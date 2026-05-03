from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .team import OneOnOne


class Transcript(BaseModel):
    __tablename__ = "transcripts"

    file_path: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    call_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    duration_secs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    participants: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    raw_vtt: Mapped[str] = mapped_column(Text, nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    extraction_items: Mapped[List["ExtractionQueueItem"]] = relationship(
        "ExtractionQueueItem",
        primaryjoin="foreign(ExtractionQueueItem.source_ref) == Transcript.id",
        viewonly=True,
    )
    one_on_ones: Mapped[List["OneOnOne"]] = relationship(
        "OneOnOne", back_populates="transcript"
    )


class ExtractionQueueItem(BaseModel):
    __tablename__ = "extraction_queue"

    source_type: Mapped[str] = mapped_column(String, nullable=False)
    source_ref: Mapped[str] = mapped_column(String, nullable=False)
    source_label: Mapped[str] = mapped_column(String, nullable=False)
    proposed_json: Mapped[Any] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class AuditLog(BaseModel):
    __tablename__ = "audit_log"

    # Override soft-delete fields to make them inoperative for audit records —
    # audit logs are permanent and should never be soft-deleted.
    table_name: Mapped[str] = mapped_column(String, nullable=False)
    record_id: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    changed_by: Mapped[str] = mapped_column(String, nullable=False, default="leo")
    snapshot_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    def soft_delete(self) -> None:  # type: ignore[override]
        """Audit records are permanent — soft delete is intentionally a no-op."""
        raise NotImplementedError("AuditLog records cannot be soft-deleted.")
