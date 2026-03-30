# backend/tests/test_server_import.py
"""Tests for FTP/SFTP server import — SSRF validation, browse, import, saved servers."""

import socket
from unittest.mock import patch

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
# SSRF Validation
# ---------------------------------------------------------------------------


class TestSSRFValidation:
    def test_block_private_ip_10(self):
        from services.server_import_service import _validate_host

        with pytest.raises(ValueError, match="private/reserved"):
            _validate_host("10.0.0.1")

    def test_block_private_ip_172(self):
        from services.server_import_service import _validate_host

        with pytest.raises(ValueError, match="private/reserved"):
            _validate_host("172.16.0.1")

    def test_block_private_ip_192(self):
        from services.server_import_service import _validate_host

        with pytest.raises(ValueError, match="private/reserved"):
            _validate_host("192.168.1.1")

    def test_block_loopback(self):
        from services.server_import_service import _validate_host

        with pytest.raises(ValueError, match="private/reserved"):
            _validate_host("127.0.0.1")

    def test_block_localhost(self):
        from services.server_import_service import _validate_host

        with pytest.raises(ValueError, match="not allowed"):
            _validate_host("localhost")

    def test_block_aws_metadata(self):
        from services.server_import_service import _validate_host

        with pytest.raises(ValueError, match="private/reserved"):
            _validate_host("169.254.169.254")

    def test_block_zero_address(self):
        from services.server_import_service import _validate_host

        with pytest.raises(ValueError, match="private/reserved"):
            _validate_host("0.0.0.0")

    @patch("services.server_import_service.socket.getaddrinfo")
    def test_block_ipv6_mapped_loopback(self, mock_getaddrinfo):
        from services.server_import_service import _validate_host

        mock_getaddrinfo.return_value = [
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("::ffff:127.0.0.1", 0, 0, 0))
        ]
        with pytest.raises(ValueError, match="private/reserved"):
            _validate_host("evil.example.com")

    @patch("services.server_import_service.socket.getaddrinfo")
    def test_block_ipv6_mapped_metadata(self, mock_getaddrinfo):
        from services.server_import_service import _validate_host

        mock_getaddrinfo.return_value = [
            (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("::ffff:169.254.169.254", 0, 0, 0))
        ]
        with pytest.raises(ValueError, match="private/reserved"):
            _validate_host("evil.example.com")


# ---------------------------------------------------------------------------
# Credential Service
# ---------------------------------------------------------------------------


class TestCredentialService:
    def test_encrypt_decrypt_roundtrip(self):
        from services.server_credential_service import decrypt_password, encrypt_password

        plaintext = "my-secret-password!"
        encrypted = encrypt_password(plaintext)
        assert encrypted != plaintext
        assert decrypt_password(encrypted) == plaintext

    def test_different_inputs_different_ciphertexts(self):
        from services.server_credential_service import encrypt_password

        a = encrypt_password("password-a")
        b = encrypt_password("password-b")
        assert a != b


# ---------------------------------------------------------------------------
# Browse (mock mode)
# ---------------------------------------------------------------------------


