# Barra de herramientas del mapa 2D — botón "Ajustar vista" (zoom extend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un botón "Ajustar vista" (zoom extend) al `MapView` que encuadre el mapa a la extensión de las geometrías visibles, con el mismo lenguaje visual que el `ViewerToolbar` del visor 3D.

**Architecture:** Nuevo componente `MapToolbar` (hijo de `MapContainer`, usa `useMap()` para acceder a la instancia de Leaflet) que se posiciona en la esquina superior derecha, debajo del control de capas nativo. Recibe `bounds` como prop desde `MapView` (el mismo `layers.bounds` que ya usa el auto-fit al cargar dataset) y llama a `map.fitBounds(bounds, { padding: [24, 24] })` al hacer click.

**Tech Stack:** React 18, react-leaflet v4, Leaflet 1.9, Tailwind CSS, Vitest + Testing Library.

## Global Constraints

- No añadir dependencias nuevas.
- Reutilizar el ícono "cuatro esquinas" ya definido en `ViewerToolbar` (`src/components/Viewer3D/ViewerToolbar.jsx`), sin extraerlo a un módulo compartido (dos ocurrencias no justifican la abstracción todavía).
- Posición: `absolute top-14 right-2.5` (56px/10px), para calzar debajo del `LayersControl` nativo de Leaflet colapsado (36px alto + 10px margen).
- `z-[500]` en el contenedor del toolbar (mismo criterio que el banner de error de tiles ya existente en `MapView.jsx:119`). No compite con el `z-50` del drawer global (`App.jsx:100`) pese a que 500 > 50 numéricamente: el contenedor raíz de `MapView` (`MapView.jsx:117`) usa `relative z-0 isolate`, que crea su propio stacking context y acota todo lo de adentro — ver Task 1, Step 3.
- Tests: extender `src/components/MapView/MapView.test.jsx` (no crear un archivo de test separado para `MapToolbar`), reutilizando el mock de `react-leaflet` y `__mapMock` ya existentes.

---

### Task 1: Componente `MapToolbar` + integración en `MapView`

**Files:**
- Create: `src/components/MapView/MapToolbar.jsx`
- Modify: `src/components/MapView/MapView.jsx:135` (justo después del cierre de `</LayersControl>`, antes del render de `layers.points`)
- Test: `src/components/MapView/MapView.test.jsx`

**Interfaces:**
- Consumes: `useMap()` de `react-leaflet` (ya mockeado en `MapView.test.jsx` como `mapMock` con `fitBounds: vi.fn()`, expuesto como `__mapMock`); `layers.bounds` calculado en `MapView.jsx` por `buildMapLayers` (tipo `[[minLat, minLng], [maxLat, maxLng]] | null`).
- Produces: componente `MapToolbar({ bounds })` — sin más consumidores en este plan.

- [ ] **Step 1: Escribir los tests que fallan en `MapView.test.jsx`**

Primero, actualizar el import de Testing Library para incluir `fireEvent` (línea 2 actual: `import { render, screen } from '@testing-library/react'`):

```js
import { render, screen, fireEvent } from '@testing-library/react'
```

Añadir al final del `describe('MapView', ...)` existente, después del último `it(...)` (después de la prueba `'suscribe tanto tileerror como tileload...'`):

```js
  it('el botón "Ajustar vista" está habilitado y llama a fitBounds al hacer click', () => {
    render(<MapView />)
    const btn = screen.getByRole('button', { name: 'Ajustar vista' })
    expect(btn).not.toBeDisabled()

    fireEvent.click(btn)

    expect(__mapMock.fitBounds).toHaveBeenCalledTimes(1)
    const [bounds, options] = __mapMock.fitBounds.mock.calls[0]
    expect(bounds).toHaveLength(2) // [[minLat, minLng], [maxLat, maxLng]]
    expect(bounds[0]).toHaveLength(2)
    expect(bounds[1]).toHaveLength(2)
    expect(options).toEqual({ padding: [24, 24] })
  })

  it('el botón "Ajustar vista" está deshabilitado cuando no hay geometría visible', () => {
    const state = mockState()
    Object.keys(state.featureLibrary).forEach((codigo) => {
      state.featureLibrary[codigo] = { ...state.featureLibrary[codigo], visible: false }
    })
    useApp.mockReturnValue({ state })

    render(<MapView />)
    const btn = screen.getByRole('button', { name: 'Ajustar vista' })
    expect(btn).toBeDisabled()
  })
```

