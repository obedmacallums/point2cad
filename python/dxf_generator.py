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
  - etiquetas      → TEXT con el campo "nombre", en una capa separada
                     "<CAPA>_TEXT" (solo si options["include_labels"] es True)

Las etiquetas van en su propia capa para que se puedan apagar/contar aparte de
los puntos en el CAD (un punto con nombre genera 1 POINT + 1 TEXT).

Entrada : geometry (dict) — salida de geometry_builder
          feature_library (dict) — mapa de códigos
          options (dict|None) — preferencias de exportación. Claves usadas:
            include_labels (bool, def. True) → dibujar o no los TEXT de nombre.
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


def generate_dxf(geometry: dict, feature_library: dict, options: dict = None) -> str:
    import ezdxf

    options = options or {}
    include_labels = options.get("include_labels", True)

    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()

    def ensure_layer(name: str, color_hex: str):
        if name not in doc.layers:
            layer = doc.layers.new(name)
            layer.rgb = _hex_to_rgb(color_hex)

    # Una capa por código, con el color RGB real elegido por el usuario.
    # Las entidades heredan por BYLAYER, así que no se especifica color por entidad.
    for codigo, feature in feature_library.items():
        ensure_layer(feature.get("capa", codigo), feature.get("color", "#ffffff"))

    # Puntos
    for pt in geometry.get("points", []):
        feature = feature_library.get(pt["codigo"], {})
        capa = feature.get("capa", pt["codigo"])
        msp.add_point(
            (pt["x"], pt["y"], pt["z"]),
            dxfattribs={"layer": capa},
        )
        # Etiqueta solo si hay nombre y si el usuario las pidió. Va en una capa
        # "<CAPA>_TEXT" separada para poder apagarla/contarla aparte del punto.
        # (Los vértices de líneas exportados desde el viewer vienen sin nombre.)
        if include_labels and pt.get("nombre"):
            text_layer = f"{capa}_TEXT"
            ensure_layer(text_layer, feature.get("color", "#ffffff"))
            msp.add_text(
                pt["nombre"],
                dxfattribs={"layer": text_layer, "height": 0.5},
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
