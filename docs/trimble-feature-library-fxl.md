# Biblioteca de características de Trimble y archivos FXL

> Guía de referencia sobre la *Feature Library* de Trimble (Trimble Access y
> Trimble Business Center), su sintaxis, funcionamiento y el formato de los
> archivos `.fxl` que la definen.

---

## 1. ¿Qué es una *Feature Library*?

Una **biblioteca de características** (*feature library*) es un archivo de texto
con extensión **`.fxl`** que contiene las definiciones de:

- **Códigos de característica** (*feature codes*).
- **Atributos** asociados a cada código.
- **Simbología y linework** (símbolos de punto, estilos y colores de línea).
- **Códigos de control** (*control codes*) que definen relaciones geométricas
  entre puntos.

Su propósito es **estandarizar la captura de datos en campo**: en lugar de que
cada operador invente su propia codificación, todos seleccionan códigos de una
biblioteca común. Esto garantiza que elementos del mismo tipo (postes, bordillos,
árboles, tuberías, etc.) compartan el mismo código, los mismos atributos y la
misma representación gráfica.

El mismo archivo `.fxl` se usa en **dos extremos del flujo de trabajo**:

1. **En campo** (Trimble Access / Siteworks / SiteVision): el topógrafo asigna a
   cada punto un código y rellena sus atributos.
2. **En oficina** (Trimble Business Center): se importa el mismo `.fxl` para
   procesar correctamente los códigos, generar el linework y exportar a CAD/GIS.

---

## 2. Las dos aplicaciones y sus roles

| Aspecto | **Trimble Access** (campo) | **Trimble Business Center / TBC** (oficina) |
|---|---|---|
| Rol principal | Captura de datos; asignar códigos y atributos a puntos | Crear/editar la biblioteca completa y procesar los datos |
| Herramienta | Editor de feature library integrado (limitado) | **Feature Definition Manager** (completo) |
| Qué se puede editar | Feature codes, tipos de línea, control codes | Todo: feature codes, **atributos**, **símbolos**, capas, control codes |
| Limitación | **No** permite definir atributos nuevos ni añadir símbolos | Sin limitaciones |

> **Recomendación de Trimble:** aunque Trimble Access permite editar códigos de
> una biblioteca existente, la creación y edición completa debe hacerse con el
> **Feature Definition Manager** de TBC. Una biblioteca que contenga atributos o
> símbolos **solo** puede crearse desde TBC.

### Feature Definition Manager (FDM)

Es una utilidad de Trimble Business Center (a la que se accede normalmente desde
**GIS ▸ Feature Definition ▸ Feature Definition Manager**) que permite crear y
gestionar la biblioteca y guardarla en un archivo `.fxl`.

Flujo típico:

1. Se crea o edita la biblioteca en el FDM.
2. Se exporta el `.fxl` y se transfiere a la carpeta **System Files** del
   controlador de campo.
3. El operador captura datos en campo usando esos códigos.
4. El proyecto se importa en TBC, que usa el **mismo** `.fxl` para interpretar
   códigos, dibujar el linework y poblar los atributos.

Trimble distribuye un archivo de ejemplo, **`GlobalFeatures.fxl`**, instalado en
la carpeta System Files, con códigos de punto, línea, atributos, símbolos y
control codes ya configurados, que sirve como punto de partida.

---

## 3. El archivo `.fxl`

### 3.1 Naturaleza del formato

- Es un **archivo XML** de texto plano.
- Puede abrirse e inspeccionarse con cualquier editor de texto, pero **se
  recomienda editarlo con el Feature Definition Manager** para no romper el
  esquema.
- Tiene un **número de versión de esquema** que determina qué funciones soporta
  (ver §6). Versiones más altas habilitan más tipos de control codes.

### 3.2 Estructura real (verificada en archivos de muestra)

> Esta estructura está **verificada** sobre dos archivos `.fxl` reales: uno
> generado por TBC en 2018 (`SchemaVersion="8"`) y otro en 2024
> (`SchemaVersion="9.3"`). Ver el análisis completo en la **§8**.

