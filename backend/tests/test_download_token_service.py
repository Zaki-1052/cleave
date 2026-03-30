# backend/tests/test_download_token_service.py
"""Unit tests for HMAC-signed download token creation and verification."""

import time

from services.download_token_service import create_download_token, verify_download_token

SECRET = "test-secret-key-for-unit-tests"


def test_create_and_verify_roundtrip():
    """Create a token and immediately verify it returns the original payload."""
    payload = {"user_id": 42, "file": "sample.bam"}
    token = create_download_token(payload, SECRET, ttl=300)

    result = verify_download_token(token, SECRET)

    assert result is not None
    assert result["user_id"] == 42
    assert result["file"] == "sample.bam"
    assert "exp_ts" in result
    assert result["exp_ts"] > time.time()


def test_expired_token_rejected():
    """A token created with negative TTL is already expired and must be rejected."""
    token = create_download_token({"file": "x"}, SECRET, ttl=-10)

    result = verify_download_token(token, SECRET)

    assert result is None


def test_tampered_signature_rejected():
    """Modifying the signature portion invalidates the token."""
    token = create_download_token({"file": "x"}, SECRET, ttl=300)
    payload_b64, sig_b64 = token.split(".", 1)

    # Flip the last character of the signature
    flipped = "A" if sig_b64[-1] != "A" else "B"
    tampered = f"{payload_b64}.{sig_b64[:-1]}{flipped}"

    result = verify_download_token(tampered, SECRET)

    assert result is None


def test_tampered_payload_rejected():
    """Modifying the payload portion invalidates the token."""
    token = create_download_token({"file": "x"}, SECRET, ttl=300)
    payload_b64, sig_b64 = token.split(".", 1)

    # Flip the first character of the payload
    flipped = "A" if payload_b64[0] != "A" else "B"
    tampered = f"{flipped}{payload_b64[1:]}.{sig_b64}"

    result = verify_download_token(tampered, SECRET)

    assert result is None


def test_malformed_token_no_dot():
    """A string without a dot separator is not a valid token."""
    result = verify_download_token("nodotinthisstring", SECRET)

    assert result is None
