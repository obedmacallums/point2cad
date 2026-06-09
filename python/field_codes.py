"""
field_codes.py
--------------
Responsabilidad: interpretar el campo `codigo` del CSV — separar el código base,
el string number y los control codes — y clasificar cada código como punto,
línea o polígono.

Idea central (esta es la parte importante): los nombres de los control codes
(inicio/fin/cerrar/…) son CONFIGURABLES en el FXL y **no tenemos el FXL**, solo
el CSV. Por eso NO se reconocen por listas fijas de palabras, sino que se
**aprenden del propio CSV** combinando tres señales, en este orden de prioridad:

  1. Override del usuario (desde la UI) — máxima prioridad.
  2. Léxico de alias conocidos (`KNOWN_ALIASES`) — refuerzo de alta confianza,
     multilingüe y ampliable.
  3. Estructura + geometría:
       - estructura: el primer token del Code es el feature; los tokens en
         posición ≥2 (no numéricos) son control codes. Un feature es "lineal" si
         alguna de sus apariciones lleva un control code → robusto ante nombres
         exóticos, sin depender del léxico.
       - geometría: para un terminal desconocido, si las cadenas que cierra
         vuelven cerca de su inicio (ratio dist(primero,último)/longitud bajo) →
         es un cierre (polígono); si no → fin de línea.

`dialect.fit(points, overrides)` produce un `ControlCodeModel` (token→rol) que
consumen `classify_codes`, `detect_codes` y `build_geometry`, de modo que las
tres etapas nunca diverjan. Los colores/capas NO se asignan aquí (eso sigue en
JS, `assignColors`).
"""

import math
import re
import statistics


# --- Tipos de geometría de salida (literales que consume la UI) -------------
TIPO_PUNTO = "Punto"
TIPO_LINEA = "Línea abierta"
TIPO_POLIGONO = "Polilínea cerrada"

# --- Roles de control code --------------------------------------------------
ROLE_START = "start"
ROLE_END = "end"
ROLE_CLOSE = "close"
ROLE_JOIN = "join"
ROLE_CIRCLE = "circle"
ROLE_ARC = "arc"
ROLE_RECT = "rect"
ROLE_SMOOTH = "smooth"

# Roles que abren/definen una cadena (linework)
_OPEN_ROLES = {ROLE_START, ROLE_CIRCLE, ROLE_ARC, ROLE_RECT, ROLE_SMOOTH}
# Roles cuya forma es intrínsecamente cerrada (polígono)
_CLOSED_SHAPE_ROLES = {ROLE_CLOSE, ROLE_CIRCLE, ROLE_RECT}
_SHAPE_ROLES = {ROLE_CIRCLE, ROLE_ARC, ROLE_RECT, ROLE_SMOOTH}


def _is_number(token: str) -> bool:
    try:
        float(token)
        return True
    except ValueError:
        return False


class ControlCodeModel:
    """Mapa token→rol aprendido de un CSV, más metadatos por token para la UI."""

    def __init__(self, roles: dict, meta: dict):
        self.roles = roles  # token(lower) -> rol
        self.meta = meta    # token(lower) -> {source, ratio, count}

    def role(self, token):
        if not token:
            return None
        return self.roles.get(token.lower())

    def shape_of(self, token):
        """Forma geométrica para densificar (shapes.py), o 'line'/None."""
        r = self.role(token)
        if r in _SHAPE_ROLES:
            return r
        if r == ROLE_START:
            return "line"
        return None

    def is_open(self, token):
        return self.role(token) in _OPEN_ROLES

    def is_end(self, token):
        return self.role(token) == ROLE_END

    def is_close(self, token):
        return self.role(token) == ROLE_CLOSE

    def is_join(self, token):
        return self.role(token) == ROLE_JOIN

    def is_closed_shape(self, token):
        """True si el rol produce un polígono (close/circle/rect)."""
        return self.role(token) in _CLOSED_SHAPE_ROLES


