from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_fscore_support,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from .prediction import (
    ARTIFACT_DIR,
    CATEGORICAL_FEATURES,
    CLASSIFICATION_TARGET,
    COLUMN_ALIASES,
    FEATURES,
    NUMERIC_FEATURES,
    REGRESSION_TARGET,
)


RANDOM_STATE = 42
TEST_SIZE = 0.20
VALIDATION_SIZE = 0.20
TARGET_SOURCE = "factor_of_safety"
RISK_THRESHOLD = 1.0
TRAINING_NOTICE = (
    "Dataset supplied by the user. The archive contains no source or licence metadata. "
    "Its values appear generated; no independent field validation is available."
)
FEATURE_SCHEMA = {
    "unit_weight_kN_m3": {"label": "Soil unit weight", "unit": "kN/m³", "type": "number"},
    "soil_cohesion_kPa": {"label": "Soil cohesion", "unit": "kPa", "type": "number"},
    "friction_angle_deg": {"label": "Internal friction angle", "unit": "degrees", "type": "number"},
    "slope_angle_deg": {"label": "Slope angle", "unit": "degrees", "type": "number"},
    "slope_height_m": {"label": "Slope height", "unit": "m", "type": "number"},
    "pore_water_pressure_ratio": {
        "label": "Pore-water pressure ratio",
        "unit": "dimensionless ratio",
        "type": "number",
    },
    "reinforcement_type": {
        "label": "Reinforcement type",
        "unit": "category",
        "type": "category",
    },
}
PHYSICAL_BOUNDS = {
    "unit_weight_kN_m3": (0.0, 50.0, False, True),
    "soil_cohesion_kPa": (0.0, None, True, True),
    "friction_angle_deg": (0.0, 90.0, False, False),
    "slope_angle_deg": (0.0, 90.0, False, False),
    "slope_height_m": (0.0, None, False, True),
    "pore_water_pressure_ratio": (0.0, 1.0, True, True),
}


def _json_value(value: Any) -> Any:
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def _normalise_column(name: Any) -> str:
    key = str(name).strip().casefold()
    return COLUMN_ALIASES.get(key, key)


def _clean_input(frame: pd.DataFrame, dataset_path: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    original_columns = [str(column) for column in frame.columns]
    normalized_columns = [_normalise_column(column) for column in original_columns]
    if len(set(normalized_columns)) != len(normalized_columns):
        raise ValueError("Dataset contains duplicate column names after feature-name mapping.")

    frame = frame.copy()
    frame.columns = normalized_columns
    required = FEATURES + [TARGET_SOURCE]
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(
            "Dataset is missing required mapped columns: "
            f"{', '.join(missing)}. Available columns: {', '.join(original_columns)}."
        )

    selected = frame[required].copy()
    source_rows = len(selected)
    duplicate_rows = int(selected.duplicated().sum())
    missing_before_conversion = {
        column: int(selected[column].isna().sum()) for column in required
    }
    invalid_numeric_values: dict[str, int] = {}
    for column in NUMERIC_FEATURES + [TARGET_SOURCE]:
        original = selected[column]
        numeric = pd.to_numeric(original, errors="coerce")
        invalid_numeric_values[column] = int((original.notna() & numeric.isna()).sum())
        selected[column] = numeric.replace([np.inf, -np.inf], np.nan)

    selected["reinforcement_type"] = selected["reinforcement_type"].map(
        lambda value: value.strip() if isinstance(value, str) else value
    )
    selected["reinforcement_type"] = selected["reinforcement_type"].replace("", np.nan)
    missing_before_conversion["reinforcement_type"] = int(
        selected["reinforcement_type"].isna().sum()
    )

    target_values = selected[TARGET_SOURCE]
    invalid_target_rows = target_values.isna() | (target_values <= 0)
    bounds_violations: dict[str, int] = {}
    invalid_feature_rows = pd.Series(False, index=selected.index)
    for feature, (minimum, maximum, inclusive_minimum, inclusive_maximum) in PHYSICAL_BOUNDS.items():
        values = selected[feature]
        invalid = pd.Series(False, index=selected.index)
        if minimum is not None:
            invalid |= values.notna() & (
                values < minimum if inclusive_minimum else values <= minimum
            )
        if maximum is not None:
            invalid |= values.notna() & (
                values > maximum if inclusive_maximum else values >= maximum
            )
        bounds_violations[feature] = int(invalid.sum())
        invalid_feature_rows |= invalid
    invalid_categories = selected["reinforcement_type"].notna() & ~selected[
        "reinforcement_type"
    ].isin(["Drainage", "Geosynthetics", "Retaining Wall", "Soil Nailing"])
    bounds_violations["reinforcement_type"] = int(invalid_categories.sum())
    invalid_feature_rows |= invalid_categories

    removal_reasons = {
        "missing_or_nonpositive_factor_of_safety": int(invalid_target_rows.sum()),
        "invalid_or_missing_required_feature": int(
            (invalid_feature_rows & ~invalid_target_rows).sum()
        ),
    }
    valid_rows = ~(invalid_target_rows | invalid_feature_rows)
    clean = selected.loc[valid_rows, FEATURES + [TARGET_SOURCE]].copy().reset_index(drop=True)
    if clean.empty:
        raise ValueError("No rows remain after excluding invalid targets and out-of-range features.")

    clean[CLASSIFICATION_TARGET] = np.where(
        clean[TARGET_SOURCE] < RISK_THRESHOLD,
        "UNSTABLE",
        "STABLE",
    )
    if clean[CLASSIFICATION_TARGET].nunique() < 2:
        raise ValueError("The FoS target must produce both classes around the FoS < 1.0 rule.")

    quality = {
        "source_rows": int(source_rows),
        "duplicate_rows_reported_not_removed": duplicate_rows,
        "missing_values_before_validation": missing_before_conversion,
        "invalid_numeric_values": invalid_numeric_values,
        "invalid_values_by_feature": bounds_violations,
        "removed_rows_by_reason": removal_reasons,
        "rows_used": int(len(clean)),
        "class_balance": {
            str(label): int(count)
            for label, count in clean[CLASSIFICATION_TARGET].value_counts().sort_index().items()
        },
    }
    clean.attrs["dataset_name"] = dataset_path.name
    return clean, quality


def _preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("numeric", SimpleImputer(strategy="median"), NUMERIC_FEATURES),
            (
                "categorical",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                CATEGORICAL_FEATURES,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )


def _pipeline(estimator: Any) -> Pipeline:
    return Pipeline([("preprocessor", _preprocessor()), ("model", estimator)])


def _regression_metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
        "r2": float(r2_score(actual, predicted)),
    }


