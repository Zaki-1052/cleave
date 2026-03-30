"""add project status

Revision ID: c5d8f3a10b64
Revises: b4c7e2f19a53
Create Date: 2026-03-30 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d8f3a10b64'
down_revision: Union[str, None] = 'b4c7e2f19a53'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('status', sa.String(), nullable=False, server_default='new'))


def downgrade() -> None:
    op.drop_column('projects', 'status')
