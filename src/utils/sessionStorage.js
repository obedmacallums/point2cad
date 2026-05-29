// Persistencia de la sesión de trabajo en localStorage.
//
// Se guarda un subconjunto serializable del state: configuración + CSV original.
// La geometría (points/lines/polylines) NO se persiste: se regenera al restaurar
// (ver useSessionRehydration). Esto mantiene el payload pequeño y por debajo del
// límite de ~5 MB de localStorage.

const SESSION_KEY = 'point2cad:session:v1'

const PERSISTED_FIELDS = [
  'appMode',
  'rawCSVText',
  'parseOptions',
  'columnMapping',
  'codesSummary',
  'featureLibrary',
  'fileName',
  'showLineVertices',
]

export function saveSession(state) {
  // En idle (o sin archivo) no hay sesión que guardar: limpiamos cualquier resto.
  if (state.appMode === 'idle' || !state.rawCSVText) {
    clearSession()
    return
  }

  const snapshot = {}
  for (const field of PERSISTED_FIELDS) snapshot[field] = state[field]

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot))
  } catch (err) {
    // Probablemente QuotaExceededError: el CSV no cabe. Persistimos solo la config
    // (sin rawCSVText) para conservar al menos el mapeo y los colores.
    try {
      const { rawCSVText, ...configOnly } = snapshot
      localStorage.setItem(SESSION_KEY, JSON.stringify(configOnly))
      console.warn(
        'Sesión guardada sin el CSV: excede la cuota de localStorage.',
        err,
      )
    } catch (err2) {
      console.warn('No se pudo guardar la sesión en localStorage.', err2)
    }
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.warn('No se pudo leer la sesión guardada.', err)
    return null
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch (err) {
    console.warn('No se pudo limpiar la sesión guardada.', err)
  }
}
