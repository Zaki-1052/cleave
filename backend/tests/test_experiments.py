# backend/tests/test_experiments.py
from httpx import AsyncClient


async def _register_and_get_headers(client: AsyncClient, email: str) -> dict:
    """Register a user and return auth headers + user info."""
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


async def test_create_experiment_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "H3K4me3", "assayType": "CUT&RUN", "description": "Test experiment"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "H3K4me3"
    assert data["assayType"] == "CUT&RUN"
    assert data["description"] == "Test experiment"
    assert data["status"] == "new"
    assert data["projectId"] == project_id
    assert data["creator"] is not None
    assert data["creator"]["email"] == "user@example.com"


async def test_create_experiment_name_too_long(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "x" * 101, "assayType": "CUT&RUN"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_experiment_invalid_assay_type(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)

    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "Test", "assayType": "ATAC-seq"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_experiment_nonmember(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_other = await _register_and_get_headers(client, "other@example.com")
    project_id = await _create_project(client, headers_owner)

    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "Test", "assayType": "CUT&RUN"},
        headers=headers_other,
    )
    assert resp.status_code == 403


async def test_list_experiments_for_project(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_a = await _create_project(client, headers, "Project A")
    project_b = await _create_project(client, headers, "Project B")

    # Create experiments in different projects
    await client.post(
        "/api/v1/experiments",
        params={"projectId": project_a},
        json={"name": "Exp A1", "assayType": "CUT&RUN"},
        headers=headers,
    )
    await client.post(
        "/api/v1/experiments",
        params={"projectId": project_a},
        json={"name": "Exp A2", "assayType": "CUT&Tag"},
        headers=headers,
    )
    await client.post(
        "/api/v1/experiments",
        params={"projectId": project_b},
        json={"name": "Exp B1", "assayType": "CUT&RUN"},
        headers=headers,
    )

    # List for project A only
    resp = await client.get(
        "/api/v1/experiments",
        params={"projectId": project_a},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    names = {item["name"] for item in data["items"]}
    assert names == {"Exp A1", "Exp A2"}


async def test_get_experiment_detail(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "H3K27ac", "assayType": "CUT&RUN", "description": "Acetylation mark"},
        headers=headers,
    )
    exp_id = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/experiments/{exp_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == exp_id
    assert data["name"] == "H3K27ac"
    assert data["description"] == "Acetylation mark"
    assert data["creator"] is not None
    assert data["creator"]["email"] == "user@example.com"
    assert data["storageBytes"] == 0
    assert "createdAt" in data


async def test_update_experiment(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "Old Name", "assayType": "CUT&RUN"},
        headers=headers,
    )
    exp_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/experiments/{exp_id}",
        json={"name": "New Name"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


async def test_update_experiment_nonmember(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_other = await _register_and_get_headers(client, "other@example.com")
    project_id = await _create_project(client, headers_owner)

    create_resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "Test", "assayType": "CUT&RUN"},
        headers=headers_owner,
    )
    exp_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/experiments/{exp_id}",
        json={"name": "Hacked"},
        headers=headers_other,
    )
    assert resp.status_code == 404


async def test_delete_experiment(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)

    create_resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "To Delete", "assayType": "CUT&RUN"},
        headers=headers,
    )
    exp_id = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/experiments/{exp_id}", headers=headers)
    assert resp.status_code == 204

    # Verify it's gone
    get_resp = await client.get(f"/api/v1/experiments/{exp_id}", headers=headers)
    assert get_resp.status_code == 404


async def test_delete_experiment_viewer(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_viewer = await _register_and_get_headers(client, "viewer@example.com")
    project_id = await _create_project(client, headers_owner)

    # Add viewer as a viewer
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "viewer@example.com", "role": "viewer"},
        headers=headers_owner,
    )

    create_resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "Protected", "assayType": "CUT&RUN"},
        headers=headers_owner,
    )
    exp_id = create_resp.json()["id"]

    # Viewer should not be able to delete
    resp = await client.delete(f"/api/v1/experiments/{exp_id}", headers=headers_viewer)
    assert resp.status_code == 404
