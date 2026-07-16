# Diseño: Capa "Híbrido" y más zoom en el mapa 2D

> Fecha: 2026-07-15
> Estado: aprobado (brainstorming) — pendiente de plan de implementación.
> Continúa a [[2026-07-15-vista-2d-mapa-base-design]] y [[2026-07-15-mapa-2d-toolbar-zoom-extend-design]].

## 1. Objetivo

El mapa 2D (`MapView`) hoy ofrece dos capas base: OpenStreetMap y Satélite
(Esri World Imagery), sin `maxZoom` explícito (usa el default de Leaflet,
18). Este spec añade:

1. Una tercera capa base **"Híbrido"** (estilo Google Maps: imagen
   satelital + nombres de calles/lugares y límites superpuestos).
2. Más nivel de zoom disponible en las tres capas base.

Ambos, sin API key ni backend nuevo — mismo criterio que ya rige el
proyecto para las capas existentes.

## 2. Alcance

**Dentro:**

- Capa base "Híbrido": combina la imagen satelital ya usada con una capa
  de referencia de etiquetas (nombres, calles, límites) sobre fondo
  transparente, seleccionable como una sola opción en el control de capas.
- `maxZoom={21}` en `MapContainer` y en las tres capas base (`OpenStreetMap`,
  `Satélite`, `Híbrido`), con `maxNativeZoom={19}` en cada `TileLayer`
  (over-zoom de Leaflet más allá de la resolución nativa de los tres
  servicios).

**Fuera (YAGNI ahora):**

- Selector de nivel de zoom manual o UI adicional — el control nativo de
  Leaflet (+/-) y el mouse wheel ya cubren esto; solo cambia el límite
  superior disponible.
- Otros proveedores de imagen (Google, Mapbox, Bing) — todos requieren API
  key, fuera del criterio del proyecto ("sin API keys ni backend").
- Persistir la capa base seleccionada entre sesiones.

## 3. Enfoques considerados

**A (aprobado): Esri "Reference/World_Boundaries_and_Places" apilada
sobre la imagen satelital existente, agrupadas en un `LayerGroup`.** Esri
publica esta capa de referencia (nombres, calles, límites sobre fondo
transparente) específicamente para combinarse con `World_Imagery` y lograr
el efecto "híbrido" — mismo dominio (`server.arcgisonline.com`), mismo
esquema de tiles, mismos términos gratuitos y sin API key que la capa
Satélite ya usada. React-leaflet permite agrupar dos `TileLayer` dentro de
un `LayerGroup` para que `LayersControl` los trate como una sola opción de
base layer — patrón estándar, sin dependencias nuevas.

**B (descartado): Stadia Maps / Stamen "hybrid".** Requiere API key desde
2023 para uso en producción (Stadia adquirió Stamen); rompe el criterio
"sin API keys" del proyecto.

**C (descartado): Mapbox/Google hybrid tiles.** Ambos requieren API key y
tienen límites de uso/facturación — mismo problema que B, además de
introducir dependencia comercial nueva.

## 4. Diseño

### 4.1 Capa "Híbrido"

En `src/components/MapView/MapView.jsx`, nueva constante junto a
`SAT_URL`/`SAT_ATTR`:

```js
const LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
```

Nueva entrada en `LayersControl`, después de "Satélite (Esri)":

```jsx
<LayersControl.BaseLayer name="Híbrido">
  <LayerGroup>
    <TileLayer
      url={SAT_URL}
      attribution={SAT_ATTR}
      crossOrigin="anonymous"
      maxZoom={21}
      maxNativeZoom={19}
    />
    <TileLayer
      url={LABELS_URL}
      attribution={SAT_ATTR}
      crossOrigin="anonymous"
      maxZoom={21}
      maxNativeZoom={19}
    />
  </LayerGroup>
</LayersControl.BaseLayer>
```

- `attribution={SAT_ATTR}` en ambas capas de la combinación: Leaflet
  deduplica atribuciones idénticas en su control (misma cadena de texto no
  se repite visualmente), así que reutilizar `SAT_ATTR` evita una entrada
  duplicada de "Esri" sin perder la atribución correcta — la capa de
  etiquetas es del mismo proveedor.
- Se importa `LayerGroup` de `react-leaflet` junto al resto de imports ya
  existentes de la librería.

### 4.2 Más zoom

- `<MapContainer center={center} zoom={13} maxZoom={21} preferCanvas ...>`
- Las tres capas base (`OpenStreetMap`, `Satélite`, y las dos `TileLayer`
  de `Híbrido`) reciben `maxZoom={21} maxNativeZoom={19}`.
- `maxNativeZoom={19}`: OpenStreetMap y los dos servicios Esri
  (`World_Imagery` y `Reference/World_Boundaries_and_Places`) sirven tiles
  nativos hasta zoom 19 (esquema de 20 niveles, índices 0–19). Más allá de
  ese nivel, Leaflet amplía (over-zoom) el último tile disponible en vez
  de pedir un tile inexistente — comportamiento estándar de Leaflet vía
  `maxNativeZoom`, sin cambios de backend ni tiles adicionales.
- El acercamiento por encima de 19 pierde nitidez (tile ampliado), pero
  sigue siendo útil para verificar posición relativa de puntos — mismo
  principio que ya rige la vista de mapa como "verificación visual", no
  cartografía de precisión.

## 5. Manejo de errores

Sin cambios respecto al spec base: el banner de "sin conexión" ya
existente (`tileerror`/`tileload` en `MapController`) cubre también los
tiles de la nueva capa de etiquetas, sin lógica adicional.

## 6. Testing

Extender `MapView.test.jsx` (mismo archivo, mismo patrón que specs
anteriores):

- Añadir el mock de `LayerGroup` al mock de `react-leaflet` (pass-through,
  igual que `LayersControl.BaseLayer`).
- Verificar que la capa "Híbrido" renderiza dos `TileLayer` (satélite +
  etiquetas), ambas con `crossOrigin="anonymous"`.
- Verificar `maxZoom`/`maxNativeZoom` en las tres capas base.

## 7. Criterios de aceptación

1. El control de capas del mapa muestra tres opciones: "OpenStreetMap",
   "Satélite (Esri)" e "Híbrido".
2. Al seleccionar "Híbrido", se ve la imagen satelital con nombres de
   calles/lugares y límites superpuestos.
3. En cualquiera de las tres capas, el zoom permite llegar hasta el nivel
   21 (antes tope 18).
4. `npm test` y `npm run build` pasan; sin regresiones en `MapView` ni en
   `ViewerStage`.
