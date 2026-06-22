# Copyright 2025 Ross Mitchell
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from __future__ import annotations
from typing import Literal, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import logging

from dotenv import load_dotenv
from app.config.package_checks import VLLM_AVAILABLE

load_dotenv(override=True)

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    ENVIRONMENT: Literal["production", "development"] = "production"
    APP_NAME: str = ' "Berta" Scribe'
    APP_VERSION: str = "0.6.0"

    DEFAULT_AUDIO_FORMAT: str = "mp3"
    DEFAULT_AUDIO_BITRATE: str = "96k"
    LOGGING_LEVEL: str = "info"
    COOKIE_SECURE: bool = True
    COOKIE_DOMAIN: str | None = None  # Optional domain for cookies, set via env var

    DATA_FOLDER: str = ".data"
    RECORDINGS_FOLDER: str = f"{DATA_FOLDER}/recordings"
    DEV_DATABASE_FILE: str = f"{DATA_FOLDER}/database.db"

    PROMPTS_FOLDER: str = ".prompts"
    BUILTIN_NOTETYPES_FOLDER: str = f"{PROMPTS_FOLDER}/builtin-note-types"

    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_SECRET: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    SYSTEM_USER: str = "BUILTIN"
    DEFAULT_NOTE_DEFINITION: str = "Full Visit"

    DEFAULT_NOTE_GENERATION_MODEL: str = "llama3.1:8b"
    LABEL_MODEL: str = "llama3.1:8b"
    
    TRANSCRIPTION_SERVICE: Literal["OpenAI Whisper", "WhisperX", "AWS Transcribe", "Parakeet MLX"] = (
        "OpenAI Whisper"
    )
    # gpt-4o-transcribe supports SERVER VAD: it segments audio on natural silence
    # (no mid-word chopping → far better accuracy) and auto commit+clears the buffer
    # each turn (so the buffer never accumulates → no token explosion / 1006 drops).
    # gpt-realtime-whisper does NOT support server VAD and needs the manual-commit
    # path below; it is kept as an alternative but is lower accuracy for this use.
    REALTIME_TRANSCRIPTION_MODEL: str = "gpt-4o-transcribe"
    # Latency/quality tradeoff for live partial transcripts (gpt-realtime-whisper only).
    # Lower = earlier partial text, higher = more context before emitting.
    # Allowed: minimal | low | medium | high | xhigh
    REALTIME_TRANSCRIPTION_DELAY: str = "low"
    # Server-VAD silence window (ms) for gpt-4o-transcribe. gpt-4o-transcribe emits
    # a turn's transcript only when VAD detects this much silence, so a shorter
    # window = text appears after shorter pauses (more responsive) at the cost of
    # splitting turns on natural mid-sentence micro-pauses. 300 ms balances both;
    # raise toward 500 for cleaner segments, lower toward 200 for snappier updates.
    REALTIME_VAD_SILENCE_MS: int = 300
    # Upstream session rotation: how many seconds before proactively opening a new
    # OpenAI WS connection to stay under the provider's ~30-min session limit.
    # Set to 0 to disable rotation (legacy single-connection mode).
    ROTATION_INTERVAL_S: int = 1500
    SPEAKER_LABELING_MODEL: str = "gpt-4o-mini"
    GENERATIVE_AI_SERVICE: Literal["Ollama", "OpenAI", "AWS Bedrock", "VLLM", "LM Studio", "LlamaCpp", "Gemini"] = "Ollama"
    LOCAL_WHISPER_SERVICE_URL: str | None = None

    # WhisperX Configuration
    WHISPERX_DEVICE: str = "cpu"  # Can be "cpu" or "cuda" or "cuda:0", "cuda:1", etc.

    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_REGION: str = "us-west-2"
    S3_BUCKET_NAME: str = "berta"
    AWS_SECRET_NAME: str | None = None

    USE_GOOGLE_AUTH: bool = False
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str | None = None

    USE_COGNITO: bool = True
    COGNITO_USER_POOL_ID: str | None = None
    COGNITO_CLIENT_ID: str | None = None
    COGNITO_CLIENT_SECRET: str | None = None
    COGNITO_DOMAIN: str | None = None
    COGNITO_REDIRECT_URI: str | None = None

    ENCOUNTERS_PAGE_SIZE: int = 15

    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None

    USE_AURORA: bool = True
    AURORA_WRITER_ENDPOINT: str | None = None
    DB_NAME: str | None = None
    DB_USER: str | None = None
    DB_PASSWORD: str | None = None
    DB_PORT: int = 5432

    VLLM_SERVER_NAME: str = "localhost"
    VLLM_SERVER_PORT: int = 8080
    HUGGINGFACE_TOKEN: str | None = None
    VLLM_MODEL_NAME: str | None = None  # Optional model name for downloading from Hugging Face

    # LM Studio defaults to http://localhost:1234
    LM_STUDIO_SERVER_URL: str | None = "http://localhost:1234"

    # LlamaCpp server (llama-server) defaults to http://localhost:8080
    LLAMA_CPP_SERVER_URL: str | None = "http://localhost:8080"

    model_config = SettingsConfigDict(case_sensitive=True)


