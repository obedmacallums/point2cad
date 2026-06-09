"""
geometry_builder.py
-------------------
Construye puntos / líneas / polilíneas a partir de los puntos parseados,
interpretando los códigos con el dialecto detectado (field_codes.py).

Soporta el formato Trimble Access:
  - Stringing: cada (código_base, string_number) es una cadena independiente,
    permitiendo cadenas paralelas del mismo tipo abiertas en simultáneo.
    Ej: EP1 ST … EP1 EN puede correr en paralelo con EP2 ST … EP2 EN.
  - Control codes: ST (start), EN (end), CL (close), JN/CO (join/continue).
  - Primitivas avanzadas (círculo, arco, rectángulo, curva suave): se
    **densifican** a polilíneas/polígonos (shapes.py). El modelo de salida son
    SIEMPRE las tres entidades: punto, línea abierta y polígono (línea cerrada).
    Un círculo → polígono con forma de círculo; un arco → línea densificada; etc.

Devuelve:
  {
    "points":    [{nombre, x, y, z, codigo}, ...],
    "lines":     [{codigo, vertices: [[x,y,z], ...], vertex_names: [str, ...]}, ...],
    "polylines": [{codigo, vertices: [[x,y,z], ...], vertex_names: [str, ...]}, ...],
  }

vertex_names guarda el nombre original del punto CSV en cada vértice (mismo
índice que vertices). En geometrías densificadas (círculo/arco/…) no hay
correspondencia 1:1, así que se rellena con cadenas vacías.

Las claves "codigo" en la salida son SIEMPRE el código base (sin string number),
de modo que el lookup contra feature_library funciona uniformemente.

Dependencias inyectadas por el namespace concatenado en Pyodide:
  - detect_dialect, linear_code_set (field_codes.py)
  - circle_from_3_points, circle_from_center_radius, arc_from_3_points,
    rectangle, smooth_curve (shapes.py)
"""


