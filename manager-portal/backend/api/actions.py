from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.models.actions import ActionItem

router = APIRouter(prefix="/actions", tags=["actions"])


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class ActionItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "open"
    source: Optional[str] = None
    member_id: Optional[int] = None
    project_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    transcript_id: Optional[int] = None


class ActionItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    member_id: Optional[int] = None
    project_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: Optional[str] = None
    completed_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# NOTE: /actions/count must be defined BEFORE /actions/{id} so FastAPI
#       doesn't treat "count" as an integer path parameter.
# ---------------------------------------------------------------------------

@router.get("/count")
def count_actions(db: Session = Depends(get_db)):
    """Return counts by status: open, in_progress, done, overdue."""
    now = datetime.utcnow()

    def _count(status: str) -> int:
        return (
            db.query(func.count(ActionItem.id))
            .filter(ActionItem.status == status, ActionItem.deleted_at == None)  # noqa: E711
            .scalar()
        ) or 0

    overdue_count = (
        db.query(func.count(ActionItem.id))
        .filter(
            ActionItem.due_date < now.date(),
            ActionItem.status != "done",
            ActionItem.deleted_at == None,  # noqa: E711
        )
        .scalar()
    ) or 0

    return {
        "open": _count("open"),
        "in_progress": _count("in_progress"),
        "done": _count("done"),
        "overdue": overdue_count,
    }


@router.get("")
def list_actions(
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    member_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    overdue: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(ActionItem).filter(ActionItem.deleted_at == None)  # noqa: E711

    if status:
        q = q.filter(ActionItem.status == status)
    if source:
        q = q.filter(ActionItem.source == source)
    if member_id is not None:
        q = q.filter(ActionItem.member_id == member_id)
    if project_id is not None:
        q = q.filter(ActionItem.project_id == project_id)
    if overdue:
        q = q.filter(
            ActionItem.due_date < datetime.utcnow().date(),
            ActionItem.status != "done",
        )

    return [a.to_dict() for a in q.all()]


@router.post("", status_code=201)
def create_action(body: ActionItemCreate, db: Session = Depends(get_db)):
    item = ActionItem(**body.model_dump(exclude_none=True))
    db.add(item)
    db.flush()
    db.refresh(item)
    return item.to_dict()


@router.put("/{id}")
def update_action(id: int, body: ActionItemUpdate, db: Session = Depends(get_db)):
    item = db.query(ActionItem).filter(
        ActionItem.id == id, ActionItem.deleted_at == None  # noqa: E711
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.flush()
    db.refresh(item)
    return item.to_dict()


@router.put("/{id}/complete")
def complete_action(id: int, db: Session = Depends(get_db)):
    item = db.query(ActionItem).filter(
        ActionItem.id == id, ActionItem.deleted_at == None  # noqa: E711
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    item.status = "done"
    item.completed_at = datetime.utcnow()
    db.flush()
    db.refresh(item)
    return item.to_dict()


@router.delete("/{id}", status_code=204)
def delete_action(id: int, db: Session = Depends(get_db)):
    item = db.query(ActionItem).filter(
        ActionItem.id == id, ActionItem.deleted_at == None  # noqa: E711
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    item.deleted_at = datetime.utcnow()
    db.flush()