El elemento raíz es `<FeatureCodingDefinitions>` con el namespace
`http://trimble.com/schema/fxl` y un `SchemaVersion`. Sus hijos directos, **en
orden**, son:

```
<FeatureCodingDefinitions xmlns="http://trimble.com/schema/fxl"
                          CreationDate="…" DateModified="…" SchemaVersion="9.3">
├── <LineStyleDefinitions>      estilos de línea (patrones de Line/Location)
├── <SymbolDefinitions>         símbolos vectoriales (componentes Line y Arc)
├── <LabelStyles>               etiquetado automático de líneas, puntos y polígonos
│                               + <TextStyleDefinition> (fuente, altura, etc.)
├── <LayerDefinitions>          capas (color, line style, prioridad, impresión)
├── <ControlCodeDefinitions>    acciones de control (Type + Code de campo)
├── <FeatureDefinitions>        la lista de códigos
│   ├── <PointFeatureDefinition>  + <Symbols> + <Attributes>
│   └── <LineFeatureDefinition>   + estilo de línea + <Attributes>
│       (también existe <PolygonFeatureDefinition>, no presente en las muestras)
└── <FeatureCodeGroupDefinitions> grupos/botones de Measure codes (§6.bis)
```

Cada bloque declara **su propio namespace XML anidado** (`…/schema/linestyle`,
`…/schema/symbol`, `…/schema/labelstyle`, `…/schema/linelabel`, etc.).

### 3.3 Ejemplo de sintaxis XML real

Definición de un código de **línea** con atributos de texto (extraído de
`geologia.fxl`, `SchemaVersion="8"`):

```xml
<LineFeatureDefinition Code="LINEA" Name="Linea" Category="Lineas"
    IncludeInSurface="true" Color="FE000000" Layer="Lineas"
    FieldLineStyle="Solid" LineStyleName="Solid" LineStyleScale="1"
    LineLabelStyle="" PointLabelStyle="" PointLayer="0">
  <Attributes>
    <StringAttribute Name="Tipo de falla" EntryMethod="Optional" MaximumLength="50" />
    <StringAttribute Name="Manteo"        EntryMethod="Optional" MaximumLength="50" />
    <StringAttribute Name="Espesor"       EntryMethod="Optional" MaximumLength="50" />
  </Attributes>
</LineFeatureDefinition>
```

Definición de un código de **punto** con símbolo cuya **rotación se toma de un
atributo** (simbología dinámica, extraído de `BIBLIO_GEO_2022.fxl`,
`SchemaVersion="9.3"`):

```xml
<PointFeatureDefinition Code="SEÑAL" Name="SEÑAL" Category="..."
    IncludeInSurface="true" Color="FE000000" Layer="..." PointLabelStyle="">
  <Symbols>
    <Symbol>
      <DimensionOneValue><FixedValue>2</FixedValue></DimensionOneValue>
      <Rotation><AttributeName>ROTACION</AttributeName></Rotation>  <!-- ← dinámico -->
      <Name>SEÑAL</Name>
      <Color>FE000000</Color>
      <SymbolName>SC</SymbolName>
      <Scale><FixedValue>1</FixedValue></Scale>
      <Dimensioning>Paper</Dimensioning>
    </Symbol>
  </Symbols>
  <Attributes>
    <DoubleAttribute Name="ROTACION" EntryMethod="Optional" IsLabelVisible="true"
        MinimumValue="-1.7976931348623157E+308"
        MaximumValue="1.7976931348623157E+308"/>
  </Attributes>
</PointFeatureDefinition>
```

---

## 4. Componentes de la biblioteca en detalle

### 4.1 Tipos de *feature code*

Al crear un código se define: **nombre** (hasta ~20 caracteres), **descripción**
opcional, **tipo** y **capa**. Los tipos son:

