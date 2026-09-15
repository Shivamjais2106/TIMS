"""Part 4, Steps 7 and 8 — feature engineering, stratified split, model training.

Trains XGBoost (primary) and Random Forest (comparison baseline) on the same
stratified 80/20 split of the real Bhopal detections, reports per-class
precision/recall/F1 and a confusion matrix from the held-out test set, and
saves the better model to ``models/``.

    python ml/train_model.py

Read ``reports/model_report.md`` alongside the numbers: the labels are
heuristic weak labels, so these metrics measure agreement with the labelling
rules, not real-world classification accuracy.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

import joblib
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

from config import (
    FEATURE_COLUMNS,
    LABELLED_CSV,
    METADATA_PATH,
    MODEL_PATH,
    MODEL_VERSION,
    MODELS_DIR,
    PILOT,
    RANDOM_STATE,
    REPORTS_DIR,
    TEST_SIZE,
)


def load() -> pd.DataFrame:
    if not LABELLED_CSV.exists():
        print(
            f"[train] ERROR: {LABELLED_CSV} not found.\n"
            "        Run, in order:\n"
            "          python ml/export_data.py\n"
            "          python ml/clean_eda.py\n"
            "          python ml/weak_labels.py",
            file=sys.stderr,
        )
        raise SystemExit(1)

    frame = pd.read_csv(LABELLED_CSV, parse_dates=["detected_at"])
    print(f"[train] loaded {len(frame)} labelled row(s)")
    return frame


def evaluate(name: str, model, x_test: pd.DataFrame, y_test: np.ndarray, classes: list[str]) -> dict:
    """Scores a fitted model on the held-out test set."""
    predictions = model.predict(x_test)

    accuracy = accuracy_score(y_test, predictions)
    # Macro-F1 is the headline metric rather than accuracy: with 83% of rows in
    # one class, a model that predicted only that class would score 0.83
    # accuracy while being useless. Macro-F1 weights every class equally.
    macro_f1 = f1_score(y_test, predictions, average="macro", zero_division=0)
    weighted_f1 = f1_score(y_test, predictions, average="weighted", zero_division=0)

    report = classification_report(
        y_test,
        predictions,
        labels=list(range(len(classes))),
        target_names=classes,
        zero_division=0,
        output_dict=True,
    )
    matrix = confusion_matrix(y_test, predictions, labels=list(range(len(classes))))

    print(f"\n[train] === {name} (held-out test set, n={len(y_test)}) ===")
    print(f"        accuracy    : {accuracy:.4f}")
    print(f"        macro F1    : {macro_f1:.4f}")
    print(f"        weighted F1 : {weighted_f1:.4f}")
    print()
    print(
        classification_report(
            y_test,
            predictions,
            labels=list(range(len(classes))),
            target_names=classes,
            zero_division=0,
        )
    )

    return {
        "name": name,
        "accuracy": float(accuracy),
        "macro_f1": float(macro_f1),
        "weighted_f1": float(weighted_f1),
        "report": report,
        "confusion_matrix": matrix.tolist(),
        "predictions": predictions,
    }


def plot_confusion(result: dict, classes: list[str], filename: str) -> None:
    matrix = np.array(result["confusion_matrix"])
    figure, axis = plt.subplots(figsize=(7.5, 6.5))
    image = axis.imshow(matrix, cmap="Oranges")

    short = [c.replace("POSSIBLE_", "").replace("_", "\n").title() for c in classes]
    axis.set_xticks(range(len(classes)), short, fontsize=8)
    axis.set_yticks(range(len(classes)), short, fontsize=8)
    axis.set_xlabel("Predicted")
    axis.set_ylabel("Weak label (heuristic)")
    axis.set_title(f"{result['name']} — confusion matrix\nheld-out test set, n={matrix.sum()}")

    threshold = matrix.max() / 2 if matrix.max() else 0
    for i in range(matrix.shape[0]):
        for j in range(matrix.shape[1]):
            axis.text(
                j,
                i,
                int(matrix[i, j]),
                ha="center",
                va="center",
                color="white" if matrix[i, j] > threshold else "#0A0C0E",
                fontsize=11,
            )

    figure.colorbar(image, ax=axis, fraction=0.045)
    figure.tight_layout()
    figure.savefig(REPORTS_DIR / filename, dpi=110, facecolor="white")
    plt.close(figure)


def main() -> int:
    frame = load()

    # --- Step 7: feature engineering + stratified split --------------------
    # Only the five features the serving contract exposes are used. Latitude and
    # longitude are deliberately excluded: with 1,294 points in a 25 km box a
    # tree ensemble would memorise coordinates and appear to perform well while
    # learning nothing transferable.
    features = frame[FEATURE_COLUMNS].astype(float)

    present = [label for label in sorted(frame["weak_label"].unique())]
    encoding = {label: index for index, label in enumerate(present)}
    target = frame["weak_label"].map(encoding).to_numpy()

    print(f"[train] features : {FEATURE_COLUMNS}")
    print(f"[train] classes  : {present}")
    print()
    print("[train] class balance:")
    for label in present:
        count = int((frame['weak_label'] == label).sum())
        print(f"        {label:<40} {count:>5}  ({count / len(frame):>6.1%})")

    x_train, x_test, y_train, y_test = train_test_split(
        features,
        target,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        # Stratified so every class appears in both halves. Without this the
        # 2% minority classes could be absent from the test set entirely.
        stratify=target,
    )
    print()
    print(f"[train] split: {len(x_train)} train / {len(x_test)} test (stratified, {TEST_SIZE:.0%} held out)")
    print("[train] test-set class counts:", dict(zip(present, np.bincount(y_test, minlength=len(present)).tolist())))

    # Balanced sample weights, so the minority industrial classes are not
    # ignored in favour of the 83% vegetation majority.
    sample_weights = compute_sample_weight(class_weight="balanced", y=y_train)

    # --- Step 8: train XGBoost (primary) -----------------------------------
    xgb = XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        # Shallow-ish trees plus L2 regularisation: only 1,294 rows across 5
        # features, so an unconstrained ensemble overfits immediately.
        reg_lambda=1.5,
        min_child_weight=2,
        objective="multi:softprob",
        num_class=len(present),
        eval_metric="mlogloss",
        random_state=RANDOM_STATE,
        n_jobs=4,
        tree_method="hist",
    )
    xgb.fit(x_train, y_train, sample_weight=sample_weights)

    # --- Random Forest (comparison baseline) -------------------------------
    forest = RandomForestClassifier(
        n_estimators=400,
        max_depth=12,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=4,
    )
    forest.fit(x_train, y_train)

    xgb_result = evaluate("XGBoost (primary)", xgb, x_test, y_test, present)
    forest_result = evaluate("Random Forest (baseline)", forest, x_test, y_test, present)

    # --- Cross-validation --------------------------------------------------
    # A single 20% split of 1,294 rows puts only ~6 rows of each minority class
    # in the test set, so one misclassification swings its recall by 17 points.
    # 5-fold stratified CV gives a far more honest picture of stability.
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    cv_scores = {
        "XGBoost (primary)": cross_val_score(xgb, features, target, cv=folds, scoring="f1_macro"),
        "Random Forest (baseline)": cross_val_score(forest, features, target, cv=folds, scoring="f1_macro"),
    }

    print("\n[train] === 5-fold stratified cross-validation (macro F1) ===")
    for name, scores in cv_scores.items():
        print(f"        {name:<28} {scores.mean():.4f} +/- {scores.std():.4f}   folds={np.round(scores, 4).tolist()}")

    # --- Selection ---------------------------------------------------------
    # Selected on *cross-validated* macro F1, not the single-split score.
    #
    # The single 20% split puts only 6 rows of each minority class in the test
    # set, so one misclassification swings that class's recall by 17 points and
    # macro F1 by several. On this dataset the two estimates disagree: the
    # single split favours Random Forest while 5-fold CV favours XGBoost with a
    # LOWER standard deviation. Trusting the 5-fold estimate is the defensible
    # choice; selecting on the noisier metric would have been arbitrary.
    results = [xgb_result, forest_result]
    models = {xgb_result["name"]: xgb, forest_result["name"]: forest}

    best = max(results, key=lambda result: cv_scores[result["name"]].mean())
    best_model = models[best["name"]]

    for result in results:
        tag = "selected" if result is best else "rejected"
        scores = cv_scores[result["name"]]
        print(
            f"[train] {tag}: {result['name']} "
            f"(CV macro F1 {scores.mean():.4f} +/- {scores.std():.4f}; "
            f"single-split macro F1 {result['macro_f1']:.4f})"
        )

    plot_confusion(xgb_result, present, "confusion_xgboost.png")
    plot_confusion(forest_result, present, "confusion_random_forest.png")

    # --- Feature importance ------------------------------------------------
    importance = dict(
        sorted(
            zip(FEATURE_COLUMNS, [float(v) for v in best_model.feature_importances_]),
            key=lambda item: item[1],
            reverse=True,
        )
    )
    print("\n[train] feature importance (selected model):")
    for feature, value in importance.items():
        print(f"        {feature:<26} {value:.4f}")

    figure, axis = plt.subplots(figsize=(8, 4))
    axis.barh(list(importance)[::-1], list(importance.values())[::-1], color="#C1502E", edgecolor="#0A0C0E")
    axis.set_title(f"{best['name']} — feature importance")
    axis.grid(alpha=0.2, linestyle=":", axis="x")
    figure.tight_layout()
    figure.savefig(REPORTS_DIR / "feature_importance.png", dpi=110, facecolor="white")
    plt.close(figure)

    # --- Persist -----------------------------------------------------------
    # The label encoding is saved with the model: without it the served
    # integer predictions cannot be mapped back to class names.
    joblib.dump(
        {
            "model": best_model,
            "classes": present,
            "features": FEATURE_COLUMNS,
            "model_version": MODEL_VERSION,
            "algorithm": best["name"],
        },
        MODEL_PATH,
    )

    metadata = {
        "model_version": MODEL_VERSION,
        "algorithm": best["name"],
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "pilot": PILOT,
        "features": FEATURE_COLUMNS,
        "classes": present,
        "dataset": {
            "rows_total": int(len(frame)),
            "rows_train": int(len(x_train)),
            "rows_test": int(len(x_test)),
            "date_range": [str(frame["detected_at"].min()), str(frame["detected_at"].max())],
            "class_counts": {label: int((frame["weak_label"] == label).sum()) for label in present},
            "label_source": "heuristic-weak-v1",
            "ground_truth": False,
        },
        "metrics": {
            result["name"]: {
                "accuracy": result["accuracy"],
                "macro_f1": result["macro_f1"],
                "weighted_f1": result["weighted_f1"],
                "per_class": {
                    label: {
                        "precision": result["report"][label]["precision"],
                        "recall": result["report"][label]["recall"],
                        "f1": result["report"][label]["f1-score"],
                        "support": result["report"][label]["support"],
                    }
                    for label in present
                },
                "confusion_matrix": result["confusion_matrix"],
            }
            for result in results
        },
        "cross_validation": {
            name: {
                "macro_f1_mean": float(scores.mean()),
                "macro_f1_std": float(scores.std()),
                "folds": [float(s) for s in scores],
            }
            for name, scores in cv_scores.items()
        },
        "feature_importance": importance,
        "selection": {
            "basis": "5-fold stratified cross-validated macro F1",
            "rationale": (
                "The single 20% split holds only ~6 rows of each minority class, so its "
                "macro F1 is unstable; on this dataset the split and the CV estimate "
                "disagree about which model is better. The CV estimate is used."
            ),
            "selected": best["name"],
        },
        "caveat": (
            "Trained on heuristic weak labels derived from industrial proximity and "
            "recurrence, NOT on verified ground truth. Reported metrics measure "
            "agreement with those heuristics. Distance-to-facility is both a labelling "
            "rule and a model feature, so performance is partly circular."
        ),
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"\n[train] saved model    -> {MODEL_PATH}")
    print(f"[train] saved metadata -> {METADATA_PATH}")

    write_report(metadata, present)
    return 0


def write_report(metadata: dict, classes: list[str]) -> None:
    """Writes the human-readable model report."""
    lines = [
        f"# Model report — TIMS {PILOT['label']} pilot ({PILOT['id']})",
        "",
        "> **Trained on heuristic weak labels, not ground truth.** Every figure below",
        "> measures agreement with the labelling rules in `weak_labels.py`. It is not",
        "> evidence that TIMS classifies real fires correctly.",
        "",
        f"- Model version: `{metadata['model_version']}`",
        f"- Selected algorithm: **{metadata['algorithm']}**",
        f"- Trained at: {metadata['trained_at']}",
        f"- Features: {', '.join(f'`{f}`' for f in metadata['features'])}",
        "",
        "## Dataset",
        "",
        f"- Total rows: **{metadata['dataset']['rows_total']}** real NASA FIRMS detections",
        f"- Train / test: {metadata['dataset']['rows_train']} / {metadata['dataset']['rows_test']} "
        f"(stratified {TEST_SIZE:.0%} held out)",
        f"- Date range: {metadata['dataset']['date_range'][0]} to {metadata['dataset']['date_range'][1]}",
        "",
        "| Weak label | Rows |",
        "| --- | --- |",
    ]
    for label, count in metadata["dataset"]["class_counts"].items():
        lines.append(f"| `{label}` | {count} |")

    lines += ["", "## Held-out test results", "",
              "| Model | Accuracy | Macro F1 | Weighted F1 |", "| --- | --- | --- | --- |"]
    for name, scores in metadata["metrics"].items():
        lines.append(
            f"| {name} | {scores['accuracy']:.4f} | {scores['macro_f1']:.4f} | {scores['weighted_f1']:.4f} |"
        )

    lines += [
        "",
        "Macro F1 is the headline metric, not accuracy: with ~83% of rows in one class,",
        "a model that only ever predicted that class would score 0.83 accuracy while",
        "being operationally worthless.",
        "",
    ]

    for name, scores in metadata["metrics"].items():
        lines += [
            f"### {name} — per class",
            "",
            "| Class | Precision | Recall | F1 | Support |",
            "| --- | --- | --- | --- | --- |",
        ]
        for label in classes:
            per = scores["per_class"][label]
            lines.append(
                f"| `{label}` | {per['precision']:.3f} | {per['recall']:.3f} | "
                f"{per['f1']:.3f} | {int(per['support'])} |"
            )
        lines += ["", "Confusion matrix (rows = weak label, columns = predicted):", "",
                  "| | " + " | ".join(c.replace("POSSIBLE_", "") for c in classes) + " |",
                  "| --- |" + " --- |" * len(classes)]
        for index, label in enumerate(classes):
            row = scores["confusion_matrix"][index]
            lines.append(f"| **{label.replace('POSSIBLE_', '')}** | " + " | ".join(str(v) for v in row) + " |")
        lines.append("")

    lines += ["## 5-fold stratified cross-validation (macro F1)", "",
              "**Model selection is based on this table, not the single split above.**",
              "",
              "| Model | Mean | Std |", "| --- | --- | --- |"]
    for name, scores in metadata["cross_validation"].items():
        lines.append(f"| {name} | {scores['macro_f1_mean']:.4f} | {scores['macro_f1_std']:.4f} |")

    lines += [
        "",
        "Cross-validation matters here: a single 20% split leaves only ~6 rows of each",
        "minority class in the test set, so one misclassification moves its recall by",
        "17 percentage points.",
        "",
        "## Feature importance",
        "",
        "| Feature | Importance |",
        "| --- | --- |",
    ]
    for feature, value in metadata["feature_importance"].items():
        lines.append(f"| `{feature}` | {value:.4f} |")

    lines += [
        "",
        "![Confusion — XGBoost](confusion_xgboost.png)",
        "![Confusion — Random Forest](confusion_random_forest.png)",
        "![Feature importance](feature_importance.png)",
        "",
        "## How to read these numbers honestly",
        "",
        "1. **The labels are heuristics.** No incident log or image confirmation was",
        "   joined to these detections, so there is no ground truth to be accurate against.",
        "2. **The task is partly circular.** `distance_to_facility_m` is both a labelling",
        "   rule and a model feature, so a high score largely reflects the model",
        "   recovering thresholds it was trained on. Expect `distance_to_facility_m` to",
        "   dominate feature importance for exactly this reason.",
        "3. **The minority classes are small.** Industrial and persistent-source classes",
        "   have roughly 30 examples each. Their per-class metrics are indicative only.",
        "4. **Class imbalance is real, not fixed.** Balanced sample weights stop the",
        "   majority class swamping training, but they do not create information that",
        "   30 examples do not contain.",
        "",
        "## What the model is actually for",
        "",
        "It makes the labelling logic available as a fast, versioned service with a",
        "calibrated-looking confidence, so the backend can attach a class and a score to",
        "each detection at ingest time and record which code path produced it. When the",
        "service is unreachable the backend falls back to the rule engine and records",
        "`classificationPath = RULE_FALLBACK`, so the UI never implies a model prediction",
        "that did not happen.",
        "",
    ]

    path = REPORTS_DIR / "model_report.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[train] saved report   -> {path}")


if __name__ == "__main__":
    raise SystemExit(main())
