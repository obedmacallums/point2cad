import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
from field_codes import (  # noqa: E402
    TrimbleDialect,
    LeicaDialect,
    PentaxDialect,
    detect_dialect,
    parse_field_code,
    detect_codes,
    detect_control_codes,
    TIPO_PUNTO,
    TIPO_LINEA,
    TIPO_POLIGONO,
)


# --- parse_field_code (solo sintáctico: base/string/modifier/params) --------

def test_parse_simple_point():
    p = parse_field_code("ARBOL")
    assert p["base"] == "ARBOL"
    assert p["string"] == ""
    assert p["modifier"] is None
    assert p["params"] == []


def test_parse_string_number():
    p = parse_field_code("EP12")
    assert p["base"] == "EP"
    assert p["string"] == "12"
    assert p["modifier"] is None


def test_parse_control_code():
    p = parse_field_code("CERCA1 ST")
    assert p["base"] == "CERCA"
    assert p["string"] == "1"
    assert p["modifier"] == "st"


def test_parse_modifier_and_params():
    # El primer token de control no numérico es el modifier; los numéricos van
    # a params (radio/ancho/offset), sin importar el orden.
    p = parse_field_code("TANQUE CI 8")
    assert p["base"] == "TANQUE"
    assert p["modifier"] == "ci"
    assert p["params"] == [8.0]


def test_parse_empty():
    p = parse_field_code("")
    assert p["base"] == ""
    assert p["modifier"] is None
    assert p["params"] == []


# --- el ROL/forma ahora lo da el modelo (fit), no parse_field_code ----------

def test_model_assigns_roles_from_lexicon():
    # El modelo solo mapea tokens que aparecen en el CSV (detección estructural);
    # para esos, el léxico asigna el rol.
    d = TrimbleDialect()
    pts = _pts("TANQUE CI 8", "MURO CL", "VIA ST")
    model = d.fit(pts)
    assert model.role("ci") == "circle"
    assert model.role("cl") == "close"
    assert model.role("st") == "start"
    assert model.shape_of("ci") == "circle"


def test_official_trimble_control_codes():
    # Códigos por defecto del GlobalFeatures.fxl oficial de Trimble.
    d = TrimbleDialect()
    pts = _pts(
        "A ST", "A CL", "A END",
        "B SCC", "B SCE",       # circle center / edge
        "C SR",                 # rectangle
        "D SSC", "D ESC",       # start / end smooth curve
        "E STA", "E SNTA", "E ETA", "E ENTA",  # arcs + terminadores
        "F JPT",                # join to point
    )
    model = d.fit(pts)
    expected = {
        "st": "start", "cl": "close", "end": "end",
        "scc": "circle", "sce": "circle",
        "sr": "rect",
        "ssc": "smooth", "esc": "end",
        "sta": "arc", "snta": "arc", "eta": "end", "enta": "end",
        "jpt": "join",
    }
    for token, role in expected.items():
        assert model.role(token) == role, f"{token} → {model.role(token)} (esperado {role})"


# --- detect_codes: contrato de salida ---------------------------------------

def _pts(*codigos):
    return [{"nombre": f"P{i}", "x": 0.0, "y": 0.0, "z": 0.0, "codigo": c}
            for i, c in enumerate(codigos)]


def test_detect_codes_keys_and_tipos():
    points = _pts("ARBOL", "ARBOL", "CERCA ST", "CERCA EN", "BORDE ST", "BORDE CL")
    res = detect_codes(points)
    # Claves del contrato intactas
    for row in res:
        assert set(row.keys()) == {"codigo", "cantidad", "tipo", "cadenas"}
        assert row["tipo"] in (TIPO_PUNTO, TIPO_LINEA, TIPO_POLIGONO)

    by_code = {r["codigo"]: r for r in res}
    assert by_code["ARBOL"]["tipo"] == TIPO_PUNTO
    assert by_code["ARBOL"]["cantidad"] == 2
    assert by_code["CERCA"]["tipo"] == TIPO_LINEA
    assert by_code["BORDE"]["tipo"] == TIPO_POLIGONO


def test_detect_codes_stringing_counts_chains():
    points = _pts("EP1", "EP1", "EP2", "EP2", "EP3")
    res = detect_codes(points)
    ep = next(r for r in res if r["codigo"] == "EP")
    assert ep["tipo"] == TIPO_LINEA
    assert ep["cadenas"] == 3