| Tipo | Descripción | Configuración asociada |
|---|---|---|
| **Point** | Elemento puntual (poste, árbol, tapa de registro) | Requiere un **símbolo** |
| **Line** | Elemento lineal (cerca, bordillo, eje de vía) | Estilo de línea, *field line style* y color |
| **Polygon / Area** | Elemento de superficie cerrada (edificio, parcela) | Estilo de línea/borde y color |
| **Control code** | No es un elemento físico: modifica cómo se conectan/dibujan los puntos | Una **acción de control** (ver §5) |

### 4.2 Atributos

Un **atributo** es una propiedad de la característica almacenada en la base de
datos (p. ej. un camino tiene nombre, tipo de superficie, ancho, número de
carriles). Todo elemento tiene además su **posición geográfica** como atributo
implícito.

**Tipos de atributo** (en la UI del Feature Definition Manager → elemento XML real
en el `.fxl`):

| Tipo en la UI | Elemento XML | Contenido |
|---|---|---|
| **Number** | `<DoubleAttribute>` | Valor numérico con decimales; `MinimumValue`/`MaximumValue` (±Double.MaxValue si sin límite) |
| **Integer** | `<IntegerAttribute>` | Número entero; admite mínimo/máximo/valor por defecto |
| **Text** | `<StringAttribute>` | Cadena de caracteres; `MaximumLength` (y longitud mínima) |
| **Date** | `<DateAttribute>` | Fecha; formato de visualización configurable |
| **Time** | `<TimeAttribute>` | Hora; formato configurable |
| **List / Menu** | `<ListAttribute>` | Lista predefinida de valores seleccionables (añadir/quitar/ordenar) |
| **File** | `<FileAttribute>` | Referencia a un archivo externo asociado |
| **Photo** | `<PhotoAttribute>` | Fotografía; puede tener opción *Auto Generate* (captura automática) |

> Propiedades comunes observadas en las muestras: `Name`, `Description`,
> `EntryMethod`, `DefaultValue` y `IsLabelVisible` (controla si el valor se
> muestra como etiqueta en el mapa).

**Método de entrada** (*Input method / EntryMethod*) — común a todos:

- **Required** — exige un valor o selección válida antes de guardar.
- **Optional / Normal** — el valor es opcional.
- **Office use only** — no se muestra en campo (Trimble Access); solo se usa en TBC.
- **Read-only / Display only** — visible pero no editable en campo.
- **Auto Generate** — (solo Photo) captura automática desde el dispositivo.
- **AutoSequence / valor por defecto** — para autoincrementar o prerellenar.

### 4.3 Simbología y linework

- **Símbolos de punto**: definen cómo se ve un punto en el mapa (forma, color,
  tamaño).
- **Estilos de línea**: grosor, color, patrón (continua, discontinua…) para
  líneas y bordes de polígono.
- El linework puede gestionarse de dos formas:
  - **Codes on points** — los símbolos y el linework se derivan de los códigos
    almacenados en los puntos; no se guarda linework como objeto en el proyecto.
  - **Codes on lines** — se almacenan polilíneas y polígonos con sus códigos como
    objetos del proyecto.

---

## 5. Códigos de control (*Control codes*)

Los **control codes** no representan objetos físicos: instruyen al software sobre
**cómo conectar y dibujar** la geometría a partir de la secuencia de puntos
medidos. Se introducen en campo junto con el código de la característica. Permiten
construir líneas, curvas, rectángulos, arcos, etc., directamente desde el
levantamiento.

Acciones de control habituales (la disponibilidad depende de la versión del FXL):

| Categoría | Acciones típicas | Función |
|---|---|---|
| **Secuencias de unión (Join)** | Start join sequence / End join sequence / Join to named point | Marcar inicio y fin de una polilínea, o unir a un punto concreto |
| **Curvas suaves** | Smooth curve **on** / Smooth curve **off** | Activar/desactivar interpolación de curva suave entre puntos *(FXL v4+)* |
| **Arcos** | Start arc / End arc | Definir tramos de arco dentro de la línea |
| **Rectángulos y círculos** | Rectangle / Circle | Construir geometrías regulares a partir de pocos puntos *(FXL v5+)* |
| **Desplazamientos (Offset)** | Horizontal offset / Vertical offset | Desplazar el linework respecto al punto medido *(FXL v6+)* |
| **Cierre** | Close | Cerrar la polilínea/polígono al punto inicial |
| **Bloques (Block)** | Rotation, Scale X/Y/Z, From 1/2/3 points | Insertar y orientar bloques CAD (símbolos complejos) |

