# scripts/promote_superuser.py
"""Promote a user to superuser by email address.

Idempotent — no-op if already a superuser.

Usage:
    # Default (zalibhai@ucsd.edu):
    python scripts/promote_superuser.py

    # Specific email:
    python scripts/promote_superuser.py --email someone@example.com

    # Via Docker Compose:
    docker compose exec api python scripts/promote_superuser.py
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from config import settings
from models.user import User

DEFAULT_EMAIL = "zalibhai@ucsd.edu"


async def main(email: str) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None:
            print(f"User '{email}' not found. Register the account first.")
            await engine.dispose()
            sys.exit(1)

        if user.is_superuser:
            print(f"User '{email}' is already a superuser.")
            await engine.dispose()
            return

        await db.execute(
            update(User).where(User.id == user.id).values(is_superuser=True)
        )
        await db.commit()
        print(f"Promoted '{email}' to superuser.")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promote a user to superuser.")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help=f"Email to promote (default: {DEFAULT_EMAIL})")
    args = parser.parse_args()
    asyncio.run(main(args.email))
