"""
shapefile_generator.py
-----------------------
Responsabilidad: generar un conjunto de Shapefiles a partir de la geometría
procesada y empaquetarlos en un ZIP.

Usa la librería pyshp (módulo `shapefile`, instalado vía micropip) y la stdlib
(`os`, `tempfile`, `zipfile`, `base64`).

Un archivo .shp solo admite un tipo de geometría, así que se genera un shapefile
por tipo presente (conservando Z, como el DXF 3D):
  - puntos              → points.*   (POINTZ)
  - líneas              → lines.*    (POLYLINEZ)
  - polilíneas cerradas → polygons.* (POLYGONZ)

Se escribe a rutas reales en el sistema de archivos virtual de Pyodide (uso
canónico de pyshp) y luego se leen los .shp/.shx/.dbf para meterlos en un ZIP.

CRS: si `options["epsg"]` trae el código EPSG de la zona UTM (procesamiento de
coordenadas geodésicas, calculado en JS), se escribe un .prj por shapefile con el
WKT correspondiente, de modo que el SIG reconozca la georreferencia. Sin EPSG
(coordenadas proyectadas/planas) no se genera .prj y el CRS se asigna al abrir.

Atributos en .dbf: codigo, capa (y nombre solo en puntos).

Entrada : geometry (dict) — salida de geometry_builder
          feature_library (dict) — mapa de códigos
          options (dict|None) — {epsg?: int} (EPSG de la zona UTM, opcional)
Salida  : ZIP codificado en base64 (string), para transportarlo por stdout.
"""

import base64
import io
import os
import tempfile
import zipfile


def _capa(feature_library: dict, codigo: str) -> str:
    return feature_library.get(codigo, {}).get("capa", codigo)


def utm_wkt_from_epsg(epsg) -> str | None:
    """WKT1 (OGC) de un CRS WGS84/UTM a partir de su EPSG.

    Solo cubre la familia que produce esta app: WGS 84 / UTM zona N (326xx) y
    zona S (327xx). Para cualquier otro EPSG devuelve None (no se escribe .prj).
    Se construye con plantilla en Python puro para no arrastrar pyproj a esta
    ruta de exportación (que solo necesita pyshp).
    """
    if epsg is None:
        return None
    try:
        code = int(epsg)
    except (TypeError, ValueError):
        return None

    if 32601 <= code <= 32660:
        zone, hemisphere, false_northing = code - 32600, "N", 0
    elif 32701 <= code <= 32760:
        zone, hemisphere, false_northing = code - 32700, "S", 10000000
    else:
        return None

    central_meridian = zone * 6 - 183
    return (
        f'PROJCS["WGS 84 / UTM zone {zone}{hemisphere}",'
        'GEOGCS["WGS 84",DATUM["WGS_1984",'
        'SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],'
        'AUTHORITY["EPSG","6326"]],'
        'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],'
        'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],'
        'AUTHORITY["EPSG","4326"]],'
        'PROJECTION["Transverse_Mercator"],'
        'PARAMETER["latitude_of_origin",0],'
        f'PARAMETER["central_meridian",{central_meridian}],'
        'PARAMETER["scale_factor",0.9996],'
        'PARAMETER["false_easting",500000],'
        f'PARAMETER["false_northing",{false_northing}],'
        'UNIT["metre",1,AUTHORITY["EPSG","9001"]],'
        'AXIS["Easting",EAST],AXIS["Northing",NORTH],'
        f'AUTHORITY["EPSG","{code}"]]'
    )


def generate_shapefile_zip_b64(geometry: dict, feature_library: dict, options: dict = None) -> str:
    # `options` se acepta por uniformidad de firma con los demás generadores;
    # el Shapefile guarda el nombre como campo en el .dbf, así que no aplica
    # ninguna opción de etiquetas.
    import shapefile

    points = geometry.get("points", [])
    lines = geometry.get("lines", [])
    polylines = geometry.get("polylines", [])

    prj_wkt = utm_wkt_from_epsg((options or {}).get("epsg"))

    workdir = tempfile.mkdtemp()
    base_names = []

    if points:
        base = os.path.join(workdir, "points")
        w = shapefile.Writer(base, shapeType=shapefile.POINTZ)
        w.field("codigo", "C", 40)
        w.field("capa", "C", 40)
        w.field("nombre", "C", 60)
        for pt in points:
            w.pointz(pt["x"], pt["y"], pt["z"])
            w.record(
                pt["codigo"],
                _capa(feature_library, pt["codigo"]),
                pt.get("nombre", ""),
            )
        w.close()
        base_names.append(("points", base))

    if lines:
        base = os.path.join(workdir, "lines")
        w = shapefile.Writer(base, shapeType=shapefile.POLYLINEZ)
        w.field("codigo", "C", 40)
        w.field("capa", "C", 40)
        for line in lines:
            w.linez([[[v[0], v[1], v[2]] for v in line["vertices"]]])
            w.record(line["codigo"], _capa(feature_library, line["codigo"]))
        w.close()
        base_names.append(("lines", base))

    if polylines:
        base = os.path.join(workdir, "polygons")
        w = shapefile.Writer(base, shapeType=shapefile.POLYGONZ)
        w.field("codigo", "C", 40)
        w.field("capa", "C", 40)
        for poly in polylines:
            ring = [[v[0], v[1], v[2]] for v in poly["vertices"]]
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])
            w.polyz([ring])
            w.record(poly["codigo"], _capa(feature_library, poly["codigo"]))
        w.close()
        base_names.append(("polygons", base))

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, base in base_names:
            for ext in (".shp", ".shx", ".dbf"):
                path = base + ext
                if os.path.exists(path):
                    with open(path, "rb") as f:
                        zf.writestr(name + ext, f.read())
            # .prj sidecar con el CRS, solo si hay EPSG de zona UTM.
            if prj_wkt:
                zf.writestr(name + ".prj", prj_wkt)

    return base64.b64encode(zip_buffer.getvalue()).decode("ascii")
