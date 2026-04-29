"""add rms_curve to analysis_results

Revision ID: c3a1f2e8d7b5
Revises: 9e87bf669ba7
Create Date: 2026-04-28 22:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3a1f2e8d7b5'
down_revision: Union[str, Sequence[str], None] = '9e87bf669ba7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('analysis_results', sa.Column('rms_curve', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('analysis_results', 'rms_curve')
