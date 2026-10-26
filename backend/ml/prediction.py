from __future__ import annotations

import csv
import io
import json
import math
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd


FEATURES = [
    "unit_weight_kN_m3",
    "soil_cohesion_kPa",
    "friction_angle_deg",
    "slope_angle_deg",
    "slope_height_m",
    "pore_water_pressure_ratio",
    "reinforcement_type",
]
NUMERIC_FEATURES = FEATURES[:-1]
CATEGORICAL_FEATURES = ["reinforcement_type"]
REGRESSION_TARGET = "factor_of_safety"
CLASSIFICATION_TARGET = "risk_class"
OUTPUT_COLUMNS = [
    "predicted_factor_of_safety",
    "predicted_risk_class",
    "predicted_warning_level",
    "prediction_status",
]
WARNING_THRESHOLDS = {"unstable": 1.0}
ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "trained_models.joblib"
FEATURES_PATH = ARTIFACT_DIR / "feature_names.json"
EVALUATION_PATH = ARTIFACT_DIR / "evaluation_report.json"

_FEATURE_ALIASES = {
    "unit weight (kn/m³)": "unit_weight_kN_m3",
    "unit_weight (kn/m³)": "unit_weight_kN_m3",
    "unit weight (kn/m3)": "unit_weight_kN_m3",
    "unit_weight (kn/m3)": "unit_weight_kN_m3",
    "cohesion (kpa)": "soil_cohesion_kPa",
    "soil cohesion (kpa)": "soil_cohesion_kPa",
    "internal friction angle (°)": "friction_angle_deg",
    "internal friction angle (deg)": "friction_angle_deg",
    "friction angle (°)": "friction_angle_deg",
    "friction angle (deg)": "friction_angle_deg",
    "slope angle (°)": "slope_angle_deg",
    "slope angle (deg)": "slope_angle_deg",
    "slope height (m)": "slope_height_m",
    "pore water pressure ratio": "pore_water_pressure_ratio",
    "reinforcement type": "reinforcement_type",
    "factor of safety (fs)": REGRESSION_TARGET,
    "factor of safety": REGRESSION_TARGET,
    "factor_of_safety_proxy": REGRESSION_TARGET,
    "reinforcement numeric": "reinforcement_numeric",
}
COLUMN_ALIASES = {
    **{name.casefold(): name for name in FEATURES},
    **_FEATURE_ALIASES,
    "risk_class": CLASSIFICATION_TARGET,
    "warning_level": "warning_level",
}
_CATEGORY_VALUES = {"Drainage", "Geosynthetics", "Retaining Wall", "Soil Nailing"}
_PHYSICAL_BOUNDS: dict[str, tuple[float | None, float | None, bool, bool, str]] = {
    "unit_weight_kN_m3": (0.0, 50.0, False, True, "must be greater than 0 and at most 50 kN/m³"),
    "soil_cohesion_kPa": (0.0, None, True, True, "must be 0 or greater kPa"),
    "friction_angle_deg": (0.0, 90.0, False, False, "must be greater than 0 and less than 90 degrees"),
    "slope_angle_deg": (0.0, 90.0, False, False, "must be greater than 0 and less than 90 degrees"),
    "slope_height_m": (0.0, None, False, True, "must be greater than 0 metres"),
    "pore_water_pressure_ratio": (0.0, 1.0, True, True, "must be between 0 and 1"),
}


class PredictionInputError(ValueError):
    pass


def normalize_column_name(name: str) -> str:
    normalized = name.strip().casefold()
    return COLUMN_ALIASES.get(normalized, normalized)


def warning_level_for_fos(factor_of_safety: float) -> str:
    return "UNSTABLE" if factor_of_safety < WARNING_THRESHOLDS["unstable"] else "STABLE"


