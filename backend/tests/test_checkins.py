"""Tests for the Quorum check-in pipeline (pseudonymous identity)."""
from __future__ import annotations

import hashlib

from fastapi.testclient import TestClient


def _tpl(seed: str) -> str:
    """Stable fake template hash for a given seed."""
    return hashlib.sha256(seed.encode()).hexdigest()


def _make_event(client: TestClient, name: str = "Workshop #1") -> str:
    resp = client.post(
        "/events", json={"name": name, "location": "Nairobi", "operator": "Jane"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Walk-in flow
# ---------------------------------------------------------------------------


def test_walkin_creates_attendee_and_checkin(client: TestClient) -> None:
    event_id = _make_event(client)

    body = {
        "template_hash": _tpl("alice"),
        "flow": "walkin",
        "display_name": "Alice Walkin",
        "lat": -1.29,
        "lng": 36.82,
    }
    resp = client.post(f"/events/{event_id}/checkins", json=body)
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["welcome_back"] is False
    assert out["attendee_known"] is True
    assert out["checkin"]["template_hash"] == _tpl("alice")
    assert out["checkin"]["lat"] == -1.29

    # Anonymous roster shows the row but never the name.
    roster = client.get(f"/events/{event_id}/checkins").json()
    assert len(roster) == 1
    assert "display_name" not in roster[0]
    assert "name" not in roster[0]


def test_walkin_requires_display_name(client: TestClient) -> None:
    event_id = _make_event(client)
    body = {"template_hash": _tpl("nameless"), "flow": "walkin"}
    resp = client.post(f"/events/{event_id}/checkins", json=body)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Duplicate refusal
# ---------------------------------------------------------------------------


def test_same_fingerprint_same_event_is_refused(client: TestClient) -> None:
    event_id = _make_event(client)
    first = {
        "template_hash": _tpl("bob"),
        "flow": "walkin",
        "display_name": "Bob",
    }
    assert client.post(f"/events/{event_id}/checkins", json=first).status_code == 201

    again = client.post(f"/events/{event_id}/checkins", json=first)
    assert again.status_code == 409
    assert "Already checked in" in again.json()["detail"]["reason"]


# ---------------------------------------------------------------------------
# Returning attendee (cross-event recognition)
# ---------------------------------------------------------------------------


def test_returning_attendee_recognized_at_second_event(client: TestClient) -> None:
    e1 = _make_event(client, "Workshop #1")
    e2 = _make_event(client, "Workshop #2")

    # Enroll at event 1 as a walk-in.
    assert (
        client.post(
            f"/events/{e1}/checkins",
            json={
                "template_hash": _tpl("carol"),
                "flow": "walkin",
                "display_name": "Carol",
            },
        ).status_code
        == 201
    )

    # Lookup at event 2 — known globally, not checked in yet locally.
    lookup = client.get(
        f"/events/{e2}/lookup", params={"template_hash": _tpl("carol")}
    ).json()
    assert lookup == {
        "template_hash": _tpl("carol"),
        "attendee_known": True,
        "already_checked_in": False,
    }

    # 'returning' check-in needs no name fields.
    resp = client.post(
        f"/events/{e2}/checkins",
        json={"template_hash": _tpl("carol"), "flow": "returning"},
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["welcome_back"] is True
    assert out["attendee_known"] is True


def test_returning_flow_refused_when_attendee_unknown(client: TestClient) -> None:
    event_id = _make_event(client)
    resp = client.post(
        f"/events/{event_id}/checkins",
        json={"template_hash": _tpl("ghost"), "flow": "returning"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Invitee flow
# ---------------------------------------------------------------------------


def test_invitee_flow_claims_row_and_creates_attendee(client: TestClient) -> None:
    event_id = _make_event(client)

    bulk = client.post(
        f"/events/{event_id}/invitees",
        json={
            "invitees": [
                {"display_name": "Dan Donor", "phone_last4": "1234"},
                {"display_name": "Eve Expected"},
            ]
        },
    )
    assert bulk.status_code == 201, bulk.text
    invitees = bulk.json()
    dan = next(i for i in invitees if i["display_name"] == "Dan Donor")

    resp = client.post(
        f"/events/{event_id}/checkins",
        json={
            "template_hash": _tpl("dan"),
            "flow": "invitee",
            "invitee_id": dan["id"],
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["welcome_back"] is False

    # Trying to claim the same invitee row with a different fingerprint must fail.
    resp2 = client.post(
        f"/events/{event_id}/checkins",
        json={
            "template_hash": _tpl("impostor"),
            "flow": "invitee",
            "invitee_id": dan["id"],
        },
    )
    assert resp2.status_code == 409


def test_invitee_csv_upload(client: TestClient) -> None:
    event_id = _make_event(client)
    csv_bytes = b"display_name,phone_last4\nFiona First,1111\nGreg Guest,\n"
    resp = client.post(
        f"/events/{event_id}/invitees/bulk-csv",
        files={"file": ("invitees.csv", csv_bytes, "text/csv")},
    )
    assert resp.status_code == 201, resp.text
    rows = resp.json()
    assert {r["display_name"] for r in rows} == {"Fiona First", "Greg Guest"}
    assert next(r for r in rows if r["display_name"] == "Fiona First")["phone_last4"] == "1111"
    assert next(r for r in rows if r["display_name"] == "Greg Guest")["phone_last4"] is None


# ---------------------------------------------------------------------------
# Stats + exports
# ---------------------------------------------------------------------------


def test_stats_and_anonymous_export(client: TestClient) -> None:
    event_id = _make_event(client)
    client.post(
        f"/events/{event_id}/invitees",
        json={"invitees": [{"display_name": "Henry"}]},
    )
    invitees = client.get(f"/events/{event_id}/invitees").json()
    henry_id = invitees[0]["id"]

    client.post(
        f"/events/{event_id}/checkins",
        json={"template_hash": _tpl("h"), "flow": "invitee", "invitee_id": henry_id},
    )
    client.post(
        f"/events/{event_id}/checkins",
        json={"template_hash": _tpl("walkin"), "flow": "walkin", "display_name": "Iris"},
    )

    stats = client.get(f"/events/{event_id}/stats").json()
    assert stats == {
        "event_id": event_id,
        "checked_in": 2,
        "invitees_total": 1,
        "invitees_claimed": 1,
        "walkins": 1,
    }

    csv_resp = client.get(f"/events/{event_id}/export.csv")
    assert csv_resp.status_code == 200
    body = csv_resp.text
    # Anonymous export must contain hashes but never display_name.
    assert _tpl("h") in body
    assert "Henry" not in body
    assert "Iris" not in body


def test_named_export_joins_directory(client: TestClient) -> None:
    event_id = _make_event(client)
    client.post(
        f"/events/{event_id}/checkins",
        json={"template_hash": _tpl("j"), "flow": "walkin", "display_name": "Juma"},
    )

    csv_resp = client.get(f"/events/{event_id}/export-named.csv")
    assert csv_resp.status_code == 200
    assert "Juma" in csv_resp.text
    assert _tpl("j") in csv_resp.text


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
