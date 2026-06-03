"""
csv_parser.py
-------------
Responsabilidad: leer el texto de un CSV y devolver una lista de dicts.

Columnas requeridas: nombre, x, y, z, codigo

La interpretación/clasificación de los códigos de campo vive en field_codes.py
(detección multimarca con dialectos). Aquí solo se lee y normaliza el CSV.
"""

import csv
import io


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
