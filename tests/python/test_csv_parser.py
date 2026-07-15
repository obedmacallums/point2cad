import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
from _pybridge import build_namespace  # noqa: E402

_NS = build_namespace("csv_parser.py")
parse_csv = _NS["parse_csv"]


CSV_BASE = """nombre,x,y,z,codigo
P1,100.5,200.25,10.0,arbol
P2,110.0,210.0,11.5,POSTE
"""


def test_parse_basico_tipos_y_normalizacion():
    points = parse_csv(CSV_BASE)
    assert len(points) == 2
    p1 = points[0]
    assert p1["nombre"] == "P1"
    assert isinstance(p1["x"], float) and p1["x"] == 100.5
    assert p1["y"] == 200.25
    assert p1["z"] == 10.0
    # El código se normaliza a mayúsculas
    assert p1["codigo"] == "ARBOL"
    assert points[1]["codigo"] == "POSTE"


def test_nombre_y_codigo_con_espacios_se_recortan():
    csv_text = "nombre,x,y,z,codigo\n  P1  ,1,2,3,  cerca  \n"
    points = parse_csv(csv_text)
    assert points[0]["nombre"] == "P1"
    assert points[0]["codigo"] == "CERCA"


def test_cabeceras_case_insensitive():
    csv_text = "NOMBRE,X,Y,Z,CODIGO\nP1,1,2,3,arbol\n"
    points = parse_csv(csv_text)
    assert points[0]["codigo"] == "ARBOL"


def test_texto_con_lineas_en_blanco_alrededor():
    points = parse_csv("\n\n" + CSV_BASE + "\n\n")
    assert len(points) == 2


def test_columnas_faltantes_lanza_valueerror_con_nombres():
    csv_text = "nombre,x,y\nP1,1,2\n"
    with pytest.raises(ValueError) as exc:
        parse_csv(csv_text)
    # El mensaje menciona las columnas que faltan
    assert "z" in str(exc.value)
    assert "codigo" in str(exc.value)


def test_coordenada_no_numerica_lanza_valueerror():
    csv_text = "nombre,x,y,z,codigo\nP1,abc,2,3,arbol\n"
    with pytest.raises(ValueError):
        parse_csv(csv_text)


def test_csv_solo_cabecera_devuelve_lista_vacia():
    assert parse_csv("nombre,x,y,z,codigo\n") == []
