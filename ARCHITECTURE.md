# Manager Portal — Architecture Document
> Version 1.0 | Last updated: May 2026 | Owner: Leo Mordasini

---

## 1. Purpose

A local-first, AI-powered management portal that serves as a second brain for Leo's day-to-day work as a Manager at Datadog. It auto-ingests data from Zoom transcripts, Gmail, and Slack, uses Claude to extract structured information (action items, achievements, wellbeing signals), and presents everything in a clean, searchable portal UI.

Designed to grow modularly over time. Each section is independent. New sections, integrations, and extractors can be added without touching existing code.

---

## 2. Core Design Principles

| Principle | Decision |
|---|---|
| **Data permanence** | SQLite on disk. Every record is soft-deleted (never destroyed). Full audit log. |
| **AI-assisted, human-approved** | Claude extracts, Leo approves. Nothing auto-commits to DB. |
| **Local-first** | Runs on localhost. Data never leaves the machine unless Leo exports it. |
| **Profile-isolated** | Work and Personal are completely separate: separate DB, config, ports, Zoom paths. |
| **Zero build step** | Frontend is plain HTML/JS ES modules. Open browser, it works. |
| **Modular** | Backend: one file per integration, one file per extractor, one file per API route. Frontend: one file per section. Adding a new section = add one backend file + one frontend file. |
| **Async review** | Extracted items queue up in an Inbox. Leo reviews when ready — not forced immediately. |

---

## 3. Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend runtime | Python 3.11+ | Best ecosystem for file watching, Gmail API, Claude SDK, SQLite |
| Web framework | FastAPI | Fast, async, auto-docs at /docs, clean routing |
| Database | SQLite via SQLAlchemy | Zero server, single file, portable, trivially backed up |
| Schema migrations | Alembic | Versioned, never destructive migrations |
| File watching | watchdog | Mac-native FSEvents, detects new VTT files instantly |
| Gmail | google-api-python-client | Official, OAuth Desktop flow, token cached locally |
| Slack | slack_sdk + user xoxp token | Workaround for company-managed workspace (no app creation) |
| AI extraction | anthropic Python SDK | Claude Sonnet 4.7 (cost-effective, strong at structured extraction) |
| VTT parsing | Custom Python parser | Extracts speaker, timestamp, text from WebVTT format |
| Frontend | Vanilla JS ES Modules | No build step, no framework, fast load, easy to modify |
| Scheduling | APScheduler | Background polling for Gmail + Slack on a timer |
| Launch | Makefile + Python venv | Clean, Mac-native, no Docker overhead |

---

## 4. Environment Profiles

Two completely isolated environments. Nothing shared.

```
PORTAL_ENV=work        → uses config/config.work.yaml    → data/work.db     → port 8000
PORTAL_ENV=personal    → uses config/config.personal.yaml → data/personal.db → port 8001
```

### Config File Structure (`config.example.yaml`)

```yaml
profile: work                          # work | personal

server:
  port: 8000
  host: 127.0.0.1

database:
  path: data/work.db

zoom:
  folder: ~/Documents/Zoom             # Local Zoom recordings folder
  watch: true                          # Auto-watch for new VTT files
  poll_interval_seconds: 60            # Fallback polling interval

gmail:
  enabled: true
  token_path: ~/.portal/gmail-work-token.json
  credentials_path: config/gmail-credentials.json
  poll_interval_minutes: 30
  labels_to_watch:
    - INBOX
  search_queries:
    - "to:me action required"
    - "to:me please"
    - "to:me by EOD"
    - "to:me by Friday"

slack:
  enabled: true
  user_token: xoxp-...                 # Extracted from browser (see setup docs)
  poll_interval_minutes: 30
  channels_to_watch: []                # Empty = only DMs + @mentions
  dm_enabled: true

extraction:
  model: claude-sonnet-4-7
  review_mode: async                   # async = items queue up in Inbox
  anthropic_api_key: sk-ant-...

user:
  name: Leo Mordasini
  email: leo@datadog.com
```

