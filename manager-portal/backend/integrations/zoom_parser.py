"""
zoom_parser.py
--------------
Parses Zoom .vtt transcript files into structured Python dicts.

Supports:
  - Speaker-prefixed lines  ("John Smith: Hello there")
  - Plain text lines        (no speaker prefix → speaker = "Unknown")
  - Consecutive-turn merging for the same speaker
  - Call-date extraction from Zoom filename conventions
  - Duration calculation from first/last timestamp
  - Deduplication of Zoom's partial-line repetitions
  - BOM characters, Windows line endings, empty files, malformed timestamps

Public API
----------
  parse_vtt(file_path: str) -> dict
  parse_vtt_text(content: str, file_path: str = '') -> dict
"""

from __future__ import annotations

import os
import re
from typing import Optional


# ---------------------------------------------------------------------------
# Timestamp helpers
# ---------------------------------------------------------------------------

_TS_RE = re.compile(
    r"(\d{2,}):(\d{2}):(\d{2})(?:[.,](\d+))?"
)


def _ts_to_seconds(ts: str) -> Optional[int]:
    """Convert HH:MM:SS[.mmm] or HH:MM:SS[,mmm] to integer seconds."""
    m = _TS_RE.match(ts.strip())
    if not m:
        return None
    h, mn, s = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return h * 3600 + mn * 60 + s


def _ts_to_hms(ts: str) -> str:
    """Normalise a raw VTT timestamp to HH:MM:SS (drop sub-second part)."""
    m = _TS_RE.match(ts.strip())
    if not m:
        return ts.strip()
    h, mn, s = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return f"{h:02d}:{mn:02d}:{s:02d}"


# ---------------------------------------------------------------------------
# Filename date extraction
# ---------------------------------------------------------------------------

# GMT20240501-150000_Recording.transcript.vtt
_ZOOM_GMT_RE = re.compile(r"GMT(\d{4})(\d{2})(\d{2})-\d{6}")

# 2024-05-01 15.00.00 Meeting Name.transcript.vtt
_ZOOM_ISO_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})\s+\d{2}\.\d{2}\.\d{2}")

# Fallback: bare ISO date anywhere in name  2024-05-01
_BARE_ISO_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


def _extract_date(filename: str) -> Optional[str]:
    """Return ISO date (YYYY-MM-DD) from a Zoom VTT filename, or None."""
    for pattern in (_ZOOM_GMT_RE, _ZOOM_ISO_RE, _BARE_ISO_RE):
        m = pattern.search(filename)
        if m:
            year, month, day = m.group(1), m.group(2), m.group(3)
            # Basic sanity check
            if 1 <= int(month) <= 12 and 1 <= int(day) <= 31:
                return f"{year}-{month}-{day}"
    return None


# ---------------------------------------------------------------------------
# VTT block parser
# ---------------------------------------------------------------------------

_ARROW_RE = re.compile(r"--\s*>")          # timing line separator
_SPEAKER_RE = re.compile(r"^([^:]{1,80}):\s+(.+)$")  # "Speaker Name: text"


def _parse_blocks(lines: list[str]) -> list[dict]:
    """
    Parse raw VTT lines into a list of raw cue dicts:
      { "start": str, "end": str, "speaker": str, "text": str }
    """
    cues: list[dict] = []
    i = 0
    n = len(lines)

    # Skip WEBVTT header and any NOTE/STYLE blocks
    while i < n and not _ARROW_RE.search(lines[i]):
        i += 1

    while i < n:
        line = lines[i]

        # Timing line?
        if _ARROW_RE.search(line):
            parts = _ARROW_RE.split(line, maxsplit=1)
            start_raw = parts[0].strip()
            # end may have extra positioning info — take only the timestamp
            end_raw = parts[1].strip().split()[0] if parts[1].strip() else ""

            # Collect text lines that follow (until blank line or next cue)
            i += 1
            text_lines = []
            while i < n and lines[i] != "" and not _ARROW_RE.search(lines[i]):
                stripped = lines[i]
                # Skip pure cue-number lines (a single integer)
                if not stripped.isdigit():
                    text_lines.append(stripped)
                i += 1

            if text_lines:
                raw_text = " ".join(text_lines).strip()
                # Try to extract speaker
                m = _SPEAKER_RE.match(raw_text)
                if m:
                    speaker = m.group(1).strip()
                    text = m.group(2).strip()
                else:
                    speaker = "Unknown"
                    text = raw_text

                cues.append({
                    "start": _ts_to_hms(start_raw),
                    "end": _ts_to_hms(end_raw),
                    "start_raw": start_raw,
                    "end_raw": end_raw,
                    "speaker": speaker,
                    "text": text,
                })
        else:
            i += 1

    return cues


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def _deduplicate(cues: list[dict]) -> list[dict]:
    """
    Zoom sometimes emits rolling partial captions before the final version.
    If a later cue's text *starts with* the text of the previous cue (same
    speaker), the earlier partial is dropped.
    Also drops exact duplicates.
    """
    if not cues:
        return cues

    cleaned: list[dict] = []
    for cue in cues:
        if (
            cleaned
            and cleaned[-1]["speaker"] == cue["speaker"]
            and (
                cue["text"].startswith(cleaned[-1]["text"])
                or cleaned[-1]["text"] == cue["text"]
            )
        ):
            # Replace the earlier partial with the longer/updated version
            cleaned[-1] = cue
        else:
            cleaned.append(cue)
    return cleaned


