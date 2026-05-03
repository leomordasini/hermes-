from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .team import TeamMember
    from .projects import Project


class ActionItem(BaseModel):
    __tablename__ = "action_items"

    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    owed_to: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")
    priority: Mapped[str] = mapped_column(String, nullable=False, default="medium")
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    source_ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    member_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("team_members.id"), nullable=True
    )
    project_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("projects.id"), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    member: Mapped[Optional["TeamMember"]] = relationship(
        "TeamMember", back_populates="action_items"
    )
    project: Mapped[Optional["Project"]] = relationship(
        "Project", back_populates="action_items"
    )

    @property
    def is_overdue(self) -> bool:
        """Return True if the action item is past its due date and not yet done or cancelled."""
        if self.due_date is None:
            return False
        if self.status in ("done", "cancelled"):
            return False
        return self.due_date < date.today()