---

## 5. Full File Structure

```
manager-portal/
│
├── Makefile                           # All launch commands
├── requirements.txt                   # Python dependencies
├── .gitignore                         # Ignores *.db, config.*.yaml, tokens
├── ARCHITECTURE.md                    # This file
│
├── config/
│   ├── config.example.yaml            # ✅ Committed — safe template
│   ├── config.work.yaml               # ❌ Gitignored — real work config
│   ├── config.personal.yaml           # ❌ Gitignored — real personal config
│   └── gmail-credentials.json         # ❌ Gitignored — from Google Cloud Console
│
├── data/
│   ├── work.db                        # ❌ Gitignored — work SQLite database
│   └── personal.db                    # ❌ Gitignored — personal SQLite database
│
├── backend/
│   ├── main.py                        # FastAPI app entry point
│   ├── config.py                      # Config loader (reads PORTAL_ENV)
│   ├── database.py                    # SQLAlchemy setup, session factory
│   ├── scheduler.py                   # APScheduler — Gmail + Slack polling jobs
│   │
│   ├── models/                        # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── base.py                    # BaseModel with id, created_at, updated_at, deleted_at
│   │   ├── team.py                    # TeamMember, OneOnOne, Achievement, WellbeingSignal, Feedback
│   │   ├── projects.py                # Project, ProjectUpdate
│   │   ├── actions.py                 # ActionItem
│   │   └── transcripts.py            # Transcript, ExtractionQueueItem
│   │
│   ├── integrations/                  # Data source connectors
│   │   ├── zoom_watcher.py            # watchdog observer for VTT folder
│   │   ├── zoom_parser.py             # VTT → structured dialogue
│   │   ├── gmail.py                   # Gmail API client + polling
│   │   └── slack.py                   # Slack SDK client + polling
│   │
│   ├── extractors/                    # Claude extraction pipeline
│   │   ├── base.py                    # Shared Claude call + retry logic
│   │   ├── from_transcript.py         # VTT dialogue → structured items
│   │   ├── from_email.py              # Email thread → action items
│   │   └── from_slack.py             # Slack thread → action items
│   │
│   ├── api/                           # FastAPI route modules
│   │   ├── __init__.py
│   │   ├── team.py                    # /api/team/*
│   │   ├── projects.py                # /api/projects/*
│   │   ├── actions.py                 # /api/actions/*
│   │   ├── transcripts.py             # /api/transcripts/*
│   │   └── inbox.py                   # /api/inbox/* (extraction queue)
│   │
│   └── migrations/                    # Alembic migration files
│       ├── env.py
│       ├── alembic.ini
│       └── versions/                  # 001_initial.py, 002_add_nps.py, …
│
└── frontend/
    ├── index.html                     # Entry point — imports all modules
    └── app/
        ├── app.js                     # Module registry, router, modal, toast
        ├── api.js                     # All fetch() calls — thin wrapper over REST
        ├── css/
        │   └── style.css              # Datadog dark theme
        └── modules/
            ├── dashboard.js           # Overview — stats, inbox badge, upcoming
            ├── inbox.js               # Review extracted items (approve/edit/dismiss)
            ├── team.js                # Team members, 1:1s, achievements, wellbeing
            ├── projects.js            # Big-picture projects, status, health
            ├── actions.js             # Action items, deadlines, sources
            └── settings.js            # Config viewer, sync triggers, export/import
```

---

## 6. Database Schema

All tables inherit from `BaseModel`:
```
id            TEXT PRIMARY KEY (UUID)
created_at    DATETIME
updated_at    DATETIME
deleted_at    DATETIME (NULL = active, set = soft-deleted)
```

### team_members
```
name          TEXT NOT NULL
role          TEXT
email         TEXT
start_date    DATE
status        TEXT (active | on_leave | pip | departed)
timezone      TEXT
notes         TEXT
```

