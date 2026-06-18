from datetime import datetime
from typing import cast

from google import genai
from google.genai import types

from app.config import settings
from app.errors import ExternalServiceError, ExternalServiceTimeout
from app.schemas import GenerationOutput, LanguageModel
from app.services.adapters import GenerativeAIService
from app.utility.timing import ExecutionTimer

_ROLE_MAP = {"user": "user", "assistant": "model"}


def _split_messages(messages: str | list[dict[str, str]]) -> tuple[str | None, list[types.Content]]:
    if isinstance(messages, str):
        return None, [types.Content(role="user", parts=[types.Part(text=messages)])]

    system_parts = [m["content"] for m in messages if m.get("role") == "system"]
    contents = [
        types.Content(role=_ROLE_MAP.get(m["role"], "user"), parts=[types.Part(text=m["content"])])
        for m in messages
        if m.get("role") != "system"
    ]
    return ("\n\n".join(system_parts) or None), contents


class GeminiGenerativeAIService(GenerativeAIService):
    def __init__(self) -> None:
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)

    @property
    def service_name(self) -> str:
        return "Gemini"

    @property
    def models(self) -> list[LanguageModel]:
        return [
            LanguageModel(name="gemini-flash-latest", size="Medium"),
            LanguageModel(name="gemini-pro-latest", size="Large"),
        ]

    def _generate(
        self,
        model: str,
        messages: str | list[dict[str, str]],
        temperature: int,
        response_mime_type: str | None = None,
        response_schema: dict | None = None,
    ) -> GenerationOutput:
        system_instruction, contents = _split_messages(messages)
        try:
            with ExecutionTimer() as timer:
                response = self._client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=temperature,
                        response_mime_type=response_mime_type,
                        response_schema=response_schema,
                    ),
                )

                text = response.text
                usage = response.usage_metadata
                completion_tokens = getattr(usage, "candidates_token_count", 0) or 0
                prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
        except TimeoutError as e:
            raise ExternalServiceTimeout(self.service_name, str(e))
        except Exception as e:
            raise ExternalServiceError(self.service_name, str(e))

        return GenerationOutput(
            text=text or "",
            generatedAt=cast(datetime, timer.started_at),
            service=self.service_name,
            model=model,
            completionTokens=completion_tokens,
            promptTokens=prompt_tokens,
            timeToGenerate=cast(int, timer.elapsed_ms),
        )

    def complete(
        self,
        model: str,
        messages: str | list[dict[str, str]],
        temperature: int = 0,
    ) -> GenerationOutput:
        return self._generate(model, messages, temperature)

    def complete_structured(
        self,
        model: str,
        messages: str | list[dict[str, str]],
        response_schema: dict,
        temperature: int = 0,
    ) -> GenerationOutput:
        return self._generate(
            model,
            messages,
            temperature,
            response_mime_type="application/json",
            response_schema=response_schema,
        )
