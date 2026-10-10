"""Unit tests for the summariser provider wiring (no network access).

These pin down the behaviour that was broken: a configured Gemini key must
actually be used, the local fallback must be clearly labelled, and the two
fallback causes (no key vs. failed request) must be distinguishable.
"""
from app.services import summary_service


def _record() -> dict:
    return {
        "id": 1,
        "title": "Demo test",
        "category": "lab_result",
        "event_date": "2026-01-02",
        "details": "Synthetic value only.",
    }


def _clear(monkeypatch):
    for variable in (
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "OPENAI_BASE_URL",
        "LLM_API_KEY",
    ):
        monkeypatch.delenv(variable, raising=False)


def test_no_key_returns_labelled_local_fallback(monkeypatch):
    _clear(monkeypatch)
    text, model = summary_service.generate_summary([_record()])
    assert model == "local-fallback-no-llm"
    assert "LLM not configured" in text
    assert "[Record ID: 1]" in text


def test_gemini_key_is_actually_used(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("GEMINI_API_KEY", "AQ.test-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.5-flash")
    monkeypatch.setattr(
        summary_service, "_call_gemini", lambda key, model, prompt: f"summary via {model}"
    )

    text, model = summary_service.generate_summary([_record()])
    assert model == "gemini-3.5-flash"
    assert text == "summary via gemini-3.5-flash"


def test_legacy_gemini_key_in_openai_variable_is_honoured(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "AQ.legacy-gemini-key")
    monkeypatch.setenv("OPENAI_MODEL", "gemini-3.5-flash")
    monkeypatch.setattr(
        summary_service, "_call_gemini", lambda key, model, prompt: "legacy ok"
    )

    text, model = summary_service.generate_summary([_record()])
    assert text == "legacy ok"
    assert model == "gemini-3.5-flash"


def test_failed_request_is_labelled_as_error_not_unconfigured(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("GEMINI_API_KEY", "AQ.test-key")

    def boom(key, model, prompt):
        raise RuntimeError("simulated outage")

    monkeypatch.setattr(summary_service, "_call_gemini", boom)
    text, model = summary_service.generate_summary([_record()])
    assert model == "local-fallback-llm-error"
    assert "LLM request failed" in text
