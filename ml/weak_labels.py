"""Part 4, Step 6 — weak-label bootstrapping.

THESE ARE NOT GROUND-TRUTH LABELS.

No fire-department incident log, MPPCB inspection record or image-confirmed
fire perimeter has been joined to these detections, because no such dataset is
openly available for Bhopal. The labels below are *heuristics* derived from
geospatial context, and every metric reported downstream measures agreement
with these heuristics rather than real-world correctness.

The heuristics are stated explicitly, keyed off named constants from
``shared/bhopal.config.json``, so a reviewer can disagree with a specific rule
rather than with an opaque number.

    python ml/weak_labels.py
"""

from __future__ import annotations

import sys

import pandas as pd

from config import (
    CLASSIFICATION,
    CLEAN_CSV,
    FRP_ELEVATED_MW,
    FRP_MODERATE_MW,
    INDUSTRIAL_INFLUENCE_M,
    INDUSTRIAL_PROXIMITY_M,
    LABELLED_CSV,
    PERSISTENT_SOURCE_DETECTIONS,
    PILOT,
    REPORTS_DIR,
)

# ---------------------------------------------------------------------------
# Weak-label thresholds — all named, none inline
# ---------------------------------------------------------------------------

#: Recurrence at or above which a co-located source is treated as continuous
#: rather than a one-off event. Distinct from PERSISTENT_SOURCE_DETECTIONS,
#: which counts distinct *days*; this counts total detections in the radius.
PERSISTENT_RECURRENCE_COUNT = 5

#: Months in which crop-residue burning is plausible around Bhopal.
#: The rabi (wheat) harvest in Madhya Pradesh runs roughly March-April, so
#: residue burning concentrates there; the kharif (paddy) residue window is
#: October-November. The ingested data covers February-May.
AGRICULTURAL_MONTHS = (3, 4, 10, 11)

#: Recurrence at or below which a detection is a plausible one-off burn.
SINGLE_EVENT_RECURRENCE = 2


def assign_weak_label(row: pd.Series) -> str:
    """Assigns one heuristic weak label to a single detection.

    Rule order matters: the most specific geospatial evidence is applied first,
    and the vegetation class is the residual rather than a positive claim.
    """
    distance = float(row["distance_to_facility_m"])
    recurrence = int(row["recurrence_count"])
    frp = float(row["frp"])
    brightness = float(row["brightness"])
    is_night = bool(row["is_night"])
    month = int(row["month"])

    on_site = distance <= INDUSTRIAL_PROXIMITY_M
    industry_adjacent = distance <= INDUSTRIAL_INFLUENCE_M
    recurring = recurrence >= PERSISTENT_RECURRENCE_COUNT
    persistent_days = int(row["persistence_days"]) >= PERSISTENT_SOURCE_DETECTIONS

    # --- 1. Persistent industrial source -----------------------------------
    # Co-located with mapped industry AND recurring. A kiln, furnace or flare
    # burns in the same place for weeks; a fire does not.
    if on_site and (recurring or persistent_days):
        return "POSSIBLE_PERSISTENT_THERMAL_SOURCE"

    # --- 2. Industrial fire -------------------------------------------------
    # On an industrial footprint with a real thermal signal but no recurrence:
    # consistent with an episodic fire rather than a process heat source.
    if on_site and (frp >= FRP_MODERATE_MW or brightness >= CLASSIFICATION["brightnessElevatedK"]):
        return "POSSIBLE_INDUSTRIAL_FIRE"

    # --- 3. Unmapped persistent source --------------------------------------
    # Industry-adjacent, at night, recurring. Brick kilns ring Bhopal and are
    # largely absent from OpenStreetMap, so a recurring night source just
    # outside a mapped boundary is more plausibly industrial than vegetative.
    if industry_adjacent and is_night and recurring:
        return "POSSIBLE_PERSISTENT_THERMAL_SOURCE"

    # --- 4. Agricultural burn -----------------------------------------------
    # Away from industry, in a harvest-residue month, daytime, low power and
    # not recurring. Residue burns are lit deliberately and burn out in hours.
    if (
        not industry_adjacent
        and month in AGRICULTURAL_MONTHS
        and not is_night
        and frp < FRP_ELEVATED_MW
        and recurrence <= SINGLE_EVENT_RECURRENCE
    ):
        return "POSSIBLE_AGRICULTURAL_BURN"

    # --- 5. Vegetation fire (residual) --------------------------------------
    # Everything else: away from mapped industry with no agricultural
    # signature. Bhopal district includes the Ratapani forest belt, so this is
    # the plausible default rather than a confident assertion.
    return "POSSIBLE_VEGETATION_FIRE"