class CodingDialect:
    """Interfaz común de un dialecto de codificación de campo.

    `parse_field_code` es puramente sintáctico (separa tokens). La semántica
    (qué rol tiene cada control code) la produce `fit`, que aprende del CSV.
    """

    name = "generic"

    # Léxico de alias conocidos (subclases lo rellenan). rol -> [alias...]
    KNOWN_ALIASES: dict = {}

    # Umbral del ratio de cierre para distinguir polígono (cierra) de línea.
    CLOSE_RATIO_THRESHOLD = 0.5

    # Regex base/string number; subclases pueden sobreescribirlo
    _BASE_AND_STRING = re.compile(r"^([A-Z][A-Z_\-]*?)(\d+)$")

    def __init__(self):
        # token(lower) -> rol, derivado de KNOWN_ALIASES
        self._lexicon = {}
        for role, aliases in self.KNOWN_ALIASES.items():
            for a in aliases:
                self._lexicon[a.lower()] = role

    def _split_base_string(self, token: str) -> tuple[str, str]:
        """'EP12' → ('EP', '12'). 'EP' → ('EP', '')."""
        t = token.upper()
        m = self._BASE_AND_STRING.match(t)
        if m:
            return m.group(1), m.group(2)
        return t, ""

    def parse_field_code(self, codigo: str) -> dict:
        """Devuelve {base, string, modifier, params} (solo sintáctico).

        - base: primer token, sin string number (en mayúsculas).
        - string: sufijo numérico pegado al primer token (stringing).
        - modifier: primer token de control (posición ≥2, no numérico), en
          minúsculas, o None.
        - params: tokens numéricos extra (radio, ancho, offset…).

        El ROL del modifier (start/end/close/…) no se decide aquí: lo da el
        ControlCodeModel de `fit`.
        """
        raw = (codigo or "").strip()
        if not raw:
            return {"base": "", "string": "", "modifier": None, "params": []}

        parts = raw.split()
        base, string_num = self._split_base_string(parts[0])

        modifier = None
        params = []
        for tok in parts[1:]:
            if _is_number(tok):
                params.append(float(tok))
            elif modifier is None:
                modifier = tok.lower()
            # tokens de control adicionales se ignoran por ahora

        return {"base": base, "string": string_num, "modifier": modifier, "params": params}

    # --- Aprendizaje de roles (fit) -----------------------------------------

    def _segment_ratios(self, points: list[dict]) -> list[tuple]:
        """Segmenta las cadenas (auto-conexión por feature consecutivo, cortando
        en cada punto con control code) y devuelve, por segmento terminado por un
        control code, (terminal_token, ratio_de_cierre, longitud).

        ratio = dist(primer, último) / longitud de la polilínea; None si no se
        puede medir (cadena de 1 punto o sin coordenadas)."""
        segs = []
        cur = []
        cur_base = None
        for pt in points:
            parsed = self.parse_field_code(pt.get("codigo") or "")
            base = parsed["base"]
            if not base:
                continue
            if cur and base != cur_base:
                segs.append((None, cur))
                cur = []
            cur_base = base
            cur.append(pt)
            if parsed["modifier"] is not None:
                segs.append((parsed["modifier"], cur))
                cur = []
                cur_base = None
        if cur:
            segs.append((None, cur))

        out = []
        for term, seq in segs:
            ratio = None
            if len(seq) >= 2:
                length = 0.0
                for a, b in zip(seq, seq[1:]):
                    length += math.hypot(
                        float(b.get("x", 0)) - float(a.get("x", 0)),
                        float(b.get("y", 0)) - float(a.get("y", 0)),
                    )
                if length > 0:
                    d = math.hypot(
                        float(seq[-1].get("x", 0)) - float(seq[0].get("x", 0)),
                        float(seq[-1].get("y", 0)) - float(seq[0].get("y", 0)),
                    )
                    ratio = d / length
            out.append((term, ratio, len(seq)))
        return out

    def fit(self, points: list[dict], overrides: dict | None = None,
            fxl_roles: dict | None = None) -> ControlCodeModel:
        """Aprende el rol de cada control code del CSV. Prioridad:
        `overrides` (usuario) → `fxl_roles` (FXL) → léxico → geometría."""
        overrides = {k.lower(): v for k, v in (overrides or {}).items()}
        fxl_roles = {k.lower(): v for k, v in (fxl_roles or {}).items()}

        first_tokens = set()
        later_counts = {}
        for pt in points:
            raw = (pt.get("codigo") or "").strip()
            if not raw:
                continue
            parts = raw.split()
            first_tokens.add(parts[0].lower())
            for tok in parts[1:]:
                if _is_number(tok):
                    continue
                tl = tok.lower()
                later_counts[tl] = later_counts.get(tl, 0) + 1

        # Vocabulario de control: tokens en pos≥2 que no sean también features.
        control_vocab = {t for t in later_counts if t not in first_tokens}
        control_vocab |= set(overrides.keys())
        control_vocab |= set(fxl_roles.keys())

        seg_ratios = self._segment_ratios(points)

        roles = {}
        meta = {}
        for token in control_vocab:
            count = later_counts.get(token, 0)
            if token in overrides:
                roles[token] = overrides[token]
                meta[token] = {"source": "override", "ratio": None, "count": count}
            elif token in fxl_roles:
                roles[token] = fxl_roles[token]
                meta[token] = {"source": "fxl", "ratio": None, "count": count}
            elif token in self._lexicon:
                roles[token] = self._lexicon[token]
                meta[token] = {"source": "lexicon", "ratio": None, "count": count}
            else:
                role, ratio = self._infer_geom_role(token, seg_ratios)
                roles[token] = role
                meta[token] = {"source": "geometry", "ratio": ratio, "count": count}

        return ControlCodeModel(roles, meta)

    def _infer_geom_role(self, token: str, seg_ratios: list[tuple]) -> tuple[str, float | None]:
        """Rol de un terminal desconocido por geometría: cierra el anillo →
        close (polígono); si no → end (línea)."""
        ratios = [seg[1] for seg in seg_ratios if seg[0] == token and seg[1] is not None]
        if not ratios:
            return ROLE_END, None
        med = statistics.median(ratios)
        role = ROLE_CLOSE if med < self.CLOSE_RATIO_THRESHOLD else ROLE_END
        return role, med

    def score(self, points: list[dict]) -> float:
        """Confianza (0..1) de que el CSV use la sintaxis de este dialecto:
        proporción de códigos con estructura reconocible (control code o
        string number)."""
        total = 0
        recognized = 0
        for pt in points:
            parsed = self.parse_field_code(pt.get("codigo") or "")
            if not parsed["base"]:
                continue
            total += 1
            if parsed["modifier"] or parsed["string"]:
                recognized += 1
        if total == 0:
            return 0.0
        return recognized / total