**Control codes de bloque** (Block) — propiedades:

- **Rotation** — rota el bloque el valor indicado, en sentido horario, alrededor
  del punto actual.
- **Scale X / Scale Y / Scale Z** — escala el bloque en cada eje (Z para bloques 3D).
- **From 1 point** — inserta el bloque usando el punto actual como inserción.
- **From 2 points** — usa el punto actual y el siguiente (define orientación/escala).
- **From 3 points** — usa los tres puntos siguientes.

---

## 6. Versionado del esquema FXL

El archivo `.fxl` lleva una **versión de esquema** que condiciona las funciones
disponibles. Conviene que la versión del FXL sea compatible con la versión del
software de campo/oficina:

| Función | Versión mínima de FXL |
|---|---|
| Smooth curve control codes | **v4** |
| Rectangle y circle control codes | **v5** |
| Horizontal y vertical offset control codes | **v6** |

> Usar un `.fxl` de versión más alta en un software antiguo puede provocar que
> ciertos control codes no se reconozcan.

---

## 6.bis Codificación rápida en campo

En Trimble Access (módulo **Measure codes**) se **mide y codifica en un solo
paso**: en el **campo `Code`** se escribe tanto el código de la característica
como los **control codes** que indican cómo construir la geometría. El software
los interpreta sobre la marcha y dibuja el linework automáticamente.

### Reglas de sintaxis

- Los códigos se **separan por espacios** (el software inserta el espacio al
  pulsar cada botón).
- El **control code va siempre detrás** del *line code* al que se aplica.
- El campo `Code` admite un **máximo de 60 caracteres**.
- Se trabaja con **botones grandes** configurables (un toque = un código).
- El botón **Multi-code** permite combinar varios códigos en el mismo punto.
- En Measure codes conviene pulsar **primero el control code** y luego el feature
  code, porque este último suele disparar la medición.

### Ejemplos de cadenas de código

| Objetivo | Campo `Code` resultante |
|---|---|
| Empezar una línea | `CL Start`  *(line code + Start join sequence)* |
| Terminar el tramo / abrir un hueco | `CL End` |
| Reanudar la línea tras el hueco | `CL Start` |
| Unir a un punto nombrado | `<line code> <Join to named point> 123` |
| Unir al primer punto del mismo código | `<line code> <Join to first (same code)>` |
| No unir este punto | `<line code> <No join>` |
| Curva suave | `<Start smooth curve> CL` … `<End smooth curve>` |
| Arco tangencial | `<Start join sequence> CL <Start tangential arc>` |
| Arco no tangencial | `<Start join sequence> CL <Start non-tangential arc>` |
| Círculo por borde (3 puntos) | `<Start circle (edge)> CL` (1.º), luego `CL`, `CL` |
| Círculo por centro con radio 8 | `<Start circle (center)> CL 8` |
| Rectángulo con ancho 0.5 | `CL <Start rectangle> 0.5` (multi-code) |
| Bordillo con offset (*curb & gutter*) | `CL <Horizontal offset> 0.3 <Vertical offset> 0.04` |

### Stringing (encadenado de líneas paralelas)

Cuando se levantan **varias entidades del mismo tipo a la vez** (p. ej. tres
cercas en paralelo), se añade un **sufijo numérico** al código para distinguir
cada cadena: los puntos con el mismo sufijo se unen entre sí y quedan separados
de los de otra cadena.

```
FENCE01   FENCE02   FENCE03
```

- El softkey **`+`** incrementa el sufijo automáticamente al medir.
- El **formato del sufijo** es configurable: `1`, `01`, `001` o `0001`.

### Convenios de signo (offsets y geometrías)

