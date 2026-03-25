# backend/tests/test_users.py
from httpx import AsyncClient


async def _register_and_get_headers(client: AsyncClient, email: str) -> dict:
    """Register a user and return auth headers."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert resp.status_code == 201
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def test_update_profile_requires_auth(client: AsyncClient):
    resp = await client.patch("/api/v1/users/me", json={"firstName": "Zakir"})
    assert resp.status_code == 401


async def test_update_profile_name(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")

    resp = await client.patch(
        "/api/v1/users/me",
        json={"firstName": "Zakir", "lastName": "Alibhai"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["firstName"] == "Zakir"
    assert data["lastName"] == "Alibhai"

    # Verify persistence via GET
    me = await client.get("/api/v1/users/me", headers=headers)
    assert me.json()["firstName"] == "Zakir"
    assert me.json()["lastName"] == "Alibhai"


async def test_update_email_notification_preference(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")

    resp = await client.patch(
        "/api/v1/users/me",
        json={"emailNotifications": "never"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["emailNotifications"] == "never"


async def test_partial_update_preserves_other_fields(client: AsyncClient):
    # Register with a name
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "named@example.com",
            "password": "testpass123",
            "first_name": "Jane",
            "last_name": "Doe",
        },
    )
    assert resp.status_code == 201
    headers = {"Authorization": f"Bearer {resp.json()['accessToken']}"}

    # Update only notification preference
    patch_resp = await client.patch(
        "/api/v1/users/me",
        json={"emailNotifications": "on_error"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["firstName"] == "Jane"
    assert data["lastName"] == "Doe"
    assert data["emailNotifications"] == "on_error"
