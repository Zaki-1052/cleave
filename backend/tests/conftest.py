# backend/tests/conftest.py
import os

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import models  # noqa: F401 — register all tables with Base.metadata
from database import Base, get_db
from main import app
from rate_limit import limiter

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://cleave:dev@localhost:5432/cleave_test",
)

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
test_session_factory = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def setup_db():
    """Create all tables before each test, drop after. Disable rate limiting."""
    limiter.enabled = False
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    limiter.enabled = True


async def _override_get_db():
    async with test_session_factory() as session:
        yield session


@pytest.fixture
async def client():
    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def override_storage_root(tmp_path):
    """Point STORAGE_ROOT to a temporary directory for test isolation."""
    from config import settings

    original = settings.STORAGE_ROOT
    settings.STORAGE_ROOT = str(tmp_path / "cleave_test_storage")
    yield
    settings.STORAGE_ROOT = original


@pytest.fixture
def patch_worker_sessions(monkeypatch):
    """Patch async_session_factory in modules that import it directly.

    Worker and service code bypass FastAPI DI and use async_session_factory
    from their own module namespace (captured at import time). This fixture
    patches each module's local reference to point at the test database.
    Only used by tests that exercise the worker or job_output_service.
    """
    import database
    import services.fastqc_service
    import services.job_output_service
    import services.trimming_service
    import worker

    monkeypatch.setattr(database, "async_session_factory", test_session_factory)
    monkeypatch.setattr(worker, "async_session_factory", test_session_factory)
    monkeypatch.setattr(
        services.trimming_service, "async_session_factory", test_session_factory
    )
    monkeypatch.setattr(
        services.job_output_service, "async_session_factory", test_session_factory
    )
    monkeypatch.setattr(
        services.fastqc_service, "async_session_factory", test_session_factory
    )


@pytest.fixture
async def registered_user(client: AsyncClient) -> dict:
    """Register a test user and return {email, password, access_token, refresh_cookie}."""
    email = "test@example.com"
    password = "testpass123"
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 201
    data = resp.json()
    refresh_cookie = resp.cookies.get("fapiusers_refresh")
    return {
        "email": email,
        "password": password,
        "access_token": data["accessToken"],
        "refresh_cookie": refresh_cookie,
    }


@pytest.fixture
def auth_headers(registered_user: dict) -> dict:
    return {"Authorization": f"Bearer {registered_user['access_token']}"}
