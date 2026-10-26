from dataclasses import dataclass

import numpy as np
import pandas as pd


FEATURES = [
    "rainfall_mm",
    "soil_moisture",
    "pore_pressure_kpa",
    "slope_movement_mm_day",
    "gnss_displacement_mm",
    "inclinometer_deg",
    "groundwater_head_m",
]
DEFAULT_SEQUENCE_LENGTH = 7


@dataclass
class PredictionResult:
    mode: str
    predicted_fos: float | None
    message: str
    mae: float | None = None
    rmse: float | None = None
    training_loss: float | None = None
    validation_loss: float | None = None


def make_sequences(frame: pd.DataFrame, sequence_length: int = DEFAULT_SEQUENCE_LENGTH):
    required = FEATURES + ["fos"]
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError(f"Required prediction column is missing: {missing[0]}")
    clean = frame[required].apply(pd.to_numeric, errors="coerce").dropna().reset_index(drop=True)
    feature_values = clean[FEATURES].to_numpy(dtype=np.float32)
    target_values = clean["fos"].to_numpy(dtype=np.float32)
    sequences, targets = [], []
    for end in range(sequence_length, len(clean)):
        sequences.append(feature_values[end - sequence_length:end])
        targets.append(target_values[end])
    return np.asarray(sequences, dtype=np.float32), np.asarray(targets, dtype=np.float32)


def predict_stability(frame: pd.DataFrame, sequence_length: int = DEFAULT_SEQUENCE_LENGTH) -> PredictionResult:
    del frame, sequence_length
    raise RuntimeError(
        "The experimental LSTM is inactive. Use the saved tabular models; do not train a model during prediction."
    )