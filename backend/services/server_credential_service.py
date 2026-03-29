# backend/services/server_credential_service.py
"""Encrypted credential storage for saved FTP/SFTP server connections."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.saved_server import SavedServer
from schemas.server_import import SavedServerCreate, SavedServerUpdate


def _get_fernet() -> Fernet:
    """Derive a Fernet key from SECRET_KEY via SHA-256 → base64."""
    key_bytes = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def encrypt_password(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_password(ciphertext: str) -> str:
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt server password — SECRET_KEY may have changed") from exc


async def create_saved_server(
    db: AsyncSession, user_id: int, data: SavedServerCreate
) -> SavedServer:
    server = SavedServer(
        user_id=user_id,
        name=data.name,
        protocol=data.protocol,
        host=data.host,
        port=data.port,
        username=data.username,
        encrypted_password=encrypt_password(data.password),
        default_path=data.default_path,
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server


async def list_saved_servers(db: AsyncSession, user_id: int) -> list[SavedServer]:
    result = await db.execute(
        select(SavedServer).where(SavedServer.user_id == user_id).order_by(SavedServer.name)
    )
    return list(result.scalars().all())


async def get_saved_server(db: AsyncSession, user_id: int, server_id: int) -> SavedServer | None:
    result = await db.execute(
        select(SavedServer).where(
            SavedServer.id == server_id,
            SavedServer.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_saved_server_with_password(
    db: AsyncSession, user_id: int, server_id: int
) -> tuple[SavedServer, str] | None:
    """Return (server, decrypted_password) or None if not found."""
    server = await get_saved_server(db, user_id, server_id)
    if server is None:
        return None
    return server, decrypt_password(server.encrypted_password)


async def update_saved_server(
    db: AsyncSession, user_id: int, server_id: int, data: SavedServerUpdate
) -> SavedServer | None:
    server = await get_saved_server(db, user_id, server_id)
    if server is None:
        return None
    if data.name is not None:
        server.name = data.name
    if data.default_path is not None:
        server.default_path = data.default_path
    if data.username is not None:
        server.username = data.username
    if data.password is not None:
        server.encrypted_password = encrypt_password(data.password)
    await db.commit()
    await db.refresh(server)
    return server


async def delete_saved_server(db: AsyncSession, user_id: int, server_id: int) -> bool:
    server = await get_saved_server(db, user_id, server_id)
    if server is None:
        return False
    await db.delete(server)
    await db.commit()
    return True


async def update_default_path(db: AsyncSession, user_id: int, server_id: int, path: str) -> None:
    """Update the default_path on a saved server (called after successful browse)."""
    server = await get_saved_server(db, user_id, server_id)
    if server:
        server.default_path = path
        await db.commit()
