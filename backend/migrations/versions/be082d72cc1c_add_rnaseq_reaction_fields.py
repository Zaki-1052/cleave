"""add rnaseq reaction fields

Revision ID: be082d72cc1c
Revises: cf4728be3c58
Create Date: 2026-04-08 00:49:02.272641

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'be082d72cc1c'
down_revision: Union[str, None] = 'cf4728be3c58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('reactions', sa.Column('treatment', sa.String(), nullable=True))
    op.add_column('reactions', sa.Column('timepoint', sa.String(), nullable=True))
    op.add_column('reactions', sa.Column('genotype', sa.String(), nullable=True))
    op.add_column('reactions', sa.Column('replicate_number', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('reactions', 'replicate_number')
    op.drop_column('reactions', 'genotype')
    op.drop_column('reactions', 'timepoint')
    op.drop_column('reactions', 'treatment')
