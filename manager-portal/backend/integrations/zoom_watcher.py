"""
zoom_watcher.py — Watchdog file observer for Zoom VTT transcripts.

Watches the configured Zoom folder for new .vtt files, parses them,
runs Claude extraction, and queues results in extraction_queue for
Leo to review in the Inbox.

Phase 2 — full implementation.
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from datetime import datetime

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileModifiedEvent

logger = logging.getLogger(__name__)

# Module-level observer (started/stopped by main.py lifecycle)
_observer: Observer | None = None


# ── VTT Event Handler ──────────────────────────────────────────────────────────

class VTTHandler(FileSystemEventHandler):
    """Handles new/modified .vtt files in the Zoom folder."""

    def on_created(self, event):
        if not event.is_directory and str(event.src_path).endswith('.vtt'):
            logger.info(f"[zoom_watcher] New VTT file detected: {event.src_path}")
            # Small delay — Zoom may still be writing the file
            time.sleep(2)
            _ingest_file(str(event.src_path))

    def on_modified(self, event):
        # Only process modifications for files we haven't processed yet
        if not event.is_directory and str(event.src_path).endswith('.vtt'):
            from backend.database import session_scope
            from backend.models.transcripts import Transcript
            from sqlalchemy import select
            with session_scope() as db:
                existing = db.execute(
                    select(Transcript).where(Transcript.file_path == str(event.src_path))
                ).scalar_one_or_none()
                if existing and existing.processed:
                    return  # Already processed, skip
            logger.info(f"[zoom_watcher] Modified unprocessed VTT: {event.src_path}")
            time.sleep(2)
            _ingest_file(str(event.src_path))


# ── Core Ingestion ─────────────────────────────────────────────────────────────

def _ingest_file(file_path: str) -> None:
    """
    Full pipeline for a single VTT file:
    1. Parse VTT → structured dialogue
    2. Save Transcript record (if not already saved)
    3. Run Claude extraction
    4. Save ExtractionQueueItem for inbox review
    """
    from backend.database import session_scope
    from backend.models.transcripts import Transcript, ExtractionQueueItem
    from backend.integrations.zoom_parser import parse_vtt
    from backend.extractors.from_transcript import extract_from_transcript
    from sqlalchemy import select

    logger.info(f"[zoom_watcher] Ingesting: {file_path}")

    # ── 1. Parse VTT ──
    try:
        parsed = parse_vtt(file_path)
    except Exception as e:
        logger.error(f"[zoom_watcher] Failed to parse {file_path}: {e}")
        return

    if parsed["word_count"] < 10:
        logger.warning(f"[zoom_watcher] Skipping nearly-empty transcript: {file_path}")
        return

    # ── 2. Save Transcript (idempotent) ──
    with session_scope() as db:
        existing = db.execute(
            select(Transcript).where(Transcript.file_path == file_path)
        ).scalar_one_or_none()

        if existing and existing.processed:
            logger.info(f"[zoom_watcher] Already processed: {file_path}")
            return

        if not existing:
            transcript = Transcript(
                file_path=file_path,
                file_name=parsed["file_name"],
                call_date=_parse_date(parsed.get("call_date")),
                duration_secs=parsed.get("duration_seconds"),
                participants=parsed.get("participants", []),
                raw_vtt=open(file_path, encoding="utf-8", errors="replace").read(),
                processed=False,
            )
            db.add(transcript)
            db.flush()
            transcript_id = transcript.id
            logger.info(f"[zoom_watcher] Saved transcript record: {transcript_id}")
        else:
            transcript_id = existing.id
            logger.info(f"[zoom_watcher] Using existing transcript record: {transcript_id}")

    # ── 3. Detect member name from participants ──
    from backend.config import get_user_name
    manager_name = get_user_name()
    participants = parsed.get("participants", [])
    member_name = next(
        (p for p in participants if p.lower() != manager_name.lower()),
        "Unknown"
    )

    # ── 4. Run Claude extraction ──
    logger.info(f"[zoom_watcher] Running Claude extraction for {parsed['file_name']} (member: {member_name})")
    try:
        extraction = extract_from_transcript(parsed, member_name=member_name)
    except Exception as e:
        logger.error(f"[zoom_watcher] Extraction failed for {file_path}: {e}")
        _mark_processed(transcript_id, success=False)
        return

    # ── 5. Count proposed items ──
    item_count = (
        len(extraction.get("action_items", [])) +
        len(extraction.get("achievements", [])) +
        len(extraction.get("wellbeing_signals", [])) +
        len(extraction.get("project_updates", []))
    )

    # ── 6. Save to extraction queue ──
    with session_scope() as db:
        queue_item = ExtractionQueueItem(
            source_type="zoom",
            source_ref=file_path,
            source_label=f"1:1 with {member_name} — {parsed.get('call_date', 'Unknown date')}",
            proposed_json={
                **extraction,
                "_meta": {
                    "transcript_id": transcript_id,
                    "file_name": parsed["file_name"],
                    "member_name": member_name,
                    "call_date": parsed.get("call_date"),
                    "participants": participants,
                }
            },
            status="pending",
            item_count=item_count,
        )
        db.add(queue_item)
        logger.info(
            f"[zoom_watcher] Queued {item_count} items for review "
            f"({parsed['file_name']}, member: {member_name})"
        )

    # ── 7. Mark transcript as processed ──
    _mark_processed(transcript_id, success=True)


def _mark_processed(transcript_id: str, success: bool = True) -> None:
    from backend.database import session_scope
    from backend.models.transcripts import Transcript
    with session_scope() as db:
        t = db.get(Transcript, transcript_id)
        if t:
            t.processed = success
            t.processed_at = datetime.utcnow()


def _parse_date(date_str: str | None):
    if not date_str:
        return None
    try:
        from datetime import date
        return date.fromisoformat(date_str)
    except Exception:
        return None


# ── Public API ─────────────────────────────────────────────────────────────────

def start_watcher() -> None:
    """Start the watchdog observer. Called by main.py on startup."""
    global _observer

    from backend.config import get_zoom_folder

    zoom_folder = get_zoom_folder()
    folder_path = Path(zoom_folder).expanduser()

    if not folder_path.exists():
        logger.warning(
            f"[zoom_watcher] Zoom folder does not exist: {folder_path} — "
            "watcher not started. Create the folder or update config.yaml."
        )
        return

    if _observer and _observer.is_alive():
        logger.info("[zoom_watcher] Watcher already running.")
        return

    handler = VTTHandler()
    _observer = Observer()
    _observer.schedule(handler, str(folder_path), recursive=True)
    _observer.start()
    logger.info(f"[zoom_watcher] Watching: {folder_path}")


def stop_watcher() -> None:
    """Stop the watchdog observer. Called by main.py on shutdown."""
    global _observer
    if _observer and _observer.is_alive():
        _observer.stop()
        _observer.join(timeout=5)
        logger.info("[zoom_watcher] Watcher stopped.")
    _observer = None


def scan_now() -> dict:
    """
    Manually scan the Zoom folder for all unprocessed VTT files.
    Returns a summary dict with counts.
    Called by: make sync-zoom, POST /api/sync/zoom
    """
    from backend.config import get_zoom_folder
    from backend.database import session_scope
    from backend.models.transcripts import Transcript
    from sqlalchemy import select

    zoom_folder = Path(get_zoom_folder()).expanduser()
    logger.info(f"[zoom_watcher] Manual scan: {zoom_folder}")

    if not zoom_folder.exists():
        return {"error": f"Zoom folder not found: {zoom_folder}", "processed": 0, "skipped": 0, "failed": 0}

    # Find all VTT files recursively
    vtt_files = sorted(zoom_folder.rglob("*.vtt"))
    logger.info(f"[zoom_watcher] Found {len(vtt_files)} VTT files total")

    processed = 0
    skipped = 0
    failed = 0

    for vtt_path in vtt_files:
        file_path = str(vtt_path)

        # Check if already processed
        with session_scope() as db:
            existing = db.execute(
                select(Transcript).where(
                    Transcript.file_path == file_path,
                )
            ).scalar_one_or_none()

            if existing and existing.processed:
                skipped += 1
                continue

        try:
            _ingest_file(file_path)
            processed += 1
        except Exception as e:
            logger.error(f"[zoom_watcher] Error ingesting {file_path}: {e}")
            failed += 1

    summary = {
        "total_found": len(vtt_files),
        "processed": processed,
        "skipped": skipped,
        "failed": failed,
    }
    logger.info(f"[zoom_watcher] Scan complete: {summary}")
    return summary
