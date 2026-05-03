.PHONY: setup work personal migrate backup export-work export-personal open sync-zoom sync-gmail sync-slack help

PYTHON := .venv/bin/python
PIP    := .venv/bin/pip
UV     := .venv/bin/uvicorn

# ── Setup ─────────────────────────────────────────────────────────────────────

setup: ## Create venv, install deps, init DBs, check config
	@echo "→ Creating virtual environment..."
	python3 -m venv .venv
	@echo "→ Installing dependencies..."
	$(PIP) install --quiet --upgrade pip
	$(PIP) install --quiet -r requirements.txt
	@echo "→ Initialising databases..."
	PORTAL_ENV=work    $(PYTHON) -c "from backend.database import init_db; init_db()"
	PORTAL_ENV=personal $(PYTHON) -c "from backend.database import init_db; init_db()"
	@echo "→ Running migrations..."
	PORTAL_ENV=work    .venv/bin/alembic upgrade head
	PORTAL_ENV=personal .venv/bin/alembic upgrade head
	@echo ""
	@echo "✅ Setup complete."
	@echo ""
	@echo "Next steps:"
	@echo "  1. Copy config/config.example.yaml → config/config.work.yaml"
	@echo "  2. Fill in your Zoom folder path, API keys, etc."
	@echo "  3. Run: make work"

# ── Run ───────────────────────────────────────────────────────────────────────

work: ## Start portal with work profile on port 8000
	@echo "→ Starting Manager Portal (work) on http://localhost:8000"
	PORTAL_ENV=work $(UV) backend.main:app --host 127.0.0.1 --port 8000 --reload

personal: ## Start portal with personal profile on port 8001
	@echo "→ Starting Manager Portal (personal) on http://localhost:8001"
	PORTAL_ENV=personal $(UV) backend.main:app --host 127.0.0.1 --port 8001 --reload

# ── Database ──────────────────────────────────────────────────────────────────

migrate: ## Run Alembic migrations for both profiles (safe, never destructive)
	@echo "→ Migrating work DB..."
	PORTAL_ENV=work .venv/bin/alembic upgrade head
	@echo "→ Migrating personal DB..."
	PORTAL_ENV=personal .venv/bin/alembic upgrade head
	@echo "✅ Migrations complete."

# ── Sync ──────────────────────────────────────────────────────────────────────

sync-zoom: ## Manually scan Zoom folder and process new transcripts
	PORTAL_ENV=work $(PYTHON) -c "from backend.integrations.zoom_watcher import scan_now; scan_now()"

sync-gmail: ## Manually pull Gmail
	PORTAL_ENV=work $(PYTHON) -c "from backend.integrations.gmail import poll_now; poll_now()"

sync-slack: ## Manually pull Slack DMs and mentions
	PORTAL_ENV=work $(PYTHON) -c "from backend.integrations.slack import poll_now; poll_now()"

# ── Backup & Export ────────────────────────────────────────────────────────────

backup: ## Copy both DBs to ~/Desktop/portal-backup-{date}
	@DATE=$$(date +%Y-%m-%d_%H%M) && \
	DIR=~/Desktop/portal-backup-$$DATE && \
	mkdir -p $$DIR && \
	cp data/work.db    $$DIR/work.db    2>/dev/null && echo "  ✓ work.db" || echo "  - work.db not found" && \
	cp data/personal.db $$DIR/personal.db 2>/dev/null && echo "  ✓ personal.db" || echo "  - personal.db not found" && \
	echo "✅ Backup saved to $$DIR"

export-work: ## Export work DB to JSON
	PORTAL_ENV=work $(PYTHON) -c "from backend.database import export_all; export_all()" > data/work-export-$$(date +%Y%m%d).json
	@echo "✅ Exported to data/work-export-$$(date +%Y%m%d).json"

export-personal: ## Export personal DB to JSON
	PORTAL_ENV=personal $(PYTHON) -c "from backend.database import export_all; export_all()" > data/personal-export-$$(date +%Y%m%d).json

# ── Utilities ─────────────────────────────────────────────────────────────────

open: ## Open portal in browser
	open http://localhost:8000

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
