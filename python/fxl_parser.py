"""
fxl_parser.py
-------------
Responsabilidad: leer una biblioteca de características Trimble (.fxl, XML) que
aporta el usuario y extraer SOLO lo que el proyecto usa:

  - features: { CODIGO: {capa, color, tipo} } donde tipo ∈ {Punto, Línea abierta,
    Polilínea cerrada}; color en "#RRGGBB" o None; capa = nombre de capa o None.
  - control_roles: { código_de_campo(lower): rol } a partir de ControlCodeDefinitions.

No parsea símbolos, atributos, estilos de línea ni etiquetado (fuera de alcance).
El parseo es por observación de archivos reales (interoperabilidad); no se incluye
ningún esquema ni muestra de Trimble en el repo.
"""

import xml.etree.ElementTree as ET

# Literales de tipo (deben coincidir con field_codes.TIPO_*).
TIPO_PUNTO = "Punto"
TIPO_LINEA = "Línea abierta"
TIPO_POLIGONO = "Polilínea cerrada"

# ControlCodeDefinition Type → rol del proyecto (mismos literales que field_codes).
_TYPE_TO_ROLE = {
    "Start": "start",
    "End": "end",
    "Close": "close",
    "Join": "join",
    "Smooth": "smooth",
    "Arc": "arc",
    "StartArc": "arc",
    "Rectangle": "rect",
    "Circle": "circle",
}

_DEF_TIPO = {
    "PointFeatureDefinition": TIPO_PUNTO,
    "LineFeatureDefinition": TIPO_LINEA,
    "PolygonFeatureDefinition": TIPO_POLIGONO,
}


def _argb_to_hex(argb):
    """'FE000000' (ARGB) → '#000000'. Devuelve None si no es un hex de 8 dígitos."""
    if not argb or len(argb) != 8:
        return None
    try:
        int(argb, 16)
    except ValueError:
        return None
    return "#" + argb[2:].lower()


def _local(tag):
    """Quita el namespace de un tag: '{...}LineFeatureDefinition' → 'LineFeatureDefinition'."""
    return tag.split("}", 1)[-1]


def parse_fxl(xml_text: str) -> dict:
    """Parsea un FXL (XML) y devuelve {features, control_roles}.

    - features: { CODIGO: {capa, color, tipo} } (color "#RRGGBB" o None; un color
      ausente hereda el de la capa del feature como fallback).
    - control_roles: { código_de_campo(lower): rol } de los ControlCodeDefinitions.

    El emparejamiento es por nombre local (sin namespace), de modo que tolera
    FXL sin namespace o con un URI distinto. Lanza ValueError si el XML es inválido.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"FXL no es XML válido: {exc}") from exc

    # Una sola pasada por nombre local: las LayerDefinitions preceden a las
    # FeatureDefinitions en el esquema, así que el mapa capa→color (fallback de
    # color) ya está construido cuando los features lo consultan.
    layer_colors = {}
    features = {}
    control_roles = {}
    for el in root.iter():
        name = _local(el.tag)
        if name == "LayerDefinition":
            layer_name = el.get("Name")
            if layer_name:
                layer_colors[layer_name] = _argb_to_hex(el.get("Color"))
        elif name == "ControlCodeDefinition":
            code = el.get("Code")
            role = _TYPE_TO_ROLE.get(el.get("Type"))
            if code and role:
                control_roles[code.lower()] = role
        else:
            tipo = _DEF_TIPO.get(name)
            if tipo is None:
                continue
            code = el.get("Code")
            if not code:
                continue
            layer = el.get("Layer")
            capa = None if layer in (None, "", "0") else layer
            color = _argb_to_hex(el.get("Color"))
            if color is None and capa is not None:
                color = layer_colors.get(capa)
            features[code] = {"capa": capa, "color": color, "tipo": tipo}

    return {"features": features, "control_roles": control_roles}
