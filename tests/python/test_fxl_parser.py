import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
from fxl_parser import parse_fxl  # noqa: E402

# FXL sintético propio (no muestra de Trimble), con namespace raíz real.
SAMPLE = """<?xml version="1.0" encoding="utf-8"?>
<FeatureCodingDefinitions xmlns="http://trimble.com/schema/fxl" SchemaVersion="9">
  <LayerDefinitions>
    <LayerDefinition Name="CERCAS" Color="FF00FF00"/>
  </LayerDefinitions>
  <ControlCodeDefinitions>
    <ControlCodeDefinition Code="ini" Description="Iniciar" Type="Start"/>
    <ControlCodeDefinition Code="fin" Description="Finalizar" Type="End"/>
    <ControlCodeDefinition Code="cer" Description="Cerrar" Type="Close"/>
  </ControlCodeDefinitions>
  <FeatureDefinitions>
    <PointFeatureDefinition Code="ARBOL" Name="Arbol" Color="FE000000" Layer="VEGETACION"/>
    <PointFeatureDefinition Code="HITO" Name="Hito" Layer="0"/>
    <LineFeatureDefinition Code="CERCA" Name="Cerca" Layer="CERCAS"/>
    <PolygonFeatureDefinition Code="EDIF" Name="Edificio" Color="FFFF0000" Layer="EDIFICIOS"/>
  </FeatureDefinitions>
</FeatureCodingDefinitions>
"""


def test_features_tipo_mapping():
    out = parse_fxl(SAMPLE)
    f = out["features"]
    assert f["ARBOL"]["tipo"] == "Punto"
    assert f["CERCA"]["tipo"] == "Línea abierta"
    assert f["EDIF"]["tipo"] == "Polilínea cerrada"


def test_color_argb_to_hex_drops_alpha():
    out = parse_fxl(SAMPLE)
    assert out["features"]["ARBOL"]["color"] == "#000000"
    assert out["features"]["EDIF"]["color"] == "#ff0000"


def test_layer_zero_and_missing_become_none():
    out = parse_fxl(SAMPLE)
    assert out["features"]["HITO"]["capa"] is None  # Layer="0"
    assert out["features"]["ARBOL"]["capa"] == "VEGETACION"


def test_color_fallback_from_layer_when_feature_has_no_color():
    # CERCA no trae Color; hereda el de su capa CERCAS (FF00FF00 → #00ff00).
    out = parse_fxl(SAMPLE)
    assert out["features"]["CERCA"]["color"] == "#00ff00"


def test_control_roles_mapping():
    out = parse_fxl(SAMPLE)
    assert out["control_roles"] == {"ini": "start", "fin": "end", "cer": "close"}


def test_invalid_xml_raises_valueerror():
    with pytest.raises(ValueError):
        parse_fxl("esto no es xml <<<")


def test_invalid_color_degrades_to_none():
    # Color malformado y sin capa de la que heredar → color None (no crash).
    xml = """<?xml version="1.0" encoding="utf-8"?>
<FeatureCodingDefinitions xmlns="http://trimble.com/schema/fxl" SchemaVersion="9">
  <FeatureDefinitions>
    <PointFeatureDefinition Code="MALO" Name="Malo" Color="ZZZ"/>
  </FeatureDefinitions>
</FeatureCodingDefinitions>
"""
    out = parse_fxl(xml)
    assert out["features"]["MALO"]["color"] is None


def test_different_namespace_still_parsed():
    # Un FXL con OTRO namespace raíz debe seguir entregando features,
    # control_roles y el fallback de color desde la capa (contrato namespace-agnóstico).
    xml = """<?xml version="1.0" encoding="utf-8"?>
<FeatureCodingDefinitions xmlns="http://trimble.com/schema/fxl/v2" SchemaVersion="9">
  <LayerDefinitions>
    <LayerDefinition Name="CERCAS" Color="FF00FF00"/>
  </LayerDefinitions>
  <ControlCodeDefinitions>
    <ControlCodeDefinition Code="ini" Type="Start"/>
  </ControlCodeDefinitions>
  <FeatureDefinitions>
    <LineFeatureDefinition Code="CERCA" Name="Cerca" Layer="CERCAS"/>
  </FeatureDefinitions>
</FeatureCodingDefinitions>
"""
    out = parse_fxl(xml)
    assert "CERCA" in out["features"]
    assert out["control_roles"] == {"ini": "start"}
    assert out["features"]["CERCA"]["color"] == "#00ff00"
