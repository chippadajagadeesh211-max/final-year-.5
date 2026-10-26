import tempfile
import unittest
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from backend.ml.prediction import FEATURES
from backend.ml.train import _clean_input, train_models


def training_fixture(rows=80):
    values = {
        "Unit Weight (kN/m³)": np.linspace(16, 24, rows),
        "Cohesion (kPa)": np.linspace(5, 45, rows),
        "Internal Friction Angle (°)": np.linspace(21, 44, rows),
        "Slope Angle (°)": np.linspace(12, 58, rows),
        "Slope Height (m)": np.linspace(5, 48, rows),
        "Pore Water Pressure Ratio": np.linspace(0.05, 0.95, rows),
        "Reinforcement Type": [
            ["Drainage", "Geosynthetics", "Retaining Wall", "Soil Nailing"][index % 4]
            for index in range(rows)
        ],
        "Reinforcement Numeric": [index % 4 for index in range(rows)],
        "Factor of Safety (FS)": [
            0.75 + index / 100 if index % 4 == 0 else 1.15 + index / 100
            for index in range(rows)
        ],
    }
    return pd.DataFrame(values)


class MLTrainingTests(unittest.TestCase):
    def test_dataset_mapping_target_labels_and_data_quality(self):
        source = training_fixture(20)
        source.loc[0, "Pore Water Pressure Ratio"] = 1.2
        source.loc[1, "Factor of Safety (FS)"] = 0
        source.loc[2, "Cohesion (kPa)"] = np.nan
        clean, quality = _clean_input(source, Path("fixture.csv"))

        self.assertEqual(list(clean.columns[: len(FEATURES)]), FEATURES)
        self.assertEqual(len(clean), 18)
        self.assertEqual(quality["removed_rows_by_reason"]["invalid_or_missing_required_feature"], 1)
        self.assertEqual(quality["removed_rows_by_reason"]["missing_or_nonpositive_factor_of_safety"], 1)
        self.assertEqual(quality["missing_values_before_validation"]["soil_cohesion_kPa"], 1)
        self.assertEqual(set(clean["risk_class"]), {"STABLE", "UNSTABLE"})

    def test_training_saves_pipelines_report_and_held_out_predictions(self):
        with tempfile.TemporaryDirectory() as temporary:
            dataset = Path(temporary) / "input.csv"
            artifacts = Path(temporary) / "artifacts"
            training_fixture().to_csv(dataset, index=False)

            report = train_models(dataset, artifacts)
            saved_models = joblib.load(artifacts / "trained_models.joblib")
            predictions = pd.read_csv(artifacts / "test_predictions.csv")
            evaluation_report = artifacts / "evaluation_report.json"
            self.assertEqual(report["dataset"]["target_column"], "Factor of Safety (FS), mapped to factor_of_safety")
            self.assertEqual(report["target_definition"]["classification"], "UNSTABLE when factor_of_safety < 1.0; STABLE otherwise")
            self.assertEqual(report["split"]["counts"]["test"], 16)
            self.assertEqual(len(predictions), 16)
            self.assertIn("mae", report["test_metrics"]["regression"])
            self.assertIn("balanced_accuracy", report["test_metrics"]["classification"])
            self.assertEqual(saved_models["feature_categories"]["reinforcement_type"], ["Drainage", "Geosynthetics", "Retaining Wall", "Soil Nailing"])
            self.assertTrue(evaluation_report.is_file())


if __name__ == "__main__":
    unittest.main()
