/**
 * The actual `<Canvas>` tree for `/switches/:slug`. Default-exported so
 * `SwitchDetailCanvasHost.tsx` can `React.lazy()`-import this module
 * specifically - same lazy-chunk isolation rule as
 * `BuildScene.tsx`/`BuildCanvasHost.tsx`: everything that pulls in
 * `three`/`@react-three/fiber`/`@react-three/drei` lives in this file (or
 * things it imports), never imported eagerly/statically from anywhere
 * outside `SwitchDetailCanvasHost.tsx`.
 *
 * Renders one switch as four independently-positioned meshes (stem,
 * spring, topHousing, bottomHousing) that fly apart along Y as
 * `explodeFactor` goes 0 -> 1, per-part offset =
 * `part.explodeOffsetY * explodeFactor` (`shared/src/switchSpec.ts`'s
 * `explodedParts` is the data source, nothing here invents new numbers).
 * `BASE_Y` below is this component's own stylized assembled stacking
 * position per part (where it sits when `explodeFactor === 0`) - not
 * literal switch-anatomy ratios, same "generic stand-in good enough to
 * read correctly" spirit as `Switch.tsx`'s doc comment.
 *
 * Deliberately not reusing `Switch.tsx`: that component is an instanced,
 * multi-key stand-in sized to sit under every keycap on a full board -
 * wrong shape for a single large, part-by-part exploded showpiece. It
 * still reuses `materials.ts`'s `switchHousing`/`switchStem`/`switchSpring`.
 *
 * Reduced motion: a part's rendered Y lerps toward its target every frame
 * (same damped-exponential ease as `CameraRig.tsx`) unless
 * `useReducedMotion()` is true, in which case every position change
 * (explode slider or the press button) snaps straight to its target in
 * one frame, no tween. No `frameloop="demand"`/`<PerformanceMonitor>`
 * tiering here (unlike `BuildScene.tsx`): that machinery exists for a
 * full keyboard's worth of instanced geometry; a single 4-mesh switch has
 * no comparable perf budget to protect.
 */
import { OrbitControls } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { useRef } from "react"
import * as THREE from "three"
import type { SwitchExplodedPart, SwitchExplodedPartId } from "@shared"
import { useReducedMotion } from "@/lib/useReducedMotion"
import { materials } from "./materials"

/** Assembled (explodeFactor === 0) stacking position per part, low -> high. */
const BASE_Y: Record<SwitchExplodedPartId, number> = {
  bottomHousing: 0,
  spring: 0.15,
  topHousing: 0.3,
  stem: 0.45,
}

/** How far the stem travels down into the housing while pressed, in world units. */
const PRESS_TRAVEL_Y = 0.18
/** Damped-lerp ease rate - same family of constant as `CameraRig.tsx`'s `speed` default. */
const EASE_SPEED = 10

const HOUSING_BOTTOM_GEOMETRY = new THREE.BoxGeometry(1, 0.4, 1)
const HOUSING_TOP_GEOMETRY = new THREE.BoxGeometry(0.8, 0.3, 0.8)
const SPRING_GEOMETRY = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 16)
const STEM_GEOMETRY = new THREE.CylinderGeometry(0.15, 0.15, 0.5, 16)

function geometryFor(id: SwitchExplodedPartId): THREE.BufferGeometry {
  switch (id) {
    case "bottomHousing":
      return HOUSING_BOTTOM_GEOMETRY
    case "topHousing":
      return HOUSING_TOP_GEOMETRY
    case "spring":
      return SPRING_GEOMETRY
    case "stem":
      return STEM_GEOMETRY
  }
}

function materialFor(id: SwitchExplodedPartId): THREE.Material {
  switch (id) {
    case "bottomHousing":
    case "topHousing":
      return materials.switchHousing
    case "spring":
      return materials.switchSpring
    case "stem":
      return materials.switchStem
  }
}

interface ExplodedMeshProps {
  part: SwitchExplodedPart
  explodeFactor: number
  pressed: boolean
  reducedMotion: boolean
}

function ExplodedMesh({ part, explodeFactor, pressed, reducedMotion }: ExplodedMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const pressOffset = part.id === "stem" && pressed ? PRESS_TRAVEL_Y : 0
  const targetY = BASE_Y[part.id] + part.explodeOffsetY * explodeFactor - pressOffset

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    if (reducedMotion) {
      mesh.position.y = targetY
      return
    }
    const alpha = 1 - Math.exp(-EASE_SPEED * delta)
    mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, alpha)
  })

  return (
    <mesh ref={meshRef} geometry={geometryFor(part.id)} material={materialFor(part.id)} position={[0, targetY, 0]} />
  )
}

export interface SwitchDetailSceneProps {
  parts: SwitchExplodedPart[]
  /** 0 (assembled) to 1 (fully exploded). */
  explodeFactor: number
  /** Whether the press button is currently held/active - snaps the stem down. */
  pressed: boolean
  ariaLabel: string
}

export default function SwitchDetailScene({ parts, explodeFactor, pressed, ariaLabel }: SwitchDetailSceneProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div role="img" aria-label={ariaLabel} className="h-full w-full">
      <Canvas flat camera={{ position: [2.2, 1.7, 2.6], fov: 35 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 3]} intensity={1.1} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        {parts.map((part) => (
          <ExplodedMesh key={part.id} part={part} explodeFactor={explodeFactor} pressed={pressed} reducedMotion={reducedMotion} />
        ))}
        <OrbitControls makeDefault target={[0, 0.3, 0]} minDistance={1.5} maxDistance={6} />
      </Canvas>
    </div>
  )
}
