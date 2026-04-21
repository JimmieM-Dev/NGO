# NGO Biometric Backend

FastAPI + SQLAlchemy + SQLite service that powers attendee registration and duplicate
detection for the NGO biometric app.

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

`NGO_DATABASE_URL` overrides the default SQLite location (`sqlite:///./ngo.db`).

## Test

```bash
pytest
ruff check app tests
```
