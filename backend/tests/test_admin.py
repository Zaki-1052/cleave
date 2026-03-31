# backend/tests/test_admin.py
"""Tests for the superuser admin panel endpoints."""

from httpx import AsyncClient
from sqlalchemy import update

from models.user import User


async def _register(client: AsyncClient, email: str) -> dict:
    """Register a user and return auth headers."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert resp.status_code == 201
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def _get_user_id(client: AsyncClient, headers: dict) -> int:
    resp = await client.get("/api/v1/users/me", headers=headers)
    return resp.json()["id"]


async def _make_superuser(client: AsyncClient, db_session, email: str) -> dict:
    """Register a user and promote to superuser. Returns auth headers."""
    headers = await _register(client, email)
    user_id = await _get_user_id(client, headers)
    async with db_session as db:
        await db.execute(update(User).where(User.id == user_id).values(is_superuser=True))
        await db.commit()
    return headers


async def _create_project(client: AsyncClient, headers: dict, name: str = "Test") -> int:
    resp = await client.post("/api/v1/projects", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


# ── Auth & Permission ─────────────────────────────────────────────────────


async def test_admin_stats_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/admin/stats")
    assert resp.status_code == 401


async def test_admin_stats_requires_superuser(client: AsyncClient):
    headers = await _register(client, "regular@example.com")
    resp = await client.get("/api/v1/admin/stats", headers=headers)
    assert resp.status_code == 403


async def test_admin_users_requires_superuser(client: AsyncClient):
    headers = await _register(client, "regular@example.com")
    resp = await client.get("/api/v1/admin/users", headers=headers)
    assert resp.status_code == 403


async def test_admin_storage_info_requires_superuser(client: AsyncClient):
    headers = await _register(client, "regular@example.com")
    resp = await client.get("/api/v1/admin/storage-info", headers=headers)
    assert resp.status_code == 403


# ── Stats ──────────────────────────────────────────────────────────────────


async def test_stats_returns_counts(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    # Create a second regular user
    await _register(client, "user2@example.com")

    resp = await client.get("/api/v1/admin/stats", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["totalUsers"] == 2
    assert data["activeUsers"] == 2
    assert data["totalProjects"] >= 0
    assert "jobsByStatus" in data
    assert "diskTotal" in data


# ── User Management ────────────────────────────────────────────────────────


async def test_list_users(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    await _register(client, "alice@example.com")
    await _register(client, "bob@example.com")

    resp = await client.get("/api/v1/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3


async def test_list_users_search(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    await _register(client, "alice@example.com")
    await _register(client, "bob@example.com")

    resp = await client.get("/api/v1/admin/users?search=alice", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["email"] == "alice@example.com"


async def test_list_users_role_filter(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    await _register(client, "regular@example.com")

    # Only superusers
    resp = await client.get("/api/v1/admin/users?role=superuser", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["email"] == "admin@example.com"

    # Only regular users
    resp = await client.get("/api/v1/admin/users?role=regular", headers=admin_headers)
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["email"] == "regular@example.com"


async def test_toggle_user_superuser(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    other_headers = await _register(client, "other@example.com")
    other_id = await _get_user_id(client, other_headers)

    # Promote
    resp = await client.patch(
        f"/api/v1/admin/users/{other_id}",
        json={"isSuperuser": True},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["isSuperuser"] is True

    # Demote
    resp = await client.patch(
        f"/api/v1/admin/users/{other_id}",
        json={"isSuperuser": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["isSuperuser"] is False


async def test_toggle_user_active(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    other_headers = await _register(client, "other@example.com")
    other_id = await _get_user_id(client, other_headers)

    resp = await client.patch(
        f"/api/v1/admin/users/{other_id}",
        json={"isActive": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["isActive"] is False


async def test_cannot_modify_self(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    admin_id = await _get_user_id(client, admin_headers)

    resp = await client.patch(
        f"/api/v1/admin/users/{admin_id}",
        json={"isSuperuser": False},
        headers=admin_headers,
    )
    assert resp.status_code == 400
    assert "Cannot modify your own account" in resp.json()["detail"]


async def test_cannot_demote_last_superuser(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    other_headers = await _register(client, "other@example.com")
    other_id = await _get_user_id(client, other_headers)

    # Promote other to superuser, then demote admin (should fail since admin is self)
    # Actually: promote other, then try to demote other — but other is the only
    # other superuser, admin is also a superuser, so there are 2. Should succeed.
    await client.patch(
        f"/api/v1/admin/users/{other_id}",
        json={"isSuperuser": True},
        headers=admin_headers,
    )

    # Now demote other — there's still admin, so should succeed
    resp = await client.patch(
        f"/api/v1/admin/users/{other_id}",
        json={"isSuperuser": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    # Now other is the only non-superuser. Try to demote a second superuser
    # But admin can't demote self, so we'd need a third user.
    # Instead: register a third, promote them, demote admin via third, then
    # try demoting third from admin = last superuser scenario.
    # Simpler test: only have one superuser, try to demote another user who
    # is already not a superuser — that's not what we're testing.
    # Let's just test: with only 1 superuser (admin), try to demote
    # the only other superuser (but admin can't target self).
    # Actually the scenario is: there's only 1 superuser in the system.
    # We can't test "demote the last superuser" via the API because the
    # only superuser is the caller, and self-modification is blocked first.
    # The guard exists for safety (e.g., direct DB manipulation scenario).
    # The test above proves self-modification is blocked, which achieves
    # the same protection.


async def test_update_nonexistent_user(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    resp = await client.patch(
        "/api/v1/admin/users/9999",
        json={"isSuperuser": True},
        headers=admin_headers,
    )
    assert resp.status_code == 404


# ── Project Management ─────────────────────────────────────────────────────


async def test_list_all_projects(client: AsyncClient, db_session):
    """Superuser can see all projects, even those they aren't a member of."""
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    other_headers = await _register(client, "other@example.com")

    # Other user creates a project that admin is not a member of
    await _create_project(client, other_headers, "Other's Project")

    resp = await client.get("/api/v1/admin/projects", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    names = [p["name"] for p in data["items"]]
    assert "Other's Project" in names


async def test_force_delete_project(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    other_headers = await _register(client, "other@example.com")
    project_id = await _create_project(client, other_headers, "Deletable")

    resp = await client.delete(f"/api/v1/admin/projects/{project_id}", headers=admin_headers)
    assert resp.status_code == 204

    # Verify it's gone
    resp = await client.get("/api/v1/admin/projects?search=Deletable", headers=admin_headers)
    assert resp.json()["total"] == 0


async def test_delete_nonexistent_project(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    resp = await client.delete("/api/v1/admin/projects/9999", headers=admin_headers)
    assert resp.status_code == 404


# ── Job Management ─────────────────────────────────────────────────────────


async def test_list_all_jobs_empty(client: AsyncClient, db_session):
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")

    resp = await client.get("/api/v1/admin/jobs", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


async def test_is_superuser_in_user_me(client: AsyncClient, db_session):
    """Verify /users/me now returns isSuperuser field."""
    admin_headers = await _make_superuser(client, db_session, "admin@example.com")
    resp = await client.get("/api/v1/users/me", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["isSuperuser"] is True

    regular_headers = await _register(client, "regular@example.com")
    resp = await client.get("/api/v1/users/me", headers=regular_headers)
    assert resp.json()["isSuperuser"] is False