def _classification_metrics(
    actual: pd.Series,
    predicted: np.ndarray,
    probabilities: np.ndarray,
    labels: list[str],
) -> dict[str, Any]:
    precision, recall, f1, _ = precision_recall_fscore_support(
        actual, predicted, labels=labels, average="macro", zero_division=0
    )
    class_labels = sorted(set(labels))
    unstable_index = class_labels.index("UNSTABLE")
    return {
        "accuracy": float(accuracy_score(actual, predicted)),
        "balanced_accuracy": float(balanced_accuracy_score(actual, predicted)),
        "precision_macro": float(precision),
        "recall_macro": float(recall),
        "f1_macro": float(f1),
        "roc_auc_unstable": float(
            roc_auc_score(actual.eq("UNSTABLE"), probabilities[:, unstable_index])
        ),
        "class_wise": classification_report(
            actual,
            predicted,
            labels=labels,
            output_dict=True,
            zero_division=0,
        ),
        "confusion_matrix": confusion_matrix(actual, predicted, labels=labels).tolist(),
        "confusion_matrix_labels": labels,
    }


def _feature_importance(pipeline: Pipeline) -> list[dict[str, Any]]:
    model = pipeline.named_steps["model"]
    if hasattr(model, "feature_importances_"):
        values = model.feature_importances_
    elif hasattr(model, "coef_"):
        coefficients = np.abs(np.asarray(model.coef_))
        values = coefficients if coefficients.ndim == 1 else coefficients.mean(axis=0)
    else:
        return []
    names = pipeline.named_steps["preprocessor"].get_feature_names_out()
    ranked = sorted(zip(names, values, strict=True), key=lambda item: -float(item[1]))
    return [{"feature": str(name), "importance": float(value)} for name, value in ranked]


def _regression_error_bands(
    actual: pd.Series,
    predicted: np.ndarray,
) -> dict[str, dict[str, float | int]]:
    edges = [0.0, 1.0, 1.5, 2.0, 3.0000001, float("inf")]
    names = ["<1.0", "1.0–<1.5", "1.5–<2.0", "2.0–3.0", ">3.0"]
    band_index = pd.cut(actual, bins=edges, labels=names, right=False)
    result: dict[str, dict[str, float | int]] = {}
    for name in names:
        selected = band_index == name
        count = int(selected.sum())
        if count:
            values = actual[selected]
            estimate = predicted[selected.to_numpy()]
            result[name] = {
                "count": count,
                "mae": float(mean_absolute_error(values, estimate)),
                "rmse": float(np.sqrt(mean_squared_error(values, estimate))),
            }
        else:
            result[name] = {"count": 0, "mae": None, "rmse": None}
    return result


