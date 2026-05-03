from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.models.team import TeamMember, OneOnOne, Achievement, WellbeingSignal, Feedback

router = APIRouter(prefix="/team", tags=["team"])


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class TeamMemberCreate(BaseModel):
    name: str
    role: Optional[str] = None
    email: Optional[str] = None
    start_date: Optional[date] = None
    notes: Optional[str] = None
    timezone: Optional[str] = None
    level: Optional[str] = None


class TeamMemberUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    start_date: Optional[date] = None
    notes: Optional[str] = None
    timezone: Optional[str] = None
    level: Optional[str] = None


class OneOnOneCreate(BaseModel):
    member_id: int
    date: date
    notes: Optional[str] = None
    mood: Optional[str] = None
    action_items: Optional[str] = None
    transcript_id: Optional[int] = None


class OneOnOneUpdate(BaseModel):
    date: Optional[date] = None
    notes: Optional[str] = None
    mood: Optional[str] = None
    action_items: Optional[str] = None
    transcript_id: Optional[int] = None


class AchievementCreate(BaseModel):
    member_id: int
    description: str
    date: Optional[date] = None
    source: Optional[str] = None
    transcript_id: Optional[int] = None


class WellbeingCreate(BaseModel):
    member_id: int
    signal: str
    date: Optional[date] = None
    notes: Optional[str] = None
    source: Optional[str] = None
    transcript_id: Optional[int] = None


class FeedbackCreate(BaseModel):
    member_id: int
    content: str
    direction: Optional[str] = None  # 'given' | 'received'
    date: Optional[date] = None
    source: Optional[str] = None
    transcript_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Team members
# ---------------------------------------------------------------------------

@router.get("/members")
def list_members(db: Session = Depends(get_db)):
    members = db.query(TeamMember).filter(TeamMember.deleted_at == None).all()  # noqa: E711
    return [m.to_dict() for m in members]


@router.post("/members", status_code=201)
def create_member(body: TeamMemberCreate, db: Session = Depends(get_db)):
    member = TeamMember(**body.model_dump(exclude_none=True))
    db.add(member)
    db.flush()
    db.refresh(member)
    return member.to_dict()


@router.get("/members/{id}")
def get_member(id: int, db: Session = Depends(get_db)):
    member = db.query(TeamMember).filter(
        TeamMember.id == id, TeamMember.deleted_at == None  # noqa: E711
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    return member.to_dict()


@router.put("/members/{id}")
def update_member(id: int, body: TeamMemberUpdate, db: Session = Depends(get_db)):
    member = db.query(TeamMember).filter(
        TeamMember.id == id, TeamMember.deleted_at == None  # noqa: E711
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(member, field, value)
    db.flush()
    db.refresh(member)
    return member.to_dict()


@router.delete("/members/{id}", status_code=204)
def delete_member(id: int, db: Session = Depends(get_db)):
    member = db.query(TeamMember).filter(
        TeamMember.id == id, TeamMember.deleted_at == None  # noqa: E711
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    member.deleted_at = datetime.utcnow()
    db.flush()


# ---------------------------------------------------------------------------
# One-on-ones
# ---------------------------------------------------------------------------

@router.get("/members/{id}/one-on-ones")
def list_one_on_ones(id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(OneOnOne)
        .filter(OneOnOne.member_id == id, OneOnOne.deleted_at == None)  # noqa: E711
        .order_by(OneOnOne.date.desc())
        .all()
    )
    return [r.to_dict() for r in rows]


@router.post("/one-on-ones", status_code=201)
def create_one_on_one(body: OneOnOneCreate, db: Session = Depends(get_db)):
    row = OneOnOne(**body.model_dump(exclude_none=True))
    db.add(row)
    db.flush()
    db.refresh(row)
    return row.to_dict()


@router.put("/one-on-ones/{id}")
def update_one_on_one(id: int, body: OneOnOneUpdate, db: Session = Depends(get_db)):
    row = db.query(OneOnOne).filter(OneOnOne.id == id).first()
    if not row:
        raise HTTPException(status_code=404, detail="1:1 not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(row, field, value)
    db.flush()
    db.refresh(row)
    return row.to_dict()


# ---------------------------------------------------------------------------
# Achievements
# ---------------------------------------------------------------------------

@router.get("/members/{id}/achievements")
def list_achievements(id: int, db: Session = Depends(get_db)):
    rows = db.query(Achievement).filter(
        Achievement.member_id == id, Achievement.deleted_at == None  # noqa: E711
    ).all()
    return [r.to_dict() for r in rows]


@router.post("/achievements", status_code=201)
def create_achievement(body: AchievementCreate, db: Session = Depends(get_db)):
    row = Achievement(**body.model_dump(exclude_none=True))
    db.add(row)
    db.flush()
    db.refresh(row)
    return row.to_dict()


@router.delete("/achievements/{id}", status_code=204)
def delete_achievement(id: int, db: Session = Depends(get_db)):
    row = db.query(Achievement).filter(
        Achievement.id == id, Achievement.deleted_at == None  # noqa: E711
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Achievement not found")
    row.deleted_at = datetime.utcnow()
    db.flush()


# ---------------------------------------------------------------------------
# Wellbeing
# ---------------------------------------------------------------------------

@router.get("/members/{id}/wellbeing")
def list_wellbeing(id: int, db: Session = Depends(get_db)):
    rows = db.query(WellbeingSignal).filter(
        WellbeingSignal.member_id == id, WellbeingSignal.deleted_at == None  # noqa: E711
    ).all()
    return [r.to_dict() for r in rows]


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

@router.get("/members/{id}/feedback")
def list_feedback(id: int, db: Session = Depends(get_db)):
    rows = db.query(Feedback).filter(
        Feedback.member_id == id, Feedback.deleted_at == None  # noqa: E711
    ).all()
    return [r.to_dict() for r in rows]


@router.post("/feedback", status_code=201)
def create_feedback(body: FeedbackCreate, db: Session = Depends(get_db)):
    row = Feedback(**body.model_dump(exclude_none=True))
    db.add(row)
    db.flush()
    db.refresh(row)
    return row.to_dict()
