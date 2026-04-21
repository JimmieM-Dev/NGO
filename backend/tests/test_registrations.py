from __future__ import annotations

import hashlib

from fastapi.testclient import TestClient


def _sha256(seed: str) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()


def _dhash(seed: str) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()[:16]


def _make_event(client: TestClient, name: str = "Community Sensitization #1") -> str:
    resp = client.post("/events", json={"name": name, "location": "Nairobi", "operator": "Jane"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _payload(seed: str, *, national_id: str | None = None, phone: str | None = None) -> dict:
    return {
        "full_name": f"Attendee {seed}",
        "national_id": national_id or f"NID-{seed}",
        "phone": phone or f"+2547000{seed.zfill(5)}",
        "fingerprint_sha256": _sha256(seed),
        "fingerprint_dhash": _dhash(seed),
    }


def test_create_event_and_first_registration(client: TestClient) -> None:
    event_id = _make_event(client)

    resp = client.post(f"/events/{event_id}/registrations", json=_payload("1"))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["duplicate"] is None
    assert body["registration"]["is_duplicate"] is False


def test_duplicate_national_id_is_flagged(client: TestClient) -> None:
    event_id = _make_event(client)

    first = client.post(f"/events/{event_id}/registrations", json=_payload("1"))
    assert first.status_code == 201

    dup_payload = _payload("2", national_id="NID-1")  # reuse national id
    resp = client.post(f"/events/{event_id}/registrations", json=dup_payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["registration"]["is_duplicate"] is True
    assert body["duplicate"]["matched_field"] == "national_id"


def test_duplicate_phone_is_flagged(client: TestClient) -> None:
    event_id = _make_event(client)
    client.post(f"/events/{event_id}/registrations", json=_payload("1"))

    resp = client.post(
        f"/events/{event_id}/registrations",
        json=_payload("2", phone="+254700000001"),
    )
    # Phone of seed "1" is "+254700000001".
    body = resp.json()
    assert body["registration"]["is_duplicate"] is True
    assert body["duplicate"]["matched_field"] == "phone"


def test_exact_fingerprint_match_is_flagged(client: TestClient) -> None:
    event_id = _make_event(client)
    client.post(f"/events/{event_id}/registrations", json=_payload("1"))

    payload = _payload("unique-seed")
    payload["fingerprint_sha256"] = _sha256("1")
    resp = client.post(f"/events/{event_id}/registrations", json=payload)
    body = resp.json()
    assert body["registration"]["is_duplicate"] is True
    assert body["duplicate"]["matched_field"] == "fingerprint_sha256"


def test_fuzzy_fingerprint_match_is_flagged(client: TestClient) -> None:
    event_id = _make_event(client)
    base = _payload("1")
    client.post(f"/events/{event_id}/registrations", json=base)

    # Flip one bit in the dhash: hamming distance = 1, well below threshold.
    orig = int(base["fingerprint_dhash"], 16)
    flipped = orig ^ 0b1
    near = _payload("near")
    near["fingerprint_dhash"] = format(flipped, "016x")
    resp = client.post(f"/events/{event_id}/registrations", json=near)
    body = resp.json()
    assert body["registration"]["is_duplicate"] is True
    assert body["duplicate"]["matched_field"] == "fingerprint_dhash"


def test_different_fingerprints_not_flagged(client: TestClient) -> None:
    event_id = _make_event(client)
    client.post(f"/events/{event_id}/registrations", json=_payload("1"))
    resp = client.post(f"/events/{event_id}/registrations", json=_payload("completely-different"))
    body = resp.json()
    assert body["registration"]["is_duplicate"] is False


def test_stats_and_export(client: TestClient) -> None:
    event_id = _make_event(client)
    client.post(f"/events/{event_id}/registrations", json=_payload("a"))
    client.post(f"/events/{event_id}/registrations", json=_payload("b"))
    dup = _payload("c", national_id="NID-a")
    client.post(f"/events/{event_id}/registrations", json=dup)

    stats = client.get(f"/events/{event_id}/stats").json()
    assert stats == {"event_id": event_id, "total": 3, "unique": 2, "duplicates": 1}

    dups = client.get(f"/events/{event_id}/duplicates").json()
    assert len(dups) == 1

    csv_resp = client.get(f"/events/{event_id}/export.csv")
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")
    assert "NID-a" in csv_resp.text


def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_server_side_image_hashing(client: TestClient) -> None:
    """Client can send a raw fingerprint image and the server derives the hashes."""
    import base64
    import io

    from PIL import Image

    def make_img_b64(seed: int) -> str:
        img = Image.new("L", (128, 128), color=seed % 256)
        # Add a deterministic gradient so dhashes differ between seeds.
        px = img.load()
        assert px is not None
        for x in range(128):
            for y in range(128):
                px[x, y] = (x * y + seed) % 256
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    event_id = _make_event(client)

    first = client.post(
        f"/events/{event_id}/registrations",
        json={
            "full_name": "Alice",
            "national_id": "NID-alice",
            "phone": "+254700001111",
            "fingerprint_image_b64": make_img_b64(1),
        },
    )
    assert first.status_code == 201, first.text
    body = first.json()
    assert len(body["registration"]["fingerprint_sha256"]) == 64
    assert len(body["registration"]["fingerprint_dhash"]) == 16
    assert body["duplicate"] is None

    # Second registration with a different image and different identity should not be a dup.
    second = client.post(
        f"/events/{event_id}/registrations",
        json={
            "full_name": "Bob",
            "national_id": "NID-bob",
            "phone": "+254700002222",
            "fingerprint_image_b64": make_img_b64(99),
        },
    )
    assert second.status_code == 201
    assert second.json()["duplicate"] is None

    # Same image as first = fingerprint_sha256 duplicate.
    third = client.post(
        f"/events/{event_id}/registrations",
        json={
            "full_name": "Carol",
            "national_id": "NID-carol",
            "phone": "+254700003333",
            "fingerprint_image_b64": make_img_b64(1),
        },
    )
    assert third.status_code == 201
    assert third.json()["registration"]["is_duplicate"] is True
    assert third.json()["duplicate"]["matched_field"] == "fingerprint_sha256"


def test_missing_fingerprint_rejected(client: TestClient) -> None:
    event_id = _make_event(client)
    resp = client.post(
        f"/events/{event_id}/registrations",
        json={
            "full_name": "No Fingerprint",
            "national_id": "NID-x",
            "phone": "+254700099999",
        },
    )
    assert resp.status_code == 422
