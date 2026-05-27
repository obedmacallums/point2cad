"""
dxf_generator.py
----------------
Responsabilidad: generar un archivo DXF a partir de la geometría procesada.

Usa la librería ezdxf (disponible en Pyodide).
Para cada código crea una capa con el color recibido en feature_library.
Entidades generadas:
  - puntos         → INSERT de bloque punto o POINT
  - líneas         → POLYLINE 3D abierta (preserva Z por vértice)
  - polilíneas cerradas → POLYLINE 3D cerrada (preserva Z por vértice)
  - etiquetas      → TEXT con el campo "nombre" en la posición del punto

Entrada : geometry (dict) — salida de geometry_builder
          feature_library (dict) — mapa de códigos
Salida  : contenido DXF como string (se escribe con ezdxf a un buffer StringIO)
"""

import io


def _hex_to_rgb(hex_color: str):
    """Convierte '#RRGGBB' a tupla (r, g, b). Blanco si el formato es inválido."""
    h = (hex_color or "").lstrip("#")
    if len(h) != 6:
        return (255, 255, 255)
    try:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except ValueError:
        return (255, 255, 255)


def generate_dxf(geometry: dict, feature_library: dict) -> str:
    import ezdxf

    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()

    # Una capa por código, con el color RGB real elegido por el usuario.
    # Las entidades heredan por BYLAYER, así que no se especifica color por entidad.
    for codigo, feature in feature_library.items():
        capa = feature.get("capa", codigo)
        if capa not in doc.layers:
            layer = doc.layers.new(capa)
            layer.rgb = _hex_to_rgb(feature.get("color", "#ffffff"))

    # Puntos
    for pt in geometry.get("points", []):
        feature = feature_library.get(pt["codigo"], {})
        capa = feature.get("capa", pt["codigo"])
        msp.add_point(
            (pt["x"], pt["y"], pt["z"]),
            dxfattribs={"layer": capa},
        )
        # Etiqueta solo si hay nombre — los vértices de líneas exportados
        # desde el viewer 3D vienen sin nombre para no llenar el DXF de TEXT.
        if pt.get("nombre"):
            msp.add_text(
                pt["nombre"],
                dxfattribs={"layer": capa, "height": 0.5},
            ).set_placement((pt["x"], pt["y"], pt["z"]))

    # Líneas (POLYLINE 3D para preservar Z por vértice)
    for line in geometry.get("lines", []):
        feature = feature_library.get(line["codigo"], {})
        capa = feature.get("capa", line["codigo"])
        pts_3d = [(v[0], v[1], v[2]) for v in line["vertices"]]
        msp.add_polyline3d(pts_3d, dxfattribs={"layer": capa})

    # Polilíneas cerradas (POLYLINE 3D cerrada)
    for poly in geometry.get("polylines", []):
        feature = feature_library.get(poly["codigo"], {})
        capa = feature.get("capa", poly["codigo"])
        pts_3d = [(v[0], v[1], v[2]) for v in poly["vertices"]]
        msp.add_polyline3d(pts_3d, close=True, dxfattribs={"layer": capa})

    buffer = io.StringIO()
    doc.write(buffer)
    return buffer.getvalue()