### one_on_ones
```
member_id     FK → team_members.id
date          DATE NOT NULL
transcript_id FK → transcripts.id (nullable — can be note-only)
summary       TEXT
sentiment     TEXT (positive | neutral | concerning)
topics        JSON (list of strings)
raw_notes     TEXT
```

### achievements
```
member_id     FK → team_members.id
date          DATE NOT NULL
description   TEXT NOT NULL
impact_level  TEXT (low | medium | high)
source        TEXT (manual | zoom | slack | gmail)
source_ref    TEXT (transcript filename / email id / slack ts)
quarter       TEXT (Q1 2026, Q2 2026, …)
tags          JSON (list of strings)
```

### wellbeing_signals
```
member_id     FK → team_members.id
date          DATE NOT NULL
signal_text   TEXT NOT NULL
severity      TEXT (green | yellow | red)
source        TEXT
source_ref    TEXT
```

### feedback
```
member_id     FK → team_members.id (nullable)
date          DATE NOT NULL
score         INTEGER (0-10, nullable — qualitative only)
feedback_text TEXT NOT NULL
from_name     TEXT
from_role     TEXT
source        TEXT (nps | peer | customer | retro | manual)
```

### projects
```
name          TEXT NOT NULL
description   TEXT
status        TEXT (not_started | active | blocked | completed | on_hold)
priority      TEXT (low | medium | high | critical)
owner         TEXT
stakeholders  JSON
start_date    DATE
due_date      DATE
health        TEXT (green | yellow | red)
health_note   TEXT
tags          JSON
```

### project_updates
```
project_id    FK → projects.id
date          DATE NOT NULL
update_text   TEXT NOT NULL
source        TEXT (manual | zoom | gmail | slack)
source_ref    TEXT
```

### action_items
```
title         TEXT NOT NULL
description   TEXT
due_date      DATE
owed_to       TEXT
context       TEXT
status        TEXT (open | in_progress | done | cancelled)
priority      TEXT (low | medium | high | critical)
source        TEXT (zoom | slack | gmail | manual)
source_ref    TEXT
member_id     FK → team_members.id (nullable — who it relates to)
project_id    FK → projects.id (nullable — which project it relates to)
completed_at  DATETIME
```

### transcripts
```
file_path     TEXT UNIQUE NOT NULL
file_name     TEXT NOT NULL
call_date     DATE
duration_secs INTEGER
participants  JSON (list of speaker names from VTT)
raw_vtt       TEXT (full file content — never deleted)
processed     BOOLEAN DEFAULT FALSE
processed_at  DATETIME
```

### extraction_queue
```
source_type   TEXT (zoom | slack | gmail)
source_ref    TEXT NOT NULL
source_label  TEXT (human-readable: filename, email subject, channel name)
proposed_json JSON NOT NULL (Claude's structured output — see below)
status        TEXT (pending | approved | dismissed | partial)
item_count    INTEGER
reviewed_at   DATETIME
```

### audit_log
```
table_name    TEXT
record_id     TEXT
action        TEXT (insert | update | soft_delete)
changed_by    TEXT (always 'leo' for now — future multi-user ready)
snapshot_json JSON (full record at time of change)
timestamp     DATETIME
```

---

## 7. Extraction Pipeline Detail

### VTT Parser Output
```python
# Input: raw .vtt file
# Output:
{
  "participants": ["Leo Mordasini", "John Smith"],
  "duration_seconds": 3240,
  "call_date": "2026-05-01",
  "turns": [
    {
      "speaker": "Leo Mordasini",
      "start": "00:01:23",
      "text": "Can you make sure the SAP 2.0 deck is ready by Thursday?"
    },
    ...
  ]
}
```

