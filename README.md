# Quorum

**Verified attendance. Anonymous by design.**

A two-part system for reducing duplicate registrations at NGO sensitization events
and workshops, using a fingerprint template hash as a pseudonymous identifier so
per-event records carry no personally identifiable information.

> Phase 0 of the Quorum migration is in flight — the codebase still has the
> older face-capture data model below. The schema is being replaced in Phase 1
> with `attendees` / `invitees` / `checkins` per the migration plan.

During an event a single operator uses a tablet/phone app to enroll attendees. Each
attendee provides:

- full name
- national ID
- phone number
- a fingerprint capture (camera image)

The backend derives a biometric template from the fingerprint image and flags any
registration that collides with a prior entry on national ID, phone, or fingerprint
(exact or fuzzy match). This makes it harder for a single person to sign up multiple
times using different phone numbers, and gives organizers transparent, auditable records
of unique attendance.

## Repository layout

```
backend/   FastAPI + SQLAlchemy + SQLite API (Python 3.11+)
mobile/    Expo React Native app (TypeScript)
docs/      Architecture and design notes
```

## How duplicate detection works

For every registration the server stores:

| Field                 | Purpose                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `national_id`         | Exact dedup: same ID = hard duplicate.                                 |
| `phone`               | Exact dedup: same phone = hard duplicate.                              |
| `fingerprint_sha256`  | Exact dedup: identical image bytes = hard duplicate.                   |
| `fingerprint_dhash`   | Fuzzy dedup: Hamming distance on 8x8 difference hash = soft duplicate. |

Match precedence is `national_id > phone > fingerprint_sha256 > fingerprint_dhash`.
Matches are reported to the operator immediately, and flagged registrations are stored
(not silently dropped) so that an auditor can review them later via the duplicates
report or CSV export.

### Biometric honesty note

The MVP's fingerprint template is an 8x8 perceptual difference hash (dhash) of the
captured image. This is good enough to demonstrate deduplication but is **not a
production-grade fingerprint matcher** — real deployments should integrate a proper
fingerprint SDK (e.g. [SourceAFIS](https://sourceafis.machinezoo.com/),
Innovatrics, Neurotechnology, or NIST NBIS) and a dedicated fingerprint scanner. The
swap-in point is the `app.biometric` module on the backend; the rest of the flow
(storage, dedup, reporting) is unchanged. See
[`docs/architecture.md`](docs/architecture.md) for details.

## Running the backend

```bash
cd backend
uv venv && source .venv/bin/activate    # or: python -m venv .venv && source .venv/bin/activate
uv pip install -e ".[dev]"               # or: pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Once the server is up, the OpenAPI explorer is at <http://localhost:8000/docs>.

Run the test suite:

```bash
cd backend
pytest
ruff check app tests
```

## Running the mobile app

```bash
cd mobile
npm install
npx expo start
```

The app reads the backend URL from, in order of preference:

1. `EXPO_PUBLIC_API_BASE_URL` env var.
2. `expo.extra.apiBaseUrl` in `app.json`.
3. `http://localhost:8000` fallback.

On a physical device you'll need to point the mobile app at your host machine's LAN IP
(e.g. `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:8000 npx expo start`).

Test in the browser with `npx expo start --web` (uses `getUserMedia` for the camera).

## API reference (abridged)

| Method | Path                                    | Purpose                         |
| ------ | --------------------------------------- | ------------------------------- |
| POST   | `/events`                               | Create an event.                |
| GET    | `/events`                               | List events.                    |
| POST   | `/events/{id}/registrations`            | Register an attendee.           |
| GET    | `/events/{id}/registrations`            | List all registrations.         |
| GET    | `/events/{id}/duplicates`               | List flagged duplicates only.   |
| GET    | `/events/{id}/stats`                    | Total / unique / duplicate counts. |
| GET    | `/events/{id}/export.csv`               | CSV export for auditors.        |

See `docs/architecture.md` for the full request/response shapes.
