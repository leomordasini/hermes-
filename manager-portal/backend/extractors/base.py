"""
backend/extractors/base.py

Wrapper around the Anthropic Python SDK for structured extraction.
Provides call_claude(), extract_json(), get_model(), and get_client().
"""

import anthropic
import json
import logging
import time
from typing import Any
from backend.config import get_anthropic_key, get_config

logger = logging.getLogger(__name__)

# Module-level cached client
_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    """Return a cached Anthropic client, creating it on first call."""
    global _client
    if _client is None:
        api_key = get_anthropic_key()
        if not api_key:
            raise RuntimeError(
                "No Anthropic API key configured. "
                "Set extraction.anthropic_api_key in config.yaml or ANTHROPIC_API_KEY env var."
            )
        _client = anthropic.Anthropic(api_key=api_key)
        logger.debug("Anthropic client initialised.")
    return _client


def get_model() -> str:
    """Return the model name from config, defaulting to claude-sonnet-4-7."""
    return str(get_config().get("extraction", {}).get("model", "claude-sonnet-4-7"))


def call_claude(
    prompt: str,
    system: str | None = None,
    max_tokens: int = 4096,
    retries: int = 3,
) -> str:
    """
    Call the Claude API and return the response text.

    Retries on HTTP 429 (rate limit) with exponential back-off.
    Raises the underlying exception if all retries are exhausted or
    if the error is not a rate-limit error.
    """
    client = get_client()
    model = get_model()

    # Rough token estimate for logging (4 chars ≈ 1 token)
    prompt_tokens_est = len(prompt) // 4
    system_tokens_est = len(system) // 4 if system else 0
    logger.debug(
        "call_claude | model=%s max_tokens=%d "
        "prompt_tokens_est=%d system_tokens_est=%d",
        model,
        max_tokens,
        prompt_tokens_est,
        system_tokens_est,
    )

    messages = [{"role": "user", "content": prompt}]
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system:
        kwargs["system"] = system

    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            response = client.messages.create(**kwargs)
            text = response.content[0].text
            logger.debug(
                "call_claude | attempt=%d success | output_tokens_est=%d",
                attempt,
                len(text) // 4,
            )
            return text
        except anthropic.RateLimitError as exc:
            last_exc = exc
            wait = 2 ** attempt  # 2s, 4s, 8s
            logger.warning(
                "call_claude | rate limited (attempt %d/%d). Retrying in %ds…",
                attempt,
                retries,
                wait,
            )
            time.sleep(wait)
        except anthropic.APIError as exc:
            # Non-rate-limit API errors: don't retry, raise immediately
            logger.error("call_claude | API error (attempt %d/%d): %s", attempt, retries, exc)
            raise

    # All retries exhausted on rate-limit
    logger.error("call_claude | all %d retries exhausted due to rate limiting.", retries)
    raise last_exc  # type: ignore[misc]


def extract_json(
    prompt: str,
    system: str | None = None,
    max_tokens: int = 4096,
) -> dict | list:
    """
    Call Claude and parse the response as JSON.

    Strips markdown code fences (```json … ``` or ``` … ```) if present.
    Raises ValueError if the response cannot be parsed as JSON.
    """
    raw = call_claude(prompt=prompt, system=system, max_tokens=max_tokens)

    # Strip markdown code fences
    text = raw.strip()
    if text.startswith("```"):
        # Remove opening fence (```json or ```)
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        # Remove closing fence
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].rstrip()

    logger.debug("extract_json | raw_length=%d stripped_length=%d", len(raw), len(text))

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("extract_json | JSON parse failed: %s\nRaw response:\n%s", exc, raw)
        raise ValueError(f"Claude response could not be parsed as JSON: {exc}") from exc
