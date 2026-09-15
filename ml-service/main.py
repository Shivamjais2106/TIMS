"""TIMS classification service — Part 4, Step 9.

FastAPI microservice wrapping the trained thermal-anomaly classifier.

    POST /predict   brightness, FRP, distance, recurrence -> class + confidence
    GET  /health    liveness plus whether a model is actually loaded
    GET  /model     full training metadata, including the weak-label caveat

Design notes:

* The model is loaded once at startup, not per request.
* ``/health`` reports ``model_loaded`` honestly. The Node backend treats a
  service that is up but has no model as unavailable and falls back to its rule
  engine, rather than trusting a service that cannot actually predict.
* The feature order is pinned by the artefact itself, so a retrained model with
  reordered features cannot silently be served against the wrong inputs.
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s [ml-service] %(message)s",
)
log = logging.getLogger("ml-service")

# ---------------------------------------------------------------------------
# Model artefact location
#
# MODEL_PATH lets the Docker image mount or bake the model anywhere; the default
# resolves to ../ml/models/classifier.joblib for local development.
# ---------------------------------------------------------------------------

SERVICE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = SERVICE_DIR.parent / "ml" / "models" / "classifier.joblib"
DEFAULT_METADATA_PATH = SERVICE_DIR.parent / "ml" / "models" / "model_metadata.json"

MODEL_PATH = Path(os.environ.get("MODEL_PATH", DEFAULT_MODEL_PATH))
METADATA_PATH = Path(os.environ.get("MODEL_METADATA_PATH", DEFAULT_METADATA_PATH))

#: Distance sentinel for "no industrial facility on record".
#: MUST match NO_FACILITY_DISTANCE_M in
#: backend/src/services/classification.service.ts and ml/config.py.
NO_FACILITY_DISTANCE_M = 50_000.0


class ModelBundle:
    """Holds the loaded artefact, or records why loading failed."""

    def __init__(self) -> None:
        self.model: Any = None
        self.classes: list[str] = []
        self.features: list[str] = []
        self.version: str | None = None
        self.algorithm: str | None = None
        self.metadata: dict[str, Any] = {}
        self.error: str | None = None

    @property
    def loaded(self) -> bool:
        return self.model is not None

    def load(self) -> None:
        if not MODEL_PATH.exists():
            self.error = (
                f"Model artefact not found at {MODEL_PATH}. "
                "Train it first: python ml/train_model.py"
            )
            log.error(self.error)
            return

        try:
            bundle = joblib.load(MODEL_PATH)
            self.model = bundle["model"]
            self.classes = list(bundle["classes"])
            # Feature order comes from the artefact, never from a local
            # constant, so a retrain that reorders features cannot be served
            # against mismatched inputs.
            self.features = list(bundle["features"])
            self.version = bundle.get("model_version")
            self.algorithm = bundle.get("algorithm")
            self.error = None

            if METADATA_PATH.exists():
                self.metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))

            log.info(
                "Model loaded: %s v%s | classes=%s | features=%s",
                self.algorithm,
                self.version,
                self.classes,
                self.features,
            )
        except Exception as exception:  # noqa: BLE001 - surfaced via /health
            self.error = f"Failed to load model: {exception}"
            self.model = None
            log.exception(self.error)


bundle = ModelBundle()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Loads the model once at startup."""
    bundle.load()
    if not bundle.loaded:
        # Deliberately does not exit: the service stays up and answers /health
        # with model_loaded=false so the backend can see *why* and degrade
        # gracefully, rather than facing an opaque connection refused.
        log.warning("Service starting WITHOUT a model — /predict will return 503")
    yield
    log.info("Service shutting down")


