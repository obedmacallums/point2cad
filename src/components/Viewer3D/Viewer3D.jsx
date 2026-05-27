import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import {
  OrbitControls,
  Grid,
  Line,
  Html,
  GizmoHelper,
  GizmoViewport,
} from '@react-three/drei'
import { CanvasTexture } from 'three'
import { useApp } from '../../context/AppContext'
import ViewerToolbar from './ViewerToolbar'

// Tamaño de punto en píxeles de pantalla. sizeAttenuation:false en el material
// hace que se renderice constante sin importar el zoom de cámara.
const POINT_PIXEL_SIZE = 8

// Textura circular blanca aplicada como map al PointsMaterial → convierte
// el cuadrado por defecto de gl_PointSize en un disco. Se multiplica con
// el color del material, por lo que cada grupo conserva su color.
const CIRCLE_TEXTURE = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.beginPath()
  ctx.arc(32, 32, 30, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.fill()
  return new CanvasTexture(canvas)
})()

// El threshold del raycaster para <points> está en unidades de mundo, pero
// nuestros puntos son constantes en pantalla → recalculamos cada frame el
// equivalente en mundo del radio visible usando la distancia cámara→target.
// Sin esto el click area no coincide con lo que el usuario ve.
function PointsRaycasterTuner({ pixelSize }) {
  const { camera, raycaster, size, controls } = useThree()
  useFrame(() => {
    const distance = controls?.target
      ? camera.position.distanceTo(controls.target)
      : camera.position.length()
    const fov = (camera.fov * Math.PI) / 180
    const worldPerPixel = (2 * distance * Math.tan(fov / 2)) / size.height
    raycaster.params.Points.threshold = (pixelSize / 2) * worldPerPixel
  })
  return null
}

function CameraRig({ spread, controlsRef, cameraRef }) {
  const { camera } = useThree()

  useEffect(() => {
    cameraRef.current = camera
  }, [camera, cameraRef])

  useEffect(() => {
    camera.position.set(0, spread * 0.9, spread * 1.4)
    camera.lookAt(0, 0, 0)
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }, [spread]) // eslint-disable-line

  return null
}

