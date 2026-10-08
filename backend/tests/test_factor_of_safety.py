import unittest

from backend.engineering.factor_of_safety import StabilityInput, calculate_factor_of_safety, classify_fos


class FactorOfSafetyTests(unittest.TestCase):
    def test_project_classification_thresholds(self):
        self.assertEqual(classify_fos(1.50), "SAFE")
        self.assertEqual(classify_fos(1.49), "CAUTION")
        self.assertEqual(classify_fos(1.19), "WARNING")
        self.assertEqual(classify_fos(0.99), "CRITICAL")

    def test_calculation_returns_intermediates_and_assumptions(self):
        result = calculate_factor_of_safety(StabilityInput(18, 34, 24, 31, 18.5, 52, 7.4, 10, 0.05))
        self.assertGreater(result["fos"], 0)
        self.assertIn("effective_normal_stress_kpa", result["intermediate"])
        self.assertTrue(result["assumptions"])

    def test_invalid_slope_angle_is_rejected(self):
        parameters = StabilityInput(18, 90, 24, 31, 18.5, 52, 7.4, 10, 0.05)
        with self.assertRaises(ValueError):
            calculate_factor_of_safety(parameters)


if __name__ == "__main__":
    unittest.main()