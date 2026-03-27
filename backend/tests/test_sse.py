# backend/tests/test_sse.py
"""Tests for the SSE real-time notification and job status stream.

HTTP-level auth tests use normal client.get() (401 responses are finite).
Event emission tests call the sse_event_generator directly to avoid
httpx ASGI transport limitations with infinite streaming responses.
"""
import asyncio

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from models.analysis_job import AnalysisJob
from models.notification import Notification
from services.sse_service import sse_event_generator
from tests.conftest import test_session_factory


async def _collect_events(user_id, *, max_events=10, timeout=3.0):
    """Consume SSE generator and collect yielded event strings."""
    events: list[str] = []
    gen = sse_event_generator(user_id)

    async def _drain():
        async for chunk in gen:
            events.append(chunk)
            if len(events) >= max_events:
                return

    try:
        await asyncio.wait_for(_drain(), timeout=timeout)
    except asyncio.TimeoutError:
        pass
    finally:
        await gen.aclose()
    return events


# --- HTTP-level auth tests (401 responses are finite, no streaming involved) ---


@pytest.mark.asyncio
async def test_sse_requires_auth(client: AsyncClient):
    """SSE endpoint without Authorization header returns 401."""
    resp = await client.get("/api/v1/notifications/stream")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_sse_rejects_invalid_token(client: AsyncClient):
    """SSE endpoint with invalid Bearer token returns 401."""
    resp = await client.get(
        "/api/v1/notifications/stream",
        headers={"Authorization": "Bearer garbage-token"},
    )
    assert resp.status_code == 401


# --- Generator-level event emission tests ---


@pytest.mark.asyncio
async def test_sse_generator_runs(
    client: AsyncClient,
    registered_user: dict,
    patch_worker_sessions,
):
    """SSE generator yields keepalive comments without error."""
    me = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {registered_user['access_token']}"},
    )
    user_id = me.json()["id"]

    from config import settings

    original = settings.WORKER_POLL_INTERVAL_SECONDS
    settings.WORKER_POLL_INTERVAL_SECONDS = 0.1
    original_ka = settings.SSE_KEEPALIVE_SECONDS
    settings.SSE_KEEPALIVE_SECONDS = 1
    try:
        events = await _collect_events(user_id, timeout=2.0)
        # Should get at least one keepalive within 2 seconds
        keepalives = [e for e in events if "keepalive" in e]
        assert len(keepalives) >= 1, f"Expected keepalive, got: {events}"
    finally:
        settings.WORKER_POLL_INTERVAL_SECONDS = original
        settings.SSE_KEEPALIVE_SECONDS = original_ka


@pytest.mark.asyncio
async def test_sse_emits_notification_event(
    client: AsyncClient,
    registered_user: dict,
    patch_worker_sessions,
):
    """SSE generator emits a notification event when a new notification is created."""
    me = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {registered_user['access_token']}"},
    )
    user_id = me.json()["id"]

    from config import settings

    original = settings.WORKER_POLL_INTERVAL_SECONDS
    settings.WORKER_POLL_INTERVAL_SECONDS = 0.1

    try:
        async def _insert():
            await asyncio.sleep(0.2)
            async with test_session_factory() as db:
                db.add(Notification(
                    user_id=user_id,
                    type="job_complete",
                    title="Test Job Done",
                    message="Test notification for SSE",
                ))
                await db.commit()

        task = asyncio.create_task(_insert())
        events = await _collect_events(user_id, timeout=2.0)
        await task

        notif_events = [e for e in events if "event: notification" in e]
        assert len(notif_events) >= 1, f"Expected notification event, got: {events}"
        assert any("job_complete" in e for e in notif_events)
    finally:
        settings.WORKER_POLL_INTERVAL_SECONDS = original


@pytest.mark.asyncio
async def test_sse_emits_job_status_event(
    client: AsyncClient,
    registered_user: dict,
    patch_worker_sessions,
):
    """SSE generator emits a job_status event when a job transitions status."""
    token = registered_user["access_token"]

    proj = await client.post(
        "/api/v1/projects", json={"name": "SSE Project"},
        headers={"Authorization": f"Bearer {token}"},
    )
    exp = await client.post(
        f"/api/v1/experiments?projectId={proj.json()['id']}",
        json={"name": "SSE Exp", "assayType": "CUT&RUN"},
        headers={"Authorization": f"Bearer {token}"},
    )
    job = await client.post(
        f"/api/v1/experiments/{exp.json()['id']}/jobs",
        json={"jobType": "trimming", "name": "SSE Job", "params": {}},
        headers={"Authorization": f"Bearer {token}"},
    )
    job_id = job.json()["id"]

    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"},
    )
    user_id = me.json()["id"]

    from config import settings

    original = settings.WORKER_POLL_INTERVAL_SECONDS
    settings.WORKER_POLL_INTERVAL_SECONDS = 0.1

    try:
        async def _update():
            await asyncio.sleep(0.2)
            async with test_session_factory() as db:
                await db.execute(
                    update(AnalysisJob)
                    .where(AnalysisJob.id == job_id)
                    .values(status="running")
                )
                await db.commit()

        task = asyncio.create_task(_update())
        events = await _collect_events(user_id, timeout=2.0)
        await task

        job_events = [e for e in events if "event: job_status" in e]
        assert len(job_events) >= 1, f"Expected job_status event, got: {events}"
        assert any('"running"' in e for e in job_events)
    finally:
        settings.WORKER_POLL_INTERVAL_SECONDS = original


@pytest.mark.asyncio
async def test_sse_isolates_users(
    client: AsyncClient,
    registered_user: dict,
    patch_worker_sessions,
):
    """SSE generator for user A does not emit notifications for user B."""
    me_a = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {registered_user['access_token']}"},
    )
    user_a_id = me_a.json()["id"]

    resp_b = await client.post(
        "/api/v1/auth/register",
        json={"email": "userb@example.com", "password": "testpass123"},
    )
    me_b = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {resp_b.json()['accessToken']}"},
    )
    user_b_id = me_b.json()["id"]

    from config import settings

    original = settings.WORKER_POLL_INTERVAL_SECONDS
    settings.WORKER_POLL_INTERVAL_SECONDS = 0.1

    try:
        async def _insert_for_b():
            await asyncio.sleep(0.2)
            async with test_session_factory() as db:
                db.add(Notification(
                    user_id=user_b_id,
                    type="job_complete",
                    title="B's Job",
                    message="For user B only",
                ))
                await db.commit()

        task = asyncio.create_task(_insert_for_b())
        events = await _collect_events(user_a_id, timeout=1.5)
        await task

        leaked = [e for e in events if "event: notification" in e and "job_complete" in e]
        assert len(leaked) == 0, f"User A saw user B's notification: {events}"
    finally:
        settings.WORKER_POLL_INTERVAL_SECONDS = original
