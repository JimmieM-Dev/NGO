# Quorum Backend

FastAPI + SQLAlchemy + SQLite service that powers attendee check-in and duplicate
detection for Quorum.

## Install

```bash
cd backend
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
```

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- OpenAPI docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/health>

`QUORUM_DATABASE_URL` (or legacy `NGO_DATABASE_URL`) overrides the default SQLite
location (`sqlite:///./quorum.db`).

## Test

```bash
pytest
ruff check app tests
```