class TrimbleDialect(CodingDialect):
    """Trimble Access / TBC: control codes como token tras el line code,
    stringing con sufijo numérico (FENCE01/02)."""

    name = "trimble"

    # Léxico de refuerzo (ampliable y multilingüe). NO es la única fuente: los
    # tokens fuera de esta tabla se resuelven por estructura + geometría.
    #
    # Los códigos en MAYÚSCULAS (ST/CL/END/SCC/SCE/SR/SSC/ESC/STA/SNTA/ETA/ENTA/
    # JPT) son los DEFAULTS oficiales de Trimble (GlobalFeatures.fxl de ejemplo
    # en las colectoras). El resto son alias comunes y traducciones (ES/PT).
    KNOWN_ALIASES = {
        # Start / StartLine
        ROLE_START: ["start", "st", "i", "ini", "inicio", "iniciar", "b", "begin"],
        # End / EndLine + EndSmoothCurve (ESC) + EndTangentArc (ETA) +
        # EndNonTangentArc (ENTA): todos terminan/cierran la cadena como línea.
        ROLE_END: ["end", "en", "e", "fin", "f", "ende", "finalizar", "terminar",
                   "esc", "eta", "enta"],
        # Close / CloseLine
        ROLE_CLOSE: ["close", "cl", "c", "closed", "cerrar", "fechar"],
        # JoinToPoint (JPT)
        ROLE_JOIN: ["jn", "join", "co", "cont", "continue", "cn", "unir", "jpt"],
        # StartCircleCenter (SCC) + StartCircleEdge (SCE)
        ROLE_CIRCLE: ["ci", "cc", "circle", "circulo", "círculo", "scc", "sce"],
        # StartTangentArc (STA) + StartNonTangentArc (SNTA)
        ROLE_ARC: ["arc", "arco", "ta", "nta", "sta", "snta"],
        # StartRectangle (SR)
        ROLE_RECT: ["re", "rect", "rectangle", "rectangulo", "rectángulo", "sr"],
        # StartSmoothCurve (SSC)
        ROLE_SMOOTH: ["sm", "smooth", "suave", "ssc"],
    }


class LeicaDialect(CodingDialect):
    """Stub: sintaxis Leica (GSI / Captivate). Pendiente de implementar."""

    name = "leica"

    def score(self, points: list[dict]) -> float:
        return 0.0


