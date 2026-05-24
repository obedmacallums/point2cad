"""
geometry_builder.py
-------------------
Construye puntos / líneas / polilíneas a partir de los puntos parseados,
interpretando los códigos según parse_field_code (csv_parser.py).

Soporta el formato Trimble Access:
  - Stringing: cada (código_base, string_number) es una cadena independiente,
    permitiendo cadenas paralelas del mismo tipo abiertas en simultáneo.
    Ej: EP1 ST … EP1 EN puede correr en paralelo con EP2 ST … EP2 EN.
  - Control codes: ST (start), EN (end), CL (close), JN/CO (join/continue),
    RE/CI/SM/TA/NTA (avanzados → tratados como inicio de línea simple).

Devuelve:
  {
    "points":    [{nombre, x, y, z, codigo}, ...],
    "lines":     [{codigo, vertices: [[x,y,z], ...]}, ...],
    "polylines": [{codigo, vertices: [[x,y,z], ...]}, ...],
  }

Las claves "codigo" en la salida son SIEMPRE el código base (sin string number),
de modo que el lookup contra feature_library funciona uniformemente.
"""


def build_geometry(points: list[dict], feature_library: dict) -> dict:
    # parse_field_code, LINE_OPEN_MARKERS, END_MARKERS, CLOSE_MARKERS, JOIN_MARKERS
    # vienen del módulo csv_parser inyectado antes en el mismo namespace.

    result: dict[str, list] = {"points": [], "lines": [], "polylines": []}

    # active[(base, string_num)] = lista de puntos acumulados
    active: dict[tuple[str, str], list[dict]] = {}

    def flush_as_line(key, seq):
        if len(seq) >= 2:
            base = key[0]
            vertices = [[p["x"], p["y"], p["z"]] for p in seq]
            result["lines"].append({"codigo": base, "vertices": vertices})
        elif len(seq) == 1:
            result["points"].append(seq[0])

    for pt in points:
        parsed = parse_field_code(pt["codigo"])
        base = parsed["base"]
        if not base:
            continue
        string_num = parsed["string"]
        modifier = parsed["modifier"]
        key = (base, string_num)
        # En la salida el código nunca lleva el string number
        pt_norm = {**pt, "codigo": base}

        is_open = modifier in LINE_OPEN_MARKERS
        is_end = modifier in END_MARKERS
        is_close = modifier in CLOSE_MARKERS
        is_join = modifier in JOIN_MARKERS

        if is_open:
            # Si había una secuencia previa con la misma key, ciérrala como línea
            if key in active:
                flush_as_line(key, active.pop(key))
            active[key] = [pt_norm]

        elif is_end:
            if key in active:
                seq = active.pop(key)
                seq.append(pt_norm)
                vertices = [[p["x"], p["y"], p["z"]] for p in seq]
                result["lines"].append({"codigo": base, "vertices": vertices})
            else:
                result["points"].append(pt_norm)

        elif is_close:
            if key in active:
                seq = active.pop(key)
                seq.append(pt_norm)
                vertices = [[p["x"], p["y"], p["z"]] for p in seq]
                result["polylines"].append({"codigo": base, "vertices": vertices})
            else:
                # CLOSE sin sequence: tratar como punto
                result["points"].append(pt_norm)

        elif is_join:
            # Une al final de la cadena activa, o inicia una nueva si no existe
            if key in active:
                active[key].append(pt_norm)
            else:
                active[key] = [pt_norm]

        elif modifier is None:
            if key in active:
                # Punto intermedio de una cadena activa
                active[key].append(pt_norm)
            elif string_num:
                # Hay string number pero no hay cadena activa → la abre
                # (convención Trimble: el primer punto de "EP1" abre EP string 1)
                active[key] = [pt_norm]
            else:
                # Sin string, sin modifier → punto independiente
                result["points"].append(pt_norm)

        else:
            # Modifier desconocido: lo tratamos como punto
            result["points"].append(pt_norm)

    # Cadenas que nunca se cerraron explícitamente: se publican como líneas
    for key, seq in active.items():
        flush_as_line(key, seq)

    return result