class TestBrowse:
    @patch("services.server_import_service._validate_host")
    async def test_browse_mock_returns_entries(
        self, mock_validate, client: AsyncClient, auth_headers: dict
    ):
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/server-import/browse",
            json={
                "protocol": "ftp",
                "host": "mock.example.com",
                "username": "user",
                "password": "pass",
                "path": "/",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["currentPath"] == "/"
        assert len(data["entries"]) > 0

        # Should contain FASTQ files
        names = [e["name"] for e in data["entries"]]
        assert "Sample1_R1_001.fastq.gz" in names

    async def test_browse_requires_auth(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/experiments/1/server-import/browse",
            json={
                "protocol": "ftp",
                "host": "mock.example.com",
                "username": "user",
                "password": "pass",
                "path": "/",
            },
        )
        assert resp.status_code == 401

    async def test_browse_requires_contributor(self, client: AsyncClient, auth_headers: dict):
        """Viewer role should not be able to browse."""
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        # Register a second user
        resp2 = await client.post(
            "/api/v1/auth/register",
            json={"email": "viewer@example.com", "password": "viewerpass"},
        )
        viewer_token = resp2.json()["accessToken"]
        viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

        # Add as viewer
        await client.post(
            f"/api/v1/projects/{pid}/members",
            json={"email": "viewer@example.com", "role": "viewer"},
            headers=auth_headers,
        )

        resp = await client.post(
            f"/api/v1/experiments/{eid}/server-import/browse",
            json={
                "protocol": "ftp",
                "host": "mock.example.com",
                "username": "user",
                "password": "pass",
                "path": "/",
            },
            headers=viewer_headers,
        )
        assert resp.status_code == 404  # permission helper returns None → 404

    async def test_browse_blocks_ssrf(self, client: AsyncClient, auth_headers: dict):
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/server-import/browse",
            json={
                "protocol": "ftp",
                "host": "169.254.169.254",
                "username": "user",
                "password": "pass",
                "path": "/",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "private/reserved" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Import validation
# ---------------------------------------------------------------------------


class TestImportValidation:
    @patch("services.server_import_service._validate_host")
    async def test_start_import_validates_filenames(
        self, _mock_host, client: AsyncClient, auth_headers: dict
    ):
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/server-import/start",
            json={
                "protocol": "ftp",
                "host": "mock.example.com",
                "username": "user",
                "password": "pass",
                "filePaths": ["/data/bad_file.txt"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "fastq" in resp.json()["detail"].lower() or "R1" in resp.json()["detail"]

    @patch("services.server_import_service._validate_host")
    async def test_start_import_rejects_duplicates_in_batch(
        self, _mock_host, client: AsyncClient, auth_headers: dict
    ):
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/server-import/start",
            json={
                "protocol": "ftp",
                "host": "mock.example.com",
                "username": "user",
                "password": "pass",
                "filePaths": [
                    "/data/Sample1_R1_001.fastq.gz",
                    "/data/Sample1_R1_001.fastq.gz",
                ],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "Duplicate" in resp.json()["detail"]

    @patch("services.server_import_service._validate_host")
    async def test_start_import_returns_import_id(
        self, _mock_host, client: AsyncClient, auth_headers: dict
    ):
        pid = await _create_project(client, auth_headers)
        eid = await _create_experiment(client, auth_headers, pid)

        resp = await client.post(
            f"/api/v1/experiments/{eid}/server-import/start",
            json={
                "protocol": "ftp",
                "host": "mock.example.com",
                "username": "user",
                "password": "pass",
                "filePaths": ["/data/Sample1_R1_001.fastq.gz"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 202
        data = resp.json()
        assert "importId" in data
        assert data["fileCount"] == 1


# ---------------------------------------------------------------------------
# Saved Servers CRUD
# ---------------------------------------------------------------------------


class TestSavedServers:
    async def test_create_and_list(self, client: AsyncClient, auth_headers: dict):
        # Create
        resp = await client.post(
            "/api/v1/users/me/saved-servers",
            json={
                "name": "IGM FTP",
                "protocol": "ftp",
                "host": "ftp.igm.ucsd.edu",
                "username": "labuser",
                "password": "secret",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 201
        server = resp.json()
        assert server["name"] == "IGM FTP"
        assert server["protocol"] == "ftp"
        assert server["host"] == "ftp.igm.ucsd.edu"
        assert server["username"] == "labuser"
        # Password should NEVER be returned
        assert "password" not in server
        assert "encryptedPassword" not in server

        # List
        resp = await client.get("/api/v1/users/me/saved-servers", headers=auth_headers)
        assert resp.status_code == 200
        servers = resp.json()
        assert len(servers) == 1
        assert servers[0]["name"] == "IGM FTP"

    async def test_duplicate_name_rejected(self, client: AsyncClient, auth_headers: dict):
        await client.post(
            "/api/v1/users/me/saved-servers",
            json={
                "name": "My Server",
                "protocol": "sftp",
                "host": "sftp.example.com",
                "username": "user",
                "password": "pass",
            },
            headers=auth_headers,
        )

        resp = await client.post(
            "/api/v1/users/me/saved-servers",
            json={
                "name": "My Server",
                "protocol": "ftp",
                "host": "ftp.other.com",
                "username": "user2",
                "password": "pass2",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 409

    async def test_delete_saved_server(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/users/me/saved-servers",
            json={
                "name": "Temp Server",
                "protocol": "ftp",
                "host": "ftp.temp.com",
                "username": "user",
                "password": "pass",
            },
            headers=auth_headers,
        )
        server_id = resp.json()["id"]

        resp = await client.delete(
            f"/api/v1/users/me/saved-servers/{server_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 204

        # Verify gone
        resp = await client.get("/api/v1/users/me/saved-servers", headers=auth_headers)
        assert len(resp.json()) == 0

    async def test_update_saved_server(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post(
            "/api/v1/users/me/saved-servers",
            json={
                "name": "Old Name",
                "protocol": "ftp",
                "host": "ftp.example.com",
                "username": "user",
                "password": "pass",
            },
            headers=auth_headers,
        )
        server_id = resp.json()["id"]

        resp = await client.patch(
            f"/api/v1/users/me/saved-servers/{server_id}",
            json={"name": "New Name"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    async def test_user_isolation(self, client: AsyncClient, auth_headers: dict):
        """User A's saved servers are not visible to User B."""
        # User A creates a server
        await client.post(
            "/api/v1/users/me/saved-servers",
            json={
                "name": "User A Server",
                "protocol": "ftp",
                "host": "ftp.a.com",
                "username": "a",
                "password": "pass",
            },
            headers=auth_headers,
        )

        # Register User B
        resp = await client.post(
            "/api/v1/auth/register",
            json={"email": "b@example.com", "password": "bpassword"},
        )
        b_headers = {"Authorization": f"Bearer {resp.json()['accessToken']}"}

        # User B sees no servers
        resp = await client.get("/api/v1/users/me/saved-servers", headers=b_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 0
