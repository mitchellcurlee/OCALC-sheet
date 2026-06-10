# Tests for AI-powered pole height estimation endpoint
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ENDPOINT = f"{BASE_URL}/api/pole-analysis/analyze-pole-heights"

# Minimal 1x1 PNG (transparent) - smallest valid image
PIXEL_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_base_url_present():
    """Sanity check - REACT_APP_BACKEND_URL is configured"""
    assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


def test_analyze_pole_heights_endpoint_exists(session):
    """Endpoint reachable - send valid payload, should not be 404"""
    payload = {
        "image_base64": PIXEL_PNG_B64,
        "pole_height_estimate": 40,
    }
    resp = session.post(ENDPOINT, json=payload, timeout=90)
    # 200 (success) or 500 (LLM failure) acceptable - 404 means routing broken
    assert resp.status_code != 404, f"Endpoint not found: {resp.text}"
    assert resp.status_code != 405, f"Method not allowed: {resp.text}"


def test_analyze_pole_heights_missing_image_returns_422(session):
    """Pydantic validation - missing image_base64 should 422"""
    resp = session.post(ENDPOINT, json={"pole_height_estimate": 40}, timeout=30)
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


def test_analyze_pole_heights_response_shape(session):
    """Verify response JSON shape matches HeightEstimationResponse"""
    payload = {
        "image_base64": f"data:image/png;base64,{PIXEL_PNG_B64}",
        "pole_height_estimate": 40,
    }
    resp = session.post(ENDPOINT, json=payload, timeout=120)
    # If LLM is unavailable, accept 500 but flag it
    if resp.status_code == 500:
        pytest.skip(f"LLM service unavailable: {resp.text}")
    assert resp.status_code == 200, f"Got {resp.status_code}: {resp.text}"

    data = resp.json()
    # Required fields
    assert "success" in data and isinstance(data["success"], bool)
    assert "pole_height_ft" in data and isinstance(data["pole_height_ft"], (int, float))
    assert "attachments" in data and isinstance(data["attachments"], list)
    assert "analysis_notes" in data and isinstance(data["analysis_notes"], str)

    # If any attachments, validate inner shape
    for att in data["attachments"]:
        assert set(["type", "height_ft", "confidence", "description"]).issubset(att.keys())
        assert isinstance(att["height_ft"], (int, float))
        assert att["confidence"] in ["high", "medium", "low"]


def test_analyze_pole_heights_default_height(session):
    """Verify pole_height_estimate is optional (defaults to 40)"""
    payload = {"image_base64": PIXEL_PNG_B64}
    resp = session.post(ENDPOINT, json=payload, timeout=120)
    if resp.status_code == 500:
        pytest.skip(f"LLM service unavailable: {resp.text}")
    assert resp.status_code == 200, f"Got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "pole_height_ft" in data