- **Offset horizontal:** positivo = derecha, negativo = izquierda (en el sentido
  de avance de la línea).
- **Offset vertical:** positivo = arriba, negativo = abajo.
- **Ancho de rectángulo:** positivo = a la derecha del eje, negativo = a la izquierda.

> Estos control codes de campo se corresponden con las **acciones de control code**
> definidas en el `.fxl` (ver §5) y requieren la **versión de esquema** adecuada
> (curvas v4, rectángulos/círculos v5, offsets v6 — ver §6).

---

## 7. Flujo de trabajo completo (resumen)

```
┌─────────────────────────────┐
│  OFICINA (TBC)              │
│  Feature Definition Manager │  1. Crear/editar biblioteca
│        ↓                    │     (códigos, atributos, símbolos,
│   Exportar .fxl             │      control codes, capas)
└──────────┬──────────────────┘
           │ copiar a System Files del controlador
           ▼
┌─────────────────────────────┐
│  CAMPO (Trimble Access)     │  2. Asignar código + atributos
│  Medir con feature codes    │     a cada punto; usar control
│        ↓                    │     codes para el linework
│   Levantamiento (.job)      │
└──────────┬──────────────────┘
           │ descargar a oficina
           ▼
┌─────────────────────────────┐
│  OFICINA (TBC)              │  3. Importar usando el MISMO .fxl
│  Process Feature Codes      │     → genera linework, símbolos
│        ↓                    │       y rellena atributos
│   Export a CAD/GIS          │  4. Exportar (DWG/DXF, Shapefile,
└─────────────────────────────┘     GeoPackage, CSV, etc.)
```

### 7.1 El código en los datos exportados

La biblioteca de características (definida en TBC o en Trimble Access) **viaja
con cada punto medido**: al asignar un código en campo, ese código queda
**almacenado en el punto** dentro del levantamiento.

Por eso, cuando exportas los puntos a un formato tabular —por ejemplo un
**CSV**— aparece un **campo `Code`** (código) cuyo valor es **exactamente el
código de la biblioteca** que definiste. Es el nexo entre la biblioteca y los
datos:

```
Punto,Norte,Este,Cota,Codigo
101,5234.120,8120.045,512.30,SEÑAL
102,5235.880,8121.770,512.10,ARBOL
103,5237.450,8123.010,511.95,BORD
104,5239.000,8124.660,511.80,BORD FIN
```

- El campo `Codigo`/`Code` contiene el **código de feature** de la biblioteca
  (`SEÑAL`, `ARBOL`, `BORD`…) y, si se usaron, los **control codes** anexados
  separados por espacio (`BORD FIN` = bordillo + fin de secuencia).
- **El CSV exporta el código, no la definición**: no incluye el símbolo, el
  estilo de línea ni los tipos de atributo; solo el texto del código (y, según
  el exportador, los valores de los atributos como columnas adicionales). Para
  reconstruir simbología y linework hace falta volver a aplicar el **mismo
  `.fxl`** en el software que lo interprete.
- En cambio, exportadores con esquema (DWG/DXF, Shapefile, **GeoPackage**) sí
  pueden trasladar capas, geometría y atributos, porque el `.fxl` se usó al
  procesar los códigos en oficina.

> En resumen: **defines la biblioteca → mides asignando códigos → al exportar, el
> campo `Code` de cada punto "representa" esa biblioteca.** El código es el
> identificador que enlaza el dato de campo con la definición del `.fxl`.

---

## 8. Anatomía real de un archivo `.fxl` (análisis de muestras)

Esta sección documenta lo aprendido al analizar dos archivos `.fxl` reales:

| Archivo | Origen | `SchemaVersion` | Tamaño | Contenido principal |
|---|---|---|---|---|
| `geologia.fxl` | TBC, 2018 | **8** | ~190 líneas | 1 código de línea con 4 atributos de texto; estructura mínima |
| `BIBLIO_GEO_2022.fxl` | TBC, 2024 | **9.3** | ~8480 líneas | 43 puntos + 15 líneas, 75 símbolos, 54 capas, control codes y grupos |

