from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
import os
import json
from pathlib import Path
from functools import lru_cache

# Import all models so Base knows about them
from backend.models import *  # noqa
from backend.models.base import Base
from backend.config import get_db_path

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def get_engine():
    """Create (and cache) a SQLAlchemy engine for the active profile's DB."""
    db_path = get_db_path()
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    # Configure SQLite pragmas on every new connection
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

def _make_session_factory():
    return sessionmaker(bind=get_engine(), autocommit=False, autoflush=False)


def get_session() -> Session:
    """Return a new SQLAlchemy Session."""
    factory = _make_session_factory()
    return factory()


# ---------------------------------------------------------------------------
# Session scope context manager
# ---------------------------------------------------------------------------

@contextmanager
def session_scope():
    """Provide a transactional scope around a series of operations."""
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_db():
    """FastAPI dependency: yields a database session."""
    with session_scope() as session:
        yield session


# ---------------------------------------------------------------------------
# DB initialisation
# ---------------------------------------------------------------------------

def init_db():
    """Create all tables (idempotent — safe to call on every startup)."""
    engine = get_engine()
    Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# Export helper
# ---------------------------------------------------------------------------

def export_all() -> dict:
    """
    Query every table registered with Base and return a JSON-serialisable dict
    of {table_name: [row_dicts, ...]}.

    Soft-deleted records are included (full backup).
    Prints the result to stdout as JSON (used by Makefile export targets).
    """
    result: dict[str, list] = {}

    with session_scope() as session:
        for table in Base.metadata.sorted_tables:
            rows = session.execute(table.select()).mappings().all()
            serialised = []
            for row in rows:
                row_dict = {}
                for key, value in row.items():
                    # Convert non-JSON-serialisable types to strings
                    if hasattr(value, "isoformat"):
                        row_dict[key] = value.isoformat()
                    else:
                        row_dict[key] = value
                serialised.append(row_dict)
            result[table.name] = serialised

    print(json.dumps(result, indent=2, default=str))
    return result
