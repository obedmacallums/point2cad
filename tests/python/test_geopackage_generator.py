import base64
import os
import sys
import tempfile

import geopandas as gpd

# Cargar el generador como módulo aislado (no hay paquete python/ instalable).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
from geopackage_generator import generate_geopackage_b64  # noqa: E402


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


def _write_gpkg(tmp_path):
    b64 = generate_geopackage_b64(GEOMETRY, FEATURE_LIBRARY)
    path = os.path.join(tmp_path, "out.gpkg")
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))
    return path


def test_layers_present():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        import fiona
        layers = set(fiona.listlayers(path))
    assert layers == {"points", "lines", "polygons"}


def test_points_attributes_and_count():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        gdf = gpd.read_file(path, layer="points")
    assert len(gdf) == 2
    assert list(gdf["codigo"]) == ["ARBOL", "ARBOL"]
    assert list(gdf["capa"]) == ["ARBOLES", "ARBOLES"]
    assert list(gdf["nombre"]) == ["P1", "P2"]


def test_z_is_preserved():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        gdf = gpd.read_file(path, layer="points")
    assert gdf.geometry.iloc[0].has_z
    assert gdf.geometry.iloc[0].z == 5.0


def test_polygon_ring_is_closed():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        gdf = gpd.read_file(path, layer="polygons")
    coords = list(gdf.geometry.iloc[0].exterior.coords)
    assert coords[0] == coords[-1]


def test_options_arg_is_accepted():
    # Firma uniforme con los demás generadores; no debe fallar al recibir options.
    out = generate_geopackage_b64(GEOMETRY, FEATURE_LIBRARY, {"include_labels": False})
    assert isinstance(out, str) and len(out) > 0
