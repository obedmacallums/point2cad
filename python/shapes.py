"""
shapes.py
---------
Densificadores geométricos: convierten primitivas avanzadas (círculo, arco,
rectángulo, curva suave) en una lista de vértices [[x, y, z], ...].

Principio del proyecto: la salida geométrica son SIEMPRE las tres entidades del
modelo —punto, línea abierta y polígono (línea cerrada)—. Estas funciones
materializan la forma como una polilínea densificada que luego se clasifica como
línea (abierta) o polígono (cerrada).

Matemática pura (módulo `math`), sin numpy, para correr en Pyodide sin paquetes
extra. Todo el cálculo de forma es en el plano XY; la Z se interpola/promedia.
"""

import math

_EPS = 1e-9


def _circumcenter_2d(p1, p2, p3):
    """Centro y radio del círculo que pasa por 3 puntos (en XY).
    Devuelve (cx, cy, r) o None si son (casi) colineales."""
    ax, ay = p1[0], p1[1]
    bx, by = p2[0], p2[1]
    cx_, cy_ = p3[0], p3[1]

    d = 2.0 * (ax * (by - cy_) + bx * (cy_ - ay) + cx_ * (ay - by))
    if abs(d) < _EPS:
        return None

    a_sq = ax * ax + ay * ay
    b_sq = bx * bx + by * by
    c_sq = cx_ * cx_ + cy_ * cy_

    ux = (a_sq * (by - cy_) + b_sq * (cy_ - ay) + c_sq * (ay - by)) / d
    uy = (a_sq * (cx_ - bx) + b_sq * (ax - cx_) + c_sq * (bx - ax)) / d
    r = math.hypot(ax - ux, ay - uy)
    return ux, uy, r


def circle_from_3_points(p1, p2, p3, segments=64):
    """Polígono cerrado (anillo) del círculo que pasa por 3 puntos.
    La Z es el promedio de las tres. Devuelve None si son colineales."""
    cc = _circumcenter_2d(p1, p2, p3)
    if cc is None:
        return None
    cx, cy, r = cc
    z = (p1[2] + p2[2] + p3[2]) / 3.0
    return _ring(cx, cy, z, r, segments)


def circle_from_center_radius(center, radius, segments=64):
    """Polígono cerrado del círculo definido por centro y radio."""
    if radius is None or radius <= 0:
        return None
    return _ring(center[0], center[1], center[2], radius, segments)


def _ring(cx, cy, z, r, segments):
    verts = []
    for k in range(segments):
        ang = 2.0 * math.pi * k / segments
        verts.append([cx + r * math.cos(ang), cy + r * math.sin(ang), z])
    return verts


def arc_from_3_points(p1, p2, p3, segments=32):
    """Polilínea abierta del arco que va de p1 a p3 pasando por p2.
    La Z se interpola linealmente a lo largo del recorrido angular. Si los
    puntos son colineales, devuelve los tres puntos crudos (segmento recto)."""
    cc = _circumcenter_2d(p1, p2, p3)
    if cc is None:
        return [list(p1), list(p2), list(p3)]
    cx, cy, r = cc

    a1 = math.atan2(p1[1] - cy, p1[0] - cx)
    a2 = math.atan2(p2[1] - cy, p2[0] - cx)
    a3 = math.atan2(p3[1] - cy, p3[0] - cx)

    # Elegir sentido (horario/antihorario) que pase por p2.
    def _norm(a):
        while a < 0:
            a += 2.0 * math.pi
        while a >= 2.0 * math.pi:
            a -= 2.0 * math.pi
        return a

    sweep_ccw = _norm(a3 - a1)
    mid_ccw = _norm(a2 - a1)
    if mid_ccw <= sweep_ccw:
        total = sweep_ccw  # antihorario
    else:
        total = -(2.0 * math.pi - sweep_ccw)  # horario

    verts = []
    for k in range(segments + 1):
        t = k / segments
        ang = a1 + total * t
        z = p1[2] + (p3[2] - p1[2]) * t
        verts.append([cx + r * math.cos(ang), cy + r * math.sin(ang), z])
    return verts


def rectangle(p1, p2, width):
    """Polígono cerrado (4 vértices) a partir de un lado (p1→p2) y un ancho
    perpendicular. width>0 desplaza a la derecha del sentido de avance,
    width<0 a la izquierda."""
    if width is None or abs(width) < _EPS:
        return None
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.hypot(dx, dy)
    if length < _EPS:
        return None
    # Normal a la derecha del vector de avance: (dy, -dx) normalizado
    nx = (dy / length) * width
    ny = (-dx / length) * width
    return [
        [p1[0], p1[1], p1[2]],
        [p2[0], p2[1], p2[2]],
        [p2[0] + nx, p2[1] + ny, p2[2]],
        [p1[0] + nx, p1[1] + ny, p1[2]],
    ]


def smooth_curve(points, segments_per_span=8):
    """Densifica una polilínea con una spline Catmull-Rom (pasa por los puntos
    originales). Devuelve una polilínea abierta. Con menos de 3 puntos, los
    devuelve sin cambios."""
    pts = [[p[0], p[1], p[2]] for p in points]
    n = len(pts)
    if n < 3:
        return pts

    # Puntos de control extremos duplicados para que la curva toque los extremos.
    ctrl = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(ctrl) - 2):
        p0, p1, p2, p3 = ctrl[i - 1], ctrl[i], ctrl[i + 1], ctrl[i + 2]
        for s in range(segments_per_span):
            t = s / segments_per_span
            out.append(_catmull_rom(p0, p1, p2, p3, t))
    out.append(pts[-1])
    return out


def _catmull_rom(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    coord = []
    for j in range(3):
        coord.append(
            0.5
            * (
                (2 * p1[j])
                + (-p0[j] + p2[j]) * t
                + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3
            )
        )
    return coord
