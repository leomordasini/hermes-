from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.models import (
    ActionItem,
    Achievement,
    WellbeingSignal,
    ProjectUpdate,
)
from backend.models.transcripts import ExtractionQueueItem

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inbox", tags=["inbox"])

# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class ApproveItemBody(BaseModel):
    item_type: str
    item_data: dict[str, Any]


class InboxUpdate(BaseModel):
    proposed_json: Any  # flexible — can be dict or list


# ---------------------------------------------------------------------------
# item_type → model mapping
# ---------------------------------------------------------------------------

_TYPE_TO_MODEL = {
    "action_item": ActionItem,
    "achievement": Achievement,
    "wellbeing_signal": WellbeingSignal,
    "project_update": ProjectUpdate,
}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/count")
def inbox_count(db: Session = Depends(get_db)):
    pending = (
        db.query(func.count(ExtractionQueueItem.id))
        .filter(ExtractionQueueItem.status == "pending")
        .scalar()
    ) or 0
    total = (db.query(func.count(ExtractionQueueItem.id)).scalar()) or 0
    return {"pending": pending, "total": total}


@router.get("")
def list_inbox(status: Optional[str] = "pending", db: Session = Depends(get_db)):
    q = db.query(ExtractionQueueItem)
    if status:
        q = q.filter(ExtractionQueueItem.status == status)
    return [item.to_dict() for item in q.all()]


@router.post("/{id}/approve", status_code=201)
def approve_item(id: int, body: ApproveItemBody, db: Session = Depends(get_db)):
    """Approve a single extracted item and write it to the correct table."""
    queue_item = db.query(ExtractionQueueItem).filter(ExtractionQueueItem.id == id).first()
    if not queue_item:
        raise HTTPException(status_code=404, detail="Inbox item not found")

    model_cls = _TYPE_TO_MODEL.get(body.item_type)
    if model_cls is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown item_type '{body.item_type}'. Valid: {list(_TYPE_TO_MODEL)}",
        )

    record = model_cls(**body.item_data)
    db.add(record)
    db.flush()
    db.refresh(record)

    queue_item.status = "approved"
    queue_item.processed_at = datetime.utcnow()
    db.flush()

    return record.to_dict()


@router.post("/{id}/approve-all", status_code=201)
def approve_all(id: int, db: Session = Depends(get_db)):
    """Approve every proposed item in the extraction queue entry."""
    queue_item = db.query(ExtractionQueueItem).filter(ExtractionQueueItem.id == id).first()
    if not queue_item:
        raise HTTPException(status_code=404, detail="Inbox item not found")

    proposed = queue_item.proposed_json
    if isinstance(proposed, str):
        try:
            proposed = json.loads(proposed)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="proposed_json is not valid JSON")

    if not isinstance(proposed, list):
        proposed = [proposed]

    created = []
    for entry in proposed:
        item_type = entry.get("item_type") or entry.get("type")
        item_data = entry.get("item_data") or entry.get("data") or {}
        model_cls = _TYPE_TO_MODEL.get(item_type)
        if model_cls is None:
            logger.warning(f"Skipping unknown item_type '{item_type}' in approve-all for inbox {id}")
            continue
        record = model_cls(**item_data)
        db.add(record)
        db.flush()
        db.refresh(record)
        created.append(record.to_dict())

    queue_item.status = "approved"
    queue_item.processed_at = datetime.utcnow()
    db.flush()

    return {"created": created, "count": len(created)}


@router.post("/{id}/dismiss", status_code=200)
def dismiss_item(id: int, db: Session = Depends(get_db)):
    """Mark a queue item as dismissed."""
    queue_item = db.query(ExtractionQueueItem).filter(ExtractionQueueItem.id == id).first()
    if not queue_item:
        raise HTTPException(status_code=404, detail="Inbox item not found")
    queue_item.status = "dismissed"
    queue_item.processed_at = datetime.utcnow()
    db.flush()
    return queue_item.to_dict()


@router.put("/{id}")
def update_inbox_item(id: int, body: InboxUpdate, db: Session = Depends(get_db)):
    """Update proposed_json (for edits before approval)."""
    queue_item = db.query(ExtractionQueueItem).filter(ExtractionQueueItem.id == id).first()
    if not queue_item:
        raise HTTPException(status_code=404, detail="Inbox item not found")
    queue_item.proposed_json = (
        json.dumps(body.proposed_json)
        if not isinstance(body.proposed_json, str)
        else body.proposed_json
    )
    db.flush()
    db.refresh(queue_item)
    return queue_item.to_dict()
