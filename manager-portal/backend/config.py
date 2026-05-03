"""
config.py — Manager Portal configuration loader.

Usage:
    from config import get_config, get_db_path, get_port, ...

Environment:
    PORTAL_ENV  — profile to load (default: 'work')
                  Loads config/config.{PORTAL_ENV}.yaml relative to project root.
                  Falls back to config/config.example.yaml with a warning if not found.
"""

from __future__ import annotations

import os
import sys
import warnings
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml  # PyYAML — pip install pyyaml

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# Project root is the parent of the directory this file lives in.
_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _BACKEND_DIR.parent
_CONFIG_DIR = _PROJECT_ROOT / "config"

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _expand_paths(value: Any) -> Any:
    """Recursively expand '~' in every string value inside a nested dict/list."""
    if isinstance(value, dict):
        return {k: _expand_paths(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_paths(item) for item in value]
    if isinstance(value, str) and value.startswith("~"):
        return str(Path(value).expanduser())
    return value


def _resolve_config_file(profile: str) -> tuple[Path, bool]:
    """
    Return (config_path, is_fallback).

    Tries config/config.{profile}.yaml first.
    Falls back to config/config.example.yaml when the profile file is absent.
    """
    profile_path = _CONFIG_DIR / f"config.{profile}.yaml"
    if profile_path.exists():
        return profile_path, False

    example_path = _CONFIG_DIR / "config.example.yaml"
    return example_path, True


def _print_banner(profile: str, config_file: Path, is_fallback: bool) -> None:
    width = 60
    line = "─" * width
    print(f"\n┌{line}┐")
    print(f"│{'  Manager Portal — Config Loader':^{width}}│")
    print(f"├{line}┤")
    print(f"│  {'Profile:':<18}{profile:<{width - 20}}│")
    print(f"│  {'Config file:':<18}{str(config_file):<{width - 20}}│")
    if is_fallback:
        print(f"│  {'⚠  FALLBACK':^{width}}│")
        print(f"│  {'Using example config — create config.' + profile + '.yaml':<{width}}│")
    print(f"└{line}┘\n")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_config() -> dict[str, Any]:
    """
    Load and return the parsed configuration dict.
    Results are cached — the file is only read once per process.
    """
    profile = os.environ.get("PORTAL_ENV", "work").strip()
    config_file, is_fallback = _resolve_config_file(profile)

    if is_fallback:
        warnings.warn(
            f"Config file 'config/config.{profile}.yaml' not found. "
            f"Falling back to '{config_file.name}'. "
            "Copy it to a profile-specific file and fill in real values.",
            UserWarning,
            stacklevel=2,
        )

    if not config_file.exists():
        raise FileNotFoundError(
            f"Neither 'config/config.{profile}.yaml' nor 'config/config.example.yaml' "
            f"exists under {_CONFIG_DIR}. Cannot start."
        )

    with config_file.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}

    config = _expand_paths(raw)
    _print_banner(profile, config_file, is_fallback)
    return config


# ---------------------------------------------------------------------------
# Convenience accessors
# ---------------------------------------------------------------------------


def get_profile() -> str:
    """Return the active profile name ('work' or 'personal')."""
    return str(get_config().get("profile", os.environ.get("PORTAL_ENV", "work")))


def get_port() -> int:
    """Return the server port as an integer."""
    return int(get_config().get("server", {}).get("port", 8000))


def get_db_path() -> str:
    """Return the absolute path to the SQLite database file."""
    raw = get_config().get("database", {}).get("path", "data/portal.db")
    p = Path(raw)
    if not p.is_absolute():
        p = _PROJECT_ROOT / p
    return str(p.resolve())


def get_zoom_folder() -> str:
    """Return the absolute, tilde-expanded path to the Zoom recordings folder."""
    raw = get_config().get("zoom", {}).get("folder", "~/Documents/Zoom")
    return str(Path(raw).expanduser().resolve())


def get_anthropic_key() -> str:
    """Return the Anthropic API key from config (or ANTHROPIC_API_KEY env var as override)."""
    env_key = os.environ.get("ANTHROPIC_API_KEY")
    if env_key:
        return env_key
    return str(get_config().get("extraction", {}).get("anthropic_api_key", ""))


def get_user_name() -> str:
    """Return the configured user's display name."""
    return str(get_config().get("user", {}).get("name", ""))


def get_user_email() -> str:
    """Return the configured user's email address."""
    return str(get_config().get("user", {}).get("email", ""))


# ---------------------------------------------------------------------------
# CLI smoke-test:  python config.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cfg = get_config()
    print(f"  profile      : {get_profile()}")
    print(f"  port         : {get_port()}")
    print(f"  db_path      : {get_db_path()}")
    print(f"  zoom_folder  : {get_zoom_folder()}")
    print(f"  user_name    : {get_user_name()}")
    print(f"  user_email   : {get_user_email()}")
    has_key = bool(get_anthropic_key() and not get_anthropic_key().startswith("sk-ant-your"))
    print(f"  anthropic_key: {'✓ set' if has_key else '✗ placeholder / not set'}")
    sys.exit(0)
