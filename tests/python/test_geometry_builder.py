import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _pybridge import build_namespace  # noqa: E402

_NS = build_namespace(
    "csv_parser.py", "field_codes.py", "shapes.py", "geometry_builder.py"
)
build_geometry = _NS["build_geometry"]


def _pts(*items):
    """items: (nombre, x, y, z, codigo) o (codigo,) con coords 0."""
    out = []
    for i, it in enumerate(items):
        if isinstance(it, str):
            out.append({"nombre": f"P{i}", "x": 0.0, "y": 0.0, "z": 0.0, "codigo": it})
        else:
            nombre, x, y, z, codigo = it
            out.append({"nombre": nombre, "x": x, "y": y, "z": z, "codigo": codigo})
    return out


def _only_three_entities(geom):
    assert set(geom.keys()) == {"points", "lines", "polylines"}


# --- comportamiento base (regresión) ----------------------------------------

def test_simple_points():
    geom = build_geometry(_pts("ARBOL", "POSTE"), {})
    _only_three_entities(geom)
    assert len(geom["points"]) == 2
    assert geom["lines"] == []
    assert geom["polylines"] == []
    # El código de salida no lleva string number
    assert geom["points"][0]["codigo"] == "ARBOL"


def test_open_line_start_end():
    pts = _pts(
        ("P0", 0, 0, 0, "CERCA ST"),
        ("P1", 10, 0, 0, "CERCA"),
        ("P2", 10, 10, 0, "CERCA EN"),
    )
    geom = build_geometry(pts, {})
    _only_three_entities(geom)
    assert len(geom["lines"]) == 1
    assert geom["polylines"] == []
    assert len(geom["lines"][0]["vertices"]) == 3
    assert geom["lines"][0]["codigo"] == "CERCA"


def test_closed_polygon():
    pts = _pts(
        ("P0", 0, 0, 0, "BORDE ST"),
        ("P1", 10, 0, 0, "BORDE"),
        ("P2", 10, 10, 0, "BORDE CL"),
    )
    geom = build_geometry(pts, {})
    assert len(geom["polylines"]) == 1
    assert geom["lines"] == []


def test_autoconnect_polygon_without_start_marker():
    # Convención Trimble Access: SIN marcador 'inicio', los puntos consecutivos
    # del mismo código de tipo polígono se conectan; 'cerrar' cierra el anillo.
    pts = _pts(
        ("a", 0, 0, 0, "AREA"),
        ("b", 1, 0, 0, "AREA"),
        ("c", 1, 1, 0, "AREA CERRAR"),
        ("d", 5, 5, 0, "AREA"),
        ("e", 6, 5, 0, "AREA"),
        ("f", 6, 6, 0, "AREA CERRAR"),
    )
    geom = build_geometry(pts, {})
    _only_three_entities(geom)
    assert len(geom["polylines"]) == 2
    assert geom["lines"] == []
    assert geom["points"] == []


def test_autoconnect_line_without_start_marker():
    pts = _pts(
        ("a", 0, 0, 0, "BORDE"),
        ("b", 1, 0, 0, "BORDE"),
        ("c", 2, 0, 0, "BORDE"),
        ("d", 3, 0, 0, "BORDE FIN"),
        ("e", 0, 5, 0, "BORDE"),
        ("f", 1, 5, 0, "BORDE FIN"),
    )
    geom = build_geometry(pts, {})
    assert len(geom["lines"]) == 2
    assert geom["polylines"] == []
    assert geom["points"] == []


def test_build_geometry_respects_control_override():
    # 'cerrar' por defecto cierra el polígono; el override a 'end' lo hace línea.
    pts = _pts(
        ("a", 0, 0, 0, "AREA"),
        ("b", 4, 0, 0, "AREA"),
        ("c", 4, 4, 0, "AREA CERRAR"),
    )
    geom = build_geometry(pts, {})
    assert len(geom["polylines"]) == 1 and geom["lines"] == []

    geom2 = build_geometry(pts, {}, control_overrides={"cerrar": "end"})
    assert len(geom2["lines"]) == 1 and geom2["polylines"] == []


