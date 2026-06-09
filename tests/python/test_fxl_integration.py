# tests/python/test_fxl_integration.py
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
from field_codes import detect_dialect, detect_control_codes  # noqa: E402

# Puntos donde "zz" aparece como token de control en pos≥2, sin léxico que lo cubra.
POINTS = [
    {"codigo": "CERCA", "x": 0, "y": 0, "z": 0, "nombre": "1"},
    {"codigo": "CERCA zz", "x": 10, "y": 0, "z": 0, "nombre": "2"},
]


def test_fxl_role_beats_heuristic():
    # Sin FXL: "zz" se resuelve por geometría (end/close). Con FXL: start.
    dialect = detect_dialect(POINTS)
    model = dialect.fit(POINTS, overrides=None, fxl_roles={"zz": "start"})
    assert model.role("zz") == "start"
    assert model.meta["zz"]["source"] == "fxl"


def test_user_override_beats_fxl():
    dialect = detect_dialect(POINTS)
    model = dialect.fit(POINTS, overrides={"zz": "end"}, fxl_roles={"zz": "start"})
    assert model.role("zz") == "end"
    assert model.meta["zz"]["source"] == "override"


def test_detect_control_codes_reports_fxl_source():
    out = detect_control_codes(POINTS, overrides=None, fxl_roles={"zz": "start"})
    row = next(r for r in out if r["token"] == "zz")
    assert row["role"] == "start"
    assert row["source"] == "fxl"
