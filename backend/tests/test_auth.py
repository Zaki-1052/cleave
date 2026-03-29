# backend/tests/test_auth.py
from httpx import AsyncClient


async def test_register_creates_user(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "testpass123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "accessToken" in data
    assert data["tokenType"] == "bearer"


async def test_register_with_name(client: AsyncClient):
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
    token = resp.json()["accessToken"]
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["firstName"] == "Jane"
    assert me.json()["lastName"] == "Doe"


async def test_register_duplicate_email_fails(client: AsyncClient, registered_user: dict):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": registered_user["email"], "password": "otherpass123"},
    )
    assert resp.status_code == 409


async def test_login_returns_tokens(client: AsyncClient, registered_user: dict):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "accessToken" in data
    assert data["tokenType"] == "bearer"
    assert "fapiusers_refresh" in resp.cookies


async def test_login_wrong_password_fails(client: AsyncClient, registered_user: dict):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": "wrongpassword"},
    )
    assert resp.status_code == 400


async def test_login_nonexistent_user_fails(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "testpass123"},
    )
    assert resp.status_code == 400


async def test_refresh_returns_valid_access_token(client: AsyncClient, registered_user: dict):
    client.cookies.set("fapiusers_refresh", registered_user["refresh_cookie"])
    resp = await client.post("/api/v1/auth/refresh")
    client.cookies.clear()
    assert resp.status_code == 200
    data = resp.json()
    assert "accessToken" in data
    assert data["tokenType"] == "bearer"

    # Verify the refreshed token actually works on a protected endpoint
    me = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {data['accessToken']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == registered_user["email"]


async def test_refresh_without_cookie_fails(client: AsyncClient):
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


async def test_protected_route_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 401


async def test_protected_route_with_valid_token(client: AsyncClient, registered_user: dict):
    resp = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {registered_user['access_token']}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == registered_user["email"]
    assert data["isActive"] is True


async def test_protected_route_with_invalid_token(client: AsyncClient):
    resp = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": "Bearer invalid-token-here"},
    )
    assert resp.status_code == 401


async def test_logout_clears_cookie(client: AsyncClient, registered_user: dict):
    client.cookies.set("fapiusers_refresh", registered_user["refresh_cookie"])
    resp = await client.post("/api/v1/auth/logout")
    client.cookies.clear()
    assert resp.status_code == 204
    assert "fapiusers_refresh" in resp.headers.get("set-cookie", "")


async def test_health_check(client: AsyncClient):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# --- Password Reset ---


async def test_forgot_password_returns_202_for_existing_email(
    client: AsyncClient, registered_user: dict
):
    resp = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": registered_user["email"]},
    )
    assert resp.status_code == 202


async def test_forgot_password_returns_202_for_nonexistent_email(client: AsyncClient):
    """Must not reveal whether the email exists — always 202."""
    resp = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "nobody@example.com"},
    )
    assert resp.status_code == 202


async def test_reset_password_bad_token_returns_400(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "invalid-token-here", "password": "newpass123"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "RESET_PASSWORD_BAD_TOKEN"
