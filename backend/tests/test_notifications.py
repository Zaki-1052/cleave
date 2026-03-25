# backend/tests/test_notifications.py
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


async def _create_project(client: AsyncClient, headers: dict, name: str = "Test Project") -> int:
    """Create a project and return its ID."""
    resp = await client.post(
        "/api/v1/projects",
        json={"name": name},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_list_notifications_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/notifications")
    assert resp.status_code == 401


async def test_list_notifications_after_register(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")

    resp = await client.get("/api/v1/notifications", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    # on_after_register creates a welcome notification
    assert len(data) == 1
    assert data[0]["type"] == "welcome"
    assert data[0]["title"] == "Welcome to Cleave"
    assert data[0]["isRead"] is False


async def test_notification_created_on_member_invite(client: AsyncClient):
    headers_admin = await _register_and_get_headers(client, "admin@example.com")
    headers_invitee = await _register_and_get_headers(client, "invitee@example.com")
    project_id = await _create_project(client, headers_admin, "Test Project")

    # Invite user
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "invitee@example.com", "role": "contributor"},
        headers=headers_admin,
    )

    # Check invitee's notifications
    resp = await client.get("/api/v1/notifications", headers=headers_invitee)
    assert resp.status_code == 200
    data = resp.json()

    # Should have welcome + project_invitation (newest first)
    invitation = next((n for n in data if n["type"] == "project_invitation"), None)
    assert invitation is not None
    assert invitation["title"] == "Project Invitation"
    assert invitation["isRead"] is False
    assert invitation["linkTarget"] == f"/projects/{project_id}"
    assert "Contributor" in invitation["message"]
    assert "Test Project" in invitation["message"]


async def test_mark_notification_read(client: AsyncClient):
    headers_admin = await _register_and_get_headers(client, "admin@example.com")
    headers_invitee = await _register_and_get_headers(client, "invitee@example.com")
    project_id = await _create_project(client, headers_admin)

    # Invite to create a notification
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "invitee@example.com", "role": "contributor"},
        headers=headers_admin,
    )

    # Get notification id
    list_resp = await client.get("/api/v1/notifications", headers=headers_invitee)
    invitation = next(n for n in list_resp.json() if n["type"] == "project_invitation")
    notif_id = invitation["id"]

    # Mark as read
    mark_resp = await client.patch(
        f"/api/v1/notifications/{notif_id}/read",
        headers=headers_invitee,
    )
    assert mark_resp.status_code == 204

    # Verify it's now read
    check_resp = await client.get("/api/v1/notifications", headers=headers_invitee)
    updated = next(n for n in check_resp.json() if n["id"] == notif_id)
    assert updated["isRead"] is True


async def test_notification_not_visible_to_other_users(client: AsyncClient):
    headers_admin = await _register_and_get_headers(client, "admin@example.com")
    await _register_and_get_headers(client, "invitee@example.com")  # register so invite works
    headers_other = await _register_and_get_headers(client, "other@example.com")
    project_id = await _create_project(client, headers_admin)

    # Invite only invitee
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "invitee@example.com", "role": "contributor"},
        headers=headers_admin,
    )

    # Other user should not see project_invitation
    resp = await client.get("/api/v1/notifications", headers=headers_other)
    assert resp.status_code == 200
    types = [n["type"] for n in resp.json()]
    assert "project_invitation" not in types
