"""Biometric template helpers.

For each registration the system derives two values from the captured fingerprint image:

- ``fingerprint_sha256``: SHA-256 of the raw captured bytes. Exact-match dedup.
- ``fingerprint_dhash``: An 8x8 difference hash (64 bits, 16 hex chars). Fuzzy dedup via
  Hamming distance, which tolerates minor variation introduced by a re-capture of the same
  finger.

These values can be computed client-side by the mobile app (fast, works offline) OR
server-side from an uploaded base64 image (simpler clients). This module contains the
server-side reference implementation.

For production deployments, swap this pipeline for a real fingerprint SDK (e.g. SourceAFIS,
Innovatrics, Neurotechnology, NIST NBIS) that extracts minutiae templates, and replace
``hamming_distance_hex`` with the SDK's matcher. The rest of the flow (storage, dedup,
reporting) is unchanged.
"""
from __future__ import annotations

import base64
import hashlib
from io import BytesIO

from PIL import Image

# Max Hamming distance between two 64-bit dhashes that still counts as a fuzzy match.
# Tuned for 8x8 dhash over fingerprint-like images. A dhash-only match is a SUSPECTED
# duplicate, not a hard duplicate.
DHASH_MATCH_THRESHOLD = 12


def hamming_distance_hex(a: str, b: str) -> int:
    """Return the bitwise Hamming distance between two equal-length hex strings."""
    if len(a) != len(b):
        raise ValueError("hex strings must be equal length")
    return (int(a, 16) ^ int(b, 16)).bit_count()


def compute_sha256(raw_bytes: bytes) -> str:
    return hashlib.sha256(raw_bytes).hexdigest()


def compute_dhash(raw_bytes: bytes) -> str:
    """Compute an 8x8 difference hash of ``raw_bytes`` (an image) as 16-char hex."""
    with Image.open(BytesIO(raw_bytes)) as img:
        small = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
        pixels = list(small.tobytes())

    bits = 0
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return format(bits, "016x")


def hashes_from_b64_image(image_b64: str) -> tuple[str, str]:
    """Decode ``image_b64`` and return ``(sha256, dhash)``.

    Raises ``ValueError`` if the bytes are not a valid image.
    """
    try:
        raw = base64.b64decode(image_b64, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise ValueError("fingerprint_image_b64 is not valid base64") from exc

    try:
        return compute_sha256(raw), compute_dhash(raw)
    except Exception as exc:  # noqa: BLE001
        raise ValueError("fingerprint_image_b64 is not a valid image") from exc
