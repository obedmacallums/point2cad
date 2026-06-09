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


from field_codes import detect_codes, linear_code_set, closed_code_set  # noqa: E402

# "PT" aparece como puntos sueltos (heurística lo llamaría Punto).
PTS_PUNTOS = [
    {"codigo": "PT", "x": 0, "y": 0, "z": 0, "nombre": "1"},
    {"codigo": "PT", "x": 50, "y": 80, "z": 0, "nombre": "2"},
    {"codigo": "PT", "x": 120, "y": 10, "z": 0, "nombre": "3"},
]


def test_fxl_type_forces_line():
    summary = detect_codes(PTS_PUNTOS, fxl_types={"PT": "Línea abierta"})
    row = next(r for r in summary if r["codigo"] == "PT")
    assert row["tipo"] == "Línea abierta"


def test_fxl_type_forces_polygon():
    summary = detect_codes(PTS_PUNTOS, fxl_types={"PT": "Polilínea cerrada"})
    row = next(r for r in summary if r["codigo"] == "PT")
    assert row["tipo"] == "Polilínea cerrada"


def test_explicit_control_code_beats_fxl_type():
    # Datos con "fin" (end → línea); el FXL dice Punto, pero el control code manda.
    pts = [
        {"codigo": "AA", "x": 0, "y": 0, "z": 0, "nombre": "1"},
        {"codigo": "AA fin", "x": 10, "y": 0, "z": 0, "nombre": "2"},
    ]
    summary = detect_codes(pts, fxl_roles={"fin": "end"}, fxl_types={"AA": "Punto"})
    row = next(r for r in summary if r["codigo"] == "AA")
    assert row["tipo"] == "Línea abierta"


def test_fxl_type_lookup_is_case_insensitive():
    # base se normaliza a mayúsculas; un fxl_types con clave en minúscula igual aplica.
    summary = detect_codes(PTS_PUNTOS, fxl_types={"pt": "Línea abierta"})
    row = next(r for r in summary if r["codigo"] == "PT")
    assert row["tipo"] == "Línea abierta"


def test_linear_and_closed_sets_honor_fxl():
    assert "PT" in linear_code_set(PTS_PUNTOS, detect_dialect(PTS_PUNTOS),
                                   fxl_types={"PT": "Línea abierta"})
    assert "PT" in closed_code_set(PTS_PUNTOS, detect_dialect(PTS_PUNTOS),
                                   fxl_types={"PT": "Polilínea cerrada"})
