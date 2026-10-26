import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main
from backend.ml.prediction import (
    FEATURES,
    OUTPUT_COLUMNS,
    PredictionInputError,
    parse_prediction_csv,
    predict_manual,
    predict_rows,
    warning_level_for_fos,
)


class FixedRegressor:
    def predict(self, frame):
        return [1.35] * len(frame)


class FixedClassifier:
    def predict(self, frame):
        return ["STABLE"] * len(frame)


class MLPredictionTests(unittest.TestCase):
    def setUp(self):
        self.models = {
            "regression": FixedRegressor(),
            "classification": FixedClassifier(),
            "feature_categories": {"reinforcement_type": ["Drainage", "Geosynthetics", "Retaining Wall", "Soil Nailing"]},
            "training_ranges": {"slope_angle_deg": {"minimum": 10.0, "maximum": 60.0}},
            "model_version": "test-v1",
        }
        self.valid_values = {
            "unit_weight_kN_m3": "18",
            "soil_cohesion_kPa": "25",
            "friction_angle_deg": "30",
            "slope_angle_deg": "30",
            "slope_height_m": "20",
            "pore_water_pressure_ratio": "0.4",
            "reinforcement_type": "Drainage",
        }

    def csv_for(self, rows, extras=()):
        columns = list(FEATURES) + list(extras)
        lines = [",".join(columns)]
        lines.extend(
            ",".join(str(row.get(column, "")) for column in columns)
            for row in rows
        )
        return ("\n".join(lines) + "\n").encode("utf-8")

    def test_feature_list_matches_dataset_supported_inputs(self):
        self.assertEqual(len(FEATURES), 7)
        self.assertIn("pore_water_pressure_ratio", FEATURES)
        self.assertIn("reinforcement_type", FEATURES)
        self.assertNotIn("rainfall_24h_mm", FEATURES)
        self.assertNotIn("factor_of_safety", FEATURES)

    def test_source_dataset_headers_map_and_extra_columns_are_preserved(self):
        contents = (
            "Unit Weight (kN/m³),Cohesion (kPa),Internal Friction Angle (°),"
            "Slope Angle (°),Slope Height (m),Pore Water Pressure Ratio,"
            "Reinforcement Type,Reinforcement Numeric,Factor of Safety (FS)\n"
            "18,25,30,35,12,0.4,Drainage,3,1.7\n"
        ).encode()
        frame, columns = parse_prediction_csv(contents)
        self.assertTrue(set(FEATURES).issubset(frame.columns))
        self.assertEqual(frame.loc[0, "reinforcement_type"], "Drainage")
        self.assertIn("Factor of Safety (FS)", columns)

    def test_csv_prediction_preserves_columns_and_reports_each_invalid_row(self):
        valid = {**self.valid_values, "note": "north"}
        invalid = {**valid, "pore_water_pressure_ratio": ""}
        frame, columns = parse_prediction_csv(self.csv_for([valid, invalid], ("note",)))
        result = predict_rows(frame, columns, self.models)

        self.assertEqual(result["records"], 2)
        self.assertEqual(result["predicted_rows"], 1)
        self.assertEqual(result["failed_rows"], 1)
        self.assertEqual(result["rows"][0]["note"], "north")
        self.assertEqual(result["rows"][0]["predicted_factor_of_safety"], 1.35)
        self.assertEqual(result["rows"][0]["predicted_risk_class"], "STABLE")
        self.assertEqual(result["rows"][0]["predicted_warning_level"], "STABLE")
        self.assertIn("pore_water_pressure_ratio is missing", result["rows"][1]["prediction_status"])
        self.assertIsNone(result["rows"][1]["predicted_risk_class"])
        self.assertEqual(result["columns"][-5:-1], OUTPUT_COLUMNS)

    def test_csv_feature_names_are_case_insensitive_and_use_canonical_order(self):
        header = [feature.upper() for feature in FEATURES]
        values = [self.valid_values[feature] for feature in FEATURES]
        contents = (",".join(header) + "\n" + ",".join(values) + "\n").encode()
        frame, columns = parse_prediction_csv(contents)
        result = predict_rows(frame, columns, self.models)

        self.assertEqual(list(frame.columns), list(FEATURES))
        self.assertEqual(result["predicted_rows"], 1)

    def test_missing_required_columns_are_explained(self):
        columns = FEATURES[1:]
        with self.assertRaisesRegex(PredictionInputError, "unit_weight_kN_m3"):
            parse_prediction_csv((",".join(columns) + "\n" + ",".join(["1"] * len(columns))).encode())

    def test_empty_csv_and_header_only_csv_are_rejected(self):
        for contents in (b"", (",".join(FEATURES) + "\n").encode()):
            with self.subTest(contents=contents), self.assertRaises(PredictionInputError):
                parse_prediction_csv(contents)

    def test_invalid_numeric_physical_and_category_values_are_not_predicted(self):
        for feature, value, message in [
            ("slope_angle_deg", "90", "less than 90 degrees"),
            ("pore_water_pressure_ratio", "1.1", "between 0 and 1"),
            ("unit_weight_kN_m3", "invalid", "must be numeric"),
            ("reinforcement_type", "Unknown", "must be one of"),
        ]:
            invalid = {**self.valid_values, feature: value}
            frame, columns = parse_prediction_csv(self.csv_for([invalid]))
            result = predict_rows(frame, columns, self.models)
            self.assertEqual(result["predicted_rows"], 0)
            self.assertIn(message, result["rows"][0]["prediction_status"])

    def test_manual_prediction_uses_both_models_and_reports_range_warning(self):
        result = predict_manual({**self.valid_values, "slope_angle_deg": "65"}, self.models)
        self.assertEqual(result["predicted_factor_of_safety"], 1.35)
        self.assertEqual(result["predicted_risk_class"], "STABLE")
        self.assertEqual(result["predicted_warning_level"], "STABLE")
        self.assertEqual(result["warning_thresholds"]["unstable"], 1.0)
        self.assertEqual(result["model_version"], "test-v1")
        self.assertTrue(result["training_range_warnings"])

    def test_manual_prediction_rejects_missing_and_unsupported_inputs(self):
        with self.assertRaisesRegex(PredictionInputError, "pore_water_pressure_ratio is missing"):
            predict_manual({**self.valid_values, "pore_water_pressure_ratio": ""}, self.models)
        with self.assertRaisesRegex(PredictionInputError, "Unsupported model input"):
            predict_manual({**self.valid_values, "rainfall_24h_mm": 4}, self.models)

    def test_binary_foS_warning_threshold(self):
        self.assertEqual(warning_level_for_fos(1.0), "STABLE")
        self.assertEqual(warning_level_for_fos(0.99), "UNSTABLE")


class MLPredictionApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.models = {
            "regression": FixedRegressor(),
            "classification": FixedClassifier(),
            "feature_categories": {"reinforcement_type": ["Drainage"]},
            "training_ranges": {},
            "model_version": "test-v1",
        }
        self.values = {
            "unit_weight_kN_m3": 18,
            "soil_cohesion_kPa": 25,
            "friction_angle_deg": 30,
            "slope_angle_deg": 30,
            "slope_height_m": 20,
            "pore_water_pressure_ratio": 0.4,
            "reinforcement_type": "Drainage",
        }

    def csv_content(self, rows):
        lines = [",".join(FEATURES)]
        lines.extend(",".join(str(row.get(column, "")) for column in FEATURES) for row in rows)
        return ("\n".join(lines) + "\n").encode("utf-8")

    def test_csv_endpoint_predicts_valid_rows_and_returns_row_errors(self):
        invalid = {**self.values, "pore_water_pressure_ratio": ""}
        contents = self.csv_content([self.values, invalid])
        with patch("backend.main.load_trained_models", return_value=self.models):
            response = self.client.post(
                "/api/ml/predict/csv",
                files={"file": ("batch.csv", contents, "text/csv")},
            )

        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["records"], 2)
        self.assertEqual(result["predicted_rows"], 1)
        self.assertEqual(result["failed_rows"], 1)
        self.assertIn("pore_water_pressure_ratio is missing", result["rows"][1]["prediction_status"])
        history = self.client.get("/api/ml/history")
        self.assertTrue(any(
            entry["scenario"] == "CSV row 1" and entry["model_version"] == "test-v1"
            for entry in history.json()
        ))

    def test_csv_endpoint_validates_missing_columns_and_empty_csv(self):
        missing_columns = self.client.post(
            "/api/ml/predict/csv",
            files={"file": ("missing.csv", b"slope_angle_deg\n30\n", "text/csv")},
        )
        empty = self.client.post(
            "/api/ml/predict/csv",
            files={"file": ("empty.csv", b"", "text/csv")},
        )
        self.assertEqual(missing_columns.status_code, 422)
        self.assertIn("Missing required model input columns", missing_columns.json()["detail"])
        self.assertEqual(empty.status_code, 422)
        self.assertIn("empty", empty.json()["detail"])

    def test_csv_endpoint_reports_unavailable_models(self):
        with patch("backend.main.load_trained_models", side_effect=FileNotFoundError("train models first")):
            response = self.client.post(
                "/api/ml/predict/csv",
                files={"file": ("batch.csv", self.csv_content([self.values]), "text/csv")},
            )
        self.assertEqual(response.status_code, 503)
        self.assertIn("train models first", response.json()["detail"])

    def test_manual_endpoint_uses_both_models(self):
        with patch("backend.main.load_trained_models", return_value=self.models):
            response = self.client.post("/api/ml/predict/manual", json={"features": self.values})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["predicted_factor_of_safety"], 1.35)
        self.assertEqual(response.json()["predicted_risk_class"], "STABLE")
        self.assertIn("prediction_timestamp", response.json())
        history = self.client.get("/api/ml/history")
        self.assertEqual(history.status_code, 200)
        self.assertTrue(any(entry["model_version"] == "test-v1" for entry in history.json()))

    def test_legacy_demo_prediction_endpoints_do_not_return_estimates(self):
        disabled_prediction = self.client.get("/api/predictions")
        disabled_training = self.client.post(
            "/api/predictions/train",
            files={"file": ("monitoring.csv", b"timestamp,fos\n", "text/csv")},
        )
        self.assertEqual(disabled_prediction.status_code, 503)
        self.assertEqual(disabled_training.status_code, 410)
        self.assertIn("disabled", disabled_prediction.json()["detail"])
        self.assertIn("disabled", disabled_training.json()["detail"])


if __name__ == "__main__":
    unittest.main()
