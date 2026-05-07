"""OAuth ID-token verification for Google and Apple."""

from __future__ import annotations

import json
import time
import urllib.request
from typing import Any

from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jose import jwt as jose_jwt

from app.core.config import settings

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
_apple_jwks_cache: dict[str, Any] = {"fetched_at": 0.0, "keys": []}
_APPLE_CACHE_TTL_SECONDS = 24 * 60 * 60


def verify_google_id_token(token: str) -> dict[str, Any]:
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on the server.",
        )
    try:
        claims = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Google ID token: {exc}"
        ) from exc

    if claims.get("iss") not in {"https://accounts.google.com", "accounts.google.com"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google issuer")

    return claims


def _load_apple_jwks() -> list[dict[str, Any]]:
    now = time.time()
    if _apple_jwks_cache["keys"] and (now - _apple_jwks_cache["fetched_at"]) < _APPLE_CACHE_TTL_SECONDS:
        return _apple_jwks_cache["keys"]
    try:
        with urllib.request.urlopen(APPLE_JWKS_URL, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to fetch Apple JWKs: {exc}",
        ) from exc
    keys = payload.get("keys", [])
    _apple_jwks_cache["keys"] = keys
    _apple_jwks_cache["fetched_at"] = now
    return keys


def verify_apple_id_token(token: str) -> dict[str, Any]:
    if not settings.apple_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Apple sign-in is not configured on the server.",
        )

    try:
        unverified_header = jose_jwt.get_unverified_header(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Malformed Apple ID token: {exc}"
        ) from exc

    kid = unverified_header.get("kid")
    keys = _load_apple_jwks()
    matching = next((k for k in keys if k.get("kid") == kid), None)
    if not matching:
        # Refresh once in case Apple rotated keys.
        _apple_jwks_cache["fetched_at"] = 0
        keys = _load_apple_jwks()
        matching = next((k for k in keys if k.get("kid") == kid), None)
    if not matching:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Apple JWK not found for token kid"
        )

    try:
        claims = jose_jwt.decode(
            token,
            matching,
            algorithms=[matching.get("alg", "RS256")],
            audience=settings.apple_client_id,
            issuer=APPLE_ISSUER,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Apple ID token: {exc}"
        ) from exc

    return claims
