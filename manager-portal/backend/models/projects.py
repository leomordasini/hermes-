from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import Date, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .actions import ActionItem


class Project(BaseModel):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="not_started")
    priority: Mapped[str] = mapped_column(String, nullable=False, default="medium")
    owner: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stakeholders: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    health: Mapped[str] = mapped_column(String, nullable=False, default="green")
    health_note: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    # Relationships
    updates: Mapped[List["ProjectUpdate"]] = relationship(
        "ProjectUpdate", back_populates="project", cascade="all, delete-orphan"
    )
    action_items: Mapped[List["ActionItem"]] = relationship(
        "ActionItem", back_populates="project"
    )


class ProjectUpdate(BaseModel):
    __tablename__ = "project_updates"

    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    update_text: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    source_ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project", back_populates="updates"
    )
