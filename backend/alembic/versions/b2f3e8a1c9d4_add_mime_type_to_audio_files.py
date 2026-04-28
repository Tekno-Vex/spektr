"""add mime_type to audio_files

Revision ID: b2f3e8a1c9d4
Revises: 1f35ee457180
Create Date: 2026-04-28 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b2f3e8a1c9d4'
down_revision: Union[str, Sequence[str], None] = '1f35ee457180'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('audio_files', sa.Column('mime_type', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('audio_files', 'mime_type')
