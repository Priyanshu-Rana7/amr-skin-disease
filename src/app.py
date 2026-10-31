from PIL import Image, UnidentifiedImageError
import io
from flask import Flask, jsonify, request, render_template
from pathlib import Path
import json
import os

import joblib
import numpy as np
import tensorflow as tf
from werkzeug.exceptions import HTTPException


# Project paths
PROJECT_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_DIR / "models"

CNN_PATH = MODELS_DIR / "rebuilt_baseline_cnn.keras"
AMR_PATH = MODELS_DIR / "amr_logistic_pipeline.joblib"
METADATA_PATH = MODELS_DIR / "model_metadata.json"

# Initialize Flask
app = Flask(
    __name__,
    template_folder=str(PROJECT_DIR / "templates")
)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
ALLOWED_ORIGINS = set(os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","))

@app.after_request
def allow_frontend(response):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response

@app.errorhandler(413)
def upload_too_large(_error):
    return jsonify({"error": "Upload an image smaller than 8 MB."}), 413

@app.errorhandler(Exception)
def handle_error(error):
    if isinstance(error, HTTPException):
        return jsonify({"error": error.description}), error.code
    app.logger.exception("Prediction service failure")
    return jsonify({"error": "The prediction service could not complete this request. Please try again."}), 500

@app.get("/api/health")
def health():
    return jsonify({"status": "ready", "models": ["skin", "amr"]})

# Skin disease class labels
CLASS_NAMES = {
    0: "akiec",
    1: "bcc",
    2: "bkl",
    3: "df",
    4: "mel",
    5: "nv",
    6: "vasc",
}

CLASS_DESCRIPTIONS = {
    0: "Actinic keratoses and intraepithelial carcinoma",
    1: "Basal cell carcinoma",
    2: "Benign keratosis-like lesions",
    3: "Dermatofibroma",
    4: "Melanoma",
    5: "Melanocytic nevi",
    6: "Vascular lesions",
}

# Load models once when the application starts
cnn_model = tf.keras.models.load_model(
    str(CNN_PATH),
    compile=False,
)

amr_pipeline = joblib.load(AMR_PATH)

with METADATA_PATH.open("r", encoding="utf-8") as file:
    amr_metadata = json.load(file)

@app.route("/app", methods=["GET"])
def application():
    return render_template("index.html")

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "Skin Disease Classification and AMR Prediction API",
        "skin_model_classes": len(CLASS_NAMES),
        "amr_target": amr_metadata.get("target", "MDR Pathogen"),
        "status": "running",
        "notice": (
            "For research and educational use only. "
            "Not intended for clinical diagnosis or treatment decisions."
        ),
    })


@app.route("/api/predict/skin", methods=["POST"])
def predict_skin():
    if "image" not in request.files:
        return jsonify({
            "error": "No image uploaded. Use the field name 'image'."
        }), 400

    uploaded_file = request.files["image"]

    if not uploaded_file.filename:
        return jsonify({"error": "Please select an image."}), 400

    try:
        image_bytes = uploaded_file.read()

        if not image_bytes:
            return jsonify({"error": "The uploaded file is empty."}), 400

        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.width * image.height > 20_000_000:
                return jsonify({"error": "Choose an image with fewer than 20 million pixels."}), 400
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                return jsonify({"error": "Upload a JPEG, PNG, or WebP image."}), 400
            image = image.convert("RGB")
            image = image.resize((28, 28))
            image_array = np.asarray(image, dtype=np.float32)

        # DermaMNIST images use pixel values in the 0–255 range.
        # Keep this consistent with the preprocessing used during training.
        model_input = np.expand_dims(image_array, axis=0)

        scores = cnn_model.predict(model_input, verbose=0)[0]
        predicted_index = int(np.argmax(scores))

        return jsonify({
            "predicted_class": CLASS_NAMES[predicted_index],
            "description": CLASS_DESCRIPTIONS[predicted_index],
            "class_index": predicted_index,
            "class_scores": {
                CLASS_NAMES[i]: round(float(scores[i]), 6)
                for i in range(len(CLASS_NAMES))
            },
            "notice": (
                "Research and educational use only. "
                "This result is not a clinical diagnosis."
            )
        })

    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return jsonify({
            "error": "Invalid or unsupported image. Please upload a valid image."
        }), 400


@app.route("/api/predict/amr", methods=["POST"])
def predict_amr():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Send a valid JSON object."
        }), 400

    required_features = [
        "Year Case",
        "Sex",
        "Age Group",
        "On Abx",
    ]

    missing = [
        feature for feature in required_features
        if feature not in data
        or data[feature] is None
        or str(data[feature]).strip() == ""
    ]

    if missing:
        return jsonify({
            "error": "Missing required features.",
            "missing_features": missing,
        }), 400

    try:
        year_case = float(data["Year Case"])

        if not np.isfinite(year_case):
            raise ValueError("Year Case must be a finite number.")
        if not year_case.is_integer() or not 1900 <= year_case <= 2100:
            raise ValueError("Year Case must be a whole year from 1900 to 2100.")
        allowed = {"Sex": {"F", "M"}, "Age Group": {"13-18", "19-35", "36-59", "≤12", "≥60"}, "On Abx": {"No", "Yes"}}
        for feature, values in allowed.items():
            if str(data[feature]).strip() not in values:
                raise ValueError(f"Invalid {feature} value.")

        # Keep the original feature names and order expected by the pipeline.
        import pandas as pd

        input_data = pd.DataFrame([{
            "Year Case": year_case,
            "Sex": str(data["Sex"]).strip(),
            "Age Group": str(data["Age Group"]).strip(),
            "On Abx": str(data["On Abx"]).strip(),
        }])

        prediction = int(amr_pipeline.predict(input_data)[0])
        probabilities = amr_pipeline.predict_proba(input_data)[0]

        class_labels = {
            0: "No MDR",
            1: "MDR",
        }

        return jsonify({
            "predicted_class": class_labels.get(
                prediction, str(prediction)
            ),
            "predicted_label": prediction,
            "class_probabilities": {
                class_labels.get(int(cls), str(cls)): round(
                    float(prob), 6
                )
                for cls, prob in zip(
                    amr_pipeline.classes_, probabilities
                )
            },
            "features_used": input_data.iloc[0].to_dict(),
            "notice": (
                "Research and educational use only. "
                "This result is not a clinical prediction "
                "for treatment decisions."
            ),
        })

    except (TypeError, ValueError) as error:
        return jsonify({
            "error": str(error) or "Invalid input values."
        }), 400



if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "0") == "1")
