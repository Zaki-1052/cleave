# backend/tests/test_projects.py
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


async def _get_user_id(client: AsyncClient, headers: dict) -> int:
    """Get the current user's ID."""
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.status_code == 200
    return resp.json()["id"]


# --- Stub tests (8 original) ---


async def test_create_project_requires_auth(client: AsyncClient):
    resp = await client.post("/api/v1/projects", json={"name": "No Auth Project"})
    assert resp.status_code == 401


async def test_create_project_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.post(
        "/api/v1/projects",
        json={"name": "My CUT&RUN Project", "description": "Test description"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My CUT&RUN Project"
    assert data["description"] == "Test description"
    assert data["storageBytes"] == 0
    assert "id" in data
    assert "createdAt" in data
    assert "updatedAt" in data


async def test_project_creator_is_admin(client: AsyncClient):
    headers = await _register_and_get_headers(client, "creator@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.get(f"/api/v1/projects/{project_id}/members", headers=headers)
    assert resp.status_code == 200
    members = resp.json()
    assert len(members) == 1
    assert members[0]["role"] == "admin"
    assert members[0]["user"]["email"] == "creator@example.com"


async def test_list_projects_only_shows_member_projects(client: AsyncClient):
    headers_a = await _register_and_get_headers(client, "user_a@example.com")
    headers_b = await _register_and_get_headers(client, "user_b@example.com")

    await _create_project(client, headers_a, "Project A1")
    await _create_project(client, headers_a, "Project A2")
    await _create_project(client, headers_b, "Project B1")

    resp_a = await client.get("/api/v1/projects", headers=headers_a)
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["total"] == 2
    names_a = {item["name"] for item in data_a["items"]}
    assert names_a == {"Project A1", "Project A2"}

    resp_b = await client.get("/api/v1/projects", headers=headers_b)
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["total"] == 1
    assert data_b["items"][0]["name"] == "Project B1"


async def test_update_project_requires_admin(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_contributor = await _register_and_get_headers(client, "contrib@example.com")
    project_id = await _create_project(client, headers_owner)

    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "contrib@example.com", "role": "contributor"},
        headers=headers_owner,
    )

    resp = await client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Hacked"},
        headers=headers_contributor,
    )
    assert resp.status_code == 403


async def test_delete_project_requires_admin(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_contributor = await _register_and_get_headers(client, "contrib@example.com")
    project_id = await _create_project(client, headers_owner)

    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "contrib@example.com", "role": "contributor"},
        headers=headers_owner,
    )

    resp = await client.delete(f"/api/v1/projects/{project_id}", headers=headers_contributor)
    assert resp.status_code == 403

    get_resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers_owner)
    assert get_resp.status_code == 200


async def test_add_member_to_project(client: AsyncClient):
    headers_admin = await _register_and_get_headers(client, "admin@example.com")
    headers_invitee = await _register_and_get_headers(client, "invitee@example.com")
    project_id = await _create_project(client, headers_admin)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "invitee@example.com", "role": "contributor"},
        headers=headers_admin,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["role"] == "contributor"
    assert data["user"]["email"] == "invitee@example.com"

    list_resp = await client.get("/api/v1/projects", headers=headers_invitee)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1


async def test_remove_member_from_project(client: AsyncClient):
    headers_admin = await _register_and_get_headers(client, "admin@example.com")
    headers_member = await _register_and_get_headers(client, "member@example.com")
    project_id = await _create_project(client, headers_admin)

    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "member@example.com", "role": "contributor"},
        headers=headers_admin,
    )

    member_id = await _get_user_id(client, headers_member)

    resp = await client.delete(
        f"/api/v1/projects/{project_id}/members/{member_id}",
        headers=headers_admin,
    )
    assert resp.status_code == 204

    list_resp = await client.get("/api/v1/projects", headers=headers_member)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 0


# --- Additional edge case tests ---


async def test_update_project_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "admin@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Updated Name", "description": "New description"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated Name"
    assert data["description"] == "New description"


async def test_delete_project_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "admin@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.delete(f"/api/v1/projects/{project_id}", headers=headers)
    assert resp.status_code == 204

    get_resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert get_resp.status_code == 404


async def test_cannot_change_own_role(client: AsyncClient):
    headers = await _register_and_get_headers(client, "admin@example.com")
    project_id = await _create_project(client, headers)
    admin_id = await _get_user_id(client, headers)

    resp = await client.patch(
        f"/api/v1/projects/{project_id}/members/{admin_id}",
        json={"role": "contributor"},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "Cannot change your own role" in resp.json()["detail"]


async def test_cannot_remove_self(client: AsyncClient):
    headers = await _register_and_get_headers(client, "admin@example.com")
    project_id = await _create_project(client, headers)
    admin_id = await _get_user_id(client, headers)

    resp = await client.delete(
        f"/api/v1/projects/{project_id}/members/{admin_id}",
        headers=headers,
    )
    assert resp.status_code == 400
    assert "Cannot remove yourself" in resp.json()["detail"]


async def test_add_duplicate_member_returns_409(client: AsyncClient):
    headers_admin = await _register_and_get_headers(client, "admin@example.com")
    await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers_admin)

    resp1 = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "user@example.com", "role": "contributor"},
        headers=headers_admin,
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "user@example.com", "role": "viewer"},
        headers=headers_admin,
    )
    assert resp2.status_code == 409


async def test_add_nonexistent_user_returns_404(client: AsyncClient):
    headers = await _register_and_get_headers(client, "admin@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "nobody@example.com", "role": "contributor"},
        headers=headers,
    )
    assert resp.status_code == 404


async def test_list_projects_respects_per_page_alias(client: AsyncClient):
    """The perPage query alias works for the projects list endpoint."""
    headers = await _register_and_get_headers(client, "admin@example.com")
    await _create_project(client, headers, "Project A")
    await _create_project(client, headers, "Project B")
    await _create_project(client, headers, "Project C")

    resp = await client.get("/api/v1/projects?perPage=2", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert data["perPage"] == 2
    assert len(data["items"]) == 2


async def test_nonmember_gets_404_for_project_actions(client: AsyncClient):
    """A non-member should receive 404 (not 403) for project endpoints."""
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_outsider = await _register_and_get_headers(client, "outsider@example.com")
    project_id = await _create_project(client, headers_owner)

    # Non-member tries to update project — should get 404, not 403
    resp = await client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Hacked"},
        headers=headers_outsider,
    )
    assert resp.status_code == 404

    # Non-member tries to delete project — should get 404
    resp = await client.delete(f"/api/v1/projects/{project_id}", headers=headers_outsider)
    assert resp.status_code == 404

    # Non-member tries to list members — should get 404
    resp = await client.get(f"/api/v1/projects/{project_id}/members", headers=headers_outsider)
    assert resp.status_code == 404