def test_build_geometry_exotic_terminal_by_geometry():
    # Terminal desconocido que cierra el anillo → polígono, sin léxico.
    pts = _pts(
        ("a", 0, 0, 0, "ZONA"),
        ("b", 4, 0, 0, "ZONA"),
        ("c", 4, 4, 0, "ZONA"),
        ("d", 0.2, 0.2, 0, "ZONA WQX"),
    )
    geom = build_geometry(pts, {})
    assert len(geom["polylines"]) == 1
    assert geom["points"] == []


def test_point_code_stays_point_even_repeated():
    # Un código que nunca lleva control code se mantiene como puntos sueltos.
    geom = build_geometry(_pts("ARB", "ARB", "ARB"), {})
    assert len(geom["points"]) == 3
    assert geom["lines"] == []
    assert geom["polylines"] == []


def test_parallel_stringing():
    pts = _pts(
        ("a", 0, 0, 0, "EP1"),
        ("b", 0, 0, 0, "EP2"),
        ("c", 1, 0, 0, "EP1"),
        ("d", 1, 1, 0, "EP2"),
    )
    geom = build_geometry(pts, {})
    # Dos cadenas paralelas EP, ambas líneas
    assert len(geom["lines"]) == 2
    assert all(l["codigo"] == "EP" for l in geom["lines"])


# --- densificación de primitivas → 3 entidades ------------------------------

def test_circle_3_points_becomes_polygon():
    # Tres puntos sobre un círculo de radio 5 centrado en el origen
    pts = _pts(
        ("c0", 5, 0, 0, "TANQUE CI"),
        ("c1", 0, 5, 0, "TANQUE"),
        ("c2", -5, 0, 0, "TANQUE EN"),
    )
    geom = build_geometry(pts, {})
    _only_three_entities(geom)
    assert len(geom["polylines"]) == 1
    assert geom["lines"] == []
    verts = geom["polylines"][0]["vertices"]
    assert len(verts) >= 8
    # Todos a radio ~5 del origen
    for v in verts:
        assert math.isclose(math.hypot(v[0], v[1]), 5.0, abs_tol=1e-6)


def test_circle_center_radius_becomes_polygon():
    pts = _pts(("c", 100, 200, 3, "POZO CI 8"))
    geom = build_geometry(pts, {})
    assert len(geom["polylines"]) == 1
    verts = geom["polylines"][0]["vertices"]
    for v in verts:
        assert math.isclose(math.hypot(v[0] - 100, v[1] - 200), 8.0, abs_tol=1e-6)


def test_arc_3_points_becomes_line():
    pts = _pts(
        ("a0", 5, 0, 0, "CANAL TA"),
        ("a1", 0, 5, 0, "CANAL"),
        ("a2", -5, 0, 0, "CANAL EN"),
    )
    geom = build_geometry(pts, {})
    assert len(geom["lines"]) == 1
    assert geom["polylines"] == []
    verts = geom["lines"][0]["vertices"]
    # Arco sobre el círculo de radio 5
    for v in verts:
        assert math.isclose(math.hypot(v[0], v[1]), 5.0, abs_tol=1e-6)


def test_rectangle_becomes_polygon():
    pts = _pts(
        ("r0", 0, 0, 0, "EDIF RE 4"),
        ("r1", 10, 0, 0, "EDIF EN"),
    )
    geom = build_geometry(pts, {})
    assert len(geom["polylines"]) == 1
    assert len(geom["polylines"][0]["vertices"]) == 4


def test_smooth_curve_becomes_line():
    pts = _pts(
        ("s0", 0, 0, 0, "RIO SM"),
        ("s1", 1, 2, 0, "RIO"),
        ("s2", 2, 0, 0, "RIO"),
        ("s3", 3, 2, 0, "RIO EN"),
    )
    geom = build_geometry(pts, {})
    assert len(geom["lines"]) == 1
    assert geom["polylines"] == []
    # Densificada: más vértices que los 4 originales
    assert len(geom["lines"][0]["vertices"]) > 4


def test_degenerate_circle_falls_back_safely():
    # Tres puntos colineales: no hay círculo → no debe romper
    pts = _pts(
        ("c0", 0, 0, 0, "X CI"),
        ("c1", 1, 0, 0, "X"),
        ("c2", 2, 0, 0, "X EN"),
    )
    geom = build_geometry(pts, {})
    _only_three_entities(geom)
    # Cae a vértices crudos como polígono (shape circle fuerza poly)
    assert len(geom["polylines"]) == 1
    assert len(geom["polylines"][0]["vertices"]) == 3
