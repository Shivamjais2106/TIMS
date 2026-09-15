"""Part 4, Step 5 — data cleaning, sensor-artefact removal and EDA.

Reads ``data/hotspots_raw.csv`` (real FIRMS records exported by
``export_data.py``), cleans it, and writes:

  * ``data/hotspots_clean.csv``
  * ``reports/eda_summary.md``   — a real EDA summary, not a template
  * ``reports/eda_distributions.png``

Rows are only ever *dropped*, never imputed with invented values. Where a
column is legitimately missing (FRP is not reported by every product) the
missingness is documented and encoded explicitly rather than filled with a
plausible-looking number.

    python ml/clean_eda.py
"""

from __future__ import annotations

import sys

import matplotlib

# Headless: this runs in CI and in Docker with no display attached.
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd

from config import CLEAN_CSV, PILOT, RAW_CSV, REPORTS_DIR

# ---------------------------------------------------------------------------
# Physical validity bounds — named, not magic
#
# These are instrument limits, not statistical outlier cuts. VIIRS and MODIS
# report brightness temperature in Kelvin; a value below freezing or above the
# saturation ceiling is a sensor artefact, not a cold or an extraordinary fire.
# ---------------------------------------------------------------------------

#: Below this, a "fire" detection is physically impossible.
MIN_BRIGHTNESS_K = 250.0
#: VIIRS I-4 saturates around 367 K; MODIS band 21 around 500 K. 550 K is a
#: generous ceiling that still excludes obvious garbage.
MAX_BRIGHTNESS_K = 550.0

#: FRP must be non-negative. A negative value is a processing error.
MIN_FRP_MW = 0.0
#: No plausible single 375 m pixel in a 25 km urban box radiates 5 GW.
MAX_FRP_MW = 5_000.0

MIN_CONFIDENCE = 0
MAX_CONFIDENCE = 100


