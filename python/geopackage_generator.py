"""
geopackage_generator.py
-----------------------
Responsabilidad: generar un archivo GeoPackage (.gpkg) a partir de la geometría
procesada, usando geopandas/fiona (disponibles en Pyodide tras loadPackage).

Un GeoPackage admite varias capas en un solo archivo, así que se crea una capa
por tipo de geometría presente (conservando Z, como el DXF/Shapefile 3D):
  - puntos              → capa "points"   (PointZ)
  - líneas              → capa "lines"    (LineStringZ)
  - polilíneas cerradas → capa "polygons" (PolygonZ)

CRS: si `options["epsg"]` trae el código EPSG de la zona UTM (procesamiento de
coordenadas geodésicas, calculado en JS), se asigna a las capas con
`crs="EPSG:<código>"`, quedando guardado dentro del .gpkg. Sin EPSG (coordenadas
proyectadas/planas) GDAL marcaría las capas como SRS geográfico indefinido, lo que
hace que el GIS intercambie los ejes; por eso se normaliza a "Undefined Cartesian
SRS" (srs_id -1) para que se traten como planas y el sistema se defina al abrir.

Atributos: codigo, capa (y nombre solo en puntos). El atributo color se excluye
intencionalmente para mantener uniformidad con el generador de Shapefile.

Entrada : geometry (dict) — salida de geometry_builder
          feature_library (dict) — mapa de códigos
          options (dict|None) — {epsg?: int} (EPSG de la zona UTM, opcional)
Salida  : .gpkg codificado en base64 (string), para transportarlo por stdout.
"""

import base64
import os
import sqlite3
import tempfile

import geopandas as gpd
from shapely.geometry import LineString, Point, Polygon


def _capa(feature_library: dict, codigo: str) -> str:
    return feature_library.get(codigo, {}).get("capa", codigo)


def _force_cartesian_srs(path: str) -> None:
    """Sin EPSG, GDAL deja las capas con un SRS "indefinido geográfico" (srs_id 0)
    o "GDAL Undefined SRS" (srs_id 99999, según versión). Si es geográfico, el GIS
    receptor aplica el orden de ejes lat/lon e intercambia Este/Norte, invirtiendo
    las coordenadas planas. Reasignamos srs_id -1 = "Undefined Cartesian SRS" (fila
    estándar del GeoPackage) para que se traten como planas sin reproyección, igual
    que un Shapefile sin .prj (el GIS les aplica el CRS del proyecto)."""
    con = sqlite3.connect(path)
    try:
        # La fila -1 es obligatoria en el estándar y GDAL la crea; la aseguramos por si acaso.
        con.execute(
            "INSERT OR IGNORE INTO gpkg_spatial_ref_sys "
            "(srs_name, srs_id, organization, organization_coordsys_id, definition) "
            "VALUES ('Undefined Cartesian SRS', -1, 'NONE', -1, 'undefined')"
        )
        con.execute("UPDATE gpkg_contents SET srs_id = -1 WHERE srs_id IN (0, 99999)")
        con.execute("UPDATE gpkg_geometry_columns SET srs_id = -1 WHERE srs_id IN (0, 99999)")
        con.commit()
    finally:
        con.close()


def _closed_ring(poly: dict):
    ring = [(v[0], v[1], v[2]) for v in poly["vertices"]]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def generate_geopackage_b64(geometry: dict, feature_library: dict, options: dict = None) -> str:
    points = geometry.get("points", [])
    lines = geometry.get("lines", [])
    polylines = geometry.get("polylines", [])

    # A diferencia de los otros generadores (que emiten un archivo vacío), un
    # GeoPackage requiere al menos una capa: geopandas no puede crear un .gpkg
    # sin features. La UI ya impide llegar aquí sin geometría (botón deshabilitado).
    if not points and not lines and not polylines:
        raise ValueError("geometry contains no features to export")

    epsg = (options or {}).get("epsg")
    crs = f"EPSG:{int(epsg)}" if epsg else None

    workdir = tempfile.mkdtemp()
    path = os.path.join(workdir, "export.gpkg")

    if points:
        gdf = gpd.GeoDataFrame(
            {
                "codigo": [p["codigo"] for p in points],
                "capa": [_capa(feature_library, p["codigo"]) for p in points],
                "nombre": [p.get("nombre", "") for p in points],
            },
            geometry=[Point(p["x"], p["y"], p["z"]) for p in points],
            crs=crs,
        )
        gdf.to_file(path, layer="points", driver="GPKG")

    if lines:
        gdf = gpd.GeoDataFrame(
            {
                "codigo": [line["codigo"] for line in lines],
                "capa": [_capa(feature_library, line["codigo"]) for line in lines],
            },
            geometry=[
                LineString([(v[0], v[1], v[2]) for v in line["vertices"]]) for line in lines
            ],
            crs=crs,
        )
        gdf.to_file(path, layer="lines", driver="GPKG")

    if polylines:
        gdf = gpd.GeoDataFrame(
            {
                "codigo": [p["codigo"] for p in polylines],
                "capa": [_capa(feature_library, p["codigo"]) for p in polylines],
            },
            geometry=[Polygon(_closed_ring(p)) for p in polylines],
            crs=crs,
        )
        gdf.to_file(path, layer="polygons", driver="GPKG")

    # Sin EPSG (coordenadas proyectadas/planas), normalizamos el SRS indefinido
    # a cartesiano para que el GIS no intercambie ejes al importar.
    if not crs:
        _force_cartesian_srs(path)

    with open(path, "rb") as f:
        data = f.read()
    return base64.b64encode(data).decode("ascii")
