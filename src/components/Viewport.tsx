import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { ModelArtifact, PrimitiveKind } from '../core/types'

function geometryFor(kind: PrimitiveKind): THREE.BufferGeometry {
  switch (kind) {
    case 'sphere':
      return new THREE.SphereGeometry(1, 64, 32)
    case 'torus':
      return new THREE.TorusKnotGeometry(0.78, 0.24, 160, 24)
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(1.05, 2)
    case 'capsule':
      return new THREE.CapsuleGeometry(0.62, 1.15, 12, 28)
    case 'cube':
    default:
      return new THREE.BoxGeometry(1.55, 1.55, 1.55, 5, 5, 5)
  }
}

interface ViewportProps {
  artifact: ModelArtifact
}

export function Viewport({ artifact }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x080b11)
    scene.fog = new THREE.Fog(0x080b11, 7, 18)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(3.5, 2.6, 4.8)
    camera.lookAt(0, 0.25, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    host.appendChild(renderer.domElement)

    const grid = new THREE.GridHelper(12, 24, 0x3c5a72, 0x19232d)
    grid.position.y = -1.5
    scene.add(grid)

    const key = new THREE.DirectionalLight(0xd9f4ff, 4.2)
    key.position.set(4, 6, 4)
    scene.add(key)

    const rim = new THREE.DirectionalLight(0x8c7bff, 3.4)
    rim.position.set(-5, 1, -4)
    scene.add(rim)

    const fill = new THREE.HemisphereLight(0x8fdcff, 0x121019, 1.6)
    scene.add(fill)

    let pointerX = 0
    let pointerY = 0
    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      pointerX = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 0.8
      pointerY = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 0.5
    }
    host.addEventListener('pointermove', onPointerMove)

    const resize = () => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const mesh = meshRef.current
      if (mesh) {
        mesh.rotation.y += 0.0035
        mesh.rotation.x += (pointerY * 0.28 - mesh.rotation.x) * 0.035
        mesh.rotation.z += (-pointerX * 0.2 - mesh.rotation.z) * 0.035
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      host.removeEventListener('pointermove', onPointerMove)
      meshRef.current?.geometry.dispose()
      const material = meshRef.current?.material
      if (material instanceof THREE.Material) material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      meshRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (meshRef.current) {
      scene.remove(meshRef.current)
      meshRef.current.geometry.dispose()
      const oldMaterial = meshRef.current.material
      if (oldMaterial instanceof THREE.Material) oldMaterial.dispose()
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0xb8efff,
      metalness: artifact.material.metalness,
      roughness: artifact.material.roughness,
    })

    const mesh = new THREE.Mesh(geometryFor(artifact.primitive), material)
    mesh.scale.set(...artifact.scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    meshRef.current = mesh
  }, [artifact])

  return (
    <div className="viewport" ref={hostRef}>
      <div className="viewport-badge">
        <span className="status-dot" />
        LIVE GEOMETRY
      </div>
      <div className="viewport-help">move pointer to inspect · auto orbit</div>
    </div>
  )
}