class PentaxDialect(CodingDialect):
    """Stub: sintaxis Pentax. Pendiente de implementar."""

    name = "pentax"

    def score(self, points: list[dict]) -> float:
        return 0.0


# Orden de preferencia; Trimble primero (también es el fallback)
DIALECTS = [TrimbleDialect(), LeicaDialect(), PentaxDialect()]

# Umbral mínimo de confianza para preferir un dialecto que no sea el fallback
_SCORE_THRESHOLD = 0.0


def detect_dialect(points: list[dict]) -> CodingDialect:
    """Elige el dialecto con mayor score. Si nadie supera el umbral, devuelve
    Trimble (fallback)."""
    fallback = DIALECTS[0]
    best = fallback
    best_score = -1.0
    for dialect in DIALECTS:
        s = dialect.score(points)
        if s > best_score:
            best_score = s
            best = dialect
    if best_score <= _SCORE_THRESHOLD:
        return fallback
    return best


def parse_field_code(codigo: str, dialect: CodingDialect | None = None) -> dict:
    """Wrapper retrocompatible. Sin dialecto explícito usa Trimble."""
    d = dialect or DIALECTS[0]
    return d.parse_field_code(codigo)


def classify_codes(
    points: list[dict], dialect: CodingDialect, model: ControlCodeModel | None = None,
    overrides: dict | None = None,
) -> tuple[dict, list]:
    """Agrupa los puntos por código base y acumula señales de geometría usando el
    rol aprendido de cada control code.

    Devuelve (info, order) donde info[base] = {count, is_line, is_closed,
    strings(set)}. Lógica común de `detect_codes` y `build_geometry`.
    """
    if model is None:
        model = dialect.fit(points, overrides)

    info: dict = {}
    order: list = []

    for pt in points:
        parsed = dialect.parse_field_code(pt.get("codigo") or "")
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

        if model.is_closed_shape(modifier):
            i["is_closed"] = True
        elif modifier is not None and model.role(modifier) is not None:
            # cualquier otro rol reconocido (start/end/join/arc/smooth) → línea
            i["is_line"] = True
        elif parsed["string"]:
            # Códigos con string number suelen ser líneas (convención Trimble)
            i["is_line"] = True

    return info, order


def linear_code_set(points: list[dict], dialect: CodingDialect,
                    model: ControlCodeModel | None = None) -> set:
    """Conjunto de códigos base que son línea o polígono (no punto). Lo usa
    build_geometry para auto-conectar aunque no haya un control code de inicio."""
    info, _ = classify_codes(points, dialect, model=model)
    return {base for base, i in info.items() if i["is_line"] or i["is_closed"]}


def detect_codes(points: list[dict], overrides: dict | None = None) -> list[dict]:
    """Clasifica cada código base para la UI. Devuelve
    [{codigo, cantidad, tipo, cadenas}]. El dialecto se autodetecta; `overrides`
    (token→rol, de la UI) tiene prioridad."""
    dialect = detect_dialect(points)
    model = dialect.fit(points, overrides)
    info, order = classify_codes(points, dialect, model=model)

    result = []
    for base in order:
        i = info[base]
        if i["is_closed"]:
            tipo = TIPO_POLIGONO
        elif i["is_line"]:
            tipo = TIPO_LINEA
        else:
            tipo = TIPO_PUNTO
        result.append({
            "codigo": base,
            "cantidad": i["count"],
            "tipo": tipo,
            "cadenas": len(i["strings"]),
        })

    return result


def detect_control_codes(points: list[dict], overrides: dict | None = None,
                         fxl_roles: dict | None = None) -> list[dict]:
    """Devuelve los control codes detectados con su rol y la fuente de la
    decisión, para que la UI los muestre y permita reasignarlos:
      [{token, role, source('override'|'fxl'|'lexicon'|'geometry'), ratio, count}]
    Ordenados por nº de ocurrencias (descendente)."""
    dialect = detect_dialect(points)
    model = dialect.fit(points, overrides, fxl_roles)
    out = []
    for token, m in model.meta.items():
        out.append({
            "token": token,
            "role": model.roles[token],
            "source": m["source"],
            "ratio": m.get("ratio"),
            "count": m.get("count", 0),
        })
    out.sort(key=lambda r: (-r["count"], r["token"]))
    return out