def test_detect_codes_preserves_order():
    points = _pts("B", "A", "C")
    res = detect_codes(points)
    assert [r["codigo"] for r in res] == ["B", "A", "C"]


# --- autodetección de dialecto ----------------------------------------------

def test_detect_dialect_fallback_is_trimble():
    # CSV de solo puntos simples: nadie puntúa → fallback Trimble
    points = _pts("ARBOL", "POSTE", "POZO")
    assert detect_dialect(points).name == "trimble"


def test_detect_dialect_trimble_wins_with_control_codes():
    points = _pts("CERCA ST", "CERCA EN")
    assert detect_dialect(points).name == "trimble"


def test_stubs_score_zero():
    points = _pts("CERCA ST", "CERCA EN")
    assert LeicaDialect().score(points) == 0.0
    assert PentaxDialect().score(points) == 0.0


def test_trimble_score_positive_with_linework():
    points = _pts("CERCA ST", "CERCA EN", "EP1", "EP1")
    assert TrimbleDialect().score(points) > 0.0


# --- detección SIN nombres: estructura + geometría --------------------------

def _xy(nombre, x, y, codigo):
    return {"nombre": nombre, "x": x, "y": y, "z": 0.0, "codigo": codigo}


def test_exotic_terminal_that_closes_ring_is_polygon():
    # 'xclose' NO está en el léxico: la geometría debe decidir. El último punto
    # vuelve cerca del primero → anillo cerrado → polígono.
    points = [
        _xy("a", 0, 0, "AREA"),
        _xy("b", 4, 0, "AREA"),
        _xy("c", 4, 4, "AREA"),
        _xy("d", 0, 4, "AREA"),
        _xy("e", 0.2, 0.2, "AREA XCLOSE"),
    ]
    res = detect_codes(points)
    area = next(r for r in res if r["codigo"] == "AREA")
    assert area["tipo"] == TIPO_POLIGONO


def test_exotic_terminal_that_stays_open_is_line():
    # 'zed' desconocido; la cadena no vuelve al inicio → línea.
    points = [
        _xy("a", 0, 0, "BORDE"),
        _xy("b", 10, 0, "BORDE"),
        _xy("c", 20, 0, "BORDE"),
        _xy("d", 30, 0, "BORDE ZED"),
    ]
    res = detect_codes(points)
    borde = next(r for r in res if r["codigo"] == "BORDE")
    assert borde["tipo"] == TIPO_LINEA


def test_exotic_control_makes_feature_linear_by_structure():
    # Aunque el nombre del control sea desconocido, el feature deja de ser punto
    # porque estructuralmente lleva un control code (token en pos≥2).
    points = [
        _xy("a", 0, 0, "MURO"),
        _xy("b", 5, 0, "MURO"),
        _xy("c", 5, 5, "MURO QWX"),
    ]
    res = detect_codes(points)
    muro = next(r for r in res if r["codigo"] == "MURO")
    assert muro["tipo"] != TIPO_PUNTO


# --- detect_control_codes (modelo para la UI) -------------------------------

def test_detect_control_codes_reports_tokens_and_source():
    points = _pts("CERCA ST", "CERCA EN", "AREA", "AREA CERRAR")
    ccs = detect_control_codes(points)
    by_token = {c["token"]: c for c in ccs}
    assert by_token["st"]["role"] == "start"
    assert by_token["st"]["source"] == "lexicon"
    assert by_token["cerrar"]["role"] == "close"
    assert by_token["en"]["role"] == "end"


def test_detect_control_codes_geometry_source_for_unknown():
    points = [
        _xy("a", 0, 0, "AREA"),
        _xy("b", 4, 0, "AREA"),
        _xy("c", 4, 4, "AREA"),
        _xy("d", 0.1, 0.1, "AREA XKZ"),
    ]
    ccs = detect_control_codes(points)
    xkz = next(c for c in ccs if c["token"] == "xkz")
    assert xkz["source"] == "geometry"
    assert xkz["role"] == "close"  # cierra el anillo


# --- overrides del usuario tienen prioridad ---------------------------------

def test_override_changes_classification():
    points = _pts("AREA", "AREA", "AREA CERRAR")
    # Por defecto 'cerrar' = close → polígono
    assert next(r for r in detect_codes(points) if r["codigo"] == "AREA")["tipo"] == TIPO_POLIGONO
    # El usuario reasigna 'cerrar' a 'end' → línea
    res = detect_codes(points, overrides={"cerrar": "end"})
    assert next(r for r in res if r["codigo"] == "AREA")["tipo"] == TIPO_LINEA
