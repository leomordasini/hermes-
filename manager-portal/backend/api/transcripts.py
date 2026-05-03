from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.transcripts import Transcript

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transcripts", tags=["transcripts"])

# ---------------------------------------------------------------------------
# NOTE: /transcripts/search and /transcripts/sync must appear BEFORE
#       /transcripts/{id} so FastAPI doesn't treat the literal segments
#       as integer path parameters.
# ---------------------------------------------------------------------------


@router.post("/sync", status_code=202)
def sync_transcripts():
    """Trigger a Zoom folder scan via zoom_watcher.scan_now()."""
    try:
        from backend import zoom_watcher
        zoom_watcher.scan_now()
        return {"status": "ok", "message": "Zoom scan triggered."}
    except ImportError:
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "message": "zoom_watcher module not loaded"},
        )
    except Exception as exc:
        logger.exception("Error during Zoom scan")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(exc)},
        )


@router.get("/search")
def search_transcripts(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Full-text search through raw_vtt content."""
    results = (
        db.query(Transcript)
        .filter(Transcript.raw_vtt.ilike(f"%{q}%"))
        .order_by(Transcript.call_date.desc())
        .all()
    )
    return [t.to_dict() for t in results]


@router.get("")
def list_transcripts(db: Session = Depends(get_db)):
    """List all transcripts sorted by call_date descending."""
    transcripts = db.query(Transcript).order_by(Transcript.call_date.desc()).all()
    return [t.to_dict() for t in transcripts]


@router.get("/{id}")
def get_transcript(id: int, db: Session = Depends(get_db)):
    """Get a single transcript by ID."""
    transcript = db.query(Transcript).filter(Transcript.id == id).first()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return transcript.to_dict()
