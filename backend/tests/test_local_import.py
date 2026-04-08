# backend/tests/test_local_import.py
"""Tests for local filesystem import — path validation, browse, import."""

import pytest
from httpx import AsyncClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_project(client: AsyncClient, auth_headers: dict) -> int:
    resp = await client.post(
        "/api/v1/projects",
        json={"name": "Test Project"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_experiment(client: AsyncClient, auth_headers: dict, project_id: int) -> int:
    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "Test Experiment", "assayType": "CUT&RUN"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Helpers — fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def local_import_root(tmp_path, monkeypatch):
    """Set LOCAL_IMPORT_DEFAULT_PATH to a temp dir so tests can create files inside it."""
    from config import settings

    root = tmp_path / "import_root"
    root.mkdir()
    monkeypatch.setattr(settings, "LOCAL_IMPORT_DEFAULT_PATH", str(root))
    return root


# ---------------------------------------------------------------------------
# Path Validation
# ---------------------------------------------------------------------------


class TestPathValidation:
    def test_reject_relative_path(self):
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="absolute path"):
            validate_local_path("data/fastq")

    def test_reject_empty_path(self):
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="absolute path"):
            validate_local_path("")

    def test_reject_outside_allowed_root(self, local_import_root):
        """Paths outside LOCAL_IMPORT_DEFAULT_PATH are rejected."""
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="must be under"):
            validate_local_path("/home")

    def test_reject_storage_root(self, local_import_root, override_storage_root):
        """STORAGE_ROOT is rejected even if it's under the allowed root."""
        from config import settings
        from services.local_import_service import validate_local_path

        # Place STORAGE_ROOT inside the allowed root to test this specific check
        storage = local_import_root / "cleave_storage"
        storage.mkdir()
        settings.STORAGE_ROOT = str(storage)
        with pytest.raises(ValueError, match="managed storage"):
            validate_local_path(str(storage))

    def test_reject_path_inside_storage_root(self, local_import_root, override_storage_root):
        from config import settings
        from services.local_import_service import validate_local_path

        storage = local_import_root / "cleave_storage"
        subdir = storage / "projects" / "1"
        subdir.mkdir(parents=True)
        settings.STORAGE_ROOT = str(storage)
        with pytest.raises(ValueError, match="managed storage"):
            validate_local_path(str(subdir))

    def test_blocklist_defense_in_depth(self, monkeypatch):
        """System directories are blocked even if LOCAL_IMPORT_DEFAULT_PATH is /."""
        from config import settings
        from services.local_import_service import validate_local_path

        monkeypatch.setattr(settings, "LOCAL_IMPORT_DEFAULT_PATH", "/")
        with pytest.raises(ValueError, match="system directory"):
            validate_local_path("/proc")
        with pytest.raises(ValueError, match="system directory"):
            validate_local_path("/etc")
        with pytest.raises(ValueError, match="system directory"):
            validate_local_path("/sys")
        with pytest.raises(ValueError, match="system directory"):
            validate_local_path("/dev")

    def test_reject_nonexistent(self, local_import_root):
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="does not exist"):
            validate_local_path(str(local_import_root / "nonexistent_abc123"))

    def test_reject_file_when_dir_required(self, local_import_root):
        from services.local_import_service import validate_local_path

        f = local_import_root / "test.txt"
        f.write_text("hello")
        with pytest.raises(ValueError, match="not a directory"):
            validate_local_path(str(f), must_be_dir=True)

    def test_accept_valid_dir(self, local_import_root):
        from services.local_import_service import validate_local_path

        subdir = local_import_root / "fastq"
        subdir.mkdir()
        result = validate_local_path(str(subdir), must_be_dir=True)
        assert result.is_dir()

    def test_accept_valid_file(self, local_import_root):
        from services.local_import_service import validate_local_path

        f = local_import_root / "sample_R1_001.fastq.gz"
        f.write_bytes(b"data")
        result = validate_local_path(str(f), must_be_dir=False)
        assert result.is_file()


# ---------------------------------------------------------------------------
# Browse
# ---------------------------------------------------------------------------


