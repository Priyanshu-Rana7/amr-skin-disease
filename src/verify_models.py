
from pathlib import Path
import json
import joblib
import numpy as np
import tensorflow as tf

# Project root is the parent of src/
PROJECT_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_DIR / "models"

CNN_PATH = MODELS_DIR / "rebuilt_baseline_cnn.keras"
AMR_PATH = MODELS_DIR / "amr_logistic_pipeline.joblib"
METADATA_PATH = MODELS_DIR / "model_metadata.json"

# 1. Verify required files
for path in (CNN_PATH, AMR_PATH, METADATA_PATH):
    if not path.is_file():
        raise FileNotFoundError(f"Required file not found: {path}")
    print(f"Found: {path.name} ({path.stat().st_size:,} bytes)")

# 2. Load the existing models
print("\nLoading CNN...")
cnn_model = tf.keras.models.load_model(
    str(CNN_PATH),
    compile=False
)

print("Loading AMR pipeline...")
amr_pipeline = joblib.load(AMR_PATH)

with METADATA_PATH.open("r", encoding="utf-8") as file:
    metadata = json.load(file)

# 3. Verify CNN structure
print("\n===== CNN =====")
print("Input shape:", cnn_model.input_shape)
print("Output shape:", cnn_model.output_shape)
print("Parameters:", f"{cnn_model.count_params():,}")

assert cnn_model.input_shape[1:] == (28, 28, 3)
assert cnn_model.output_shape[-1] == 7

# Smoke-test with a synthetic image
# This tests execution only, not classification accuracy.
sample_image = np.zeros((1, 28, 28, 3), dtype=np.float32)
cnn_output = cnn_model.predict(sample_image, verbose=0)

print("Synthetic-image output shape:", cnn_output.shape)
assert cnn_output.shape == (1, 7)

# 4. Verify AMR structure and test prediction
print("\n===== AMR =====")
print("Features:", list(amr_pipeline.feature_names_in_))
print("Classes:", amr_pipeline.classes_)

sample_case = {
    "Year Case": 2021,
    "Sex": "F",
    "Age Group": "36-59",
    "On Abx": "Yes"
}

amr_prediction = amr_pipeline.predict(
    __import__("pandas").DataFrame([sample_case])
)[0]
amr_probabilities = amr_pipeline.predict_proba(
    __import__("pandas").DataFrame([sample_case])
)[0]

print("Sample prediction:", "MDR" if amr_prediction == 1 else "No MDR")
print("Probabilities:", {
    str(cls): round(float(prob), 4)
    for cls, prob in zip(amr_pipeline.classes_, amr_probabilities)
})

print("\nMetadata target:", metadata.get("target"))
print("\nAll local model-loading checks passed.")
