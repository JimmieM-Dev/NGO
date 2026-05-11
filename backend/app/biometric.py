"""Fingerprint template hashing for Quorum.

In the current MVP (camera-stub path) the "template hash" is just the SHA-256
of the captured fingerprint image bytes. Two captures of the same finger will
NOT match because the bytes differ — that's the honest demo behavior.

When a real USB fingerprint scanner is wired in (Mantra MFS100 / SecuGen /
Suprema), this module is replaced with one that:

1. Accepts an ISO 19794-2 minutiae template from the SDK.
2. Returns ``(template_bytes, template_hash)``.
3. Provides a 1:N matcher backed by SourceAFIS so two scans of the same finger
   produce a match even though the byte-level templates differ.

The rest of the system (storage, dedup, check-in flow) is unchanged.
"""
from __future__ import annotations

import base64
import hashlib


def hash_image_b64(image_b64: str) -> str:
    """Return SHA-256 (hex, lowercase) of the base64-decoded image bytes.

    Used as the pseudonymous identity in the camera-stub path. Raises
    ``ValueError`` if the input is not valid base64.
    """
    try:
        raw = base64.b64decode(image_b64, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise ValueError("image_b64 is not valid base64") from exc
    return hashlib.sha256(raw).hexdigest()


def normalize_template_hash(value: str) -> str:
    """Normalize a hex template hash to lowercase."""
    return value.strip().lower()
