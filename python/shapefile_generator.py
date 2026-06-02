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
No se genera .prj porque no se conoce el sistema de referencia (las coordenadas
son UTM planas y el CRS se asigna al abrir en el SIG).

Atributos en .dbf: codigo, capa (y nombre solo en puntos).

Entrada : geometry (dict) — salida de geometry_builder
          feature_library (dict) — mapa de códigos
Salida  : ZIP codificado en base64 (string), para transportarlo por stdout.
"""

import base64
import io
import os
import tempfile
import zipfile


def _capa(feature_library: dict, codigo: str) -> str:
    return feature_library.get(codigo, {}).get("capa", codigo)


def generate_shapefile_zip_b64(geometry: dict, feature_library: dict, options: dict = None) -> str:
    # `options` se acepta por uniformidad de firma con los demás generadores;
    # el Shapefile guarda el nombre como campo en el .dbf, así que no aplica
    # ninguna opción de etiquetas.
    import shapefile

    points = geometry.get("points", [])
    lines = geometry.get("lines", [])
    polylines = geometry.get("polylines", [])

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

    return base64.b64encode(zip_buffer.getvalue()).decode("ascii")
