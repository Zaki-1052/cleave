# backend/tests/test_email_service.py
"""Tests for the email service — preference gating, template rendering, SES integration."""

from unittest.mock import MagicMock

from services.email_service import (
    _format_duration,
    _render_template,
    send_email,
    send_job_notification_email,
    should_send_job_email,
)

# --- should_send_job_email gating logic ---


def test_preference_always_sends_for_all_statuses():
    assert should_send_job_email("always", "complete") is True
    assert should_send_job_email("always", "error") is True
    assert should_send_job_email("always", "terminated") is True


def test_preference_on_error_only_sends_for_error():
    assert should_send_job_email("on_error", "complete") is False
    assert should_send_job_email("on_error", "error") is True
    assert should_send_job_email("on_error", "terminated") is False


def test_preference_never_blocks_all():
    assert should_send_job_email("never", "complete") is False
    assert should_send_job_email("never", "error") is False
    assert should_send_job_email("never", "terminated") is False


def test_unknown_preference_defaults_to_no_send():
    assert should_send_job_email("invalid", "complete") is False


# --- _format_duration ---


def test_format_duration_none():
    assert _format_duration(None) == "N/A"


def test_format_duration_seconds():
    assert _format_duration(45) == "45s"


def test_format_duration_minutes():
    assert _format_duration(125) == "2m 5s"


def test_format_duration_hours():
    assert _format_duration(3725) == "1h 2m"


def test_format_duration_zero():
    assert _format_duration(0) == "0s"


# --- Template rendering with Jinja2 autoescape ---


def test_job_template_renders_variables():
    html = _render_template(
        "job_complete.html",
        job_name="Alignment-1",
        experiment_name="H3K4me3",
        project_name="Lab Project",
        status="Complete",
        status_color="#4CAF50",
        duration="5m 32s",
        results_url="http://localhost:5173/experiments/1",
        settings_url="http://localhost:5173/settings",
        preference="always",
        app_name="Cleave",
    )
    assert "Alignment-1" in html
    assert "H3K4me3" in html
    assert "Lab Project" in html
    assert "5m 32s" in html
    assert "Complete" in html


def test_template_escapes_html_in_user_input():
    """Jinja2 autoescape must prevent HTML injection from user-provided names."""
    html = _render_template(
        "job_complete.html",
        job_name='<script>alert("xss")</script>',
        experiment_name="<img src=x>",
        project_name="Normal Project",
        status="Complete",
        status_color="#4CAF50",
        duration="1m 0s",
        results_url="http://localhost:5173/experiments/1",
        settings_url="http://localhost:5173/settings",
        preference="always",
        app_name="Cleave",
    )
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "<img src=x>" not in html
    assert "&lt;img src=x&gt;" in html


def test_password_reset_template_renders():
    html = _render_template(
        "password_reset.html",
        reset_url="http://localhost:5173/reset-password?token=abc123",
        user_name="Zakir",
        app_name="Cleave",
    )
    assert "Zakir" in html
    assert "reset-password?token=abc123" in html
    assert "1 hour" in html


def test_password_reset_confirm_template_renders():
    html = _render_template(
        "password_reset_confirm.html",
        user_name="Zakir",
        login_url="http://localhost:5173/login",
        app_name="Cleave",
    )
    assert "Zakir" in html
    assert "changed" in html.lower()


# --- SES integration ---


async def test_send_email_skips_when_ses_unconfigured():
    """When AWS_SES_REGION is empty, send_email returns False without error."""
    result = await send_email("test@example.com", "Subject", "<p>Body</p>")
    assert result is False


async def test_send_email_calls_ses_when_configured(monkeypatch):
    """When SES is configured, boto3 send_email is called with correct params."""
    import services.email_service as email_mod
    from config import settings

    monkeypatch.setattr(settings, "AWS_SES_REGION", "us-west-2")
    monkeypatch.setattr(settings, "AWS_SES_FROM_EMAIL", "noreply@cleave.test")

    mock_client = MagicMock()
    monkeypatch.setattr(email_mod, "_ses_client", mock_client)

    result = await send_email("user@test.com", "Test Subject", "<p>Hello</p>")
    assert result is True

    mock_client.send_email.assert_called_once()
    call_kwargs = mock_client.send_email.call_args[1]
    assert call_kwargs["Destination"]["ToAddresses"] == ["user@test.com"]
    assert call_kwargs["Source"] == "noreply@cleave.test"
    assert call_kwargs["Message"]["Subject"]["Data"] == "Test Subject"

    # Reset to prevent leaking into other tests
    monkeypatch.setattr(email_mod, "_ses_client", None)


# --- Job notification email (integration of gating + template + send) ---


async def test_job_email_skipped_by_preference():
    """send_job_notification_email returns False when preference says no."""
    result = await send_job_notification_email(
        to="user@test.com",
        job_name="Alignment",
        experiment_name="H3K4me3",
        project_name="Lab",
        status="complete",
        duration_seconds=300,
        experiment_id=1,
        preference="never",
    )
    assert result is False


async def test_job_email_sends_when_preference_allows(monkeypatch):
    """send_job_notification_email sends when preference is 'always'."""
    import services.email_service as email_mod
    from config import settings

    monkeypatch.setattr(settings, "AWS_SES_REGION", "us-west-2")
    monkeypatch.setattr(settings, "AWS_SES_FROM_EMAIL", "noreply@cleave.test")

    mock_client = MagicMock()
    monkeypatch.setattr(email_mod, "_ses_client", mock_client)

    result = await send_job_notification_email(
        to="user@test.com",
        job_name="Alignment",
        experiment_name="H3K4me3",
        project_name="Lab",
        status="complete",
        duration_seconds=300,
        experiment_id=1,
        preference="always",
    )
    assert result is True
    mock_client.send_email.assert_called_once()

    subject = mock_client.send_email.call_args[1]["Message"]["Subject"]["Data"]
    assert "[Cleave] Job Complete: Alignment" == subject

    monkeypatch.setattr(email_mod, "_ses_client", None)
