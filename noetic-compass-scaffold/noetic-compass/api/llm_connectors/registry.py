"""LLM connector factory/registry."""

from __future__ import annotations

from api.config import settings
from api.errors import LLMError

from .base import BaseLLMConnector
from .mock_connector import MockLLMConnector


def _resolve_provider_key(
    *,
    override: str | None,
    server_key: str,
    provider_label: str,
    provider: str,
    allow_server_credentials: bool,
) -> str:
    """Resolve an API key, refusing server fallback when server credentials are disallowed."""
    if override:
        return override
    if not allow_server_credentials:
        raise LLMError(
            f"{provider_label} requires a caller-supplied BYOK API key "
            "(server credentials are not permitted for unauthenticated requests)",
            provider=provider,
        )
    if not server_key:
        raise LLMError(f"{provider_label} API key not configured", provider=provider)
    return server_key


def get_connector(
    provider: str,
    model: str | None = None,
    *,
    api_key_override: str | None = None,
    allow_server_credentials: bool = True,
) -> BaseLLMConnector:
    """Get an LLM connector by provider name.

    The explicit provider argument takes precedence. Only falls back to
    mock if the caller actually requests "mock" (or leaves the default).
    The global settings.mock_llm flag is used ONLY when no provider is
    specified by the caller (i.e., WrapRequest.provider defaults to "mock").

    ``api_key_override`` supports the customer bring-your-own-key (BYOK)
    path: when a non-empty key is supplied, it takes precedence over the
    server-side ``settings.<provider>_api_key`` for this connector instance
    only. It is never persisted — the caller passes an ephemeral, request-
    scoped secret.

    ``allow_server_credentials`` controls whether omitting ``api_key_override``
    may fall back to configured ``settings.<provider>_api_key`` values.
    Unauthenticated/anonymous callers must pass ``allow_server_credentials=False``
    so non-mock providers never consume server-funded credentials.
    """
    override = api_key_override.strip() if api_key_override else None

    if provider == "mock":
        return MockLLMConnector()

    if provider == "openai":
        api_key = _resolve_provider_key(
            override=override,
            server_key=settings.openai_api_key,
            provider_label="OpenAI",
            provider="openai",
            allow_server_credentials=allow_server_credentials,
        )
        from .openai_connector import OpenAIConnector

        return OpenAIConnector(
            api_key=api_key,
            model=model or "gpt-4",
        )

    if provider == "anthropic":
        api_key = _resolve_provider_key(
            override=override,
            server_key=settings.anthropic_api_key,
            provider_label="Anthropic",
            provider="anthropic",
            allow_server_credentials=allow_server_credentials,
        )
        from .anthropic_connector import AnthropicConnector

        return AnthropicConnector(
            api_key=api_key,
            model=model or "claude-sonnet-4-6",
        )

    if provider == "google":
        api_key = _resolve_provider_key(
            override=override,
            server_key=settings.google_api_key,
            provider_label="Google",
            provider="google",
            allow_server_credentials=allow_server_credentials,
        )
        from .google_connector import GoogleConnector

        return GoogleConnector(
            api_key=api_key,
            model=model or "gemini-2.5-flash",
        )

    if provider == "meta":
        if not allow_server_credentials and not override:
            raise LLMError(
                "Meta requires a caller-supplied BYOK API key "
                "(server credentials are not permitted for unauthenticated requests)",
                provider="meta",
            )
        if not settings.meta_api_base_url:
            raise LLMError("Meta API base URL not configured", provider="meta")
        from .meta_connector import MetaConnector

        return MetaConnector(
            api_base=settings.meta_api_base_url,
            api_key=override if not allow_server_credentials else (override or settings.meta_api_key),
            model=model or "llama-3.3-70b-versatile",
        )

    if provider == "xai":
        api_key = _resolve_provider_key(
            override=override,
            server_key=settings.xai_api_key,
            provider_label="xAI",
            provider="xai",
            allow_server_credentials=allow_server_credentials,
        )
        from .xai_connector import XAIConnector

        return XAIConnector(
            api_key=api_key,
            model=model or "grok-4.20",
        )

    if provider == "deepseek":
        api_key = _resolve_provider_key(
            override=override,
            server_key=settings.deepseek_api_key,
            provider_label="DeepSeek",
            provider="deepseek",
            allow_server_credentials=allow_server_credentials,
        )
        from .deepseek_connector import DeepSeekConnector

        return DeepSeekConnector(
            api_key=api_key,
            model=model or "deepseek-chat",
        )

    if provider == "qwen":
        api_key = _resolve_provider_key(
            override=override,
            server_key=settings.qwen_api_key,
            provider_label="Qwen",
            provider="qwen",
            allow_server_credentials=allow_server_credentials,
        )
        from .qwen_connector import QwenConnector

        return QwenConnector(
            api_key=api_key,
            model=model or "qwen3.6-plus",
        )

    raise LLMError(f"Unknown provider: {provider}", provider=provider)