class TestBrowse:
    async def test_browse_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/experiments/1/local-import/browse",
            json={"path": "/data"},
        )
        assert resp.status_code == 401

    async def test_browse_requires_contributor(
        self, client: AsyncClient, auth_headers: dict, local_import_root
    ):
        """Viewer role should not be able to browse."""
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        # Register viewer
        resp = await client.post(
            "/api/v1/auth/register",
            json={"email": "viewer@test.com", "password": "testpass123"},
        )
        viewer_token = resp.json()["accessToken"]
        viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

        # Add as viewer
        await client.post(
            f"/api/v1/projects/{pid}/members",
            json={"email": "viewer@test.com", "role": "viewer"},
            headers=auth_headers,
        )

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/browse",
            json={"path": str(local_import_root)},
            headers=viewer_headers,
        )
        assert resp.status_code == 404

    async def test_browse_mock_mode(self, client: AsyncClient, auth_headers: dict, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "mock")
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/browse",
            json={"path": "/data"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["currentPath"] == "/data"
        assert len(data["entries"]) > 0

    async def test_browse_real_directory(
        self, client: AsyncClient, auth_headers: dict, local_import_root, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        # Create test files inside the allowed root
        (local_import_root / "subdir").mkdir()
        (local_import_root / "sample_R1_001.fastq.gz").write_bytes(b"data")
        (local_import_root / "sample_R2_001.fastq.gz").write_bytes(b"data")
        (local_import_root / ".hidden").write_text("hidden")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/browse",
            json={"path": str(local_import_root)},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        names = [e["name"] for e in data["entries"]]
        assert "subdir" in names
        assert "sample_R1_001.fastq.gz" in names
        # Hidden files should be filtered
        assert ".hidden" not in names
        # Directories should come first
        assert data["entries"][0]["isDir"] is True

    async def test_browse_outside_allowed_root(
        self, client: AsyncClient, auth_headers: dict, local_import_root, monkeypatch
    ):
        """Browsing outside LOCAL_IMPORT_DEFAULT_PATH is rejected."""
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/browse",
            json={"path": "/home"},
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "must be under" in resp.json()["detail"]

    async def test_browse_invalid_path(
        self, client: AsyncClient, auth_headers: dict, local_import_root, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/browse",
            json={"path": str(local_import_root / "nonexistent_abc123")},
            headers=auth_headers,
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Import Validation
# ---------------------------------------------------------------------------


class TestImportValidation:
    async def test_import_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/experiments/1/local-import/start",
            json={"filePaths": ["/data/sample_R1_001.fastq.gz"]},
        )
        assert resp.status_code == 401

    async def test_import_rejects_invalid_filename(
        self, client: AsyncClient, auth_headers: dict, local_import_root, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        # Create a file with invalid name inside the allowed root
        bad_file = local_import_root / "not_a_fastq.txt"
        bad_file.write_text("hello")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/start",
            json={"filePaths": [str(bad_file)]},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    async def test_import_rejects_duplicate_filenames(
        self, client: AsyncClient, auth_headers: dict, local_import_root, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        f = local_import_root / "sample_R1_001.fastq.gz"
        f.write_bytes(b"data")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/start",
            json={"filePaths": [str(f), str(f)]},
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "Duplicate" in resp.json()["detail"]

    async def test_import_rejects_nonexistent_source(
        self, client: AsyncClient, auth_headers: dict, local_import_root, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/start",
            json={"filePaths": [str(local_import_root / "nonexistent_R1_001.fastq.gz")]},
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "does not exist" in resp.json()["detail"]

    async def test_import_rejects_outside_allowed_root(
        self, client: AsyncClient, auth_headers: dict, local_import_root, monkeypatch
    ):
        """Import from outside LOCAL_IMPORT_DEFAULT_PATH is rejected."""
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/start",
            json={"filePaths": ["/tmp/sample_R1_001.fastq.gz"]},
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "must be under" in resp.json()["detail"]

    async def test_import_starts_successfully_mock(
        self, client: AsyncClient, auth_headers: dict, local_import_root, monkeypatch
    ):
        """Mock mode should accept the import and return 202."""
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "mock")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        # Create real files inside the allowed root for router validation
        f1 = local_import_root / "sample_R1_001.fastq.gz"
        f2 = local_import_root / "sample_R2_001.fastq.gz"
        f1.write_bytes(b"data")
        f2.write_bytes(b"data")

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/start",
            json={"filePaths": [str(f1), str(f2)]},
            headers=auth_headers,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["fileCount"] == 2
        assert "importId" in data


# ---------------------------------------------------------------------------
# Progress
# ---------------------------------------------------------------------------


class TestProgress:
    async def test_progress_not_found(self, client: AsyncClient, auth_headers: dict):
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.get(
            f"/api/v1/experiments/{eid}/local-import/nonexistent-id/progress",
            headers=auth_headers,
        )
        assert resp.status_code == 404
