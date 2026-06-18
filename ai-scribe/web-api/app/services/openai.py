from collections.abc import Iterable
from datetime import datetime
from typing import BinaryIO, cast

import openai
from openai import AsyncOpenAI, NotGiven, OpenAI
from openai.types.chat import ChatCompletionMessageParam

from app.config import settings
from app.errors import (
    ExternalServiceError,
    ExternalServiceInterruption,
    ExternalServiceTimeout,
)
from app.schemas import GenerationOutput, LanguageModel, TranscriptionOutput
from app.services.adapters import GenerativeAIService, TranscriptionService
from app.utility.timing import ExecutionTimer


def _to_openai_strict_schema(node: dict) -> dict:
    """Normalize a (possibly Gemini-style) JSON schema dict into the strict
    JSON-schema shape OpenAI structured outputs require:
      * type names lowercased ("OBJECT" -> "object", "STRING" -> "string")
      * every object lists all its properties in `required`
      * every object sets `additionalProperties: false`
    Recurses through `properties` and `items` so nested schemas work too.
    """
    if not isinstance(node, dict):
        return node

    out: dict = {}
    for key, value in node.items():
        if key == "type" and isinstance(value, str):
            out[key] = value.lower()
        elif key == "properties" and isinstance(value, dict):
            out[key] = {pk: _to_openai_strict_schema(pv) for pk, pv in value.items()}
        elif key == "items":
            out[key] = _to_openai_strict_schema(value)
        else:
            out[key] = value

    if str(node.get("type", "")).lower() == "object":
        props = out.get("properties", {})
        out["required"] = list(props.keys())
        out["additionalProperties"] = False

    return out


class OpenAITranscriptionService(TranscriptionService):
    @property
    def service_name(self):
        return "OpenAI Whisper"

    async def transcribe(
        self,
        audio_file: BinaryIO,
        filename: str,
        content_type: str,
        prompt: str | None = None,
    ) -> TranscriptionOutput:
        try:
            openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=None, max_retries=0)
            response = await openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=(filename, audio_file, content_type),
                prompt=prompt or NotGiven(),
            )
            transcript = response.text
        except openai.APITimeoutError as e:
            raise ExternalServiceTimeout(self.service_name, str(e))
        except (
            openai.ConflictError,
            openai.InternalServerError,
            openai.RateLimitError,
            openai.UnprocessableEntityError,
        ) as e:
            raise ExternalServiceInterruption(self.service_name, str(e))
        except Exception as e:
            raise ExternalServiceError(self.service_name, str(e))

        return TranscriptionOutput(
            transcript=transcript,
            service=self.service_name,
        )


class OpenAIGenerativeAIService(GenerativeAIService):
    @property
    def service_name(self):
        return "OpenAI"

    @property
    def models(self):
        return [
            LanguageModel(name="gpt-4o", size="Large"),
            LanguageModel(name="gpt-4o-mini", size="Medium"),
        ]

    def complete(
        self,
        model: str,
        messages: str | list[dict[str, str]],
        temperature: int = 0,
    ) -> GenerationOutput:
        try:
            with ExecutionTimer() as timer:
                openai_client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=None, max_retries=0)
                response = openai_client.chat.completions.create(
                    model=model,
                    messages=cast(Iterable[ChatCompletionMessageParam], messages),
                    temperature=temperature,
                )

                text = response.choices[0].message.content
                completion_tokens = (
                    0 if response.usage is None else response.usage.completion_tokens
                )
                prompt_tokens = (
                    0 if response.usage is None else response.usage.prompt_tokens
                )

        except openai.APITimeoutError as e:
            raise ExternalServiceTimeout(self.service_name, str(e))
        except (
            openai.ConflictError,
            openai.InternalServerError,
            openai.RateLimitError,
            openai.UnprocessableEntityError,
        ) as e:
            raise ExternalServiceInterruption(self.service_name, str(e))
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

    def complete_structured(
        self,
        model: str,
        messages: str | list[dict[str, str]],
        response_schema: dict,
        temperature: int = 0,
    ) -> GenerationOutput:
        """Schema-constrained JSON via OpenAI Structured Outputs.

        Uses response_format json_schema with strict:true so the model is
        guaranteed to return JSON matching the schema (gpt-4o-2024-08-06+ /
        gpt-4o-mini). If the model rejects json_schema, falls back to JSON mode
        (response_format json_object) — still valid JSON, schema enforced by the
        prompt. Returns the raw JSON string in GenerationOutput.text; the caller
        parses it (same contract as Gemini's complete_structured).
        """
        if isinstance(messages, str):
            messages = [{"role": "user", "content": messages}]

        strict_schema = _to_openai_strict_schema(response_schema)
        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "structured_response",
                "strict": True,
                "schema": strict_schema,
            },
        }

        try:
            with ExecutionTimer() as timer:
                openai_client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=None, max_retries=0)
                try:
                    response = openai_client.chat.completions.create(
                        model=model,
                        messages=cast(Iterable[ChatCompletionMessageParam], messages),
                        temperature=temperature,
                        response_format=cast("dict", response_format),
                    )
                except openai.BadRequestError:
                    # Model/snapshot doesn't support json_schema — fall back to JSON mode.
                    response = openai_client.chat.completions.create(
                        model=model,
                        messages=cast(Iterable[ChatCompletionMessageParam], messages),
                        temperature=temperature,
                        response_format=cast("dict", {"type": "json_object"}),
                    )

                text = response.choices[0].message.content
                completion_tokens = (
                    0 if response.usage is None else response.usage.completion_tokens
                )
                prompt_tokens = (
                    0 if response.usage is None else response.usage.prompt_tokens
                )

        except openai.APITimeoutError as e:
            raise ExternalServiceTimeout(self.service_name, str(e))
        except (
            openai.ConflictError,
            openai.InternalServerError,
            openai.RateLimitError,
            openai.UnprocessableEntityError,
        ) as e:
            raise ExternalServiceInterruption(self.service_name, str(e))
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
