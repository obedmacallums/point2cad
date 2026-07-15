import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _pybridge import build_namespace  # noqa: E402

_NS = build_namespace("shapes.py")
circle_from_3_points = _NS["circle_from_3_points"]
circle_from_center_radius = _NS["circle_from_center_radius"]
arc_from_3_points = _NS["arc_from_3_points"]
rectangle = _NS["rectangle"]
smooth_curve = _NS["smooth_curve"]


def _dist_xy(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


# --- círculos ----------------------------------------------------------------

def test_circulo_por_3_puntos_radio_y_centro():
    # Tres puntos del círculo unitario centrado en (2, 3)
    verts = circle_from_3_points([3, 3, 0], [2, 4, 0], [1, 3, 0], segments=32)
    assert len(verts) == 32
    for v in verts:
        assert math.isclose(_dist_xy(v, [2, 3]), 1.0, abs_tol=1e-9)


def test_circulo_por_3_puntos_z_es_el_promedio():
    verts = circle_from_3_points([3, 3, 0.0], [2, 4, 3.0], [1, 3, 6.0])
    assert all(math.isclose(v[2], 3.0) for v in verts)


def test_circulo_colineales_devuelve_none():
    assert circle_from_3_points([0, 0, 0], [1, 0, 0], [2, 0, 0]) is None


def test_circulo_centro_radio():
    verts = circle_from_center_radius([10, 20, 5], 2.5, segments=16)
    assert len(verts) == 16
    for v in verts:
        assert math.isclose(_dist_xy(v, [10, 20]), 2.5, abs_tol=1e-9)
        assert v[2] == 5


def test_circulo_radio_invalido_devuelve_none():
    assert circle_from_center_radius([0, 0, 0], 0) is None
    assert circle_from_center_radius([0, 0, 0], -1) is None
    assert circle_from_center_radius([0, 0, 0], None) is None


# --- arcos -------------------------------------------------------------------

def test_arco_extremos_y_paso_por_el_medio():
    # Semicírculo unitario: de (1,0) a (-1,0) pasando por (0,1)
    p1, p2, p3 = [1, 0, 0], [0, 1, 0], [-1, 0, 0]
    verts = arc_from_3_points(p1, p2, p3, segments=64)
    assert len(verts) == 65
    assert math.isclose(_dist_xy(verts[0], p1), 0.0, abs_tol=1e-9)
    assert math.isclose(_dist_xy(verts[-1], p3), 0.0, abs_tol=1e-9)
    # Pasa por p2 (algún vértice queda muy cerca)
    assert min(_dist_xy(v, p2) for v in verts) < 0.05
    # Todos los vértices sobre el círculo unitario
    for v in verts:
        assert math.isclose(_dist_xy(v, [0, 0]), 1.0, abs_tol=1e-9)


def test_arco_elige_el_sentido_que_pasa_por_p2():
    # Mismo inicio/fin, p2 abajo: el arco debe ir por y<0, no por y>0.
    verts = arc_from_3_points([1, 0, 0], [0, -1, 0], [-1, 0, 0], segments=32)
    ys = [v[1] for v in verts[1:-1]]
    assert all(y <= 1e-9 for y in ys)


def test_arco_interpola_z_entre_extremos():
    verts = arc_from_3_points([1, 0, 0.0], [0, 1, 5.0], [-1, 0, 10.0], segments=10)
    assert math.isclose(verts[0][2], 0.0)
    assert math.isclose(verts[-1][2], 10.0)
    # Monótona creciente (interpolación lineal en t)
    zs = [v[2] for v in verts]
    assert zs == sorted(zs)


def test_arco_colineales_devuelve_los_3_puntos_crudos():
    p1, p2, p3 = [0, 0, 0], [1, 0, 1], [2, 0, 2]
    assert arc_from_3_points(p1, p2, p3) == [p1, p2, p3]


# --- rectángulo --------------------------------------------------------------

def test_rectangulo_ancho_a_la_derecha():
    # Avance +X: la derecha es -Y
    verts = rectangle([0, 0, 0], [10, 0, 0], 2.0)
    assert verts == [
        [0, 0, 0],
        [10, 0, 0],
        [10, -2.0, 0],
        [0, -2.0, 0],
    ]


def test_rectangulo_ancho_negativo_a_la_izquierda():
    verts = rectangle([0, 0, 0], [10, 0, 0], -2.0)
    assert verts[2][1] == 2.0
    assert verts[3][1] == 2.0


def test_rectangulo_degenerado_devuelve_none():
    assert rectangle([0, 0, 0], [10, 0, 0], 0) is None
    assert rectangle([0, 0, 0], [10, 0, 0], None) is None
    assert rectangle([5, 5, 0], [5, 5, 0], 2.0) is None  # lado de largo cero


# --- curva suave -------------------------------------------------------------

def test_curva_con_menos_de_3_puntos_sin_cambios():
    pts = [[0, 0, 0], [10, 0, 0]]
    assert smooth_curve(pts) == pts


def test_curva_pasa_por_los_puntos_originales():
    pts = [[0, 0, 0], [5, 5, 1], [10, 0, 2]]
    out = smooth_curve(pts, segments_per_span=8)
    # Extremos exactos
    assert out[0] == pts[0]
    assert out[-1] == pts[-1]
    # El punto intermedio original aparece en la curva (Catmull-Rom interpola)
    assert any(
        math.isclose(v[0], 5) and math.isclose(v[1], 5) and math.isclose(v[2], 1)
        for v in out
    )


def test_curva_densifica_segun_segments_per_span():
    pts = [[0, 0, 0], [5, 5, 0], [10, 0, 0]]
    out = smooth_curve(pts, segments_per_span=8)
    # 2 spans × 8 segmentos + punto final
    assert len(out) == 17
