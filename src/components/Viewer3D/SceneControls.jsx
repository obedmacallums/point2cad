import { OrbitControls, Grid } from '@react-three/drei'

export default function SceneControls() {
  return (
    <>
      <OrbitControls makeDefault />
      <Grid
        infiniteGrid
        cellSize={1}
        cellThickness={0.5}
        sectionSize={10}
        sectionThickness={1}
        fadeDistance={200}
        position={[0, 0, 0]}
      />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={1} />
    </>
  )
}
