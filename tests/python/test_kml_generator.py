import os
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
from _pybridge import build_namespace  # noqa: E402

_NS = build_namespace("kml_generator.py")
generate_kml = _NS["generate_kml"]
_kml_color = _NS["_kml_color"]

KMLNS = "{http://www.opengis.net/kml/2.2}"

# Geometría ya reproyectada a WGS84 (lon, lat, z) como la entrega JS.
GEOMETRY = {
    "points": [
        {"nombre": "P1", "x": -70.62, "y": -33.44, "z": 601.5, "codigo": "ARBOL"},
        {"nombre": "", "x": -70.61, "y": -33.45, "z": 600.0, "codigo": "ARBOL"},
    ],
    "lines": [
        {"codigo": "CERCA", "vertices": [[-70.62, -33.44, 1], [-70.61, -33.44, 2]]},
    ],
    "polylines": [
        {
            "codigo": "BORDE",
            "vertices": [[-70.62, -33.44, 0], [-70.61, -33.44, 0], [-70.61, -33.45, 0]],
        },
    ],
}

FEATURE_LIBRARY = {
    "ARBOL": {"capa": "ARBOLES", "color": "#00ff00"},
    "CERCA": {"capa": "CERCAS", "color": "#ff0000"},
    "BORDE": {"capa": "BORDES", "color": "#0000ff"},
}


def _doc(geometry=GEOMETRY, library=FEATURE_LIBRARY, options=None):
    content = generate_kml(geometry, library, options)
    assert isinstance(content, str)
    root = ET.fromstring(content)
    assert root.tag == f"{KMLNS}kml"
    return root.find(f"{KMLNS}Document")


def _placemarks(doc):
    return doc.findall(f"{KMLNS}Placemark")


def test_estructura_y_un_placemark_por_entidad():
    doc = _doc()
    pms = _placemarks(doc)
    assert len(pms) == 4  # 2 puntos + 1 línea + 1 polígono
    assert len(doc.findall(f"{KMLNS}Style")) == 3  # un estilo por código


def test_conversion_de_color_a_aabbggrr():
    assert _kml_color("#ff0000") == "ff0000ff"  # rojo → bb gg rr
    assert _kml_color("#00ff00") == "ff00ff00"
    assert _kml_color("#0000ff") == "ffff0000"
    assert _kml_color("chartreuse") == "ffffffff"
    assert _kml_color(None) == "ffffffff"


def test_estilo_del_codigo_lleva_su_color():
    doc = _doc()
    style = next(
        s for s in doc.findall(f"{KMLNS}Style") if s.get("id") == "s_CERCA"
    )
    line_color = style.find(f"{KMLNS}LineStyle/{KMLNS}color").text
    assert line_color == "ff0000ff"


def test_punto_lleva_nombre_coordenadas_y_extendeddata():
    doc = _doc()
    pt = _placemarks(doc)[0]
    assert pt.find(f"{KMLNS}name").text == "P1"
    coords = pt.find(f"{KMLNS}Point/{KMLNS}coordinates").text
    assert coords == "-70.62,-33.44,601.5"
    data = {
        d.get("name"): d.find(f"{KMLNS}value").text
        for d in pt.findall(f"{KMLNS}ExtendedData/{KMLNS}Data")
    }
    assert data == {"codigo": "ARBOL", "capa": "ARBOLES"}


def test_punto_sin_nombre_no_lleva_name():
    doc = _doc()
    sin_nombre = _placemarks(doc)[1]
    assert sin_nombre.find(f"{KMLNS}name") is None


def test_include_labels_false_omite_todos_los_names():
    doc = _doc(options={"include_labels": False})
    for pm in _placemarks(doc):
        assert pm.find(f"{KMLNS}name") is None


def test_poligono_cierra_el_anillo():
    doc = _doc()
    poly = _placemarks(doc)[3]
    coords = poly.find(
        f"{KMLNS}Polygon/{KMLNS}outerBoundaryIs/{KMLNS}LinearRing/{KMLNS}coordinates"
    ).text
    parts = coords.split(" ")
    assert len(parts) == 4  # 3 vértices + cierre
    assert parts[0] == parts[-1]


def test_nombre_con_caracteres_xml_se_escapa():
    geometry = {
        "points": [
            {"nombre": "Poste <A> & B", "x": 0, "y": 0, "z": 0, "codigo": "P"},
        ]
    }
    content = generate_kml(geometry, {})
    # Debe ser XML válido y conservar el texto original al parsear.
    doc = ET.fromstring(content).find(f"{KMLNS}Document")
    assert _placemarks(doc)[0].find(f"{KMLNS}name").text == "Poste <A> & B"


def test_codigo_desconocido_usa_defaults():
    geometry = {"points": [{"nombre": "P1", "x": 0, "y": 0, "z": 0, "codigo": "MISTERIO"}]}
    doc = _doc(geometry, {})
    style = doc.find(f"{KMLNS}Style")
    assert style.find(f"{KMLNS}IconStyle/{KMLNS}color").text == "ffffffff"
    data = {
        d.get("name"): d.find(f"{KMLNS}value").text
        for d in _placemarks(doc)[0].findall(f"{KMLNS}ExtendedData/{KMLNS}Data")
    }
    assert data["capa"] == "MISTERIO"
