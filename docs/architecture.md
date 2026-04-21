# Architecture

## Goals

1. During an NGO sensitization event, an operator uses a single device to enroll
   attendees using fingerprint, national ID, and phone number.
2. The system prevents a single person from registering multiple times using different
   phone numbers.
3. Organizers get transparent, auditable reports of unique attendance.

## Components

- **Mobile app (`mobile/`)** – an Expo React Native app. The operator creates an event,
  then registers attendees by entering their details and capturing a fingerprint image
  via the device camera. The app POSTs to the backend and displays an immediate duplicate
  alert if one is detected.
- **Backend API (`backend/`)** – a FastAPI service backed by SQLite. Responsible for
  biometric template derivation, duplicate detection, persistence, and reporting.

The two components are decoupled over HTTP; a single backend can serve multiple events
and devices.

## Data model

```
Event
├── id (uuid)
├── name, location, operator
└── created_at

Registration
├── id (uuid)
├── event_id → Event
├── full_name, national_id, phone
├── fingerprint_sha256          # exact-match dedup key
├── fingerprint_dhash           # fuzzy-match dedup key (8x8 dhash, 16 hex chars)
├── fingerprint_image_b64       # raw capture, kept for audit (optional in prod)
├── is_duplicate (bool)
├── duplicate_reason (text)
├── duplicate_of_id (uuid)      # points at the registration we collided with
└── created_at
```

## Duplicate detection

The backend runs the following checks against existing non-duplicate registrations for
the same event, in order:

1. `national_id` exact match → hard duplicate.
2. `phone` exact match → hard duplicate.
3. `fingerprint_sha256` exact match → hard duplicate (same image, e.g. re-scan).
4. `fingerprint_dhash` fuzzy match (Hamming distance ≤ 12) → soft/suspected duplicate.

In every case the registration is still persisted (not silently rejected), with
`is_duplicate=true` and a human-readable `duplicate_reason`. This gives organizers a
complete audit trail and lets them override the decision later if needed. Duplicates
never chain – a duplicate registration is never itself used as the match target for
future checks.

## Biometric pipeline

The `fingerprint_image_b64` is transported as base64-encoded bytes. The server computes:

- **`fingerprint_sha256`**: `SHA-256(raw_bytes)`. Unambiguous exact-image match.
- **`fingerprint_dhash`**: 8x8 difference hash over a 9×8 grayscale downscale (64 bits,
  16 hex chars). Tolerates minor variation between two captures of the same finger.

Both are stored alongside the registration. Matching on `fingerprint_dhash` uses
Hamming distance on the 64-bit hash.

### Production swap-in

dhash is a visual proxy for biometric similarity. It is sufficient for a demo-grade
deterrent on commodity hardware, but not a biometric matcher. For production:

1. Replace the capture step with a proper fingerprint sensor (USB/Bluetooth scanner, or a
   device with an integrated secure fingerprint sensor plus a managed biometric SDK).
2. Replace `compute_dhash` in `backend/app/biometric.py` with a minutiae-template
   extractor from a biometric SDK:
   - [SourceAFIS](https://sourceafis.machinezoo.com/) (open source, Apache 2.0).
   - Innovatrics, Neurotechnology, or NIST NBIS for commercial deployments.
3. Replace `hamming_distance_hex` with the SDK's matcher. Storage, dedup precedence,
   API shape, and reporting do not change.

The rest of the application (mobile UX, API, DB, reports) is agnostic to the specific
matcher used.

## Privacy considerations

- Store the raw fingerprint image only while needed for audit; rotate it out once the
  event is closed.
- Consider encrypting `fingerprint_image_b64` at rest (SQLCipher on the device, or a
  column-level encryption wrapper on the server).
- Consent should be collected before capture; the mobile app should present an
  attendee-facing consent screen in production. (The MVP screen focuses on operator
  ergonomics only.)
- National IDs are sensitive. Consider storing a salted hash instead of the raw value if
  the only requirement is dedup within an event.

## Offline behavior

The current MVP requires online connectivity. A future iteration can:

- Use AsyncStorage (already wired via `mobile/src/storage.ts`) as a pending-registrations
  queue.
- On startup / network-recovery, drain the queue and POST each pending registration.
- Re-run duplicate detection server-side so late-arriving registrations are still
  flagged against those that landed earlier.
