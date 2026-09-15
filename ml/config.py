"""Shared configuration for the TIMS ML pipeline.

Reads ``shared/bhopal.config.json`` so the Python side uses exactly the same
thresholds as the Node backend. There is no second copy of these numbers.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
DATA_DIR = ML_DIR / "data"
MODELS_DIR = ML_DIR / "models"
REPORTS_DIR = ML_DIR / "reports"

for _directory in (DATA_DIR, MODELS_DIR, REPORTS_DIR):
    _directory.mkdir(parents=True, exist_ok=True)

RAW_CSV = DATA_DIR / "hotspots_raw.csv"
CLEAN_CSV = DATA_DIR / "hotspots_clean.csv"
LABELLED_CSV = DATA_DIR / "hotspots_labelled.csv"

# ---------------------------------------------------------------------------
# Shared Bhopal config — single source of truth, same file the backend reads
# ---------------------------------------------------------------------------


def _strip_comments(value):
    """Removes the ``$comment`` documentation keys used in the JSON config."""
    if isinstance(value, list):
        return [_strip_comments(item) for item in value]
    if isinstance(value, dict):
        return {k: _strip_comments(v) for k, v in value.items() if k != "$comment"}
    return value


with (REPO_ROOT / "shared" / "bhopal.config.json").open(encoding="utf-8") as handle:
    CONFIG = _strip_comments(json.load(handle))

PILOT = CONFIG["pilot"]
BHOPAL_BBOX = CONFIG["bbox"]
THRESHOLDS = CONFIG["thresholds"]
CLASSIFICATION = CONFIG["classification"]
RISK_WEIGHTS = CONFIG["riskWeights"]

# ---------------------------------------------------------------------------
# Weak-label thresholds (Part 4, Step 6)
#
# Named constants, not magic numbers. These come from the shared config so the
# labeller and the backend's rule engine cannot drift apart.
# ---------------------------------------------------------------------------

#: Distance below which a detection is treated as co-located with industry.
INDUSTRIAL_PROXIMITY_M: int = THRESHOLDS["industrialProximityM"]

#: Distance below which a detection is treated as industry-adjacent.
INDUSTRIAL_INFLUENCE_M: int = THRESHOLDS["industrialInfluenceM"]

#: Distinct-day count at or above which a source is "persistent".
PERSISTENT_SOURCE_DETECTIONS: int = THRESHOLDS["persistentSourceDetections"]

#: FRP percentile markers observed in the real Bhopal data, in MW.
FRP_MODERATE_MW: float = CLASSIFICATION["frpModerateMw"]
FRP_ELEVATED_MW: float = CLASSIFICATION["frpElevatedMw"]
FRP_HIGH_MW: float = CLASSIFICATION["frpHighMw"]

BRIGHTNESS_ELEVATED_K: float = CLASSIFICATION["brightnessElevatedK"]

#: Sentinel written when no industrial facility exists within query range.
#: MUST match NO_FACILITY_DISTANCE_M in
#: backend/src/services/classification.service.ts — the model splits on it.
NO_FACILITY_DISTANCE_M: float = 50_000.0

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

#: Feature order is part of the serving contract. The FastAPI service builds its
#: input frame with exactly this ordering.
FEATURE_COLUMNS: list[str] = [
    "brightness",
    "frp",
    "distance_to_facility_m",
    "recurrence_count",
    "is_night",
]

#: The hedged class vocabulary. Identical to the ThermalClass enum in
#: backend/prisma/schema.prisma.
CLASS_LABELS: list[str] = [
    "POSSIBLE_INDUSTRIAL_FIRE",
    "POSSIBLE_PERSISTENT_THERMAL_SOURCE",
    "POSSIBLE_VEGETATION_FIRE",
    "POSSIBLE_AGRICULTURAL_BURN",
]

TEST_SIZE: float = 0.20
RANDOM_STATE: int = 42

MODEL_VERSION: str = "bhopal-01-v1"
MODEL_PATH = MODELS_DIR / "classifier.joblib"
METADATA_PATH = MODELS_DIR / "model_metadata.json"


#: Query parameters Prisma understands but libpq does not. psycopg raises
#: "invalid URI query parameter" on these, so they are stripped.
_PRISMA_ONLY_PARAMS = {"schema", "connection_limit", "pool_timeout", "pgbouncer", "sslaccept"}


def _sanitise_conninfo(url: str) -> str:
    """Strips Prisma-specific query parameters libpq would reject."""
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(url)
    if not parts.query:
        return url

    kept = [(k, v) for k, v in parse_qsl(parts.query) if k not in _PRISMA_ONLY_PARAMS]
    return urlunsplit(parts._replace(query=urlencode(kept)))


def database_url() -> str:
    """Resolves the Postgres connection string.

    Prefers ``DATABASE_URL``, then falls back to parsing ``backend/.env`` so the
    ML scripts read the same database the backend writes to without duplicating
    credentials or requiring a second environment setup.
    """
    from_env = os.environ.get("DATABASE_URL")
    if from_env:
        return _sanitise_conninfo(from_env)

    env_path = REPO_ROOT / "backend" / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL"):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    return _sanitise_conninfo(value)

    raise RuntimeError(
        "DATABASE_URL is not set and could not be read from backend/.env. "
        "The ML pipeline reads the same PostgreSQL database the backend writes."
    )
