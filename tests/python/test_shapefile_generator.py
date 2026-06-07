import base64
import io
import os
import sys
import zipfile

# Cargar el generador como módulo aislado (no hay paquete python/ instalable).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
from shapefile_generator import (  # noqa: E402
    generate_shapefile_zip_b64,
    utm_wkt_from_epsg,
)


GEOMETRY = {
    "points": [
        {"x": 100.0, "y": 200.0, "z": 5.0, "codigo": "ARBOL", "nombre": "P1"},
        {"x": 110.0, "y": 210.0, "z": 6.0, "codigo": "ARBOL", "nombre": "P2"},
    ],
    "lines": [
        {"codigo": "CERCA", "vertices": [[0, 0, 1], [10, 0, 1], [10, 10, 2]]},
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


def _zip_contents(options=None):
    """Devuelve {nombre: bytes} de todas las entradas del ZIP generado."""
    b64 = generate_shapefile_zip_b64(GEOMETRY, FEATURE_LIBRARY, options)
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(b64))) as zf:
        return {name: zf.read(name) for name in zf.namelist()}


# --- utm_wkt_from_epsg --------------------------------------------------------

def test_wkt_zona_sur():
    wkt = utm_wkt_from_epsg(32719)
    assert 'PROJCS["WGS 84 / UTM zone 19S"' in wkt
    assert 'PARAMETER["central_meridian",-69]' in wkt
    assert 'PARAMETER["false_northing",10000000]' in wkt
    assert 'AUTHORITY["EPSG","32719"]' in wkt


def test_wkt_zona_norte():
    wkt = utm_wkt_from_epsg(32619)
    assert 'PROJCS["WGS 84 / UTM zone 19N"' in wkt
    assert 'PARAMETER["false_northing",0]' in wkt
    assert 'AUTHORITY["EPSG","32619"]' in wkt


def test_wkt_acepta_string_epsg():
    assert utm_wkt_from_epsg("32719") == utm_wkt_from_epsg(32719)


def test_wkt_none_para_epsg_no_utm_o_ausente():
    assert utm_wkt_from_epsg(None) is None
    assert utm_wkt_from_epsg(4326) is None  # geográfico, no UTM
    assert utm_wkt_from_epsg("foo") is None


# --- .prj en el ZIP -----------------------------------------------------------

def test_prj_presente_con_epsg():
    names = set(_zip_contents({"epsg": 32719}))
    assert {"points.prj", "lines.prj", "polygons.prj"} <= names


def test_prj_contenido_es_el_wkt():
    content = _zip_contents({"epsg": 32719})["points.prj"].decode("utf-8")
    assert content == utm_wkt_from_epsg(32719)


def test_sin_epsg_no_genera_prj():
    names = set(_zip_contents())
    assert not any(n.endswith(".prj") for n in names)
    # las capas base siguen presentes
    assert {"points.shp", "lines.shp", "polygons.shp"} <= names


def test_epsg_no_utm_no_genera_prj():
    names = set(_zip_contents({"epsg": 4326}))
    assert not any(n.endswith(".prj") for n in names)
