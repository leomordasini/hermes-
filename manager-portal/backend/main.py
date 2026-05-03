from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import logging

from backend.database import init_db
from backend.config import get_profile, get_db_path, get_config

# ---------------------------------------------------------------------------
# Optional Phase-2 imports — app must start even if these don't exist yet
# ---------------------------------------------------------------------------

try:
    from backend import scheduler as _scheduler
    _has_scheduler = True
except ImportError:
    logging.warning("scheduler module not found — background scheduling disabled (Phase 2)")
    _scheduler = None
    _has_scheduler = False

try:
    from backend import zoom_watcher as _zoom_watcher
    _has_zoom_watcher = True
except ImportError:
    logging.warning("zoom_watcher module not found — Zoom watching disabled (Phase 2)")
    _zoom_watcher = None
    _has_zoom_watcher = False

# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------

from backend.api.team import router as team_router
from backend.api.projects import router as projects_router
from backend.api.actions import router as actions_router
from backend.api.transcripts import router as transcripts_router
from backend.api.inbox import router as inbox_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Manager Portal", version="1.0.0")

# CORS — allow all localhost origins (development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:*", "http://127.0.0.1:*"],
    allow_origin_regex=r"https?://localhost(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def on_startup():
    logger.info("Starting Manager Portal …")
    init_db()
    logger.info("Database initialised.")

    if _has_scheduler:
        try:
            _scheduler.start()
            logger.info("Scheduler started.")
        except Exception as exc:
            logger.warning(f"Could not start scheduler: {exc}")

    if _has_zoom_watcher:
        config = get_config()
        zoom_watch_enabled = config.get("zoom", {}).get("watch", False)
        if zoom_watch_enabled:
            try:
                _zoom_watcher.start()
                logger.info("Zoom watcher started.")
            except Exception as exc:
                logger.warning(f"Could not start Zoom watcher: {exc}")
        else:
            logger.info("Zoom watcher disabled in config (zoom.watch=false).")


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("Shutting down Manager Portal …")

    if _has_scheduler and _scheduler is not None:
        try:
            _scheduler.stop()
            logger.info("Scheduler stopped.")
        except Exception as exc:
            logger.warning(f"Error stopping scheduler: {exc}")

    if _has_zoom_watcher and _zoom_watcher is not None:
        try:
            _zoom_watcher.stop()
            logger.info("Zoom watcher stopped.")
        except Exception as exc:
            logger.warning(f"Error stopping Zoom watcher: {exc}")


# ---------------------------------------------------------------------------
# Static files & SPA root
# ---------------------------------------------------------------------------

_FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if _FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_FRONTEND_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def serve_index():
    index = _FRONTEND_DIR / "index.html"
    return FileResponse(str(index))


# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------

app.include_router(team_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(actions_router, prefix="/api")
app.include_router(transcripts_router, prefix="/api")
app.include_router(inbox_router, prefix="/api")

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health", tags=["meta"])
async def health():
    return {
        "status": "ok",
        "profile": get_profile(),
        "db": get_db_path(),
        "version": "1.0.0",
    }


# ---------------------------------------------------------------------------
# Manual sync trigger
# ---------------------------------------------------------------------------

@app.get("/api/sync/{source}", tags=["meta"])
async def manual_sync(source: str):
    """Trigger a manual sync for zoom / gmail / slack."""
    source = source.lower()

    if source == "zoom":
        if _has_zoom_watcher and _zoom_watcher is not None:
            try:
                _zoom_watcher.scan_now()
                return {"status": "ok", "source": "zoom", "message": "Zoom scan triggered."}
            except Exception as exc:
                return JSONResponse(
                    status_code=500,
                    content={"status": "error", "source": "zoom", "message": str(exc)},
                )
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "source": "zoom", "message": "zoom_watcher not loaded"},
        )

    if source in ("gmail", "slack"):
        if _has_scheduler and _scheduler is not None:
            try:
                _scheduler.trigger(source)
                return {"status": "ok", "source": source, "message": f"{source} sync triggered."}
            except Exception as exc:
                return JSONResponse(
                    status_code=500,
                    content={"status": "error", "source": source, "message": str(exc)},
                )
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "source": source, "message": "scheduler not loaded"},
        )

    return JSONResponse(
        status_code=400,
        content={"status": "error", "message": f"Unknown sync source '{source}'. Valid: zoom, gmail, slack"},
    )