def train_models(
    dataset_path: Path,
    artifact_dir: Path = ARTIFACT_DIR,
    dataset_source: str = "User-provided CSV; upstream provenance and licence not supplied",
) -> dict[str, Any]:
    dataset_path = dataset_path.expanduser().resolve()
    if not dataset_path.is_file():
        raise FileNotFoundError(f"Dataset file does not exist: {dataset_path}")
    try:
        source = pd.read_csv(dataset_path)
    except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError) as error:
        raise ValueError(f"Could not read dataset CSV: {error}") from error
    if source.empty:
        raise ValueError("Dataset has headers but no data rows.")
    clean, data_quality = _clean_input(source, dataset_path)
    labels = clean[CLASSIFICATION_TARGET]
    if int(labels.value_counts().min()) < 3:
        raise ValueError("Each risk class must have at least three rows for stratified train/validation/test splits.")

    train_validation, test = train_test_split(
        clean,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    train, validation = train_test_split(
        train_validation,
        test_size=VALIDATION_SIZE,
        random_state=RANDOM_STATE,
        stratify=train_validation[CLASSIFICATION_TARGET],
    )
    x_train = train[FEATURES]
    x_validation = validation[FEATURES]
    x_test = test[FEATURES]
    y_train_reg = train[TARGET_SOURCE]
    y_validation_reg = validation[TARGET_SOURCE]
    y_test_reg = test[TARGET_SOURCE]
    y_train_cls = train[CLASSIFICATION_TARGET]
    y_validation_cls = validation[CLASSIFICATION_TARGET]
    y_test_cls = test[CLASSIFICATION_TARGET]

    regression_candidates: dict[str, Any] = {
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=250,
            min_samples_leaf=2,
            n_jobs=-1,
            random_state=RANDOM_STATE,
        ),
        "LinearRegression": LinearRegression(),
    }
    regression_validation: dict[str, Any] = {}
    for name, estimator in regression_candidates.items():
        candidate = _pipeline(estimator)
        candidate.fit(x_train, y_train_reg)
        regression_validation[name] = _regression_metrics(
            y_validation_reg, candidate.predict(x_validation)
        )
    selected_regression_name = min(
        regression_validation,
        key=lambda name: (
            regression_validation[name]["mae"],
            regression_validation[name]["rmse"],
        ),
    )

    classification_candidates: dict[str, Any] = {
        "RandomForestClassifier": RandomForestClassifier(
            n_estimators=250,
            min_samples_leaf=2,
            class_weight="balanced",
            n_jobs=-1,
            random_state=RANDOM_STATE,
        ),
        "LogisticRegression": LogisticRegression(
            class_weight="balanced",
            max_iter=1000,
            random_state=RANDOM_STATE,
        ),
    }
    labels_order = ["UNSTABLE", "STABLE"]
    classification_validation: dict[str, Any] = {}
    for name, estimator in classification_candidates.items():
        candidate = _pipeline(estimator)
        candidate.fit(x_train, y_train_cls)
        classification_validation[name] = _classification_metrics(
            y_validation_cls,
            candidate.predict(x_validation),
            candidate.predict_proba(x_validation),
            labels_order,
        )
    selected_classification_name = max(
        classification_validation,
        key=lambda name: (
            classification_validation[name]["f1_macro"],
            classification_validation[name]["balanced_accuracy"],
        ),
    )

    final_train = pd.concat([train, validation], ignore_index=True)
    selected_regression = _pipeline(regression_candidates[selected_regression_name])
    selected_regression.fit(final_train[FEATURES], final_train[TARGET_SOURCE])
    selected_classification = _pipeline(classification_candidates[selected_classification_name])
    selected_classification.fit(final_train[FEATURES], final_train[CLASSIFICATION_TARGET])

    reg_predictions = np.asarray(selected_regression.predict(x_test), dtype=float)
    cls_predictions = selected_classification.predict(x_test)
    cls_probabilities = selected_classification.predict_proba(x_test)
    regression_test_metrics = _regression_metrics(y_test_reg, reg_predictions)
    classification_test_metrics = _classification_metrics(
        y_test_cls,
        cls_predictions,
        cls_probabilities,
        labels_order,
    )
    plot_count = min(500, len(y_test_reg))
    test_plot_points = [
        {
            "actual": float(actual),
            "predicted": float(predicted),
            "residual": float(actual - predicted),
        }
        for actual, predicted in zip(
            y_test_reg.to_numpy()[:plot_count],
            reg_predictions[:plot_count],
            strict=True,
        )
    ]

    timestamp = datetime.now(timezone.utc).isoformat()
    training_ranges = {
        feature: {
            "minimum": float(clean[feature].min()),
            "maximum": float(clean[feature].max()),
        }
        for feature in NUMERIC_FEATURES
    }
    categories = {
        feature: sorted(str(value) for value in clean[feature].dropna().unique())
        for feature in CATEGORICAL_FEATURES
    }
    report = {
        "dataset": {
            "filename": dataset_path.name,
            "rows_in_source": int(len(source)),
            "source": dataset_source,
            "source_url": None,
            "licence": "Not supplied with the dataset archive; verify before redistribution.",
            "target_column": "Factor of Safety (FS), mapped to factor_of_safety",
            "target_definition": "Observed numeric FoS value in the supplied CSV.",
        },
        "dataset_rows": int(len(source)),
        "rows_used": int(len(clean)),
        "data_quality": data_quality,
        "feature_names": FEATURES,
        "feature_schema": FEATURE_SCHEMA,
        "feature_units": {name: value["unit"] for name, value in FEATURE_SCHEMA.items()},
        "categorical_values": categories,
        "training_ranges": training_ranges,
        "target_definition": {
            "regression": "factor_of_safety = source column Factor of Safety (FS)",
            "classification": f"UNSTABLE when factor_of_safety < {RISK_THRESHOLD}; STABLE otherwise",
            "classification_notice": "Research convention only; not a universal design acceptance rule.",
        },
        "random_state": RANDOM_STATE,
        "trained_at_utc": timestamp,
        "model_version": f"dataset-v1-{timestamp}",
        "split": {
            "training_validation_test": "64% / 16% / 20%",
            "counts": {
                "training": int(len(train)),
                "validation": int(len(validation)),
                "test": int(len(test)),
            },
            "stratification": "FoS-derived binary class, for all splits",
            "selection": "Validation set: regression lowest MAE; classification highest macro F1, then balanced accuracy.",
            "test_set": "Held out from candidate selection; used once for final selected-model metrics.",
        },
        "excluded_columns": [
            "Reinforcement Numeric (duplicate encoding of Reinforcement Type)",
            "all other unselected source columns",
        ],
        "training_data_notice": TRAINING_NOTICE,
        "validation_comparison": {
            "regression": regression_validation,
            "classification": classification_validation,
        },
        "selected_models": {
            "regression": selected_regression_name,
            "classification": selected_classification_name,
        },
        "test_metrics": {
            "regression": regression_test_metrics,
            "regression_error_by_fos_range": _regression_error_bands(
                y_test_reg.reset_index(drop=True), reg_predictions
            ),
            "classification": classification_test_metrics,
        },
        "test_plot_points": test_plot_points,
        "test_plot_notice": (
            f"First {plot_count} rows of the untouched test split for chart display; "
            "the complete held-out predictions are in test_predictions.csv."
        ),
        "feature_importance": {
            "regression": _feature_importance(selected_regression),
            "classification": _feature_importance(selected_classification),
            "notice": "Importance shows model associations and does not establish causation.",
        },
    }
    artifact_dir.mkdir(parents=True, exist_ok=True)
    saved_models = {
        "regression": selected_regression,
        "classification": selected_classification,
        "selected_models": report["selected_models"],
        "feature_categories": categories,
        "training_ranges": training_ranges,
        "model_version": report["model_version"],
    }
    joblib.dump(saved_models, artifact_dir / "trained_models.joblib", compress=3)
    (artifact_dir / "feature_names.json").write_text(
        json.dumps(FEATURES, indent=2) + "\n",
        encoding="utf-8",
    )
    (artifact_dir / "evaluation_report.json").write_text(
        json.dumps(report, indent=2, default=_json_value, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    test_predictions = pd.DataFrame(
        {
            "actual_factor_of_safety": y_test_reg.to_numpy(),
            "predicted_factor_of_safety": reg_predictions,
            "regression_residual": y_test_reg.to_numpy() - reg_predictions,
            "actual_risk_class": y_test_cls.to_numpy(),
            "predicted_risk_class": cls_predictions,
        }
    )
    test_predictions.to_csv(artifact_dir / "test_predictions.csv", index=False)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train FoS regression and binary stability classification models."
    )
    parser.add_argument("--dataset", required=True, type=Path, help="Path to the supplied dataset CSV")
    parser.add_argument("--artifacts", type=Path, default=ARTIFACT_DIR, help=f"Output directory (default: {ARTIFACT_DIR})")
    parser.add_argument(
        "--dataset-source",
        default="User-provided CSV; upstream provenance and licence not supplied",
        help="Dataset provenance to record in the training report.",
    )
    arguments = parser.parse_args()
    report = train_models(arguments.dataset, arguments.artifacts, arguments.dataset_source)
    print(json.dumps(report, indent=2, default=_json_value, allow_nan=False))


if __name__ == "__main__":
    main()
