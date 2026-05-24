import { useRef, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Line, Instances, Instance, Html } from '@react-three/drei'
import { useApp } from '../../context/AppContext'

function CameraRig({ spread, controlsRef }) {
  const { camera } = useThree()

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

  const lib = featureLibrary ?? {}

  function getColor(codigo) {
    return lib[codigo]?.color ?? '#60a5fa'
  }

  // Centroide + spread → trasladar la escena al origen evita pérdida de precisión
  // Float32 cuando las coordenadas UTM están en el orden de 10^6
  const { originX, originY, spread, pointSize } = useMemo(() => {
    const allX = [
      ...points.map((p) => p.x),
      ...lines.flatMap((l) => l.vertices.map((v) => v[0])),
      ...polylines.flatMap((pl) => pl.vertices.map((v) => v[0])),
    ]
    const allY = [
      ...points.map((p) => p.y),
      ...lines.flatMap((l) => l.vertices.map((v) => v[1])),
      ...polylines.flatMap((pl) => pl.vertices.map((v) => v[1])),
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
  }, [points, lines, polylines])

  // CSV (x=Este, y=Norte, z=Elevación) → Three.js (x, y=arriba, z=sur), trasladado al origen
  const toLocal = ([x, y, z]) => [x - originX, z, -(y - originY)]

  // Agrupar puntos por color para usar una sola InstancedMesh por color
  const pointsByColor = useMemo(() => {
    const groups = {}
    for (const pt of points) {
      const color = getColor(pt.codigo)
      if (!groups[color]) groups[color] = []
      groups[color].push(pt)
    }
    return groups
  }, [points, lib]) // eslint-disable-line

  return (
    <Canvas
      camera={{ position: [0, 100, 100], fov: 50, near: 0.1, far: spread * 20 }}
      className="bg-gray-950"
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

      <CameraRig spread={spread} controlsRef={controlsRef} />

      {/* Puntos: una InstancedMesh por color (1 draw call por grupo) */}
      {Object.entries(pointsByColor).map(([color, pts]) => (
        <Instances key={color} limit={pts.length}>
          <sphereGeometry args={[pointSize, 10, 10]} />
          <meshStandardMaterial color={color} />
          {pts.map((pt) => {
            const [lx, ly, lz] = toLocal([pt.x, pt.y, pt.z])
            return <Instance key={pt.nombre} position={[lx, ly, lz]} />
          })}
        </Instances>
      ))}

      {/* Etiquetas (DOM): aceptable para cientos de puntos; con miles conviene troika-three-text */}
      {points.map((pt) => {
        const [lx, ly, lz] = toLocal([pt.x, pt.y, pt.z])
        return (
          <Html
            key={`label-${pt.nombre}`}
            position={[lx, ly, lz]}
            center
            distanceFactor={pointSize * 50}
          >
            <span
              style={{
                color: 'white',
                fontSize: '11px',
                background: 'rgba(0,0,0,0.55)',
                padding: '1px 5px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {pt.nombre}
            </span>
          </Html>
        )
      })}

      {/* Líneas abiertas */}
      {lines.map((line, i) => (
        <Line
          key={`line-${i}`}
          points={line.vertices.map(toLocal)}
          color={getColor(line.codigo)}
          lineWidth={2}
        />
      ))}

      {/* Polilíneas cerradas */}
      {polylines.map((poly, i) => {
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
    </Canvas>
  )
}