def parse_prediction_csv(contents: bytes) -> tuple[pd.DataFrame, list[str]]:
    try:
        text = contents.decode("utf-8-sig")
        header = next(csv.reader(io.StringIO(text, newline="")), None)
        if not header or not any(str(value).strip() for value in header):
            raise PredictionInputError("The CSV is empty or has no header row.")
        original_columns = [str(column) for column in header]
        normalized_columns = [normalize_column_name(column) for column in original_columns]
        duplicates = sorted(
            {name for name in normalized_columns if normalized_columns.count(name) > 1}
        )
        if duplicates:
            raise PredictionInputError(
                f"Duplicate column names after feature mapping are ambiguous: {', '.join(duplicates)}."
            )
        output_collisions = [column for column in OUTPUT_COLUMNS if column in normalized_columns]
        if output_collisions:
            raise PredictionInputError(
                "Input columns conflict with generated prediction outputs: "
                f"{', '.join(output_collisions)}. Rename these columns before uploading."
            )
        frame = pd.read_csv(io.StringIO(text))
    except UnicodeDecodeError as error:
        raise PredictionInputError("The CSV must use UTF-8 or UTF-8 with BOM encoding.") from error
    except pd.errors.EmptyDataError as error:
        raise PredictionInputError("The CSV is empty or has no header row.") from error
    except pd.errors.ParserError as error:
        raise PredictionInputError(f"The CSV could not be parsed: {error}") from error
    except StopIteration as error:
        raise PredictionInputError("The CSV is empty or has no header row.") from error

    if frame.empty:
        raise PredictionInputError("The CSV has a header but no data rows.")
    missing = [feature for feature in FEATURES if feature not in normalized_columns]
    if missing:
        raise PredictionInputError(
            f"Missing required model input columns: {', '.join(missing)}. "
            "Use the feature names and units shown in the upload guide."
        )
    frame.columns = normalized_columns
    return frame, original_columns


def _validate_feature_row(
    row: dict[str, Any],
    models: dict[str, Any] | None = None,
    *,
    reject_unknown: bool = False,
) -> tuple[dict[str, float | str], list[str]]:
    issues: list[str] = []
    if reject_unknown:
        unknown = sorted(set(row) - set(FEATURES))
        if unknown:
            issues.append(f"Unsupported model input feature(s): {', '.join(unknown)}")

    values: dict[str, float | str] = {}
    for feature in NUMERIC_FEATURES:
        raw_value = row.get(feature)
        if raw_value is None or pd.isna(raw_value) or (isinstance(raw_value, str) and not raw_value.strip()):
            issues.append(f"{feature} is missing")
            continue
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            issues.append(f"{feature} must be numeric")
            continue
        if not math.isfinite(value):
            issues.append(f"{feature} must be a finite number")
            continue
        minimum, maximum, inclusive_minimum, inclusive_maximum, message = _PHYSICAL_BOUNDS[feature]
        if minimum is not None and (
            value < minimum or (not inclusive_minimum and value == minimum)
        ):
            issues.append(f"{feature} {message}")
            continue
        if maximum is not None and (
            value > maximum or (not inclusive_maximum and value == maximum)
        ):
            issues.append(f"{feature} {message}")
            continue
        values[feature] = value

    raw_category = row.get("reinforcement_type")
    if raw_category is None or pd.isna(raw_category) or not str(raw_category).strip():
        issues.append("reinforcement_type is missing")
    else:
        category = str(raw_category).strip()
        allowed_categories = set(_CATEGORY_VALUES)
        if models is not None:
            configured = models.get("feature_categories", {}).get("reinforcement_type")
            if configured:
                allowed_categories = set(configured)
        if category not in allowed_categories:
            issues.append(
                "reinforcement_type must be one of: "
                + ", ".join(sorted(allowed_categories))
            )
        else:
            values["reinforcement_type"] = category
    return values, issues


def load_trained_models() -> dict[str, Any]:
    if not MODEL_PATH.is_file() or not FEATURES_PATH.is_file():
        raise FileNotFoundError(
            "Trained model artifacts are missing. Run "
            "`python -m backend.ml.train --dataset data/slope_stability.csv` first."
        )
    saved_features = json.loads(FEATURES_PATH.read_text(encoding="utf-8"))
    if saved_features != FEATURES:
        raise RuntimeError("The saved model feature list does not match the current prediction API.")
    models = joblib.load(MODEL_PATH)
    required_models = {"regression", "classification", "feature_categories", "training_ranges"}
    if not isinstance(models, dict) or not required_models <= models.keys():
        raise RuntimeError("The trained-model artifact is incomplete.")
    return models


