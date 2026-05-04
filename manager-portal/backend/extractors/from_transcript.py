"""
backend/extractors/from_transcript.py

Extracts structured management data from a parsed VTT transcript using Claude.
Also provides stubs for email and Slack extraction (future phases).
"""

from backend.extractors.base import extract_json
from backend.config import get_user_name

# ---------------------------------------------------------------------------
# System prompt (shared for transcript extraction)
# ---------------------------------------------------------------------------

_TRANSCRIPT_SYSTEM_PROMPT = (
    "You are an AI assistant helping a manager at Datadog extract structured information "
    "from meeting transcripts.\n"
    "You are precise, conservative, and only extract what is clearly stated.\n"
    "Always return valid JSON. Never add commentary outside the JSON."
)

# ---------------------------------------------------------------------------
# User prompt template
# ---------------------------------------------------------------------------

_TRANSCRIPT_USER_PROMPT = """\
This is a transcript of a 1:1 meeting between {manager_name} and {member_name}.
Date: {call_date}
Duration: {duration_minutes} minutes

Transcript:
{transcript_text}

---

Extract the following from this transcript and return ONLY valid JSON:

{{
  "action_items": [
    {{
      "title": "short action title",
      "description": "more detail if available",
      "due_date": "YYYY-MM-DD or null",
      "owed_to": "person or team name",
      "assigned_to": "Leo | {member_name} | other",
      "priority": "low | medium | high | critical",
      "context": "exact quote or paraphrase from transcript"
    }}
  ],
  "achievements": [
    {{
      "member_name": "{member_name}",
      "description": "specific achievement description",
      "impact_level": "low | medium | high",
      "tags": ["tag1", "tag2"]
    }}
  ],
  "wellbeing_signals": [
    {{
      "member_name": "{member_name}",
      "signal": "what was observed",
      "severity": "green | yellow | red",
      "context": "quote or paraphrase"
    }}
  ],
  "project_updates": [
    {{
      "project_name": "project name",
      "update": "what was said",
      "health": "green | yellow | red"
    }}
  ],
  "summary": "2-3 sentence meeting summary",
  "sentiment": "positive | neutral | concerning"
}}

Rules:
- Only extract action items clearly directed at Leo or {member_name}
- Only log achievements that are specific and meaningful (not generic praise)
- Only flag wellbeing signals that are clearly meaningful (stress, burnout, disengagement, wins)
- Be conservative — quality over quantity
- If nothing found in a category, return an empty array
- All dates must be ISO format YYYY-MM-DD based on the meeting date {call_date}\
"""


# ---------------------------------------------------------------------------
# Main transcript extractor
# ---------------------------------------------------------------------------

def extract_from_transcript(parsed: dict, member_name: str = None) -> dict:
    """
    Takes a parsed VTT dict (from zoom_parser.parse_vtt) and a team member name.
    Returns structured extraction result to be stored in extraction_queue.

    Expected keys in `parsed`:
      - turns: list of {"speaker": str, "text": str, ...}
      - date:  str  (ISO date of the meeting, e.g. "2024-03-15")
      - duration_minutes: int | float  (optional, defaults to 0)
    """
    manager_name: str = get_user_name() or "Leo"
    member_name = member_name or "Team Member"

    # Build transcript text from turns
    turns: list[dict] = parsed.get("turns", [])
    transcript_text: str = "\n".join(
        f"[{turn.get('speaker', 'Unknown')}] {turn.get('text', '')}"
        for turn in turns
    )

    call_date: str = parsed.get("date", "unknown date")
    duration_minutes: int | float = parsed.get("duration_minutes", 0)

    prompt = _TRANSCRIPT_USER_PROMPT.format(
        manager_name=manager_name,
        member_name=member_name,
        call_date=call_date,
        duration_minutes=duration_minutes,
        transcript_text=transcript_text,
    )

    result = extract_json(prompt=prompt, system=_TRANSCRIPT_SYSTEM_PROMPT)

    # Ensure result is a dict with expected top-level keys (safety net)
    if not isinstance(result, dict):
        raise ValueError(
            f"Claude returned a {type(result).__name__} instead of a JSON object."
        )

    defaults: dict = {
        "action_items": [],
        "achievements": [],
        "wellbeing_signals": [],
        "project_updates": [],
        "summary": "",
        "sentiment": "neutral",
    }
    for key, default in defaults.items():
        result.setdefault(key, default)

    return result


# ---------------------------------------------------------------------------
# Email extractor (stub — Phase 7)
# ---------------------------------------------------------------------------

def extract_from_email(subject: str, body: str, sender: str, date: str) -> dict:
    """
    Extract action items and a summary from an email thread.

    TODO: Implement full email extraction in Phase 7.
          For now returns an empty structure so callers don't break.
    """
    # TODO (Phase 7): Build a prompt that summarises the email thread and
    #   extracts action items addressed to the manager or their reports.
    #   Use extract_json() the same way extract_from_transcript() does.
    return {
        "action_items": [],
        "summary": "",
        # Metadata preserved for when implementation is added
        "_stub": True,
        "_source": "email",
        "_subject": subject,
        "_sender": sender,
        "_date": date,
    }


# ---------------------------------------------------------------------------
# Slack extractor (stub — Phase 8)
# ---------------------------------------------------------------------------

def extract_from_slack(messages: list[dict], channel: str) -> dict:
    """
    Extract structured management data from a list of Slack messages.

    TODO: Implement in Phase 8.
    """
    # TODO (Phase 8): Build a prompt from messages (each dict has 'user',
    #   'text', 'ts'), call extract_json(), and return structured results
    #   similar to extract_from_transcript().
    return {
        "action_items": [],
        "summary": "",
        "_stub": True,
        "_source": "slack",
        "_channel": channel,
    }