### Claude Extraction Prompt (from_transcript.py)
```
Given this 1:1 meeting transcript between Leo Mordasini (manager) and {member_name},
extract the following and return ONLY valid JSON:

{
  "action_items": [
    {
      "title": "...",
      "description": "...",
      "due_date": "YYYY-MM-DD or null",
      "owed_to": "person name or team",
      "assigned_to": "Leo | {member_name} | other",
      "priority": "low | medium | high | critical",
      "context": "quoted text from transcript"
    }
  ],
  "achievements": [
    {
      "member_name": "...",
      "description": "...",
      "impact_level": "low | medium | high",
      "tags": []
    }
  ],
  "wellbeing_signals": [
    {
      "member_name": "...",
      "signal": "...",
      "severity": "green | yellow | red"
    }
  ],
  "project_updates": [
    {
      "project_name": "...",
      "update": "...",
      "health": "green | yellow | red"
    }
  ],
  "summary": "2-3 sentence summary of the meeting"
}

Only extract action items assigned to Leo or {member_name}.
Only flag wellbeing signals that are clearly meaningful.
Be conservative — quality over quantity.
```

### Proposed JSON stored in extraction_queue
```json
{
  "action_items": [...],
  "achievements": [...],
  "wellbeing_signals": [...],
  "project_updates": [...],
  "summary": "..."
}
```

---

## 8. Inbox (Review Flow)

The Inbox is the most important UX surface. It's where raw AI output becomes real data.

```
Sidebar shows:  📥 Inbox  [14]

Inbox view:
┌─────────────────────────────────────────────────────┐
│ 📥 Inbox — 14 items to review                       │
│                                                     │
│ From: 1:1 with John Smith — May 1, 2026             │
│ ─────────────────────────────────────────────────── │
│ ✅ Action Item                                      │
│    "Send Q2 roadmap to Sarah by Thursday"           │
│    Due: May 8 · Owed to: Sarah                      │
│    [✓ Approve] [✏ Edit] [✗ Dismiss]                 │
│                                                     │
│ 🏆 Achievement                                      │
│    John — "Led the SAP 2.0 demo solo, great result" │
│    Impact: High · Q2 2026                           │
│    [✓ Approve] [✏ Edit] [✗ Dismiss]                 │
│                                                     │
│ 💛 Wellbeing Signal                                 │
│    John — "Mentioned feeling stretched across       │
│    two projects, may need support"                  │
│    Severity: Yellow                                 │
│    [✓ Approve] [✏ Edit] [✗ Dismiss]                 │
│                                                     │
│ [Approve All] [Skip for now]                        │
└─────────────────────────────────────────────────────┘
```

Approving an item writes it to the correct table. Editing lets Leo modify before saving. Dismissing marks it discarded. The source transcript is always linked.

---

## 9. REST API Surface

```
GET  /api/health

# Team
GET    /api/team/members
POST   /api/team/members
GET    /api/team/members/{id}
PUT    /api/team/members/{id}
DELETE /api/team/members/{id}

GET    /api/team/members/{id}/one-on-ones
POST   /api/team/one-on-ones
PUT    /api/team/one-on-ones/{id}

GET    /api/team/members/{id}/achievements
POST   /api/team/achievements
DELETE /api/team/achievements/{id}

GET    /api/team/members/{id}/wellbeing
GET    /api/team/members/{id}/feedback

# Projects
GET    /api/projects
POST   /api/projects
PUT    /api/projects/{id}
DELETE /api/projects/{id}
POST   /api/projects/{id}/updates

# Action Items
GET    /api/actions?status=open&source=zoom&member_id=...
POST   /api/actions
PUT    /api/actions/{id}
PUT    /api/actions/{id}/complete

# Inbox (Extraction Queue)
GET    /api/inbox?status=pending
GET    /api/inbox/count
POST   /api/inbox/{id}/approve       # body: {item_type, item_data}
POST   /api/inbox/{id}/approve-all
POST   /api/inbox/{id}/dismiss

# Transcripts
GET    /api/transcripts
GET    /api/transcripts/{id}
POST   /api/transcripts/sync         # Manual trigger: scan Zoom folder now

# Integrations
POST   /api/sync/zoom
POST   /api/sync/gmail
POST   /api/sync/slack

# Search
GET    /api/search?q=...&types=transcripts,actions,achievements
```

---

## 10. Build Order

