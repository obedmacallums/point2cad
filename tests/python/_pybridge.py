"""
Helper de tests: replica el modelo del bridge JS (usePythonBridge.js), que
concatena los módulos .py en un único namespace de Pyodide. Aquí ejecutamos los
módulos en orden dentro de un mismo dict, de modo que `build_geometry` encuentre
`detect_dialect` (field_codes) y los densificadores (shapes) como en producción.
"""

import os

_PY_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "python")


def build_namespace(*module_files):
    ns: dict = {}
    for name in module_files:
        path = os.path.join(_PY_DIR, name)
        with open(path, encoding="utf-8") as f:
            exec(compile(f.read(), name, "exec"), ns)
    return ns