# ---------------------------------------------------------------------------
# Merge consecutive same-speaker turns
# ---------------------------------------------------------------------------

def _merge_turns(cues: list[dict]) -> list[dict]:
    """Merge consecutive cues from the same speaker into a single turn."""
    if not cues:
        return cues

    merged: list[dict] = []
    current = dict(cues[0])

    for cue in cues[1:]:
        if cue["speaker"] == current["speaker"]:
            # Append text, keep start timestamp of the first segment
            current["text"] = current["text"].rstrip() + " " + cue["text"].lstrip()
            current["end"] = cue["end"]
            current["end_raw"] = cue["end_raw"]
        else:
            merged.append(current)
            current = dict(cue)

    merged.append(current)
    return merged


# ---------------------------------------------------------------------------
# Core parsing logic
# ---------------------------------------------------------------------------

def parse_vtt_text(content: str, file_path: str = "") -> dict:
    """
    Parse the *text content* of a Zoom VTT transcript.

    Parameters
    ----------
    content   : Raw VTT file content (str).
    file_path : Optional originating file path (used for metadata only).

    Returns
    -------
    Structured dict — see module docstring for schema.

    Raises
    ------
    ValueError  if content is empty or does not look like a VTT file.
    """
    if not content or not content.strip():
        raise ValueError("VTT content is empty.")

    # Strip BOM, normalise line endings
    content = content.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")

    lines = content.split("\n")

    # Must start with WEBVTT (after stripping)
    first_non_empty = next((l.strip() for l in lines if l.strip()), "")
    if not first_non_empty.startswith("WEBVTT"):
        raise ValueError(
            "Content does not appear to be a valid WebVTT file "
            "(expected 'WEBVTT' header)."
        )

    # Remove blank leading lines, cue sequence numbers
    cleaned_lines: list[str] = []
    for line in lines:
        stripped = line.rstrip()          # keep left-side content, strip \r
        cleaned_lines.append(stripped)

    # Parse raw cue blocks
    raw_cues = _parse_blocks(cleaned_lines)

    # Deduplicate rolling partials
    deduped = _deduplicate(raw_cues)

    # Merge consecutive same-speaker turns
    turns_raw = _merge_turns(deduped)

    # Build final turn objects
    turns = [
        {
            "speaker": t["speaker"],
            "start": t["start"],
            "text": t["text"].strip(),
        }
        for t in turns_raw
        if t["text"].strip()
    ]

    # Participants (preserve first-seen order, deduplicate)
    seen: set[str] = set()
    participants: list[str] = []
    for t in turns:
        sp = t["speaker"]
        if sp != "Unknown" and sp not in seen:
            seen.add(sp)
            participants.append(sp)

    # Duration
    duration_seconds: Optional[int] = None
    if raw_cues:
        first_sec = _ts_to_seconds(raw_cues[0]["start_raw"])
        last_sec = _ts_to_seconds(raw_cues[-1]["end_raw"])
        if first_sec is not None and last_sec is not None and last_sec >= first_sec:
            duration_seconds = last_sec - first_sec

    # Full text & word count
    full_text = "\n".join(t["text"] for t in turns)
    word_count = len(full_text.split()) if full_text.strip() else 0

    # File metadata
    file_name = os.path.basename(file_path) if file_path else ""
    call_date = _extract_date(file_name) if file_name else None

    return {
        "file_path": file_path,
        "file_name": file_name,
        "call_date": call_date,
        "duration_seconds": duration_seconds,
        "participants": participants,
        "turns": turns,
        "full_text": full_text,
        "word_count": word_count,
    }


def parse_vtt(file_path: str) -> dict:
    """
    Parse a Zoom VTT transcript file from disk.

    Parameters
    ----------
    file_path : Absolute or relative path to the .vtt file.

    Returns
    -------
    Structured dict — see module docstring for schema.

    Raises
    ------
    ValueError  if the file cannot be read or is not valid VTT.
    FileNotFoundError  if the path does not exist.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"VTT file not found: {file_path!r}")

    try:
        with open(file_path, "r", encoding="utf-8-sig") as fh:
            content = fh.read()
    except UnicodeDecodeError:
        # Fallback to latin-1 for exotic encodings
        with open(file_path, "r", encoding="latin-1") as fh:
            content = fh.read()

    return parse_vtt_text(content, file_path=file_path)


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python zoom_parser.py <path/to/file.vtt>")
        sys.exit(1)

    result = parse_vtt(sys.argv[1])
    # Pretty-print without turns text for brevity
    summary = {k: v for k, v in result.items() if k != "full_text"}
    print(json.dumps(summary, indent=2, ensure_ascii=False))
