"""add is_symlink to fastq_files

Revision ID: cf4728be3c58
Revises: d7a3f1b82e49
Create Date: 2026-04-06 22:15:24.679764

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'cf4728be3c58'
down_revision: Union[str, None] = 'd7a3f1b82e49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('fastq_files', sa.Column('is_symlink', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    op.drop_column('fastq_files', 'is_symlink')
