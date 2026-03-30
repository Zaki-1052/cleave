# backend/tests/test_projects.py
from httpx import AsyncClient
from sqlalchemy import select, update

from models.experiment import Experiment
from models.project import Project


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


# --- Reference project tests ---


async def _create_reference_project_in_db(db) -> tuple[int, int]:
    """Create a reference project + experiment directly in DB."""
    project = Project(
        name="Gold Standard Reference",
        description="Test reference project",
        is_reference=True,
        created_by=None,
    )
    db.add(project)
    await db.flush()

    experiment = Experiment(
        project_id=project.id,
        name="MeCP2 CUT&RUN",
        assay_type="CUT&RUN",
        status="complete",
        created_by=None,
    )
    db.add(experiment)
    await db.commit()
    return project.id, experiment.id


async def test_reference_project_visible_to_all_users(client: AsyncClient):
    """Any authenticated user can GET a reference project without being a member."""
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        pid, _ = await _create_reference_project_in_db(db)

    headers = await _register_and_get_headers(client, "viewer@example.com")
    resp = await client.get(f"/api/v1/projects/{pid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["isReference"] is True


async def test_list_reference_projects_endpoint(client: AsyncClient):
    """GET /projects/reference returns reference projects."""
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await _create_reference_project_in_db(db)

    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.get("/api/v1/projects/reference", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["isReference"] is True
    assert data[0]["name"] == "Gold Standard Reference"


async def test_reference_project_not_in_user_projects_list(client: AsyncClient):
    """GET /projects does not include reference projects (they're fetched separately)."""
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await _create_reference_project_in_db(db)

    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.get("/api/v1/projects", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


async def test_reference_project_blocks_experiment_creation(client: AsyncClient):
    """Cannot create an experiment in a reference project."""
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        pid, _ = await _create_reference_project_in_db(db)

    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.post(
        f"/api/v1/experiments?projectId={pid}",
        json={"name": "Hacked", "assayType": "CUT&RUN"},
        headers=headers,
    )
    # No ProjectMember row exists, so the permission check returns None -> 403 or 404
    assert resp.status_code in (403, 404)


async def test_reference_project_experiment_visible(client: AsyncClient):
    """Non-member can list and view experiments in a reference project."""
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        pid, eid = await _create_reference_project_in_db(db)

    headers = await _register_and_get_headers(client, "viewer@example.com")

    # List experiments
    resp = await client.get(f"/api/v1/experiments?projectId={pid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1

    # Get single experiment
    resp = await client.get(f"/api/v1/experiments/{eid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "MeCP2 CUT&RUN"


async def test_reference_project_cannot_be_deleted(client: AsyncClient):
    """Reference projects cannot be deleted even by a superuser-like route."""
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        pid, _ = await _create_reference_project_in_db(db)

    headers = await _register_and_get_headers(client, "admin@example.com")
    # No ProjectMember exists, so admin check returns 404
    resp = await client.delete(f"/api/v1/projects/{pid}", headers=headers)
    assert resp.status_code == 404

    # Verify project still exists
    async with test_session_factory() as db:
        result = await db.execute(select(Project).where(Project.id == pid))
        assert result.scalar_one_or_none() is not None


async def test_reference_project_blocks_job_creation(client: AsyncClient):
    """Cannot submit a job in a reference project experiment."""
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        pid, eid = await _create_reference_project_in_db(db)

    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.post(
        f"/api/v1/experiments/{eid}/jobs",
        json={
            "jobType": "alignment",
            "name": "Hacked",
            "params": {"reference_genome": "mm10"},
        },
        headers=headers,
    )
    assert resp.status_code in (403, 404)


async def test_reference_projects_endpoint_requires_auth(client: AsyncClient):
    """GET /projects/reference requires authentication."""
    resp = await client.get("/api/v1/projects/reference")
    assert resp.status_code == 401


# --- Filter tests ---


async def test_list_projects_includes_status_field(client: AsyncClient):
    """Project list response includes the status field."""
    headers = await _register_and_get_headers(client, "user@example.com")
    await _create_project(client, headers)

    resp = await client.get("/api/v1/projects", headers=headers)
    assert resp.status_code == 200
    project = resp.json()["items"][0]
    assert "status" in project
    assert project["status"] == "new"


async def test_list_projects_filter_by_status(client: AsyncClient):
    """Filter projects by status returns only matching projects."""
    from tests.conftest import test_session_factory

    headers = await _register_and_get_headers(client, "user@example.com")
    await _create_project(client, headers, "Project New")
    pid_b = await _create_project(client, headers, "Project Complete")

    async with test_session_factory() as db:
        await db.execute(update(Project).where(Project.id == pid_b).values(status="complete"))
        await db.commit()

    # Filter for complete only
    resp = await client.get("/api/v1/projects?statuses=complete", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Project Complete"

    # Filter for new only
    resp = await client.get("/api/v1/projects?statuses=new", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "Project New"


async def test_list_projects_filter_by_multiple_statuses(client: AsyncClient):
    """Filter by multiple statuses using repeated query params."""
    from tests.conftest import test_session_factory

    headers = await _register_and_get_headers(client, "user@example.com")
    await _create_project(client, headers, "Project New")
    pid_b = await _create_project(client, headers, "Project Complete")
    pid_c = await _create_project(client, headers, "Project Error")

    async with test_session_factory() as db:
        await db.execute(update(Project).where(Project.id == pid_b).values(status="complete"))
        await db.execute(update(Project).where(Project.id == pid_c).values(status="error"))
        await db.commit()

    resp = await client.get("/api/v1/projects?statuses=complete&statuses=error", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    names = {item["name"] for item in data["items"]}
    assert names == {"Project Complete", "Project Error"}


async def test_list_projects_filter_by_member(client: AsyncClient):
    """Filter projects by member ID returns only shared projects."""
    headers_a = await _register_and_get_headers(client, "user_a@example.com")
    headers_b = await _register_and_get_headers(client, "user_b@example.com")
    user_b_id = await _get_user_id(client, headers_b)

    # Project shared between A and B
    shared_pid = await _create_project(client, headers_a, "Shared Project")
    await client.post(
        f"/api/v1/projects/{shared_pid}/members",
        json={"email": "user_b@example.com", "role": "contributor"},
        headers=headers_a,
    )

    # Project only for A
    await _create_project(client, headers_a, "Solo Project")

    # Filter by user B — should return only the shared project
    resp = await client.get(f"/api/v1/projects?memberIds={user_b_id}", headers=headers_a)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Shared Project"


async def test_list_projects_filter_by_search(client: AsyncClient):
    """Search by project name substring."""
    headers = await _register_and_get_headers(client, "user@example.com")
    await _create_project(client, headers, "Alpha Experiment")
    await _create_project(client, headers, "Beta Analysis")

    resp = await client.get("/api/v1/projects?search=alpha", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Alpha Experiment"


async def test_list_projects_filter_by_date(client: AsyncClient):
    """Filter by createdAfter/createdBefore date range."""
    headers = await _register_and_get_headers(client, "user@example.com")
    await _create_project(client, headers, "Recent Project")

    # Far future date — no projects should match
    resp = await client.get("/api/v1/projects?createdAfter=2099-01-01T00:00:00Z", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0

    # Far past date — all projects should match
    resp = await client.get("/api/v1/projects?createdAfter=2020-01-01T00:00:00Z", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


async def test_list_projects_combined_filters(client: AsyncClient):
    """Multiple filters applied simultaneously (intersection)."""
    from tests.conftest import test_session_factory

    headers = await _register_and_get_headers(client, "user@example.com")
    pid_a = await _create_project(client, headers, "Alpha Complete")
    await _create_project(client, headers, "Beta New")

    async with test_session_factory() as db:
        await db.execute(update(Project).where(Project.id == pid_a).values(status="complete"))
        await db.commit()

    # Search "alpha" + status "complete" — should find one
    resp = await client.get("/api/v1/projects?search=alpha&statuses=complete", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "Alpha Complete"

    # Search "beta" + status "complete" — should find none
    resp = await client.get("/api/v1/projects?search=beta&statuses=complete", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


async def test_filter_members_endpoint(client: AsyncClient):
    """GET /projects/filter-members returns fellow members."""
    headers_a = await _register_and_get_headers(client, "alice@example.com")
    await _register_and_get_headers(client, "bob@example.com")

    pid = await _create_project(client, headers_a, "Shared")
    await client.post(
        f"/api/v1/projects/{pid}/members",
        json={"email": "bob@example.com", "role": "contributor"},
        headers=headers_a,
    )

    resp = await client.get("/api/v1/projects/filter-members", headers=headers_a)
    assert resp.status_code == 200
    data = resp.json()
    emails = {m["email"] for m in data}
    assert "alice@example.com" in emails
    assert "bob@example.com" in emails


async def test_filter_members_requires_auth(client: AsyncClient):
    """GET /projects/filter-members requires authentication."""
    resp = await client.get("/api/v1/projects/filter-members")
    assert resp.status_code == 401


async def test_recompute_project_status(client: AsyncClient):
    """Verify recompute_project_status derives status from experiments."""
    from services.project_service import recompute_project_status
    from tests.conftest import test_session_factory

    headers = await _register_and_get_headers(client, "user@example.com")
    pid = await _create_project(client, headers, "Status Test")

    # No experiments → new
    async with test_session_factory() as db:
        await recompute_project_status(db, pid)
        await db.commit()

    resp = await client.get(f"/api/v1/projects/{pid}", headers=headers)
    assert resp.json()["status"] == "new"

    # Add experiments in different statuses
    async with test_session_factory() as db:
        db.add(
            Experiment(
                project_id=pid,
                name="Exp1",
                assay_type="CUT&RUN",
                status="complete",
            )
        )
        db.add(
            Experiment(
                project_id=pid,
                name="Exp2",
                assay_type="CUT&RUN",
                status="complete",
            )
        )
        await db.commit()

    async with test_session_factory() as db:
        await recompute_project_status(db, pid)
        await db.commit()

    resp = await client.get(f"/api/v1/projects/{pid}", headers=headers)
    assert resp.json()["status"] == "complete"

    # One error experiment → project becomes error
    async with test_session_factory() as db:
        db.add(
            Experiment(
                project_id=pid,
                name="Exp3",
                assay_type="CUT&RUN",
                status="error",
            )
        )
        await db.commit()

    async with test_session_factory() as db:
        await recompute_project_status(db, pid)
        await db.commit()

    resp = await client.get(f"/api/v1/projects/{pid}", headers=headers)
    assert resp.json()["status"] == "error"