def main() -> int:
    if not CLEAN_CSV.exists():
        print(f"[labels] ERROR: {CLEAN_CSV} not found. Run `python ml/clean_eda.py` first.", file=sys.stderr)
        return 1

    frame = pd.read_csv(CLEAN_CSV, parse_dates=["detected_at"])
    print(f"[labels] loaded {len(frame)} clean row(s)")

    frame["weak_label"] = frame.apply(assign_weak_label, axis=1)
    # Recorded on every row so a stored prediction can always be traced back to
    # the labelling scheme that produced its training data.
    frame["label_source"] = "heuristic-weak-v1"

    frame.to_csv(LABELLED_CSV, index=False)

    counts = frame["weak_label"].value_counts()
    print(f"[labels] wrote {LABELLED_CSV}")
    print()
    print("[labels] WEAK LABEL DISTRIBUTION (heuristic, not ground truth):")
    for label, count in counts.items():
        print(f"  {label:<40} {count:>4}  ({count / len(frame):>6.1%})")

    minority = counts.min()
    print()
    print(f"[labels] smallest class: {minority} row(s)")
    if minority < 10:
        print(
            "[labels] WARNING: a class with fewer than 10 examples cannot be "
            "meaningfully evaluated on a 20% test split. Per-class metrics for it "
            "will be reported but should be treated as indicative only."
        )

    # --- Report -------------------------------------------------------------
    lines = [
        f"# Weak labels — TIMS {PILOT['label']} pilot ({PILOT['id']})",
        "",
        "> **These are heuristic weak labels, not ground truth.**",
        ">",
        "> No verified incident log, regulatory inspection record or image-confirmed",
        "> fire perimeter exists for these detections. Labels are inferred from",
        "> geospatial context. All downstream accuracy, precision and recall figures",
        "> measure **agreement with these heuristics**, not real-world correctness.",
        "",
        "## Thresholds used",
        "",
        "| Constant | Value | Meaning |",
        "| --- | --- | --- |",
        f"| `INDUSTRIAL_PROXIMITY_M` | {INDUSTRIAL_PROXIMITY_M} m | Treated as on an industrial site |",
        f"| `INDUSTRIAL_INFLUENCE_M` | {INDUSTRIAL_INFLUENCE_M} m | Treated as industry-adjacent |",
        f"| `PERSISTENT_RECURRENCE_COUNT` | {PERSISTENT_RECURRENCE_COUNT} | Detections in radius implying a continuous source |",
        f"| `PERSISTENT_SOURCE_DETECTIONS` | {PERSISTENT_SOURCE_DETECTIONS} | Distinct days implying a continuous source |",
        f"| `FRP_MODERATE_MW` | {FRP_MODERATE_MW} MW | Observed median FRP |",
        f"| `FRP_ELEVATED_MW` | {FRP_ELEVATED_MW} MW | Observed p75 FRP |",
        f"| `AGRICULTURAL_MONTHS` | {AGRICULTURAL_MONTHS} | Rabi and kharif residue windows in MP |",
        f"| `SINGLE_EVENT_RECURRENCE` | {SINGLE_EVENT_RECURRENCE} | Recurrence consistent with a one-off burn |",
        "",
        "## Rules, in order of application",
        "",
        "1. **Persistent thermal source** — on an industrial footprint (<= "
        f"{INDUSTRIAL_PROXIMITY_M} m) *and* recurring. Process heat, not an incident.",
        "2. **Industrial fire** — on an industrial footprint with a real thermal signal "
        "but no recurrence. Consistent with an episodic fire.",
        "3. **Persistent thermal source (unmapped)** — industry-adjacent, night-time and "
        "recurring. Brick kilns around Bhopal are largely unmapped in OSM.",
        "4. **Agricultural burn** — away from industry, in a harvest-residue month, "
        "daytime, low power, not recurring.",
        "5. **Vegetation fire** — the residual class. A default, not a positive claim.",
        "",
        "## Resulting distribution",
        "",
        "| Weak label | Rows | Share |",
        "| --- | --- | --- |",
    ]
    for label, count in counts.items():
        lines.append(f"| `{label}` | {count} | {count / len(frame):.1%} |")

    lines += [
        "",
        "## Known biases of this scheme",
        "",
        "- **Labels inherit OSM coverage gaps.** Only "
        f"{int((frame['distance_to_facility_m'] <= INDUSTRIAL_PROXIMITY_M).sum())} of "
        f"{len(frame)} detections are within {INDUSTRIAL_PROXIMITY_M} m of a mapped "
        "industrial site. A real kiln missing from OpenStreetMap produces a detection "
        "labelled as vegetation fire, and the model will learn that mistake.",
        "- **The scheme is circular by construction.** Distance-to-facility is both a "
        "labelling rule and a model feature, so high accuracy is largely the model "
        "recovering the thresholds it was trained on. This is why the trained model is "
        "presented as an operational convenience rather than as evidence that the "
        "classification is correct.",
        "- **The residual class absorbs all ambiguity**, so vegetation fire is "
        "over-represented relative to any plausible reality.",
        "",
        "## What would make these real labels",
        "",
        "- Bhopal fire-service incident reports with timestamps and coordinates",
        "- MPPCB inspection or consent records geocoded to facility level",
        "- Sentinel-2 or Landsat scene inspection around each detection time",
        "- Analyst adjudication in the TIMS UI, captured as a feedback loop",
        "",
    ]

    path = REPORTS_DIR / "weak_labels.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[labels] wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
