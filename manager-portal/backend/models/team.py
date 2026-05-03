from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Any, List, Optional

from sqlalchemy import Date, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel

if TYPE_CHECKING:
    from .actions import ActionItem
    from .transcripts import Transcript


class TeamMember(BaseModel):
    __tablename__ = "team_members"

    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")
    timezone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    one_on_ones: Mapped[List["OneOnOne"]] = relationship(
        "OneOnOne", back_populates="member", cascade="all, delete-orphan"
    )
    achievements: Mapped[List["Achievement"]] = relationship(
        "Achievement", back_populates="member", cascade="all, delete-orphan"
    )
    wellbeing_signals: Mapped[List["WellbeingSignal"]] = relationship(
        "WellbeingSignal", back_populates="member", cascade="all, delete-orphan"
    )
    feedback: Mapped[List["Feedback"]] = relationship(
        "Feedback", back_populates="member"
    )
    action_items: Mapped[List["ActionItem"]] = relationship(
        "ActionItem", back_populates="member"
    )


class OneOnOne(BaseModel):
    __tablename__ = "one_on_ones"

    member_id: Mapped[str] = mapped_column(
        String, ForeignKey("team_members.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    transcript_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("transcripts.id"), nullable=True
    )
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sentiment: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    topics: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    raw_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    member: Mapped["TeamMember"] = relationship(
        "TeamMember", back_populates="one_on_ones"
    )
    transcript: Mapped[Optional["Transcript"]] = relationship(
        "Transcript", back_populates="one_on_ones"
    )


class Achievement(BaseModel):
    __tablename__ = "achievements"

    member_id: Mapped[str] = mapped_column(
        String, ForeignKey("team_members.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    impact_level: Mapped[str] = mapped_column(String, nullable=False, default="medium")
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    source_ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    quarter: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    # Relationships
    member: Mapped["TeamMember"] = relationship(
        "TeamMember", back_populates="achievements"
    )


class WellbeingSignal(BaseModel):
    __tablename__ = "wellbeing_signals"

    member_id: Mapped[str] = mapped_column(
        String, ForeignKey("team_members.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    signal_text: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False, default="green")
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    source_ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Relationships
    member: Mapped["TeamMember"] = relationship(
        "TeamMember", back_populates="wellbeing_signals"
    )


class Feedback(BaseModel):
    __tablename__ = "feedback"

    member_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("team_members.id"), nullable=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    score: Mapped[Optional[int]] = mapped_column(nullable=True)
    feedback_text: Mapped[str] = mapped_column(Text, nullable=False)
    from_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    from_role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")

    # Relationships
    member: Mapped[Optional["TeamMember"]] = relationship(
        "TeamMember", back_populates="feedback"
    )
