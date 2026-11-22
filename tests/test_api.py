"""Smoke tests for the local research prediction API.

These tests verify endpoint contracts and input handling. They do not measure
clinical performance or validate the models on new data.
"""

import io
import unittest

import numpy as np
from PIL import Image

from src.app import app


class PredictionApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_health_reports_both_loaded_models(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ready", "models": ["skin", "amr"]})

    def test_skin_requires_an_image(self):
        response = self.client.post("/api/predict/skin", data={})

        self.assertEqual(response.status_code, 400)
        self.assertIn("No image uploaded", response.get_json()["error"])

    def test_skin_rejects_invalid_image_bytes(self):
        response = self.client.post(
            "/api/predict/skin",
            data={"image": (io.BytesIO(b"not an image"), "sample.png")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid or unsupported image", response.get_json()["error"])

    def test_skin_returns_seven_finite_class_scores(self):
        pixels = np.full((28, 28, 3), 128, dtype=np.uint8)
        buffer = io.BytesIO()
        Image.fromarray(pixels).save(buffer, format="PNG")
        buffer.seek(0)

        response = self.client.post(
            "/api/predict/skin",
            data={"image": (buffer, "sample.png")},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertIn(result["predicted_class"], {"akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"})
        self.assertEqual(len(result["class_scores"]), 7)
        self.assertTrue(all(np.isfinite(score) for score in result["class_scores"].values()))

    def test_amr_requires_all_model_fields(self):
        response = self.client.post("/api/predict/amr", json={"Sex": "F"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("missing_features", response.get_json())

    def test_amr_rejects_year_outside_training_range(self):
        response = self.client.post(
            "/api/predict/amr",
            json={"Year Case": 2022, "Sex": "F", "Age Group": "19-35", "On Abx": "Yes"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("2019, 2020, or 2021", response.get_json()["error"])

    def test_amr_returns_valid_binary_probabilities(self):
        response = self.client.post(
            "/api/predict/amr",
            json={"Year Case": 2021, "Sex": "F", "Age Group": "19-35", "On Abx": "Yes"},
        )

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        self.assertIn(result["predicted_class"], {"MDR", "No MDR"})
        self.assertEqual(set(result["class_probabilities"]), {"MDR", "No MDR"})
        self.assertAlmostEqual(sum(result["class_probabilities"].values()), 1.0, places=5)


if __name__ == "__main__":
    unittest.main()
