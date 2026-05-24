"""
csv_parser.py
-------------
Responsabilidad: leer el texto de un CSV y devolver una lista de dicts, y
detectar/clasificar los códigos de campo (estilo Trimble Access).

Columnas requeridas: nombre, x, y, z, codigo

Convención de códigos soportada (compatible con Trimble Access / TBC):
  - Código simple: "ARBOL"               → punto
  - Línea: "CERCA ST" ... "CERCA EN"     → línea abierta
  - Polígono: "BORDE ST" ... "BORDE CL"  → polilínea cerrada
  - Stringing (numbered): "EP1", "EP2"   → varias líneas paralelas del mismo
    tipo, cada string number es una cadena independiente
  - Multi-código: solo se interpreta el primer token + control code; tokens
    extra se ignoran (no se soporta multi-code por ahora)
"""

import csv
import io
import re


# --- Control codes (estilo Trimble Access GlobalFeatures.fxl) ---

# Inicio de línea / polígono
START_MARKERS = {"start", "st", "i", "ini", "inicio"}
# Fin → cierra como línea abierta
END_MARKERS = {"end", "en", "e", "fin", "f"}
# Cierre → cierra como polígono (LWPOLYLINE closed)
CLOSE_MARKERS = {"close", "cl", "c", "cerrar", "closed"}
# Continuar la cadena (join). En Trimble: une al último punto de la cadena activa
JOIN_MARKERS = {"jn", "join", "co", "cont", "continue", "cn"}

# Marcadores avanzados Trimble: rectángulos, círculos, curvas, arcos.
# Por ahora se tratan como "inicio de línea" (geometría simple). La
# generación DXF avanzada (arcos reales, círculos) queda fuera del MVP.
RECT_MARKERS = {"re", "rect", "rectangle"}
CIRCLE_MARKERS = {"ci", "cc", "circle"}
SMOOTH_MARKERS = {"sm", "smooth"}
ARC_MARKERS = {"ta", "nta", "eta", "ena", "arc"}

# Cualquier marcador que abre/define una línea (start o equivalentes)
LINE_OPEN_MARKERS = START_MARKERS | RECT_MARKERS | CIRCLE_MARKERS | SMOOTH_MARKERS | ARC_MARKERS

# Patrón: separa código base (letras/_/-) de string number final (dígitos)
# "EP12" → ("EP", "12"), "EP" → ("EP", ""), "CL3-A" → ("CL3-A", "")
_BASE_AND_STRING = re.compile(r"^([A-Z][A-Z_\-]*?)(\d+)$")


def parse_csv(csv_text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(csv_text.strip()))

    required = {"nombre", "x", "y", "z", "codigo"}
    if not required.issubset({k.lower() for k in (reader.fieldnames or [])}):
        missing = required - {k.lower() for k in (reader.fieldnames or [])}
        raise ValueError(f"Columnas faltantes en el CSV: {missing}")

    points = []
    for row in reader:
        row_lower = {k.lower(): v for k, v in row.items()}
        points.append(
            {
                "nombre": row_lower["nombre"].strip(),
                "x": float(row_lower["x"]),
                "y": float(row_lower["y"]),
                "z": float(row_lower["z"]),
                "codigo": row_lower["codigo"].strip().upper(),
            }
        )

    return points


def _split_base_string(token: str) -> tuple[str, str]:
    """'EP12' → ('EP', '12'). 'EP' → ('EP', '')."""
    t = token.upper()
    m = _BASE_AND_STRING.match(t)
    if m:
        return m.group(1), m.group(2)
    return t, ""


def parse_field_code(codigo: str) -> dict:
    """Devuelve {base, string, modifier} para un código de campo.

    Ejemplos:
      'CERCA1 ST' → {'base': 'CERCA', 'string': '1', 'modifier': 'st'}
      'CERCA'     → {'base': 'CERCA', 'string': '',  'modifier': None}
      'EP2'       → {'base': 'EP',    'string': '2', 'modifier': None}
      ''          → {'base': '',      'string': '',  'modifier': None}
    """
    raw = (codigo or "").strip()
    if not raw:
        return {"base": "", "string": "", "modifier": None}
    parts = raw.split()
    base, string_num = _split_base_string(parts[0])
    modifier = parts[1].lower() if len(parts) > 1 else None
    return {"base": base, "string": string_num, "modifier": modifier}


def detect_codes(points: list[dict]) -> list[dict]:
    """Agrupa los puntos por código base (sin string number) y clasifica.

    Regla de tipo:
      - algún registro con CLOSE_MARKERS → "Polilínea cerrada"
      - algún registro con marcador que abre/cierra línea, o presencia de
        string numbers (cadenas múltiples) → "Línea abierta"
      - en otro caso → "Punto"

    Devuelve [{codigo, cantidad, tipo, cadenas}] con `cadenas` = nº de string
    numbers únicos detectados (0 si no hay).
    """
    info = {}
    order = []

    for pt in points:
        parsed = parse_field_code(pt.get("codigo") or "")
        base = parsed["base"]
        if not base:
            continue
        modifier = parsed["modifier"]

        if base not in info:
            info[base] = {"count": 0, "is_line": False, "is_closed": False, "strings": set()}
            order.append(base)

        i = info[base]
        i["count"] += 1
        if parsed["string"]:
            i["strings"].add(parsed["string"])

        if modifier in CLOSE_MARKERS:
            i["is_closed"] = True
        elif modifier in LINE_OPEN_MARKERS or modifier in END_MARKERS or modifier in JOIN_MARKERS:
            i["is_line"] = True
        elif parsed["string"]:
            # Códigos con string number suelen ser líneas (convención Trimble)
            i["is_line"] = True

    result = []
    for base in order:
        i = info[base]
        if i["is_closed"]:
            tipo = "Polilínea cerrada"
        elif i["is_line"]:
            tipo = "Línea abierta"
        else:
            tipo = "Punto"
        result.append({
            "codigo": base,
            "cantidad": i["count"],
            "tipo": tipo,
            "cadenas": len(i["strings"]),
        })

    return result
