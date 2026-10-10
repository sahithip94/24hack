"""Frontend URL resolution for MediVault.

The public frontend base URL is used to build links that the
backend returns to clients (for example, guest share links).
Configuration is read from the environment at call time, so the
application can still be imported and run when no value is set:

- ``FRONTEND_URL``      -- public frontend base URL (preferred)
- ``FRONTEND_BASE_URL`` -- legacy fallback honoured for backwards
                           compatibility with older share-link
                           configuration

Email delivery (Resend) was removed together with the email
verification feature, so this module no longer sends mail.
"""
from __future__ import annotations

import os

DEFAULT_FRONTEND_URL = "http://localhost:5173"


def get_frontend_url() -> str:
    """Public frontend base URL, preferring ``FRONTEND_URL``.

    ``FRONTEND_BASE_URL`` is still honoured for backwards compatibility
    with the share-link configuration that predates ``FRONTEND_URL``.
    """
    base = (
        os.getenv("FRONTEND_URL")
        or os.getenv("FRONTEND_BASE_URL")
        or DEFAULT_FRONTEND_URL
    )
    return base.rstrip("/")
