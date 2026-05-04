"""
scheduler.py — APScheduler background jobs for Gmail and Slack polling.

Phase 2: Stub jobs registered but not yet active (Gmail=Phase 7, Slack=Phase 8).
The scheduler itself is fully wired and ready; jobs are added as integrations land.
"""

from __future__ import annotations

import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(
            job_defaults={
                "coalesce": True,       # skip missed runs, don't stack up
                "max_instances": 1,     # never run same job twice simultaneously
                "misfire_grace_time": 300,
            },
            timezone="UTC",
        )
    return _scheduler


def start() -> None:
    """Start the scheduler and register all active jobs. Called by main.py on startup."""
    from backend.config import get_config

    cfg = get_config()
    sched = get_scheduler()

    if sched.running:
        logger.info("[scheduler] Already running.")
        return

    # ── Gmail polling (Phase 7) ──────────────────────────────────────────────
    gmail_cfg = cfg.get("gmail", {})
    if gmail_cfg.get("enabled", False):
        interval_minutes = gmail_cfg.get("poll_interval_minutes", 30)
        sched.add_job(
            _poll_gmail,
            trigger=IntervalTrigger(minutes=interval_minutes),
            id="gmail_poll",
            name="Gmail polling",
            replace_existing=True,
        )
        logger.info(f"[scheduler] Gmail polling every {interval_minutes}m — registered")
    else:
        logger.info("[scheduler] Gmail disabled in config — skipping")

    # ── Slack polling (Phase 8) ──────────────────────────────────────────────
    slack_cfg = cfg.get("slack", {})
    if slack_cfg.get("enabled", False):
        interval_minutes = slack_cfg.get("poll_interval_minutes", 30)
        sched.add_job(
            _poll_slack,
            trigger=IntervalTrigger(minutes=interval_minutes),
            id="slack_poll",
            name="Slack polling",
            replace_existing=True,
        )
        logger.info(f"[scheduler] Slack polling every {interval_minutes}m — registered")
    else:
        logger.info("[scheduler] Slack disabled in config — skipping")

    sched.start()
    logger.info("[scheduler] Started.")


def shutdown(wait: bool = False) -> None:
    """Stop the scheduler cleanly. Called by main.py on shutdown."""
    sched = get_scheduler()
    if sched.running:
        sched.shutdown(wait=wait)
        logger.info("[scheduler] Stopped.")


# ── Job implementations ────────────────────────────────────────────────────────

def _poll_gmail() -> None:
    """Background job: poll Gmail for new action items. Phase 7."""
    try:
        from backend.integrations.gmail import poll_now
        logger.info("[scheduler] Running Gmail poll...")
        poll_now()
    except ImportError:
        logger.warning("[scheduler] Gmail integration not available yet.")
    except Exception as e:
        logger.error(f"[scheduler] Gmail poll failed: {e}")


def _poll_slack() -> None:
    """Background job: poll Slack for new action items. Phase 8."""
    try:
        from backend.integrations.slack import poll_now
        logger.info("[scheduler] Running Slack poll...")
        poll_now()
    except ImportError:
        logger.warning("[scheduler] Slack integration not available yet.")
    except Exception as e:
        logger.error(f"[scheduler] Slack poll failed: {e}")
