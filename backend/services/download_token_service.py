# backend/services/download_token_service.py
"""HMAC-signed download tokens for browser-native file downloads."""

import base64
import hashlib
import hmac
import json
import time


def create_download_token(
    payload: dict,
    secret: str,
    ttl: int,
) -> str:
    """Create an HMAC-signed download token.

    Payload is JSON-serialized, base64url-encoded, then signed.
    Format: base64url(payload).base64url(signature)
    """
    payload["exp_ts"] = int(time.time()) + ttl
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode().rstrip("=")
    sig = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{payload_b64}.{sig_b64}"


def verify_download_token(token: str, secret: str) -> dict | None:
    """Verify an HMAC-signed download token. Returns payload dict or None."""
    parts = token.split(".", 1)
    if len(parts) != 2:
        return None

    payload_b64, sig_b64 = parts

    expected_sig = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
    expected_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")

    if not hmac.compare_digest(sig_b64, expected_b64):
        return None

    try:
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    except (json.JSONDecodeError, ValueError):
        return None

    if payload.get("exp_ts", 0) < time.time():
        return None

    return payload