### 8.1 Hallazgos relevantes (no triviales)

1. **Raíz y versión decimal.** El elemento raíz es
   `<FeatureCodingDefinitions xmlns="http://trimble.com/schema/fxl">` con
   `CreationDate`, `DateModified` y `SchemaVersion`. La versión **puede ser
   decimal** (`9.3`), no solo entera.

2. **Nombres de elementos reales ≠ nombres de la UI.** El XML usa
   `StringAttribute`, `DoubleAttribute`, `IntegerAttribute`, `ListAttribute`…
   (no "Text"/"Number"). Conviene conocerlos para inspeccionar o transformar el
   archivo (ver tabla en §4.2).

3. **Simbología dinámica dirigida por atributos.** En `<Symbols><Symbol>`, los
   valores de **dimensión, rotación y escala** pueden ser:
   - `<FixedValue>0</FixedValue>` → valor fijo, **o**
   - `<AttributeName>ROTACION</AttributeName>` → **se toma del atributo** del
     punto.

   Ejemplos reales: la rotación de una señal sale del atributo `ROTACION`; la
   envergadura del símbolo de un árbol sale del atributo `Envergadura`. Así, un
   mismo símbolo se dibuja girado/escalado según los datos capturados en campo.
   Cada símbolo lleva además `Name`, `Color`, `SymbolName` (referencia a un
   `SymbolDefinition`, p. ej. `SC` o `Poste Hormigon Lum[2121]`) y
   `Dimensioning` (`Paper` o `Ground`).

4. **`ControlCodeDefinitions` declara las acciones de control.** Cada una es
   `<ControlCodeDefinition Type="End" Description="FIN" Code="FIN"/>`:
   - `Type` = la **acción** (p. ej. `End` = *End join sequence*),
   - `Code` = el **texto que se teclea en campo** (`FIN`),
   - `Description` = etiqueta legible.

   Es decir, el `Code` de campo de un control code es **configurable** por el
   usuario en cada biblioteca (en estas muestras solo se definió la acción
   `End`).

5. **`FeatureCodeGroupDefinitions` = los botones de Measure codes.** Materializa
   la codificación rápida (§6.bis) dentro del propio `.fxl`:

   ```xml
   <FeatureCodeGroupDefinition Name="biblio" Description="biblio">
     <Items>
       <Item><Code>BORD</Code></Item>            <!-- botón: solo bordillo -->
       <Item><Code>BORD</Code><Code>FIN</Code></Item> <!-- botón: bordillo + FIN -->
       <Item><Code>ARBOL</Code></Item>
     </Items>
   </FeatureCodeGroupDefinition>
   ```

   Un `<Item>` con **varios `<Code>`** es exactamente un botón que combina un
   feature code con un control code (cierra la línea con `FIN`). Esto confirma,
   sobre datos reales, la sintaxis de codificación rápida descrita en §6.bis.

6. **Color en formato ARGB hex de 8 dígitos.** Ej. `FFFFFFFF` (blanco opaco),
   `FE000000` (negro). Los dos primeros dígitos son el canal alfa.

7. **Capas más ricas de lo documentado.** Cada `<LayerDefinition>` incluye
   `Name`, `Color`, `LineStyleName`, `LineWeight`, `ProtectLayer`, `LayerGroup`,
   y además **`DisplayPriority`** (orden de dibujo) y **`Print`** (si se imprime).

8. **Símbolos vectoriales propios.** `<SymbolDefinitions>` define cada símbolo
   con componentes geométricos `<Line>` y `<Arc>` (con `StartAngle`, `Radius`,
   `DeltaAngle`) sobre coordenadas `<Location X= Y=>`, más `Scale`
   (`Size="Variable"`/`"Fixed"`), `Rotation` (`Type="Allow"`) y `Dimension`.

9. **Etiquetado automático.** `<LabelStyles>` define cómo se rotulan
   automáticamente líneas (distancia, rumbo, radio de arco), puntos (nombre,
   cota) y polígonos (nombre, área), con un `<TextStyleDefinition>` (fuente
   `Courier New`, altura, justificación…).

