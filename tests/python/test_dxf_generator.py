import io
import os
import sys

import ezdxf

sys.path.insert(0, os.path.dirname(__file__))
from _pybridge import build_namespace  # noqa: E402

_NS = build_namespace("dxf_generator.py")
generate_dxf = _NS["generate_dxf"]
_hex_to_rgb = _NS["_hex_to_rgb"]


GEOMETRY = {
    "points": [
        {"nombre": "P1", "x": 100.0, "y": 200.0, "z": 5.0, "codigo": "ARBOL"},
        {"nombre": "", "x": 110.0, "y": 210.0, "z": 6.0, "codigo": "ARBOL"},
    ],
    "lines": [
        {"codigo": "CERCA", "vertices": [[0, 0, 1], [10, 0, 2], [10, 10, 3]]},
    ],
    "polylines": [
        {"codigo": "BORDE", "vertices": [[0, 0, 0], [5, 0, 0], [5, 5, 0]]},
    ],
}

FEATURE_LIBRARY = {
    "ARBOL": {"capa": "ARBOLES", "color": "#00ff00"},
    "CERCA": {"capa": "CERCAS", "color": "#ff0000"},
    "BORDE": {"capa": "BORDES", "color": "#0000ff"},
}


def _doc(geometry=GEOMETRY, library=FEATURE_LIBRARY, options=None):
    content = generate_dxf(geometry, library, options)
    assert isinstance(content, str)
    return ezdxf.read(io.StringIO(content))


# --- capas y colores ---------------------------------------------------------

def test_capas_creadas_con_color_rgb():
    doc = _doc()
    assert "ARBOLES" in doc.layers
    assert "CERCAS" in doc.layers
    assert "BORDES" in doc.layers
    assert doc.layers.get("ARBOLES").rgb == (0, 255, 0)
    assert doc.layers.get("CERCAS").rgb == (255, 0, 0)


def test_codigo_sin_feature_usa_el_codigo_como_capa():
    geometry = {"points": [{"nombre": "P1", "x": 0, "y": 0, "z": 0, "codigo": "MISTERIO"}]}
    doc = _doc(geometry, {})
    points = doc.modelspace().query("POINT")
    assert len(points) == 1
    assert points[0].dxf.layer == "MISTERIO"


def test_hex_invalido_cae_a_blanco():
    assert _hex_to_rgb("#00ff00") == (0, 255, 0)
    assert _hex_to_rgb("verde") == (255, 255, 255)
    assert _hex_to_rgb("#zzzzzz") == (255, 255, 255)
    assert _hex_to_rgb(None) == (255, 255, 255)


# --- puntos y etiquetas ------------------------------------------------------

def test_puntos_en_su_capa_con_coordenadas():
    doc = _doc()
    points = doc.modelspace().query("POINT")
    assert len(points) == 2
    assert all(p.dxf.layer == "ARBOLES" for p in points)
    locs = {tuple(p.dxf.location) for p in points}
    assert (100.0, 200.0, 5.0) in locs


def test_etiquetas_en_capa_text_separada_solo_con_nombre():
    doc = _doc()
    texts = doc.modelspace().query("TEXT")
    # Solo P1 tiene nombre; el segundo punto (nombre vacío) no genera TEXT.
    assert len(texts) == 1
    assert texts[0].dxf.text == "P1"
    assert texts[0].dxf.layer == "ARBOLES_TEXT"
    assert "ARBOLES_TEXT" in doc.layers


def test_include_labels_false_no_genera_text():
    doc = _doc(options={"include_labels": False})
    assert len(doc.modelspace().query("TEXT")) == 0
    assert "ARBOLES_TEXT" not in doc.layers


# --- líneas y polilíneas -----------------------------------------------------

def test_linea_es_polyline3d_abierta_y_preserva_z():
    doc = _doc()
    polys = [
        e for e in doc.modelspace().query("POLYLINE") if e.dxf.layer == "CERCAS"
    ]
    assert len(polys) == 1
    poly = polys[0]
    assert not poly.is_closed
    verts = [tuple(v.dxf.location) for v in poly.vertices]
    assert verts == [(0, 0, 1), (10, 0, 2), (10, 10, 3)]


def test_polilinea_cerrada_lleva_flag_closed():
    doc = _doc()
    polys = [
        e for e in doc.modelspace().query("POLYLINE") if e.dxf.layer == "BORDES"
    ]
    assert len(polys) == 1
    assert polys[0].is_closed


def test_geometria_vacia_genera_dxf_valido_sin_entidades():
    doc = _doc({}, {})
    assert len(doc.modelspace()) == 0
