"""HTTP contract of the Flask API: routes, validation and error format."""
import io
import math

import pytest

from conftest import SKIN_CLASSES, VALID_CASE, image_bytes


# ---------- general ----------
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.get_json() == {"status": "ready", "models": ["skin", "amr"]}


def test_root_info(client):
    body = client.get("/").get_json()
    assert body["status"] == "running" and body["skin_model_classes"] == 7


def test_legacy_ui_served(client):
    r = client.get("/app")
    assert r.status_code == 200 and b"<html" in r.data.lower()


def test_unknown_route_is_json_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and "error" in r.get_json()


def test_wrong_method_is_json_405(client):
    r = client.get("/api/predict/amr")
    assert r.status_code == 405 and "error" in r.get_json()


def test_cors_allows_known_origin(client):
    r = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert r.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"


def test_cors_ignores_other_origin(client):
    r = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "Access-Control-Allow-Origin" not in r.headers


# ---------- skin ----------
def post_image(client, data, name="x.png", field="image"):
    return client.post("/api/predict/skin", data={field: (io.BytesIO(data), name)},
                       content_type="multipart/form-data")


@pytest.mark.parametrize("fmt,mode", [("PNG", "RGB"), ("JPEG", "RGB"), ("WEBP", "RGB"), ("PNG", "RGBA"), ("PNG", "L")])
def test_skin_accepts_formats(client, fmt, mode):
    color = (180, 120, 110, 255) if mode == "RGBA" else (180, 120, 110)
    r = post_image(client, image_bytes(fmt, mode=mode, color=color), f"x.{fmt.lower()}")
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert set(body) >= {"predicted_class", "description", "class_index", "class_scores", "notice"}
    assert list(body["class_scores"]) == SKIN_CLASSES
    assert math.isclose(sum(body["class_scores"].values()), 1.0, abs_tol=1e-4)
    assert body["predicted_class"] == max(body["class_scores"], key=body["class_scores"].get)
    assert body["predicted_class"] == SKIN_CLASSES[body["class_index"]]


def test_skin_missing_field(client):
    r = post_image(client, image_bytes(), field="file")
    assert r.status_code == 400 and "image" in r.get_json()["error"]


def test_skin_empty_filename(client):
    r = post_image(client, image_bytes(), name="")
    assert r.status_code == 400


def test_skin_empty_file(client):
    assert post_image(client, b"").status_code == 400


def test_skin_not_an_image(client):
    assert post_image(client, b"hello, not an image", "x.png").status_code == 400


def test_skin_rejects_gif(client):
    r = post_image(client, image_bytes("GIF", mode="RGB"), "x.gif")
    assert r.status_code == 400 and "JPEG" in r.get_json()["error"]


def test_skin_rejects_huge_dimensions(client):
    r = post_image(client, image_bytes("PNG", size=(5000, 5000), mode="L"))
    assert r.status_code == 400 and "pixels" in r.get_json()["error"]


def test_skin_rejects_over_8mb(client):
    r = post_image(client, b"\0" * (9 * 1024 * 1024))
    assert r.status_code == 413 and "8 MB" in r.get_json()["error"]


# ---------- amr ----------
def post_amr(client, payload):
    return client.post("/api/predict/amr", json=payload)


def test_amr_handover_example_reproduces(client):
    body = post_amr(client, VALID_CASE).get_json()
    assert body["predicted_class"] == "MDR" and body["predicted_label"] == 1
    assert body["class_probabilities"] == {"MDR": 0.798246, "No MDR": 0.201754}
    assert body["features_used"]["Year Case"] == 2024.0


def test_amr_class_matches_highest_probability(client):
    for sex in ("F", "M"):
        for abx in ("Yes", "No"):
            body = post_amr(client, {**VALID_CASE, "Sex": sex, "On Abx": abx}).get_json()
            probs = body["class_probabilities"]
            assert math.isclose(sum(probs.values()), 1, abs_tol=1e-5)
            assert body["predicted_class"] == max(probs, key=probs.get)


def test_amr_year_as_string_ok(client):
    assert post_amr(client, {**VALID_CASE, "Year Case": "2021"}).status_code == 200


def test_amr_trims_whitespace(client):
    assert post_amr(client, {**VALID_CASE, "Sex": " F "}).status_code == 200


def test_amr_not_json(client):
    r = client.post("/api/predict/amr", data="Sex=F", content_type="text/plain")
    assert r.status_code == 400


def test_amr_json_array(client):
    assert post_amr(client, [VALID_CASE]).status_code == 400


@pytest.mark.parametrize("field", ["Year Case", "Sex", "Age Group", "On Abx"])
def test_amr_missing_each_field(client, field):
    payload = {k: v for k, v in VALID_CASE.items() if k != field}
    r = post_amr(client, payload)
    assert r.status_code == 400 and r.get_json()["missing_features"] == [field]


@pytest.mark.parametrize("field,value", [("Sex", None), ("Sex", "  "), ("Age Group", "")])
def test_amr_blank_values(client, field, value):
    assert post_amr(client, {**VALID_CASE, field: value}).status_code == 400


@pytest.mark.parametrize("year", [1899, 2101, 2024.5, "abc", "nan", "inf", True])
def test_amr_bad_year(client, year):
    assert post_amr(client, {**VALID_CASE, "Year Case": year}).status_code == 400


@pytest.mark.parametrize("field,value", [("Sex", "Female"), ("Sex", "f"), ("Age Group", "20-30"),
                                         ("Age Group", "<=12"), ("On Abx", "yes"), ("On Abx", 1)])
def test_amr_bad_categories(client, field, value):
    assert post_amr(client, {**VALID_CASE, field: value}).status_code == 400