def build_geometry(points: list[dict], feature_library: dict,
                   control_overrides=None, dialect=None,
                   fxl_roles=None, fxl_types=None) -> dict:
    if dialect is None:
        dialect = detect_dialect(points)

    # Modelo de roles de control code aprendido del CSV (estructura + léxico +
    # geometría), con prioridad a los overrides del usuario (UI) y luego al FXL.
    model = dialect.fit(points, control_overrides, fxl_roles)

    # Códigos que son línea/polígono (misma clasificación que detect_codes). En
    # Trimble Access el linework se auto-conecta por código consecutivo: el
    # primer punto de un código lineal abre la cadena implícitamente, sin
    # necesidad de un control code de inicio; solo el fin/cierre es explícito.
    # `closed_codes` son los códigos cuyo tipo FXL es polígono: se cierran como
    # polilínea aunque no haya control code de cierre explícito en los datos.
    linear_codes = linear_code_set(points, dialect, model=model, fxl_types=fxl_types)
    closed_codes = closed_code_set(points, dialect, model=model, fxl_types=fxl_types)

    result: dict[str, list] = {"points": [], "lines": [], "polylines": []}

    # active[(base, string_num)] = {"pts": [...], "shape": str|None, "params": [...]}
    active: dict[tuple, dict] = {}

    def emit_line(base, vertices, names):
        result["lines"].append(
            {"codigo": base, "vertices": vertices, "vertex_names": names}
        )

    def emit_poly(base, vertices, names):
        result["polylines"].append(
            {"codigo": base, "vertices": vertices, "vertex_names": names}
        )

    def finalize(key, struct, closing):
        """Cierra una cadena. `closing` ∈ {"end", "close", None}.
        Densifica si la cadena tiene una primitiva avanzada; si no, usa los
        vértices crudos. Si no se puede densificar, cae con seguridad a los
        vértices crudos."""
        base = key[0]
        seq = struct["pts"]
        shape = struct["shape"]
        params = struct["params"]
        pts3 = [[p["x"], p["y"], p["z"]] for p in seq]
        names = [p["nombre"] for p in seq]

        dens = None
        forced = None  # "line" → siempre abierta, "poly" → siempre cerrada
        if shape == "circle":
            forced = "poly"
            if len(pts3) >= 3:
                dens = circle_from_3_points(pts3[0], pts3[len(pts3) // 2], pts3[-1])
            elif len(pts3) >= 1 and params:
                dens = circle_from_center_radius(pts3[0], params[0])
        elif shape == "arc":
            forced = "line"
            if len(pts3) >= 3:
                dens = arc_from_3_points(pts3[0], pts3[len(pts3) // 2], pts3[-1])
        elif shape == "rect":
            forced = "poly"
            if len(pts3) >= 2 and params:
                dens = rectangle(pts3[0], pts3[1], params[0])
        elif shape == "smooth":
            if len(pts3) >= 3:
                dens = smooth_curve(pts3)

        if dens:
            dnames = [""] * len(dens)
            to_poly = (
                forced == "poly"
                or (forced is None and closing == "close")
                or (forced is None and closing is None and base in closed_codes)
            )
            (emit_poly if to_poly else emit_line)(base, dens, dnames)
            return

        # Sin densificar: vértices crudos. Si la primitiva forzaba un tipo de
        # cierre (círculo/rect → cerrado, arco → abierto), se respeta aunque la
        # densificación no haya sido posible.
        if len(pts3) >= 2:
            to_poly = (
                forced == "poly"
                or (forced != "line" and closing == "close")
                or (forced != "line" and closing is None and base in closed_codes)
            )
            (emit_poly if to_poly else emit_line)(base, pts3, names)
        elif len(pts3) == 1:
            result["points"].append(seq[0])

    for pt in points:
        parsed = dialect.parse_field_code(pt["codigo"])
        base = parsed["base"]
        if not base:
            continue
        string_num = parsed["string"]
        modifier = parsed["modifier"]
        shape = model.shape_of(modifier)
        params = parsed["params"]
        key = (base, string_num)
        # En la salida el código nunca lleva el string number
        pt_norm = {**pt, "codigo": base}

        is_open = model.is_open(modifier)
        is_end = model.is_end(modifier)
        is_close = model.is_close(modifier)
        is_join = model.is_join(modifier)

        if is_open:
            # Si había una secuencia previa con la misma key, ciérrala
            if key in active:
                finalize(key, active.pop(key), None)
            active[key] = {"pts": [pt_norm], "shape": shape, "params": list(params)}

        elif is_end:
            if key in active:
                struct = active.pop(key)
                struct["pts"].append(pt_norm)
                struct["params"].extend(params)
                finalize(key, struct, "end")
            else:
                result["points"].append(pt_norm)

        elif is_close:
            if key in active:
                struct = active.pop(key)
                struct["pts"].append(pt_norm)
                struct["params"].extend(params)
                finalize(key, struct, "close")
            else:
                # CLOSE sin sequence: tratar como punto
                result["points"].append(pt_norm)

        elif is_join:
            # Une al final de la cadena activa, o inicia una nueva si no existe
            if key in active:
                active[key]["pts"].append(pt_norm)
                active[key]["params"].extend(params)
            else:
                active[key] = {"pts": [pt_norm], "shape": shape, "params": list(params)}

        elif modifier is None:
            if key in active:
                # Punto intermedio de una cadena activa
                active[key]["pts"].append(pt_norm)
            elif string_num:
                # Hay string number pero no hay cadena activa → la abre
                # (convención Trimble: el primer punto de "EP1" abre EP string 1)
                active[key] = {"pts": [pt_norm], "shape": None, "params": []}
            elif base in linear_codes:
                # Código de tipo línea/polígono sin marcador de inicio: abre la
                # cadena por auto-conexión (linework implícito de Trimble Access)
                active[key] = {"pts": [pt_norm], "shape": None, "params": []}
            else:
                # Sin string, sin modifier, código de punto → punto independiente
                result["points"].append(pt_norm)

        else:
            # Modifier desconocido: lo tratamos como punto
            result["points"].append(pt_norm)

    # Cadenas que nunca se cerraron explícitamente: se publican como geometría
    for key, struct in active.items():
        finalize(key, struct, None)

    return result
