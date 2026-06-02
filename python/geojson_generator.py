"""
geojson_generator.py
--------------------
Responsabilidad: generar un FeatureCollection GeoJSON a partir de la geometría
procesada.

Conserva las coordenadas tal cual (UTM planas, con Z por vértice). No reproyecta:
el sistema de referencia se asigna al abrir el archivo en el SIG.

Mapeo de entidades:
  - puntos              → Point      [x, y, z]
  - líneas              → LineString [[x, y, z], ...]
  - polilíneas cerradas → Polygon    [[[x, y, z], ... , primer_vértice]]

Cada feature lleva en "properties": codigo, capa y color (desde feature_library);
los puntos añaden además "nombre".

Entrada : geometry (dict) — salida de geometry_builder
          feature_library (dict) — mapa de códigos
Salida  : contenido GeoJSON como string JSON.
"""

import json


def _props(feature_library: dict, codigo: str, extra: dict = None) -> dict:
    feature = feature_library.get(codigo, {})
    props = {
        "codigo": codigo,
        "capa": feature.get("capa", codigo),
        "color": feature.get("color", "#ffffff"),
    }
    if extra:
        props.update(extra)
    return props


def generate_geojson(geometry: dict, feature_library: dict, options: dict = None) -> str:
    # `options` se acepta por uniformidad de firma con los demás generadores;
    # GeoJSON guarda el nombre como atributo en properties, así que no aplica
    # ninguna opción de etiquetas.
    features = []

    # Puntos
    for pt in geometry.get("points", []):
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [pt["x"], pt["y"], pt["z"]],
            },
            "properties": _props(
                feature_library, pt["codigo"], {"nombre": pt.get("nombre", "")}
            ),
        })

    # Líneas → LineString
    for line in geometry.get("lines", []):
        coords = [[v[0], v[1], v[2]] for v in line["vertices"]]
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": _props(feature_library, line["codigo"]),
        })

    # Polilíneas cerradas → Polygon (anillo cerrado: repetir el primer vértice)
    for poly in geometry.get("polylines", []):
        ring = [[v[0], v[1], v[2]] for v in poly["vertices"]]
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": _props(feature_library, poly["codigo"]),
        })

    collection = {"type": "FeatureCollection", "features": features}
    return json.dumps(collection)