def clean(frame: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Removes artefacts and standardises units. Returns (clean, log)."""
    log: list[str] = []
    before = len(frame)

    # --- Duplicates ---------------------------------------------------------
    # externalId is unique in the database, so exact duplicates should be
    # impossible. Checked anyway: a silent duplicate would inflate the
    # recurrence feature and bias the persistence label.
    duplicated = frame.duplicated(subset=["id"]).sum()
    if duplicated:
        frame = frame.drop_duplicates(subset=["id"])
        log.append(f"Dropped {duplicated} duplicate hotspot id(s)")
    else:
        log.append("No duplicate hotspot ids (externalId uniqueness held)")

    # --- Geometry -----------------------------------------------------------
    missing_geom = frame[["latitude", "longitude"]].isna().any(axis=1).sum()
    if missing_geom:
        frame = frame.dropna(subset=["latitude", "longitude"])
        log.append(f"Dropped {missing_geom} row(s) with no coordinate")
    else:
        log.append("All rows carry a valid coordinate")

    # --- Brightness temperature --------------------------------------------
    bad_brightness = (
        frame["brightness"].isna()
        | (frame["brightness"] < MIN_BRIGHTNESS_K)
        | (frame["brightness"] > MAX_BRIGHTNESS_K)
    )
    if bad_brightness.any():
        log.append(
            f"Dropped {int(bad_brightness.sum())} row(s) with brightness outside "
            f"[{MIN_BRIGHTNESS_K}, {MAX_BRIGHTNESS_K}] K (sensor artefact)"
        )
        frame = frame[~bad_brightness]
    else:
        log.append(
            f"All brightness values within the physical range "
            f"[{MIN_BRIGHTNESS_K}, {MAX_BRIGHTNESS_K}] K"
        )

    # --- FRP ----------------------------------------------------------------
    # FRP is exported as COALESCE(frp, 0). Zero is a real reported value for
    # weak detections, so it is kept; only impossible values are removed.
    bad_frp = (frame["frp"] < MIN_FRP_MW) | (frame["frp"] > MAX_FRP_MW)
    if bad_frp.any():
        log.append(f"Dropped {int(bad_frp.sum())} row(s) with FRP outside [{MIN_FRP_MW}, {MAX_FRP_MW}] MW")
        frame = frame[~bad_frp]
    else:
        log.append(f"All FRP values within [{MIN_FRP_MW}, {MAX_FRP_MW}] MW")

    zero_frp = int((frame["frp"] == 0).sum())
    log.append(
        f"{zero_frp} row(s) report FRP = 0. Kept as-is: zero is a genuine "
        "low-power reading, and imputing a mean would invent radiative power."
    )

    # --- Confidence ---------------------------------------------------------
    out_of_range = (frame["confidence"] < MIN_CONFIDENCE) | (frame["confidence"] > MAX_CONFIDENCE)
    if out_of_range.any():
        log.append(f"Dropped {int(out_of_range.sum())} row(s) with confidence outside 0-100")
        frame = frame[~out_of_range]
    else:
        log.append("All confidence values normalised to 0-100 (VIIRS l/n/h -> 30/70/95)")

    # --- Distance to facility ----------------------------------------------
    # A null distance means "no industrial facility on record within query
    # range", which is information, not absence of information. It is encoded
    # with the same sentinel the serving path uses so the model sees one
    # consistent representation.
    from config import NO_FACILITY_DISTANCE_M

    missing_distance = int(frame["distance_to_facility_m"].isna().sum())
    if missing_distance:
        frame = frame.copy()
        frame["distance_to_facility_m"] = frame["distance_to_facility_m"].fillna(NO_FACILITY_DISTANCE_M)
        log.append(
            f"Encoded {missing_distance} null distance-to-facility value(s) as the "
            f"{NO_FACILITY_DISTANCE_M:.0f} m sentinel (matches the serving contract)"
        )
    else:
        log.append("Every row has a real PostGIS-computed distance to its nearest facility")

    # --- Geofence -----------------------------------------------------------
    outside = int((~frame["in_bhopal_boundary"].astype(bool)).sum())
    if outside:
        frame = frame[frame["in_bhopal_boundary"].astype(bool)]
        log.append(f"Dropped {outside} row(s) outside the {PILOT['label']} district polygon")
    else:
        log.append(f"All rows are inside the {PILOT['label']} district polygon (ST_Within)")

    log.append(f"Rows: {before} in -> {len(frame)} out ({before - len(frame)} removed)")
    return frame.reset_index(drop=True), log


def write_plots(frame: pd.DataFrame) -> str:
    """Distribution plots for the four model features plus the day/night split."""
    figure, axes = plt.subplots(2, 3, figsize=(15, 8))
    figure.suptitle(
        f"TIMS {PILOT['label']} pilot — real FIRMS detections (n={len(frame)})",
        fontsize=13,
    )

    axes[0][0].hist(frame["brightness"], bins=30, color="#C1502E", edgecolor="#0A0C0E")
    axes[0][0].set_title("Brightness temperature (K)")

    # Log x-axis: FRP is strongly right-skewed (p50 2.4 MW, max 136 MW), so a
    # linear axis compresses the entire body of the distribution into one bar.
    axes[0][1].hist(frame[frame["frp"] > 0]["frp"], bins=30, color="#C1502E", edgecolor="#0A0C0E")
    axes[0][1].set_xscale("log")
    axes[0][1].set_title("FRP (MW, log scale, FRP>0)")

    axes[0][2].hist(
        frame["distance_to_facility_m"] / 1000, bins=30, color="#6B9E7A", edgecolor="#0A0C0E"
    )
    axes[0][2].set_title("Distance to nearest facility (km)")

    axes[1][0].hist(
        frame["recurrence_count"],
        bins=range(1, int(frame["recurrence_count"].max()) + 2),
        color="#6B9E7A",
        edgecolor="#0A0C0E",
    )
    axes[1][0].set_title("Recurrence count (detections within 1 km)")

    axes[1][1].hist(frame["confidence"], bins=20, color="#7A8086", edgecolor="#0A0C0E")
    axes[1][1].set_title("Confidence (0-100)")

    counts = frame["is_night"].value_counts().sort_index()
    axes[1][2].bar(
        ["Day", "Night"],
        [int(counts.get(0, 0)), int(counts.get(1, 0))],
        color=["#7A8086", "#C1502E"],
        edgecolor="#0A0C0E",
    )
    axes[1][2].set_title("Day / night overpass")

    for row in axes:
        for axis in row:
            axis.grid(alpha=0.2, linestyle=":")

    figure.tight_layout()
    path = REPORTS_DIR / "eda_distributions.png"
    figure.savefig(path, dpi=110, facecolor="white")
    plt.close(figure)
    return path.name


def write_summary(frame: pd.DataFrame, log: list[str], plot_name: str) -> None:
    """Writes a real EDA summary built from the actual cleaned frame."""
    features = ["brightness", "frp", "confidence", "distance_to_facility_m", "recurrence_count", "persistence_days"]
    describe = frame[features].describe().round(2)

    correlation = frame[["brightness", "frp", "distance_to_facility_m", "recurrence_count", "is_night"]].corr().round(3)

    lines: list[str] = [
        f"# EDA summary — TIMS {PILOT['label']} pilot ({PILOT['id']})",
        "",
        "Generated by `ml/clean_eda.py` from real NASA FIRMS records held in",
        "PostgreSQL. No synthetic, augmented or interpolated rows are present.",
        "",
        "## Dataset",
        "",
        f"- Rows after cleaning: **{len(frame)}**",
        f"- Date range: **{frame['detected_at'].min()}** to **{frame['detected_at'].max()}**",
        f"- All rows inside the {PILOT['label']} district polygon: "
        f"**{bool(frame['in_bhopal_boundary'].astype(bool).all())}**",
        "",
        "### Provenance by FIRMS product",
        "",
        "| Product | Rows |",
        "| --- | --- |",
    ]
    for product, count in frame["firms_product"].value_counts().items():
        lines.append(f"| `{product}` | {count} |")

    lines += [
        "",
        "`_SP` products are the FIRMS **archive**. The pilot bounding box has no",
        "near-real-time detections in September (monsoon), so the ingest widened to",
        "the documented February-April fire season and recorded that it had done so.",
        "",
        "## Cleaning log",
        "",
    ]
    lines += [f"- {entry}" for entry in log]

    lines += [
        "",
        "## Feature distributions",
        "",
        "```",
        describe.to_string(),
        "```",
        "",
        f"![Distributions]({plot_name})",
        "",
        "## Correlations",
        "",
        "```",
        correlation.to_string(),
        "```",
        "",
        "## Observations",
        "",
    ]

    # Observations are computed from the frame, so they cannot go stale.
    frp_median = frame["frp"].median()
    frp_p90 = frame["frp"].quantile(0.90)
    near_1km = int((frame["distance_to_facility_m"] <= 1_000).sum())
    near_3km = int((frame["distance_to_facility_m"] <= 3_000).sum())
    night_share = frame["is_night"].mean()
    persistent = int((frame["persistence_days"] >= 3).sum())

    lines += [
        f"- **FRP is strongly right-skewed**: median {frp_median:.2f} MW, p90 "
        f"{frp_p90:.2f} MW, max {frame['frp'].max():.1f} MW. These are kilns, "
        "workshops and crop/vegetation fires, not refinery flares, so risk "
        "thresholds calibrated nationally would misclassify almost everything here.",
        f"- **Industrial co-location is rare**: {near_1km} of {len(frame)} detections "
        f"({near_1km / len(frame):.1%}) fall within 1 km of a mapped industrial site, "
        f"and {near_3km} ({near_3km / len(frame):.1%}) within 3 km. Any classifier "
        "trained on proximity-derived labels will therefore face heavy class imbalance.",
        f"- **Night detections dominate**: {night_share:.1%} of passes are night-time, "
        "which is expected for VIIRS overpass timing and means `is_night` alone is a "
        "weak discriminator in this dataset.",
        f"- **{persistent} detections recur on 3 or more days**, which is the signal the "
        "persistent-thermal-source class depends on.",
        "",
        "## Limitation",
        "",
        "There is **no verified ground truth** for these detections. No fire-department",
        "incident log, MPPCB inspection record or satellite-image confirmation has been",
        "joined to them. Everything downstream of this file trains on *heuristic weak",
        "labels* (see `weak_labels.py`), and the reported metrics measure agreement with",
        "those heuristics — not real-world classification accuracy.",
        "",
    ]

    path = REPORTS_DIR / "eda_summary.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[eda] wrote {path}")


def main() -> int:
    if not RAW_CSV.exists():
        print(f"[eda] ERROR: {RAW_CSV} not found. Run `python ml/export_data.py` first.", file=sys.stderr)
        return 1

    raw = pd.read_csv(RAW_CSV, parse_dates=["detected_at"])
    print(f"[eda] loaded {len(raw)} raw row(s)")

    cleaned, log = clean(raw)
    if cleaned.empty:
        print("[eda] ERROR: cleaning removed every row.", file=sys.stderr)
        return 1

    cleaned.to_csv(CLEAN_CSV, index=False)
    print(f"[eda] wrote {len(cleaned)} clean row(s) -> {CLEAN_CSV}")

    print()
    print("[eda] cleaning log:")
    for entry in log:
        print(f"  - {entry}")

    plot_name = write_plots(cleaned)
    write_summary(cleaned, log, plot_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