- [ ] **Step 2: Ejecutar los tests para confirmar que fallan**

Run: `npm test -- MapView.test.jsx`
Expected: FAIL — `Unable to find role="button" and name "Ajustar vista"` (el botón todavía no existe).

- [ ] **Step 3: Crear `MapToolbar.jsx`**

Usar `z-[500]` (mismo valor que el banner de error de tiles ya existente en
`MapView.jsx:119`). Esto es seguro pese a que el drawer global
(`src/App.jsx:100`) usa `z-50` (valor numérico menor, 50 < 500): el
contenedor raíz de `MapView` (`MapView.jsx:117`) usa
`relative z-0 isolate`, que crea su propio stacking context. Todo lo que
esté dentro (incluido cualquier `z-[500]`) queda acotado por ese `z-0`
externo, así que nunca compite con el `z-50` del drawer en el stacking
context del documento — ya verificado leyendo `src/App.jsx` y
`MapView.jsx`, no hace falta reconfirmarlo al implementar.

```jsx
import { useMap } from 'react-leaflet'

// Mismo ícono "cuatro esquinas" que el botón "Ajustar vista" de ViewerToolbar
// (src/components/Viewer3D/ViewerToolbar.jsx), para leerse como el mismo
// concepto en 3D y en mapa.
const FIT_ICON = (
  <path d="M3 7 V3 H7 M13 3 H17 V7 M17 13 V17 H13 M7 17 H3 V13" />
)

export default function MapToolbar({ bounds }) {
  const map = useMap()
  const disabled = !bounds

  return (
    <div className="absolute top-14 right-2.5 z-[500] flex flex-col gap-px bg-gray-900/60 backdrop-blur-sm rounded p-px">
      <button
        type="button"
        onClick={() => bounds && map.fitBounds(bounds, { padding: [24, 24] })}
        disabled={disabled}
        title={disabled ? 'Sin geometría visible que encuadrar' : 'Ajustar vista'}
        aria-label="Ajustar vista"
        className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {FIT_ICON}
        </svg>
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Integrar `MapToolbar` en `MapView.jsx`**

Añadir el import junto a los demás imports locales (después de `import { buildMapLayers } from './mapLayers'`):

```js
import MapToolbar from './MapToolbar'
```

Insertar el componente dentro de `<MapContainer>`, justo después del cierre de `</LayersControl>` (línea 135 actual) y antes de `{layers.points.map(...)}`:

```jsx
        </LayersControl>

        <MapToolbar bounds={layers.bounds} />

        {layers.points.map((p) => (
```

- [ ] **Step 5: Ejecutar los tests para confirmar que pasan**

Run: `npm test -- MapView.test.jsx`
Expected: PASS — todos los tests de `MapView.test.jsx`, incluidos los dos nuevos.

- [ ] **Step 6: Ejecutar la suite completa y el build**

Run: `npm test && npm run build`
Expected: PASS sin regresiones en otras suites (`ViewerStage.test.jsx`, `Viewer3D`, etc.) ni errores de build.

- [ ] **Step 7: Commit**

```bash
git add src/components/MapView/MapToolbar.jsx src/components/MapView/MapView.jsx src/components/MapView/MapView.test.jsx
git commit -m "$(cat <<'EOF'
feat(map): botón "Ajustar vista" (zoom extend) en el mapa 2D

Primer botón de la futura toolbar propia del MapView, reutilizando el ícono y estilo del ViewerToolbar 3D. Encuadra a la extensión de las geometrías visibles.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016i1dzweA774VK91dTNLDaT
EOF
)"
```

---

## Verificación manual (opcional pero recomendada)

Tras completar la Task 1, levantar la app (`npm run dev`), importar un CSV geodésico (p. ej. `docs/geodesic_test.csv`), entrar a la etapa Vista, cambiar a modo Mapa, alejar/mover el mapa manualmente y confirmar que el botón "Ajustar vista" (esquina superior derecha, debajo del selector de capas) reencuadra correctamente las geometrías. Ocultar todos los códigos en la biblioteca de características y confirmar que el botón queda deshabilitado.
