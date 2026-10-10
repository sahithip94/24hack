"""Source-grounded summarisation with an optional LLM.

The service prefers a real LLM when a key is configured and otherwise returns a
clearly labelled local, rule-based fallback. Two providers are supported:

* Google Gemini via ``GEMINI_API_KEY`` (a legacy Gemini key stored in
  ``OPENAI_API_KEY`` is still honoured). ``GEMINI_MODEL`` selects the model.
* Any OpenAI-compatible endpoint via ``OPENAI_API_KEY`` and, optionally,
  ``OPENAI_BASE_URL``/``OPENAI_MODEL``.

When a configured model has been retired or is briefly overloaded, a small
allow-list of current Gemini models is tried before giving up, so a stale
``GEMINI_MODEL`` never silently degrades to the local fallback.
"""
from __future__ import annotations

import logging
import os
import ssl
import time

try:  # httpx ships with the google-genai/openai SDKs and exposes retryable errors
    import httpx
except Exception:  # pragma: no cover
    httpx = None

logger = logging.getLogger(__name__)

# Errors worth a single automatic retry: momentary TLS/connection resets.
_TRANSIENT_ERRORS: tuple[type[BaseException], ...] = (
    ssl.SSLError,
    ConnectionError,
    TimeoutError,
)
if httpx is not None:
    _TRANSIENT_ERRORS += (httpx.TransportError,)

# Sentinels the frontend keys its "local fallback" badge off. They are kept
# stable so the UI can tell "no key configured" apart from "call failed".
LOCAL_FALLBACK_MODEL = "local-fallback-no-llm"          # no LLM key configured
LOCAL_FALLBACK_ERROR_MODEL = "local-fallback-llm-error"  # key set, request failed

_SYSTEM_PROMPT = (
    "Create a concise, source-grounded summary of the supplied patient-record entries. "
    "Use only supplied facts. Do not diagnose, prescribe, recommend changing medication, or infer that an undocumented condition is absent. "
    "Keep dates and uncertainties clear. Cite each factual bullet with its supplied [Record ID: N]. "
    "If details conflict, say that the records appear inconsistent and ask the reader to review the original documents. "
    "State that this is an organizational summary, not medical advice."
)

# Current Gemini aliases tried when the configured model is missing, retired, or
# briefly unavailable (per-model daily quota or a transient 503). Order matters:
# best quality first, lite models as a reliable last resort.
_GEMINI_MODEL_CHAIN = (
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
)

# Values left in .env files that are not real secrets.
_PLACEHOLDER_VALUES = {
    "",
    "paste_your_actual_gemini_api_key_here",
    "your_api_key",
    "your-api-key",
    "changeme",
    "todo",
}


def _secret(value: str | None) -> str:
    """Return a usable value, or "" for missing/placeholder entries."""
    value = (value or "").strip()
    if value.lower() in _PLACEHOLDER_VALUES or value.lower().startswith("paste_"):
        return ""
    return value


def generate_summary(records: list[dict]) -> tuple[str, str]:
    """Return ``(summary_text, model_used)`` for the supplied records."""
    prompt = "Summarize these verified records only:\n" + _records_text(records)

    gemini_key = _secret(os.getenv("GEMINI_API_KEY")) or _secret(os.getenv("LLM_API_KEY"))
    openai_key = _secret(os.getenv("OPENAI_API_KEY"))

    # A Gemini key saved before the GEMINI_API_KEY rename starts with "AQ.".
    legacy_gemini = not gemini_key and openai_key.startswith("AQ.")
    if legacy_gemini:
        gemini_key = openai_key

    failures: list[str] = []

    if gemini_key:
        for model in _gemini_models():
            try:
                text = _with_retry(lambda m=model: _call_gemini(gemini_key, m, prompt))
            except Exception as exc:  # noqa: BLE001 - try the next candidate
                failures.append(f"{model}: {_brief(exc)}")
                logger.warning("Gemini summary via %s failed: %s", model, exc)
                continue
            if text:
                return text, model
            failures.append(f"{model}: empty response")

    if openai_key and not legacy_gemini:
        model = _secret(os.getenv("OPENAI_MODEL")) or "gpt-4o-mini"
        try:
            text = _with_retry(lambda: _call_openai(openai_key, model, prompt))
            if text:
                return text, model
            failures.append(f"{model}: empty response")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{model}: {_brief(exc)}")
            logger.warning("OpenAI summary via %s failed: %s", model, exc)

    configured = bool(gemini_key or openai_key)
    label = "LLM request failed" if configured else "LLM not configured"
    detail = f": {failures[0]}" if failures else ""
    lines = [f"Local summary ({label}{detail}). This is an organizational aid, not medical advice."]
    for record in records:
        date = record.get("event_date") or "Date not documented"
        lines.append(
            f"- {date}: {record['title']} ({record['category']}) — {record['details']} "
            f"[Record ID: {record['id']}]"
        )
    lines.append("Please check the original documents for clinical interpretation or conflicting details.")
    if configured:
        return "\n".join(lines), LOCAL_FALLBACK_ERROR_MODEL
    return "\n".join(lines), LOCAL_FALLBACK_MODEL


def _gemini_models() -> list[str]:
    configured = _secret(os.getenv("GEMINI_MODEL")) or _secret(os.getenv("OPENAI_MODEL"))
    models: list[str] = []
    for name in (configured, *_GEMINI_MODEL_CHAIN):
        if name and name not in models:
            models.append(name)
    return models


def _call_gemini(api_key: str, model: str, prompt: str) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT, temperature=0.1
        ),
    )
    return (getattr(response, "text", "") or "").strip()


def _call_openai(api_key: str, model: str, prompt: str) -> str:
    from openai import OpenAI

    base_url = _secret(os.getenv("OPENAI_BASE_URL"))
    client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        temperature=0.1,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return (response.choices[0].message.content or "").strip()


def _with_retry(call, attempts: int = 2, delay: float = 1.0):
    """Run ``call`` and retry once on a transient network/TLS error."""
    for attempt in range(attempts):
        try:
            return call()
        except Exception as exc:  # noqa: BLE001
            if attempt + 1 >= attempts or not isinstance(exc, _TRANSIENT_ERRORS):
                raise
            logger.warning("Transient LLM transport error, retrying once: %s", exc)
            time.sleep(delay)
    raise RuntimeError("unreachable")  # pragma: no cover


def _brief(exc: Exception) -> str:
    return " ".join(str(exc).split())[:160]


def _records_text(records: list[dict]) -> str:
    parts = []
    for r in records:
        parts.append(
            f"[Record ID: {r['id']}]\nDate: {r.get('event_date') or 'Not documented'}\n"
            f"Category: {r['category']}\nTitle: {r['title']}\nDetails: {r['details']}"
        )
    return "\n\n".join(parts)
