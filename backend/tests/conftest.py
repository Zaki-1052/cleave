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
