"""Part 4, Step 4 — export real hotspot records and features to a DataFrame/CSV.

Reads the same PostgreSQL + PostGIS database the Node backend writes to. Every
row originates from a real NASA FIRMS API response; nothing here generates,
augments or interpolates data.

    python ml/export_data.py
"""

from __future__ import annotations

import sys

import pandas as pd
import psycopg

from config import PILOT, RAW_CSV, THRESHOLDS, database_url

# Features are computed in SQL rather than pandas so the distance and recurrence
# columns come from PostGIS on the WGS84 spheroid — the same geodesic maths the
# backend uses at ingest time, not a re-derivation that could drift from it.
QUERY = """
SELECT
    h."id",
    h."latitude",
    h."longitude",
    h."detectedAt"                              AS detected_at,
    h."brightnessTemperature"                   AS brightness,
    COALESCE(h."frp", 0)                        AS frp,
    h."confidence",
    h."satellite",
    h."instrument",
    h."firmsProduct"                            AS firms_product,
    h."dayNight"                                AS day_night,
    h."source",
    h."persistenceDays"                         AS persistence_days,
    h."inBhopalBoundary"                        AS in_bhopal_boundary,
    h."distanceToFacilityM"                     AS distance_to_facility_m,
    f."name"                                    AS nearest_facility_name,
    f."type"                                    AS nearest_facility_type,

    -- Recurrence: total detections (not distinct days) within the configured
    -- radius, counted up to and including this detection's own timestamp so the
    -- feature is causal and cannot leak information from the future.
    (
        SELECT COUNT(*)
        FROM "hotspots" n
        WHERE n."detectedAt" <= h."detectedAt"
          AND n."detectedAt" >= h."detectedAt" - make_interval(days => %(lookback_days)s)
          AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(n."longitude", n."latitude"), 4326)::geography,
                ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography,
                %(recurrence_radius_m)s
              )
    )                                           AS recurrence_count,

    -- Nearest populated / critical receptor, for context and the risk score.
    (
        SELECT MIN(ST_Distance(
                ST_SetSRID(ST_MakePoint(e."longitude", e."latitude"), 4326)::geography,
                ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography))
        FROM "emergency_facilities" e
    )                                           AS distance_to_receptor_m,

    -- Count of mapped industrial sites within the influence radius. A detection
    -- inside a dense industrial cluster is a different proposition from one
    -- beside a single isolated workshop.
    (
        SELECT COUNT(*)
        FROM "industrial_facilities" i
        WHERE ST_DWithin(
                ST_SetSRID(ST_MakePoint(i."longitude", i."latitude"), 4326)::geography,
                ST_SetSRID(ST_MakePoint(h."longitude", h."latitude"), 4326)::geography,
                %(influence_m)s
              )
    )                                           AS facilities_within_influence

FROM "hotspots" h
LEFT JOIN "industrial_facilities" f ON f."id" = h."industrialFacilityId"
ORDER BY h."detectedAt" ASC
"""


def main() -> int:
    url = database_url()
    print(f"[export] connecting to PostgreSQL for the {PILOT['label']} pilot")

    params = {
        "lookback_days": THRESHOLDS["persistenceLookbackDays"],
        "recurrence_radius_m": float(THRESHOLDS["persistenceRadiusM"]),
        "influence_m": float(THRESHOLDS["industrialInfluenceM"]),
    }

    with psycopg.connect(url) as connection:
        # Guard against exporting an empty or PostGIS-less database, which would
        # otherwise produce a CSV that trains a meaningless model.
        with connection.cursor() as cursor:
            cursor.execute("SELECT postgis_version()")
            postgis = cursor.fetchone()
            print(f"[export] PostGIS {postgis[0] if postgis else 'MISSING'}")

        # Built from the cursor rather than pd.read_sql_query: pandas warns
        # that non-SQLAlchemy DBAPI connections are untested, and psycopg
        # already gives us column names via cursor.description.
        with connection.cursor() as cursor:
            cursor.execute(QUERY, params)
            columns = [column.name for column in cursor.description or []]
            frame = pd.DataFrame(cursor.fetchall(), columns=columns)

    if frame.empty:
        print(
            "[export] ERROR: no hotspots in the database.\n"
            "         Run the real ingest first:  cd backend && npm run firms:ingest\n"
            "         This pipeline will not fabricate training rows.",
            file=sys.stderr,
        )
        return 1

    # Derived flags the model consumes. Kept here rather than in SQL because
    # they are pure functions of already-exported columns.
    frame["is_night"] = (frame["day_night"] == "N").astype(int)
    frame["detected_at"] = pd.to_datetime(frame["detected_at"], utc=True)
    frame["month"] = frame["detected_at"].dt.month
    frame["hour_utc"] = frame["detected_at"].dt.hour

    frame.to_csv(RAW_CSV, index=False)

    print(f"[export] wrote {len(frame)} real hotspot row(s) -> {RAW_CSV.relative_to(RAW_CSV.parents[2])}")
    print(f"[export] columns: {len(frame.columns)}")
    print()
    print("[export] provenance (exact FIRMS product):")
    print(frame["firms_product"].value_counts().to_string())
    print()
    print(f"[export] date range: {frame['detected_at'].min()} -> {frame['detected_at'].max()}")
    print(f"[export] inside Bhopal boundary: {int(frame['in_bhopal_boundary'].sum())}/{len(frame)}")
    print()
    print("[export] feature summary:")
    print(
        frame[
            [
                "brightness",
                "frp",
                "confidence",
                "distance_to_facility_m",
                "recurrence_count",
                "persistence_days",
                "is_night",
            ]
        ]
        .describe()
        .round(2)
        .to_string()
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
