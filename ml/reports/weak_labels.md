# Weak labels — TIMS Bhopal pilot (BHOPAL-01)

> **These are heuristic weak labels, not ground truth.**
>
> No verified incident log, regulatory inspection record or image-confirmed
> fire perimeter exists for these detections. Labels are inferred from
> geospatial context. All downstream accuracy, precision and recall figures
> measure **agreement with these heuristics**, not real-world correctness.

## Thresholds used

| Constant | Value | Meaning |
| --- | --- | --- |
| `INDUSTRIAL_PROXIMITY_M` | 1000 m | Treated as on an industrial site |
| `INDUSTRIAL_INFLUENCE_M` | 3000 m | Treated as industry-adjacent |
| `PERSISTENT_RECURRENCE_COUNT` | 5 | Detections in radius implying a continuous source |
| `PERSISTENT_SOURCE_DETECTIONS` | 3 | Distinct days implying a continuous source |
| `FRP_MODERATE_MW` | 2.4 MW | Observed median FRP |
| `FRP_ELEVATED_MW` | 7.7 MW | Observed p75 FRP |
| `AGRICULTURAL_MONTHS` | (3, 4, 10, 11) | Rabi and kharif residue windows in MP |
| `SINGLE_EVENT_RECURRENCE` | 2 | Recurrence consistent with a one-off burn |

## Rules, in order of application

1. **Persistent thermal source** — on an industrial footprint (<= 1000 m) *and* recurring. Process heat, not an incident.
2. **Industrial fire** — on an industrial footprint with a real thermal signal but no recurrence. Consistent with an episodic fire.
3. **Persistent thermal source (unmapped)** — industry-adjacent, night-time and recurring. Brick kilns around Bhopal are largely unmapped in OSM.
4. **Agricultural burn** — away from industry, in a harvest-residue month, daytime, low power, not recurring.
5. **Vegetation fire** — the residual class. A default, not a positive claim.

## Resulting distribution

| Weak label | Rows | Share |
| --- | --- | --- |
| `POSSIBLE_VEGETATION_FIRE` | 1071 | 82.8% |
| `POSSIBLE_AGRICULTURAL_BURN` | 164 | 12.7% |
| `POSSIBLE_PERSISTENT_THERMAL_SOURCE` | 30 | 2.3% |
| `POSSIBLE_INDUSTRIAL_FIRE` | 29 | 2.2% |

## Known biases of this scheme

- **Labels inherit OSM coverage gaps.** Only 61 of 1294 detections are within 1000 m of a mapped industrial site. A real kiln missing from OpenStreetMap produces a detection labelled as vegetation fire, and the model will learn that mistake.
- **The scheme is circular by construction.** Distance-to-facility is both a labelling rule and a model feature, so high accuracy is largely the model recovering the thresholds it was trained on. This is why the trained model is presented as an operational convenience rather than as evidence that the classification is correct.
- **The residual class absorbs all ambiguity**, so vegetation fire is over-represented relative to any plausible reality.

## What would make these real labels

- Bhopal fire-service incident reports with timestamps and coordinates
- MPPCB inspection or consent records geocoded to facility level
- Sentinel-2 or Landsat scene inspection around each detection time
- Analyst adjudication in the TIMS UI, captured as a feedback loop
