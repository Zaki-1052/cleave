# backend/tests/conftest.py
import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_headers():
    """Generate auth headers for a test user.

    TODO: implement — create test user, get token, return headers
    """
    return {"Authorization": "Bearer test-token"}
