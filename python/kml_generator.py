"""
kml_generator.py
----------------
Responsabilidad: generar un KML a partir de la geometría procesada.

El KML es SIEMPRE WGS84 lon/lat: este generador recibe la geometría YA
reproyectada a grados (JS la reproyecta con reprojectGeometryToWGS84 antes de
cruzar el puente, igual que para GeoJSON). La Z viaja tal cual en las
coordenadas (lon,lat,z); sin altitudeMode explícito Google Earth la ignora al
dibujar (clampToGround) pero queda preservada en el archivo.

Mapeo de entidades:
  - puntos              → Placemark con Point (y <name> si include_labels)
  - líneas              → Placemark con LineString
  - polilíneas cerradas → Placemark con Polygon (anillo cerrado)

Un <Style> por código con el color de feature_library (KML usa aabbggrr).
Cada Placemark lleva codigo y capa en ExtendedData.

Entrada : geometry (dict) — salida de geometry_builder, reproyectada a WGS84
          feature_library (dict) — mapa de códigos
          options (dict|None) — include_labels (bool, def. True): emitir o no
            el <name> de los puntos.
Salida  : contenido KML como string XML.
"""

from xml.sax.saxutils import escape


def _kml_color(hex_color: str) -> str:
    """'#RRGGBB' → 'aabbggrr' KML (opaco). Blanco si el formato es inválido."""
    h = (hex_color or "").lstrip("#")
    if len(h) != 6:
        return "ffffffff"
    try:
        int(h, 16)
    except ValueError:
        return "ffffffff"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"ff{b}{g}{r}".lower()


def _style_id(codigo: str) -> str:
    """Id de estilo XML-safe derivado del código."""
    return "s_" + "".join(c if c.isalnum() else "_" for c in codigo)


def _coord(v) -> str:
    # KML exige lon,lat[,alt] sin espacios internos.
    return f"{v[0]},{v[1]},{v[2]}"


def _props_xml(feature_library: dict, codigo: str) -> str:
    capa = feature_library.get(codigo, {}).get("capa", codigo)
    return (
        "<ExtendedData>"
        f'<Data name="codigo"><value>{escape(codigo)}</value></Data>'
        f'<Data name="capa"><value>{escape(capa)}</value></Data>'
        "</ExtendedData>"
    )


def generate_kml(geometry: dict, feature_library: dict, options: dict = None) -> str:
    options = options or {}
    include_labels = options.get("include_labels", True)

    # Estilos: uno por código presente en la geometría (aunque no esté en la
    # biblioteca: cae al color blanco por defecto, igual que los demás formatos).
    codigos = []
    for pt in geometry.get("points", []):
        codigos.append(pt["codigo"])
    for ent in geometry.get("lines", []) + geometry.get("polylines", []):
        codigos.append(ent["codigo"])
    styles = []
    for codigo in dict.fromkeys(codigos):  # únicos, en orden de aparición
        color = _kml_color(feature_library.get(codigo, {}).get("color", "#ffffff"))
        fill = "7f" + color[2:]  # relleno al 50% de opacidad
        styles.append(
            f'<Style id="{_style_id(codigo)}">'
            f"<IconStyle><color>{color}</color></IconStyle>"
            f"<LineStyle><color>{color}</color><width>2</width></LineStyle>"
            f"<PolyStyle><color>{fill}</color></PolyStyle>"
            "</Style>"
        )

    placemarks = []

    for pt in geometry.get("points", []):
        name = (
            f"<name>{escape(pt['nombre'])}</name>"
            if include_labels and pt.get("nombre")
            else ""
        )
        placemarks.append(
            "<Placemark>"
            f"{name}"
            f"<styleUrl>#{_style_id(pt['codigo'])}</styleUrl>"
            f"{_props_xml(feature_library, pt['codigo'])}"
            f"<Point><coordinates>{_coord([pt['x'], pt['y'], pt['z']])}</coordinates></Point>"
            "</Placemark>"
        )

    for line in geometry.get("lines", []):
        coords = " ".join(_coord(v) for v in line["vertices"])
        placemarks.append(
            "<Placemark>"
            f"<styleUrl>#{_style_id(line['codigo'])}</styleUrl>"
            f"{_props_xml(feature_library, line['codigo'])}"
            f"<LineString><tessellate>1</tessellate><coordinates>{coords}</coordinates></LineString>"
            "</Placemark>"
        )

    for poly in geometry.get("polylines", []):
        ring = [list(v) for v in poly["vertices"]]
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        coords = " ".join(_coord(v) for v in ring)
        placemarks.append(
            "<Placemark>"
            f"<styleUrl>#{_style_id(poly['codigo'])}</styleUrl>"
            f"{_props_xml(feature_library, poly['codigo'])}"
            "<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing>"
            f"<coordinates>{coords}</coordinates>"
            "</LinearRing></outerBoundaryIs></Polygon>"
            "</Placemark>"
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2">'
        "<Document>"
        "<name>Point2CAD</name>"
        f"{''.join(styles)}"
        f"{''.join(placemarks)}"
        "</Document>"
        "</kml>"
    )
