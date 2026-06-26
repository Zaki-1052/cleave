# backend/services/email_service.py
"""Email sending service. Supports SMTP (any provider) and Amazon SES."""

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import structlog
from jinja2 import Environment, FileSystemLoader

from config import settings

logger = structlog.get_logger("cleave.email")

# Lazy-initialized SES client (module-level singleton)
_ses_client = None

_jinja_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent.parent / "templates"),
    autoescape=True,
)


def _get_ses_client():
    """Return boto3 SES client, or None if SES is unconfigured."""
    global _ses_client
    if not settings.AWS_SES_REGION or not settings.AWS_SES_FROM_EMAIL:
        return None
    if _ses_client is None:
        import boto3

        _ses_client = boto3.client("ses", region_name=settings.AWS_SES_REGION)
    return _ses_client


def _render_template(name: str, **kwargs) -> str:
    """Render a Jinja2 HTML template with auto-escaped variables."""
    return _jinja_env.get_template(name).render(**kwargs)


def _send_email_smtp_sync(to: str, subject: str, html_body: str) -> bool:
    """Send an email via SMTP (synchronous). Returns True on success."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info("email.sent", to=to, subject=subject, transport="smtp")
        return True
    except Exception:
        logger.exception("email.smtp_send_failed", to=to, subject=subject)
        return False


def _send_email_ses_sync(to: str, subject: str, html_body: str) -> bool:
    """Send an email via AWS SES (synchronous). Returns True on success."""
    client = _get_ses_client()
    if client is None:
        return False
    from botocore.exceptions import ClientError

    try:
        client.send_email(
            Source=settings.AWS_SES_FROM_EMAIL,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
            },
        )
        logger.info("email.sent", to=to, subject=subject, transport="ses")
        return True
    except ClientError:
        logger.exception("email.ses_send_failed", to=to, subject=subject)
        return False


def _send_email_sync(to: str, subject: str, html_body: str) -> bool:
    """Send an email via the first configured transport. Returns True on success."""
    if settings.SMTP_HOST and settings.SMTP_FROM_EMAIL:
        return _send_email_smtp_sync(to, subject, html_body)
    if settings.AWS_SES_REGION and settings.AWS_SES_FROM_EMAIL:
        return _send_email_ses_sync(to, subject, html_body)
    logger.info("email.skipped_no_config", to=to, subject=subject)
    return False


async def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send email asynchronously (wraps sync boto3 call in a thread)."""
    return await asyncio.to_thread(_send_email_sync, to, subject, html_body)


def should_send_job_email(preference: str, job_status: str) -> bool:
    """Determine whether to send a job email based on user preference and job outcome."""
    if preference == "never":
        return False
    if preference == "always":
        return True
    if preference == "on_error":
        return job_status == "error"
    return False


def _format_duration(seconds: int | None) -> str:
    """Format seconds into human-readable duration string."""
    if seconds is None:
        return "N/A"
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m"


_STATUS_COLORS = {
    "complete": "#4CAF50",
    "error": "#B71C1C",
    "terminated": "#9E9E9E",
}

_STATUS_LABELS = {
    "complete": "Complete",
    "error": "Failed",
    "terminated": "Terminated",
}


async def send_job_notification_email(
    to: str,
    job_name: str,
    experiment_name: str,
    project_name: str,
    status: str,
    duration_seconds: int | None,
    experiment_id: int,
    preference: str,
) -> bool:
    """Send job completion email if user preference allows it."""
    if not should_send_job_email(preference, status):
        logger.info("email.skipped_preference", to=to, preference=preference, status=status)
        return False

    label = _STATUS_LABELS.get(status, status)
    html = _render_template(
        "job_complete.html",
        job_name=job_name,
        experiment_name=experiment_name,
        project_name=project_name,
        status=label,
        status_color=_STATUS_COLORS.get(status, "#9E9E9E"),
        duration=_format_duration(duration_seconds),
        results_url=f"{settings.APP_URL}/experiments/{experiment_id}",
        settings_url=f"{settings.APP_URL}/settings",
        preference=preference,
        app_name="Cleave",
    )
    subject = f"[Cleave] Job {label}: {job_name}"
    return await send_email(to, subject, html)


async def send_password_reset_email(to: str, token: str, user_name: str) -> bool:
    """Send password reset email with reset link."""
    html = _render_template(
        "password_reset.html",
        reset_url=f"{settings.APP_URL}/reset-password?token={token}",
        user_name=user_name or to,
        app_name="Cleave",
    )
    return await send_email(to, "[Cleave] Reset Your Password", html)


async def send_password_reset_confirmation_email(to: str, user_name: str) -> bool:
    """Send confirmation that password was changed."""
    html = _render_template(
        "password_reset_confirm.html",
        user_name=user_name or to,
        login_url=f"{settings.APP_URL}/login",
        app_name="Cleave",
    )
    return await send_email(to, "[Cleave] Password Changed", html)