Build in this sequence — each phase is independently useful before the next one starts.

```
Phase 1 — Foundation
  ├── Makefile, requirements.txt, .gitignore
  ├── config.py (profile loading)
  ├── database.py (SQLAlchemy + session)
  ├── models/ (all tables)
  ├── Alembic migrations
  └── FastAPI main.py with /health

Phase 2 — Zoom Pipeline  ← HIGHEST VALUE FIRST
  ├── zoom_parser.py (VTT → structured dialogue)
  ├── zoom_watcher.py (watchdog file observer)
  ├── extractors/base.py (Claude call wrapper)
  ├── extractors/from_transcript.py
  ├── api/transcripts.py
  └── api/inbox.py

Phase 3 — Frontend Shell + Inbox
  ├── index.html + app.js + api.js + style.css
  ├── modules/inbox.js  ← review extracted items
  └── modules/dashboard.js (basic stats)

Phase 4 — Team Section
  ├── api/team.py
  └── modules/team.js

Phase 5 — Projects Section
  ├── api/projects.py
  └── modules/projects.js

Phase 6 — Action Items
  ├── api/actions.py
  └── modules/actions.js

Phase 7 — Gmail Integration
  ├── integrations/gmail.py
  ├── extractors/from_email.py
  └── scheduler.py (polling)

Phase 8 — Slack Integration
  ├── integrations/slack.py
  └── extractors/from_slack.py

Phase 9 — Polish
  ├── Full-text search across all tables
  ├── Promotion packet generator (per member)
  ├── Weekly digest view
  └── Export to JSON / CSV
```

---

## 11. Makefile Commands

```makefile
make setup          # Create venv, pip install, init DB, check config
make work           # PORTAL_ENV=work uvicorn backend.main --port 8000 --reload
make personal       # PORTAL_ENV=personal uvicorn backend.main --port 8001 --reload
make migrate        # Run Alembic migrations (safe, never destructive)
make sync-zoom      # Manually trigger Zoom folder scan
make sync-gmail     # Manually trigger Gmail poll
make sync-slack     # Manually trigger Slack poll
make backup         # Copy work.db and personal.db to ~/Desktop/portal-backup-{date}/
make export-work    # Dump work.db to JSON
make export-personal # Dump personal.db to JSON
make open           # Open http://localhost:8000 in browser
```

---

## 12. What Never Gets Built Into The App

These constraints keep it maintainable:

- ❌ No user authentication (local only, no need)
- ❌ No React/Vue/build toolchain (plain JS forever)
- ❌ No cloud database (SQLite only)
- ❌ No direct writes from AI (always queued for review)
- ❌ No deletion of raw data (soft-delete only, VTT files always kept)
- ❌ No shared DB between work/personal profiles (completely isolated)

---

## 13. Slack Setup Reference (No Admin Required)

```
1. Open https://app.slack.com in Chrome/Firefox
2. Log in to your Datadog workspace
3. Open DevTools (Cmd+Option+I)
4. Go to Console tab
5. Paste and run:

   JSON.parse(localStorage.localConfig_v2)
     .teams[Object.keys(
       JSON.parse(localStorage.localConfig_v2).teams
     )[0]].token

6. Copy the xoxp-... value
7. Paste into config.work.yaml under slack.user_token

Token expires occasionally. Re-run this if Slack sync stops working.
This is read-only access — identical to what you see in the Slack app.
```

---

## 14. Future Sections (Not Built Yet)

When ready, each of these follows the exact same pattern (one backend file, one frontend file):

| Section | Description |
|---|---|
| Goals & OKRs | Quarterly goals, key results, progress |
| Performance Reviews | Review cycles, ratings, promotion packets |
| Hiring | Interview pipelines, candidate tracking |
| Stakeholder Map | Key relationships, last contact, notes |
| Meeting Prep | Pre-meeting briefs auto-generated from context |
| Weekly Digest | Auto-generated Friday summary |
| Notes | Free-form notes linked to people/projects |
