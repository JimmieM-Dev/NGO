"""Pydantic request/response schemas for Quorum."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    operator: str | None = Field(default=None, max_length=200)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    location: str | None
    operator: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Invitees
# ---------------------------------------------------------------------------


class InviteeIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=200)
    phone_last4: str | None = Field(default=None, min_length=4, max_length=4, pattern=r"^\d{4}$")


class InviteeBulkIn(BaseModel):
    invitees: list[InviteeIn] = Field(min_length=1)


class InviteeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    display_name: str
    phone_last4: str | None
    claimed_by_attendee_id: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Check-ins (the workhorse)
# ---------------------------------------------------------------------------


Flow = Literal["returning", "invitee", "walkin"]


class CheckinIn(BaseModel):
    """The single payload used by the check-in screen.

    Flow values:

    - ``returning``: the client has already done a lookup and the
      ``template_hash`` is known. No name fields are required.
    - ``invitee``: this fingerprint is new but the operator picked a row
      from the per-event invitee list. ``invitee_id`` must be supplied.
    - ``walkin``: this fingerprint is new and the attendee is not on the
      list. ``display_name`` must be supplied (only PII ever collected
      directly).
    """

    template_hash: str = Field(min_length=8, max_length=128, pattern=r"^[0-9a-fA-F]+$")
    flow: Flow
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    invitee_id: str | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone_last4: str | None = Field(default=None, min_length=4, max_length=4, pattern=r"^\d{4}$")

    @field_validator("template_hash")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()

    @model_validator(mode="after")
    def _require_fields_for_flow(self) -> CheckinIn:
        if self.flow == "invitee" and not self.invitee_id:
            raise ValueError("invitee_id is required when flow='invitee'")
        if self.flow == "walkin" and not self.display_name:
            raise ValueError("display_name is required when flow='walkin'")
        return self


class CheckinOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str
    template_hash: str
    checked_in_at: datetime
    lat: float | None
    lng: float | None


class CheckinResult(BaseModel):
    """Wraps a CheckinOut with operator-facing context.

    Operators never see ``display_name`` on this response — only
    ``welcome_back`` (the green check). The named roster is admin-only.
    """

    checkin: CheckinOut
    welcome_back: bool
    attendee_known: bool


# ---------------------------------------------------------------------------
# Lookup (used by the check-in screen before posting a checkin)
# ---------------------------------------------------------------------------


class LookupOut(BaseModel):
    template_hash: str
    attendee_known: bool
    already_checked_in: bool


# ---------------------------------------------------------------------------
# Attendees (admin-only directory)
# ---------------------------------------------------------------------------


class AttendeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_hash: str
    display_name: str
    phone_last4: str | None
    first_seen_at: datetime
    created_at: datetime


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


class EventStats(BaseModel):
    event_id: str
    checked_in: int
    invitees_total: int
    invitees_claimed: int
    walkins: int