def _json_safe(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def _range_warnings(values: dict[str, float | str], models: dict[str, Any]) -> list[str]:
    warnings = []
    for feature, bounds in models.get("training_ranges", {}).items():
        value = values.get(feature)
        if isinstance(value, (int, float)) and (
            value < bounds["minimum"] or value > bounds["maximum"]
        ):
            warnings.append(
                f"{feature} is outside the training range "
                f"[{bounds['minimum']:.4g}, {bounds['maximum']:.4g}]"
            )
    return warnings


def predict_rows(
    frame: pd.DataFrame,
    original_columns: list[str],
    models: dict[str, Any],
) -> dict[str, Any]:
    valid_rows: list[dict[str, float | str]] = []
    valid_indices: list[int] = []
    issues_by_index: dict[int, list[str]] = {}
    records = frame.to_dict(orient="records")
    for index, row in enumerate(records):
        values, issues = _validate_feature_row(row, models)
        if issues:
            issues_by_index[index] = issues
        else:
            valid_rows.append(values)
            valid_indices.append(index)

    regression_predictions: dict[int, float] = {}
    classification_predictions: dict[int, str] = {}
    range_warnings: dict[int, list[str]] = {}
    if valid_rows:
        inputs = pd.DataFrame(valid_rows, columns=FEATURES)
        regression = np.asarray(models["regression"].predict(inputs), dtype=float).reshape(-1)
        classification = models["classification"].predict(inputs)
        for index, values, fos, risk_class in zip(
            valid_indices, valid_rows, regression, classification, strict=True
        ):
            if not math.isfinite(float(fos)):
                issues_by_index[index] = ["The regression model returned a non-finite prediction"]
                continue
            regression_predictions[index] = float(fos)
            classification_predictions[index] = str(risk_class)
            range_warnings[index] = _range_warnings(values, models)

    rows = []
    for index, record in enumerate(records):
        output = {
            column: _json_safe(record.get(normalize_column_name(column)))
            for column in original_columns
        }
        if index in issues_by_index:
            output.update({
                "predicted_factor_of_safety": None,
                "predicted_risk_class": None,
                "predicted_warning_level": None,
                "prediction_status": "error: " + "; ".join(issues_by_index[index]),
            })
        else:
            fos = regression_predictions[index]
            output.update({
                "predicted_factor_of_safety": round(fos, 6),
                "predicted_risk_class": classification_predictions[index],
                "predicted_warning_level": warning_level_for_fos(fos),
                "prediction_status": "predicted",
                "training_range_warnings": "; ".join(range_warnings[index]),
            })
        rows.append(output)

    columns = original_columns + [
        column for column in OUTPUT_COLUMNS + ["training_range_warnings"]
        if column not in original_columns
    ]
    valid_count = len(regression_predictions)
    return {
        "records": len(rows),
        "columns": columns,
        "predicted_rows": valid_count,
        "failed_rows": len(rows) - valid_count,
        "rows": rows,
        "classification_rule": "UNSTABLE when FoS < 1.0; STABLE when FoS >= 1.0",
        "notice": "Research prototype using a user-supplied dataset with unverified provenance; not validated for field safety decisions.",
    }


def predict_manual(features: dict[str, Any], models: dict[str, Any]) -> dict[str, Any]:
    normalized_features = {
        normalize_column_name(key): value for key, value in features.items()
    }
    values, issues = _validate_feature_row(normalized_features, models, reject_unknown=True)
    if issues:
        raise PredictionInputError("; ".join(issues))
    inputs = pd.DataFrame([values], columns=FEATURES)
    fos = float(np.asarray(models["regression"].predict(inputs), dtype=float).reshape(-1)[0])
    risk_class = str(models["classification"].predict(inputs)[0])
    if not math.isfinite(fos):
        raise PredictionInputError("The regression model returned a non-finite prediction.")
    return {
        "predicted_factor_of_safety": round(fos, 6),
        "predicted_risk_class": risk_class,
        "predicted_warning_level": warning_level_for_fos(fos),
        "warning_thresholds": WARNING_THRESHOLDS,
        "training_range_warnings": _range_warnings(values, models),
        "model_version": models.get("model_version", "unknown"),
        "notice": "Research prototype using a user-supplied dataset with unverified provenance; not validated for field safety decisions.",
    }