app = FastAPI(
    title="TIMS Classification Service",
    description=(
        "Classifies NASA FIRMS thermal anomalies for the TIMS Bhopal pilot.\n\n"
        "**The model is trained on heuristic weak labels, not verified ground truth.** "
        "Predictions are advisory decision support and are hedged accordingly "
        "(every class name begins with 'POSSIBLE_')."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # The only intended caller is the Node backend over the internal network.
    # Browsers never call this service directly.
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PredictRequest(BaseModel):
    """One detection's features. Field names match the training columns."""

    brightness: float = Field(
        ...,
        description="Brightness temperature in Kelvin (VIIRS bright_ti4 / MODIS brightness)",
        examples=[332.9],
    )
    frp: float = Field(..., ge=0, description="Fire Radiative Power in MW", examples=[4.2])
    distance_to_facility_m: float = Field(
        ...,
        ge=0,
        description=(
            "Metres to the nearest industrial facility, computed by PostGIS. "
            f"Pass {NO_FACILITY_DISTANCE_M:.0f} when none is on record."
        ),
        examples=[850.0],
    )
    recurrence_count: int = Field(
        ...,
        ge=1,
        description="Detections within the persistence radius over the lookback window",
        examples=[4],
    )
    is_night: int = Field(..., ge=0, le=1, description="1 for a night overpass, 0 for day", examples=[1])

    @field_validator("brightness")
    @classmethod
    def brightness_is_physical(cls, value: float) -> float:
        # Same bounds the training pipeline used to reject sensor artefacts.
        # Rejecting here stops a malformed upstream value producing a confident
        # nonsense prediction.
        if not 250.0 <= value <= 550.0:
            raise ValueError("brightness must be between 250 K and 550 K")
        return value


class PredictResponse(BaseModel):
    thermal_class: str = Field(..., description="Hedged class, matching the ThermalClass enum")
    confidence: float = Field(..., description="Predicted probability of the returned class, 0-1")
    probabilities: dict[str, float] = Field(..., description="Full per-class probability vector")
    model_version: str | None = None
    algorithm: str | None = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_version: str | None = None
    algorithm: str | None = None
    classes: list[str] = []
    features: list[str] = []
    error: str | None = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["ops"])
def health() -> HealthResponse:
    """Liveness plus model readiness.

    ``status`` is only ``ok`` when a model is actually loaded and able to
    predict, so the Node backend can distinguish "service up but useless" from
    "service healthy" and fall back to its rule engine in the former case.
    """
    return HealthResponse(
        status="ok" if bundle.loaded else "degraded",
        model_loaded=bundle.loaded,
        model_version=bundle.version,
        algorithm=bundle.algorithm,
        classes=bundle.classes,
        features=bundle.features,
        error=bundle.error,
    )


@app.get("/model", tags=["ops"])
def model_info() -> dict[str, Any]:
    """Full training metadata, including metrics and the weak-label caveat."""
    if not bundle.loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=bundle.error or "No model loaded",
        )
    return {
        "model_version": bundle.version,
        "algorithm": bundle.algorithm,
        "classes": bundle.classes,
        "features": bundle.features,
        "metadata": bundle.metadata,
    }


@app.post("/predict", response_model=PredictResponse, tags=["inference"])
def predict(request: PredictRequest) -> PredictResponse:
    """Classifies one thermal anomaly."""
    if not bundle.loaded:
        # 503 rather than 500: this is a "come back later / use your fallback"
        # condition, and it is exactly what the backend keys its rule fallback on.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=bundle.error or "No model loaded",
        )

    payload = request.model_dump()
    # Built in the artefact's own feature order.
    row = pd.DataFrame([[float(payload[name]) for name in bundle.features]], columns=bundle.features)

    probabilities = bundle.model.predict_proba(row)[0]
    index = int(np.argmax(probabilities))

    return PredictResponse(
        thermal_class=bundle.classes[index],
        confidence=float(probabilities[index]),
        probabilities={label: float(p) for label, p in zip(bundle.classes, probabilities)},
        model_version=bundle.version,
        algorithm=bundle.algorithm,
    )


@app.post("/predict/batch", tags=["inference"])
def predict_batch(requests: list[PredictRequest]) -> list[PredictResponse]:
    """Batch form — one vectorised call instead of N round trips.

    Used when reclassifying the whole table after a retrain, where per-row HTTP
    overhead dominates inference time.
    """
    if not bundle.loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=bundle.error or "No model loaded",
        )
    if not requests:
        return []

    frame = pd.DataFrame(
        [[float(item.model_dump()[name]) for name in bundle.features] for item in requests],
        columns=bundle.features,
    )
    matrix = bundle.model.predict_proba(frame)

    responses: list[PredictResponse] = []
    for probabilities in matrix:
        index = int(np.argmax(probabilities))
        responses.append(
            PredictResponse(
                thermal_class=bundle.classes[index],
                confidence=float(probabilities[index]),
                probabilities={label: float(p) for label, p in zip(bundle.classes, probabilities)},
                model_version=bundle.version,
                algorithm=bundle.algorithm,
            )
        )
    return responses


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("RELOAD", "false").lower() == "true",
    )
