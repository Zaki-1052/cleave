# backend/tests/test_local_import.py
"""Tests for local filesystem import — path validation, browse, import."""

import os
from pathlib import Path

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

    def test_reject_storage_root(self, override_storage_root):
        from config import settings
        from services.local_import_service import validate_local_path

        os.makedirs(settings.STORAGE_ROOT, exist_ok=True)
        with pytest.raises(ValueError, match="managed storage"):
            validate_local_path(settings.STORAGE_ROOT)

    def test_reject_path_inside_storage_root(self, override_storage_root):
        from config import settings
        from services.local_import_service import validate_local_path

        subdir = Path(settings.STORAGE_ROOT) / "projects" / "1"
        os.makedirs(subdir, exist_ok=True)
        with pytest.raises(ValueError, match="managed storage"):
            validate_local_path(str(subdir))

    def test_reject_proc(self):
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="system directory"):
            validate_local_path("/proc")

    def test_reject_etc(self):
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="system directory"):
            validate_local_path("/etc")

    def test_reject_sys(self):
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="system directory"):
            validate_local_path("/sys")

    def test_reject_dev(self):
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="system directory"):
            validate_local_path("/dev")

    def test_reject_nonexistent(self):
        from services.local_import_service import validate_local_path

        with pytest.raises(ValueError, match="does not exist"):
            validate_local_path("/nonexistent_path_that_does_not_exist_abc123")

    def test_reject_file_when_dir_required(self, tmp_path):
        from services.local_import_service import validate_local_path

        f = tmp_path / "test.txt"
        f.write_text("hello")
        with pytest.raises(ValueError, match="not a directory"):
            validate_local_path(str(f), must_be_dir=True)

    def test_accept_valid_dir(self, tmp_path):
        from services.local_import_service import validate_local_path

        result = validate_local_path(str(tmp_path), must_be_dir=True)
        assert result.is_dir()

    def test_accept_valid_file(self, tmp_path):
        from services.local_import_service import validate_local_path

        f = tmp_path / "sample_R1_001.fastq.gz"
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

    async def test_browse_requires_contributor(self, client: AsyncClient, auth_headers: dict):
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
            json={"path": "/tmp"},
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
        self, client: AsyncClient, auth_headers: dict, tmp_path, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        # Create test files
        (tmp_path / "subdir").mkdir()
        (tmp_path / "sample_R1_001.fastq.gz").write_bytes(b"data")
        (tmp_path / "sample_R2_001.fastq.gz").write_bytes(b"data")
        (tmp_path / ".hidden").write_text("hidden")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/browse",
            json={"path": str(tmp_path)},
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

    async def test_browse_invalid_path(self, client: AsyncClient, auth_headers: dict, monkeypatch):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/browse",
            json={"path": "/nonexistent_abc123"},
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
        self, client: AsyncClient, auth_headers: dict, tmp_path, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        # Create a file with invalid name
        bad_file = tmp_path / "not_a_fastq.txt"
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
        self, client: AsyncClient, auth_headers: dict, tmp_path, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        f = tmp_path / "sample_R1_001.fastq.gz"
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
        self, client: AsyncClient, auth_headers: dict, monkeypatch
    ):
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "real")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/local-import/start",
            json={"filePaths": ["/nonexistent/sample_R1_001.fastq.gz"]},
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "does not exist" in resp.json()["detail"]

    async def test_import_starts_successfully_mock(
        self, client: AsyncClient, auth_headers: dict, monkeypatch
    ):
        """Mock mode should accept the import and return 202."""
        from config import settings

        monkeypatch.setattr(settings, "PIPELINE_MODE", "mock")

        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        # In mock mode, path validation is skipped since we don't call validate_local_path
        # on each file (mock start_local_import handles it). We need real files for the router
        # validation though. Use tmp_path.
        # Actually let's just test with mock mode where source path validation still runs.
        # We'll create real temporary files.
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            f1 = Path(tmpdir) / "sample_R1_001.fastq.gz"
            f2 = Path(tmpdir) / "sample_R2_001.fastq.gz"
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
