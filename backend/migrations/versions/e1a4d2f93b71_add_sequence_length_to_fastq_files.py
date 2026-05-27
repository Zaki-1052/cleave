"""add sequence_length to fastq_files

Revision ID: e1a4d2f93b71
Revises: be082d72cc1c
Create Date: 2026-05-27 03:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1a4d2f93b71"
down_revision: Union[str, None] = "be082d72cc1c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("fastq_files", sa.Column("sequence_length", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("fastq_files", "sequence_length")
