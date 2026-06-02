import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const PyodideContext = createContext(null)

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js'

export function PyodideProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const pyRef = useRef(null)
  const initPromiseRef = useRef(null)
  const pkgPromisesRef = useRef({})
  const [loadedPkgs, setLoadedPkgs] = useState({})

  useEffect(() => {
    // Evita doble inicialización (React StrictMode ejecuta useEffect dos veces en dev)
    if (initPromiseRef.current) return

    initPromiseRef.current = (async () => {
      if (!window.loadPyodide) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = PYODIDE_CDN
          script.onload = resolve
          script.onerror = () => reject(new Error('No se pudo cargar Pyodide desde CDN'))
          document.head.appendChild(script)
        })
      }
      const py = await window.loadPyodide()

      // micropip viene en la distribución pero hay que activarlo con loadPackage
      await py.loadPackage('micropip')
      const micropip = py.pyimport('micropip')
      await micropip.install('ezdxf')
      await micropip.install('pyshp')

      pyRef.current = py
      setIsLoading(false)
    })().catch((err) => {
      console.error('Error iniciando Pyodide:', err)
      setIsLoading(false)
    })
  }, [])

  const runPython = useCallback(async (code) => {
    if (!pyRef.current) return { stdout: '', stderr: 'Pyodide no está listo' }
    setIsRunning(true)

    const lines = []
    const errLines = []

    // Redirigir stdout/stderr para capturar el output de esta ejecución
    pyRef.current.setStdout({ batched: (line) => lines.push(line) })
    pyRef.current.setStderr({ batched: (line) => errLines.push(line) })

    try {
      await pyRef.current.runPythonAsync(code)
      return { stdout: lines.join('\n'), stderr: errLines.join('\n') }
    } catch (err) {
      return { stdout: lines.join('\n'), stderr: err.message }
    } finally {
      setIsRunning(false)
    }
  }, [])

  // Carga perezosa y memoizada de paquetes Pyodide pesados (p.ej. geopandas).
  // Se puede llamar en segundo plano durante el flujo para precalentar.
  const ensurePackages = useCallback(async (names) => {
    await initPromiseRef.current
    const py = pyRef.current
    if (!py) return
    const key = [...names].sort().join(',')
    if (!pkgPromisesRef.current[key]) {
      pkgPromisesRef.current[key] = py
        .loadPackage(names)
        .then(() => setLoadedPkgs((m) => ({ ...m, [key]: true })))
        .catch((err) => {
          // Permite reintentar en el próximo llamado.
          delete pkgPromisesRef.current[key]
          throw err
        })
    }
    return pkgPromisesRef.current[key]
  }, [])

  const isPackagesReady = useCallback(
    (names) => loadedPkgs[[...names].sort().join(',')] === true,
    [loadedPkgs]
  )

  return (
    <PyodideContext.Provider
      value={{ isLoading, isRunning, runPython, ensurePackages, isPackagesReady }}
    >
      {children}
    </PyodideContext.Provider>
  )
}

export function usePyodide() {
  const ctx = useContext(PyodideContext)
  if (!ctx) throw new Error('usePyodide debe usarse dentro de PyodideProvider')
  return ctx
}