settings = Settings()  

is_openai_supported: bool = settings.OPENAI_API_KEY is not None
is_gemini_supported: bool = settings.GEMINI_API_KEY is not None
is_aws_bedrock_supported = (
    (bool(settings.AWS_ACCESS_KEY_ID) and bool(settings.AWS_SECRET_ACCESS_KEY) and bool(settings.AWS_REGION))
    or (settings.ENVIRONMENT == "production" and bool(settings.AWS_REGION))
)
is_aws_transcribe_supported: bool = (
    settings.AWS_ACCESS_KEY_ID is not None
    and settings.AWS_SECRET_ACCESS_KEY is not None
)
is_cognito_supported: bool = (
    settings.USE_COGNITO
    and settings.COGNITO_USER_POOL_ID is not None
    and settings.COGNITO_CLIENT_ID is not None
)

# VLLM is supported if either a server endpoint is configured OR the Python
# package is installed for local inference.
is_vllm_supported: bool = (
    (settings.VLLM_SERVER_NAME is not None and settings.VLLM_SERVER_PORT is not None)
    or VLLM_AVAILABLE
)

is_lm_studio_supported: bool = settings.LM_STUDIO_SERVER_URL is not None

is_llama_cpp_supported: bool = settings.LLAMA_CPP_SERVER_URL is not None

is_realtime_streaming_available: bool = is_openai_supported

def get_available_services() -> dict:
    """Get a dictionary of all available services and their options."""
    return {
        "TRANSCRIPTION_SERVICE": {
            "description": "Service for transcribing audio to text",
            "options": ["OpenAI Whisper", "WhisperX", "AWS Transcribe", "Parakeet MLX"],
            "default": "Parakeet MLX",
            "models": {
                "OpenAI Whisper": ["whisper-1"],
                "WhisperX": ["large-v3"],
                "AWS Transcribe": ["default"],
                "Parakeet MLX": ["mlx-large"]
            }
        },
        "GENERATIVE_AI_SERVICE": {
            "description": "Service for generating text completions",
            "options": ["Ollama", "OpenAI", "AWS Bedrock", "VLLM", "LM Studio", "LlamaCpp", "Gemini"],
            "default": "Ollama",
            "models": {
                "Ollama": ["llama3.1:8b", "llama3.1:70b", "llama3.2:8b", "llama3.2:70b"],
                "OpenAI": ["gpt-4", "gpt-3.5-turbo"],
                "Gemini": ["gemini-flash-latest", "gemini-pro-latest"],
                "AWS Bedrock": [
                    "us.meta.llama3-3-70b-instruct-v1:0",
                    "meta.llama3-1-405b-instruct-v1:0",
                    "meta.llama3-1-70b-instruct-v1:0",
                    "anthropic.claude-3-7-sonnet-20250219-v1:0",
                    "anthropic.claude-3-5-sonnet-20241022-v2:0",
                    "anthropic.claude-3-haiku-20240307-v1:0"
                ],
                "VLLM": ["dynamic"],  # Models are loaded dynamically from VLLM server
                "LM Studio": ["dynamic"],  # Models are loaded dynamically from LM Studio server
                "LlamaCpp": ["dynamic"]  # Models are loaded dynamically from llama-server
            }
        }
    }

def print_available_services() -> None:
    """Print all available services and their options in a formatted way."""
    services = get_available_services()
    
    print("\n=== Available Services ===\n")
    for service_name, info in services.items():
        print(f" {service_name}")
        print(f"   Description: {info['description']}")
        print(f"   Options: {', '.join(info['options'])}")
        print(f"   Default: {info['default']}")
        print("\n   Available Models:")
        for provider, models in info['models'].items():
            print(f"      {provider}:")
            for model in models:
                print(f"         - {model}")
        print()