### 8.2 Características que las muestras **no** ejercitan

Estos dos archivos **no cubren todo** lo que un `.fxl` puede contener. No
aparecen, pero sí son válidos en el esquema:

- Tipos de atributo `IntegerAttribute`, `DateAttribute`, `TimeAttribute`,
  `FileAttribute`/`PhotoAttribute` y listas de menú con opciones seleccionables
  (`ListAttribute` con `<Items>` de valores elegibles). En las muestras los
  `ListAttribute` aparecen vacíos dentro de los símbolos.
- `PolygonFeatureDefinition` (solo hay Point y Line).
- La mayoría de **acciones de control code** (solo se definió `End`); no hay
  `Start`, curvas, rectángulos, círculos ni offsets.
- `EntryMethod` distintos de `Optional`/`Required` (p. ej. *Office use only* /
  *Read-only*).

> **Conclusión:** las muestras son un buen ejemplo **práctico y real** del
> esquema (raíz, capas, símbolos dinámicos, control codes y grupos de códigos),
> pero **no** son exhaustivas. El documento describe el conjunto completo de
> posibilidades; las muestras confirman y aterrizan la parte central del formato.

---

## 9. Buenas prácticas

- **Edita siempre desde el Feature Definition Manager** de TBC para no corromper
  el esquema XML; reserva el editor de Trimble Access para ajustes menores.
- Mantén **un único `.fxl` maestro** compartido entre campo y oficina, así los
  códigos y atributos coinciden exactamente en ambos extremos.
- Parte de **`GlobalFeatures.fxl`** como plantilla y adáptalo.
- Define atributos **Required** solo cuando realmente sean imprescindibles, para
  no ralentizar la captura en campo.
- Usa **Office use only** para atributos que el operador no debe ver en campo.
- Controla la **versión del FXL** para asegurar compatibilidad con tus equipos.
- Asigna **capas** coherentes a los códigos para facilitar el filtrado y la
  exportación a CAD/GIS.

---

## 10. Fuentes

- [Feature library — Trimble Access Help](https://help.fieldsystems.trimble.com/trimble-access/latest/en/feature-libraries.htm)
- [To add or edit a feature library in Trimble Access](https://help.fieldsystems.trimble.com/trimble-access/latest/en/feature-libraries-edit.htm)
- [Trimble Business Center feature libraries](https://help.fieldsystems.trimble.com/trimble-access/latest/en/feature-libraries-fdm.htm)
- [Feature Definition Manager — TBC Help](https://help.fieldsystems.trimble.com/tbc/1868_1.htm)
- [Feature Definition Library (*.fxl) file — TBC Help](https://help.fieldsystems.trimble.com/tbc/2369.htm)
- [Work with Feature Definition Attributes — TBC Help](https://help.fieldsystems.trimble.com/tbc/23428.htm)
- [Work with the Feature Library and Feature Definition Files — TBC Help](https://help.fieldsystems.trimble.com/tbc/23341.htm)
- [Import Feature Definition Files (.fxl) — TBC Help](https://help.fieldsystems.trimble.com/tbc/10172.htm)
- [Export Feature Definition Files (.fxl) — TBC Help](https://help.fieldsystems.trimble.com/tbc/23519.htm)
- [Measuring with feature codes — Siteworks Help](https://help.fieldsystems.trimble.com/siteworks/en/measurement-workflows-feature-codes.htm)
- [Controlling feature geometry using control codes — Trimble Access Help](https://help.fieldsystems.trimble.com/trimble-access/latest/en/feature-libraries-control-codes.htm)
- [To create features using control codes in Measure codes — Trimble Access Help](https://help.fieldsystems.trimble.com/trimble-access/latest/en/map-cad-create-features.htm)
- [Measuring and coding observations in one step (Measure codes) — Trimble Access Help](https://help.fieldsystems.trimble.com/trimble-access/2022.10/en/Measure-codes.htm)