export default function Viewer3D() {
  const { state } = useApp()
  const { points, lines, polylines, featureLibrary } = state
  const controlsRef = useRef()
  const cameraRef = useRef()
  const [selectedPoint, setSelectedPoint] = useState(null)

  const lib = featureLibrary ?? {}

  function getColor(codigo) {
    return lib[codigo]?.color ?? '#60a5fa'
  }

  function isVisible(codigo) {
    return lib[codigo]?.visible !== false
  }

  const visiblePoints = useMemo(
    () => points.filter((p) => isVisible(p.codigo)),
    [points, lib], // eslint-disable-line
  )
  const visibleLines = useMemo(
    () => lines.filter((l) => isVisible(l.codigo)),
    [lines, lib], // eslint-disable-line
  )
  const visiblePolylines = useMemo(
    () => polylines.filter((pl) => isVisible(pl.codigo)),
    [polylines, lib], // eslint-disable-line
  )

  // Centroide + spread → trasladar la escena al origen evita pérdida de precisión
  // Float32 cuando las coordenadas UTM están en el orden de 10^6
  const { originX, originY, spread, pointSize } = useMemo(() => {
    const allX = [
      ...visiblePoints.map((p) => p.x),
      ...visibleLines.flatMap((l) => l.vertices.map((v) => v[0])),
      ...visiblePolylines.flatMap((pl) => pl.vertices.map((v) => v[0])),
    ]
    const allY = [
      ...visiblePoints.map((p) => p.y),
      ...visibleLines.flatMap((l) => l.vertices.map((v) => v[1])),
      ...visiblePolylines.flatMap((pl) => pl.vertices.map((v) => v[1])),
    ]

    if (allX.length === 0) {
      return { originX: 0, originY: 0, spread: 10, pointSize: 0.12 }
    }

    const minX = Math.min(...allX)
    const maxX = Math.max(...allX)
    const minY = Math.min(...allY)
    const maxY = Math.max(...allY)
    const ox = (minX + maxX) / 2
    const oy = (minY + maxY) / 2
    const s = Math.max(maxX - minX, maxY - minY, 10)
    return { originX: ox, originY: oy, spread: s, pointSize: s * 0.012 }
  }, [visiblePoints, visibleLines, visiblePolylines])

  // CSV (x=Este, y=Norte, z=Elevación) → Three.js (x, y=arriba, z=sur), trasladado al origen
  const toLocal = ([x, y, z]) => [x - originX, z, -(y - originY)]

  // Agrupar puntos por color y construir un Float32Array de posiciones por grupo.
  // Cada grupo se renderiza como un único <points> (1 draw call) con
  // PointsMaterial(sizeAttenuation:false) → tamaño constante en pantalla.
  const pointBuffers = useMemo(() => {
    const groups = {}
    for (const pt of visiblePoints) {
      const color = getColor(pt.codigo)
      if (!groups[color]) groups[color] = []
      groups[color].push(pt)
    }
    return Object.entries(groups).map(([color, pts]) => {
      const positions = new Float32Array(pts.length * 3)
      for (let i = 0; i < pts.length; i++) {
        const [lx, ly, lz] = toLocal([pts[i].x, pts[i].y, pts[i].z])
        positions[i * 3] = lx
        positions[i * 3 + 1] = ly
        positions[i * 3 + 2] = lz
      }
      return { color, pts, positions }
    })
  }, [visiblePoints, lib, originX, originY]) // eslint-disable-line

  const setView = useCallback(
    (view) => {
      const cam = cameraRef.current
      const ctrl = controlsRef.current
      if (!cam || !ctrl) return

      // Pequeño offset (0.001) en vista superior para evitar gimbal lock de OrbitControls
      const d = spread * 1.4
      const positions = {
        top: [0, d, 0.001],
        front: [0, 0, d],
        side: [d, 0, 0],
        iso: [0, spread * 0.9, d],
        fit: [0, spread * 0.9, d],
      }

      const [x, y, z] = positions[view] ?? positions.iso
      cam.position.set(x, y, z)
      ctrl.target.set(0, 0, 0)
      cam.lookAt(0, 0, 0)
      ctrl.update()
    },
    [spread],
  )

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 100, 100], fov: 50, near: 0.1, far: spread * 20 }}
        className="bg-gray-950"
        onPointerMissed={() => setSelectedPoint(null)}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[1, 2, 1]} intensity={0.6} />

        <OrbitControls ref={controlsRef} makeDefault />
        <Grid
          infiniteGrid
          cellSize={spread * 0.05}
          sectionSize={spread * 0.2}
          fadeDistance={spread * 4}
          position={[0, -pointSize * 0.5, 0]}
        />

        <CameraRig
          spread={spread}
          controlsRef={controlsRef}
          cameraRef={cameraRef}
        />

        <PointsRaycasterTuner pixelSize={POINT_PIXEL_SIZE} />

        {/* Puntos: un <points> por color (1 draw call por grupo) con tamaño
            constante en pantalla. El índice del punto clickeado viene en
            e.index del evento de raycast, lo usamos para identificar pt. */}
        {pointBuffers.map(({ color, pts, positions }) => (
          <points
            key={color}
            onPointerOver={(e) => {
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              document.body.style.cursor = ''
            }}
            onClick={(e) => {
              e.stopPropagation()
              const pt = pts[e.index]
              if (pt) setSelectedPoint((cur) => (cur === pt ? null : pt))
            }}
          >
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[positions, 3]}
              />
            </bufferGeometry>
            <pointsMaterial
              color={color}
              size={POINT_PIXEL_SIZE}
              sizeAttenuation={false}
              map={CIRCLE_TEXTURE}
              alphaTest={0.5}
              transparent
            />
          </points>
        ))}

        {/* Tooltip de selección: tamaño constante en pantalla (sin distanceFactor).
            El wrapper se ancla con su BOTTOM en el punto (translate -50%), y
            la línea conectora es el último hijo del flex column → su base
            queda exactamente sobre el punto seleccionado.
            Click en vacío lo cierra vía onPointerMissed del Canvas. */}
        {selectedPoint && (
          <Html
            position={toLocal([selectedPoint.x, selectedPoint.y, selectedPoint.z])}
            center
            zIndexRange={[100, 0]}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transform: 'translate(0, -50%)',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  color: 'white',
                  fontSize: 'clamp(12px, 1.05vmin, 14px)',
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '8px 10px',
                  borderRadius: '4px',
                  whiteSpace: 'nowrap',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  lineHeight: 1.4,
                  minWidth: '150px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  {selectedPoint.nombre}
                </div>
                <div style={{ opacity: 0.7 }}>{selectedPoint.codigo}</div>
                <div style={{ marginTop: 6, opacity: 0.85 }}>
                  X: {selectedPoint.x}
                  <br />
                  Y: {selectedPoint.y}
                  <br />
                  Z: {selectedPoint.z}
                </div>
              </div>
              <div
                style={{
                  width: '1px',
                  height: '24px',
                  background: 'rgba(255,255,255,0.5)',
                }}
              />
            </div>
          </Html>
        )}

        {/* Líneas abiertas */}
        {visibleLines.map((line, i) => (
          <Line
            key={`line-${i}`}
            points={line.vertices.map(toLocal)}
            color={getColor(line.codigo)}
            lineWidth={2}
          />
        ))}

        {/* Polilíneas cerradas */}
        {visiblePolylines.map((poly, i) => {
          const pts = poly.vertices.map(toLocal)
          return (
            <Line
              key={`poly-${i}`}
              points={[...pts, pts[0]]}
              color={getColor(poly.codigo)}
              lineWidth={2}
            />
          )
        })}

        {/* Gizmo de ejes en esquina (rota con la cámara, clickeable).
            Labels remapean three.js (X, Y, Z) → semántica CSV/topográfica (X, Z, Y):
            three-Y es la altura (Z del CSV) y three-Z corresponde al eje Y horizontal. */}
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport
            axisColors={['#ef4444', '#3b82f6', '#22c55e']}
            labelColor="white"
            labels={['X', 'Z', 'Y']}
          />
        </GizmoHelper>
      </Canvas>

      <ViewerToolbar onSetView={setView} />
    </div>
  )
}
