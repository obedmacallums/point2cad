import base64
import os
import sqlite3
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


def _write_gpkg(tmp_path, options=None):
    b64 = generate_geopackage_b64(GEOMETRY, FEATURE_LIBRARY, options)
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


def test_lines_z_is_preserved():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        gdf = gpd.read_file(path, layer="lines")
    geom = gdf.geometry.iloc[0]
    assert geom.has_z
    assert len(list(geom.coords)) == 3


def _srs_ids(path):
    """srs_id de cada capa según gpkg_geometry_columns."""
    con = sqlite3.connect(path)
    try:
        rows = con.execute(
            "select table_name, srs_id from gpkg_geometry_columns"
        ).fetchall()
    finally:
        con.close()
    return {table: srs_id for table, srs_id in rows}


def test_sin_epsg_no_asigna_epsg_real_ni_crs_geografico():
    # Sin EPSG no se asigna ningún sistema real (to_epsg() == None) y, sobre todo,
    # el CRS resultante NO es geográfico: así el GIS no intercambia los ejes.
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        gdf = gpd.read_file(path, layer="points")
    assert gdf.crs is None or (
        gdf.crs.to_epsg() is None and not gdf.crs.is_geographic
    )


def test_sin_epsg_usa_srs_cartesiano_no_geografico():
    # Sin EPSG, GDAL marca por defecto srs_id 0 = "Undefined geographic SRS", lo
    # que hace que el GIS receptor intercambie ejes (lat/lon) e invierta las
    # coordenadas planas. Forzamos srs_id -1 = "Undefined Cartesian SRS" para que
    # se traten como planas y no se inviertan (igual que el Shapefile sin .prj).
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp)
        srs = _srs_ids(path)
    assert srs == {"points": -1, "lines": -1, "polygons": -1}


def test_con_epsg_no_se_toca_el_srs_id():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp, {"epsg": 32719})
        srs = _srs_ids(path)
    assert srs == {"points": 32719, "lines": 32719, "polygons": 32719}


def test_epsg_se_asigna_a_todas_las_capas():
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_gpkg(tmp, {"epsg": 32719})
        for layer in ("points", "lines", "polygons"):
            gdf = gpd.read_file(path, layer=layer)
            assert gdf.crs is not None
            assert gdf.crs.to_epsg() == 32719
