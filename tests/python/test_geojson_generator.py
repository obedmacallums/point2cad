import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _pybridge import build_namespace  # noqa: E402

_NS = build_namespace("geojson_generator.py")
generate_geojson = _NS["generate_geojson"]


GEOMETRY = {
    "points": [
        {"nombre": "P1", "x": 100.0, "y": 200.0, "z": 5.0, "codigo": "ARBOL"},
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


def _features(geometry=GEOMETRY, library=FEATURE_LIBRARY):
    collection = json.loads(generate_geojson(geometry, library))
    assert collection["type"] == "FeatureCollection"
    return collection["features"]


def _by_type(features, geom_type):
    return [f for f in features if f["geometry"]["type"] == geom_type]


def test_una_feature_por_entidad():
    features = _features()
    assert len(features) == 3
    assert len(_by_type(features, "Point")) == 1
    assert len(_by_type(features, "LineString")) == 1
    assert len(_by_type(features, "Polygon")) == 1


def test_punto_lleva_xyz_y_propiedades():
    (pt,) = _by_type(_features(), "Point")
    assert pt["geometry"]["coordinates"] == [100.0, 200.0, 5.0]
    props = pt["properties"]
    assert props["nombre"] == "P1"
    assert props["codigo"] == "ARBOL"
    assert props["capa"] == "ARBOLES"
    assert props["color"] == "#00ff00"


def test_linea_preserva_vertices_y_z():
    (line,) = _by_type(_features(), "LineString")
    assert line["geometry"]["coordinates"] == [[0, 0, 1], [10, 0, 2], [10, 10, 3]]
    assert "nombre" not in line["properties"]


def test_poligono_cierra_el_anillo_repitiendo_el_primer_vertice():
    (poly,) = _by_type(_features(), "Polygon")
    ring = poly["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]
    assert len(ring) == 4  # 3 vértices + cierre


def test_anillo_ya_cerrado_no_duplica_el_cierre():
    geometry = {
        "polylines": [
            {"codigo": "BORDE", "vertices": [[0, 0, 0], [5, 0, 0], [5, 5, 0], [0, 0, 0]]},
        ]
    }
    (poly,) = _by_type(_features(geometry), "Polygon")
    ring = poly["geometry"]["coordinates"][0]
    assert len(ring) == 4
    assert ring[0] == ring[-1]


def test_codigo_desconocido_usa_defaults():
    geometry = {"points": [{"nombre": "P1", "x": 0, "y": 0, "z": 0, "codigo": "MISTERIO"}]}
    (pt,) = _by_type(_features(geometry, {}), "Point")
    assert pt["properties"]["capa"] == "MISTERIO"
    assert pt["properties"]["color"] == "#ffffff"
