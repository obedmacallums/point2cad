# Diseño: Barra de herramientas del mapa 2D — botón "Ajustar vista" (zoom extend)

> Fecha: 2026-07-15
> Estado: aprobado (brainstorming) — pendiente de plan de implementación.
> Continúa a [[2026-07-15-vista-2d-mapa-base-design]].

## 1. Objetivo

La vista 3D tiene una barra de herramientas flotante (`ViewerToolbar`) en la
esquina superior derecha con botones de vista y "Ajustar vista". La vista de
mapa (`MapView`) no tiene equivalente. Este spec añade el primer botón de una
futura barra de herramientas propia del mapa: **zoom extend** (encuadrar
todas las geometrías visibles), reutilizando el mismo lenguaje visual que el
3D. No serán barras idénticas — el mapa irá sumando sus propios botones más
adelante — pero deben leerse como parte del mismo sistema.

## 2. Alcance

**Dentro:**

- Componente `MapToolbar` con un único botón: encuadrar el mapa a la
  extensión de las geometrías visibles (mismo criterio que el `fitBounds`
  automático que ya existe al cargar un dataset nuevo).
- Mismo estilo visual que `ViewerToolbar` (panel oscuro, botones cuadrados
  de 32px) y mismo ícono de "cuatro esquinas" que usa el botón "Ajustar
  vista" del 3D.
- Posicionado en la esquina superior derecha, apilado debajo del control de
  capas nativo de Leaflet.
- Deshabilitado (atenuado, con `title` explicativo) cuando no hay geometría
  visible (`bounds === null`).

**Fuera (YAGNI ahora):**

- Botones adicionales (vistas guardadas, medición, etc.) — se irán
  añadiendo en specs futuros según se necesiten.
- Unificar `ViewerToolbar` y `MapToolbar` en un componente compartido: son
  parecidos pero vinculados a sistemas distintos (Three.js vs Leaflet); no
  hay suficiente duplicación todavía para justificar la abstracción.

## 3. Enfoques considerados

**A (aprobado): `<div>` absoluto plano dentro de `MapContainer`, con
`useMap()`.** Mismo patrón que ya usa `MapController` en este archivo para
acceder a la instancia de Leaflet. Se posiciona con Tailwind
(`top-14 right-2.5`, 56px/10px) para calzar justo debajo del control de
capas nativo (36px de alto + 10px de margen Leaflet). Cero dependencias
nuevas, consistente con cómo ya está resuelto `ViewerToolbar` en el 3D.

**B (descartado): Control nativo de Leaflet (`L.control` + portal React).**
Se apilaría automáticamente debajo de `LayersControl` sin calcular offsets a
mano, pero exige un patrón de portal que no se usa en ningún otro punto del
código (`ViewerToolbar` tampoco lo usa). Más piezas nuevas por un beneficio
menor: el offset fijo en A es estable porque el tamaño del control de capas
colapsado no cambia.

**C (descartado): integrar el botón dentro de `LayersControl`.** Leaflet no
permite mezclar controles de capas con botones de acción arbitrarios sin
hacks; rompe la semántica del control nativo.

## 4. Diseño

### 4.1 Componente `MapToolbar`

`src/components/MapView/MapToolbar.jsx`, hijo directo de `MapContainer`
(necesita `useMap()` con contexto):

```jsx
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
        {/* mismo ícono "fit" (cuatro esquinas) que ViewerToolbar */}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7 V3 H7 M13 3 H17 V7 M17 13 V17 H13 M7 17 H3 V13" />
        </svg>
      </button>
    </div>
  )
}
```

- `z-[500]` para quedar sobre los tile-panes de Leaflet (200–700) sin
  competir con el drawer (`z-50`) — mismo criterio que ya documenta
  `MapView` para su propio contenedor.
- El ícono se copia literalmente del `BUTTONS.fit.path` de `ViewerToolbar`
  (no se extrae a un módulo compartido: dos ocurrencias no justifican una
  abstracción todavía).

### 4.2 Integración en `MapView`

Se renderiza dentro de `<MapContainer>`, junto a `MapController`:

```jsx
<MapToolbar bounds={layers.bounds} />
```

`layers.bounds` ya es el mismo valor que usa `MapController` para el
auto-fit al cargar el dataset, y ya respeta la visibilidad por código
(`buildMapLayers` filtra por `featureLibrary[...].visible`).

## 5. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Sin geometría visible (`bounds === null`) | Botón deshabilitado y atenuado, con `title` explicando el motivo |
| Click con `bounds` presente | `map.fitBounds(bounds, { padding: [24, 24] })`, igual que el auto-fit inicial |

## 6. Testing

Se extiende `MapView.test.jsx` (reutiliza el mock de `useMap` ya existente,
que expone `fitBounds` como `vi.fn()`):

- El botón existe y está habilitado cuando hay geometría visible.
- Al hacer click, se llama `fitBounds` con los bounds calculados y
  `{ padding: [24, 24] }`.
- Con un dataset sin geometría visible (todo oculto), el botón aparece
  deshabilitado.

## 7. Criterios de aceptación

1. En modo Mapa, aparece un botón "Ajustar vista" en la esquina superior
   derecha, debajo del control de capas.
2. Al hacer click, el mapa se encuadra a la extensión de las geometrías
   visibles actuales (respeta capas ocultas en la biblioteca).
3. Si no hay geometría visible, el botón está deshabilitado con un motivo
   visible al pasar el cursor.
4. `npm test` y `npm run build` pasan; sin regresiones en `MapView` ni en
   `ViewerStage`.
