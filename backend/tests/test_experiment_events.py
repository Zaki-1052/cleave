# backend/tests/test_experiment_events.py
from httpx import AsyncClient


async def _register_and_get_headers(client: AsyncClient, email: str) -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert resp.status_code == 201
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict, name: str = "Test Project") -> int:
    resp = await client.post("/api/v1/projects", json={"name": name}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_experiment(
    client: AsyncClient, headers: dict, project_id: int, name: str = "H3K4me3"
) -> int:
    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": name, "assayType": "CUT&RUN"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _reaction_body(short_name: str = "IgG", organism: str = "Mouse") -> dict:
    return {
        "fastqPrefix": f"230301_{short_name}_trimmed_L001",
        "shortName": short_name,
        "organism": organism,
        "assayType": "CUT&RUN",
    }


async def _get_history(client: AsyncClient, headers: dict, exp_id: int) -> dict:
    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/history",
        params={"perPage": 100},
        headers=headers,
    )
    assert resp.status_code == 200
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_history_empty(client: AsyncClient):
    """New experiment has no history events."""
    headers = await _register_and_get_headers(client, "user@example.com")
    pid = await _create_project(client, headers)
    eid = await _create_experiment(client, headers, pid)

    data = await _get_history(client, headers, eid)
    assert data["total"] == 0
    assert data["items"] == []


async def test_history_after_reaction_created(client: AsyncClient):
    """Creating a reaction produces a 'reaction_created' event."""
    headers = await _register_and_get_headers(client, "user@example.com")
    pid = await _create_project(client, headers)
    eid = await _create_experiment(client, headers, pid)

    await client.post(
        f"/api/v1/experiments/{eid}/reactions",
        json=_reaction_body("IgG"),
        headers=headers,
    )

    data = await _get_history(client, headers, eid)
    assert data["total"] == 1
    event = data["items"][0]
    assert event["action"] == "reaction_created"
    assert event["resourceType"] == "reaction"
    assert "IgG" in event["detail"]
    assert event["user"] is not None
    assert event["user"]["email"] == "user@example.com"


async def test_history_after_reaction_deleted(client: AsyncClient):
    """Deleting a reaction produces a 'reaction_deleted' event."""
    headers = await _register_and_get_headers(client, "user@example.com")
    pid = await _create_project(client, headers)
    eid = await _create_experiment(client, headers, pid)

    resp = await client.post(
        f"/api/v1/experiments/{eid}/reactions",
        json=_reaction_body("IgG"),
        headers=headers,
    )
    rid = resp.json()["id"]

    await client.delete(f"/api/v1/experiments/{eid}/reactions/{rid}", headers=headers)

    data = await _get_history(client, headers, eid)
    actions = [e["action"] for e in data["items"]]
    assert "reaction_deleted" in actions
    assert "reaction_created" in actions


async def test_history_after_metadata_update(client: AsyncClient):
    """Updating experiment metadata produces a 'metadata_updated' event."""
    headers = await _register_and_get_headers(client, "user@example.com")
    pid = await _create_project(client, headers)
    eid = await _create_experiment(client, headers, pid)

    await client.patch(
        f"/api/v1/experiments/{eid}",
        json={"name": "Renamed Experiment"},
        headers=headers,
    )

    data = await _get_history(client, headers, eid)
    assert data["total"] == 1
    event = data["items"][0]
    assert event["action"] == "metadata_updated"
    assert "name" in event["detail"]


async def test_history_after_job_launched(client: AsyncClient):
    """Launching a job produces a 'job_launched' event."""
    headers = await _register_and_get_headers(client, "user@example.com")
    pid = await _create_project(client, headers)
    eid = await _create_experiment(client, headers, pid)

    await client.post(
        f"/api/v1/experiments/{eid}/jobs",
        json={
            "jobType": "alignment",
            "name": "Test Alignment",
            "params": {"reactions": []},
        },
        headers=headers,
    )

    data = await _get_history(client, headers, eid)
    assert data["total"] == 1
    event = data["items"][0]
    assert event["action"] == "job_launched"
    assert event["resourceType"] == "job"
    assert "Test Alignment" in event["detail"]


async def test_history_pagination(client: AsyncClient):
    """History supports pagination."""
    headers = await _register_and_get_headers(client, "user@example.com")
    pid = await _create_project(client, headers)
    eid = await _create_experiment(client, headers, pid)

    # Create 3 reactions to generate 3 events
    for i in range(3):
        await client.post(
            f"/api/v1/experiments/{eid}/reactions",
            json=_reaction_body(f"Sample_{i}", "Mouse"),
            headers=headers,
        )

    # Request page 1 with perPage=2
    resp = await client.get(
        f"/api/v1/experiments/{eid}/history",
        params={"page": 1, "perPage": 2},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["perPage"] == 2

    # Page 2 has the remaining event
    resp = await client.get(
        f"/api/v1/experiments/{eid}/history",
        params={"page": 2, "perPage": 2},
        headers=headers,
    )
    data = resp.json()
    assert len(data["items"]) == 1


async def test_history_nonmember_404(client: AsyncClient):
    """Non-members get 404 on history endpoint."""
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    pid = await _create_project(client, headers1)
    eid = await _create_experiment(client, headers1, pid)

    resp = await client.get(
        f"/api/v1/experiments/{eid}/history",
        headers=headers2,
    )
    assert resp.status_code == 404


async def test_history_viewer_can_read(client: AsyncClient):
    """Viewer role can access history."""
    headers_admin = await _register_and_get_headers(client, "admin@example.com")
    pid = await _create_project(client, headers_admin)
    eid = await _create_experiment(client, headers_admin, pid)

    # Create a viewer
    headers_viewer = await _register_and_get_headers(client, "viewer@example.com")
    await client.post(
        f"/api/v1/projects/{pid}/members",
        json={"email": "viewer@example.com", "role": "viewer"},
        headers=headers_admin,
    )

    resp = await client.get(
        f"/api/v1/experiments/{eid}/history",
        headers=headers_viewer,
    )
    assert resp.status_code == 200


async def test_history_newest_first(client: AsyncClient):
    """Events are ordered newest first."""
    headers = await _register_and_get_headers(client, "user@example.com")
    pid = await _create_project(client, headers)
    eid = await _create_experiment(client, headers, pid)

    # Create reactions in sequence
    for name in ["First", "Second", "Third"]:
        await client.post(
            f"/api/v1/experiments/{eid}/reactions",
            json=_reaction_body(name, "Mouse"),
            headers=headers,
        )

    data = await _get_history(client, headers, eid)
    details = [e["detail"] for e in data["items"]]
    # Newest first — Third should be first
    assert "Third" in details[0]
    assert "First" in details[2]
