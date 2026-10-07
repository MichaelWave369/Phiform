import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import {
  auditObject,
  prepareProductionVariants,
} from '../production/geometry'
import { productionProfile } from '../production/profiles'
import type { ProductionRuntimeResult } from '../production/runtime'
import type {
  EditTarget,
  MeshStats,
  MeshTarget,
  ModelArtifact,
  PrimitiveKind,
  ProductionAudit,
  ProductionProfileId,
  TransformMode,
  WorkspaceEditState,
} from '../core/types'

function geometryFor(kind: PrimitiveKind): THREE.BufferGeometry {
  switch (kind) {
    case 'sphere': return new THREE.SphereGeometry(1, 64, 32)
    case 'torus': return new THREE.TorusKnotGeometry(0.78, 0.24, 160, 24)
    case 'icosahedron': return new THREE.IcosahedronGeometry(1.05, 2)
    case 'capsule': return new THREE.CapsuleGeometry(0.62, 1.15, 12, 28)
    case 'cube':
    default: return new THREE.BoxGeometry(1.55, 1.55, 1.55, 5, 5, 5)
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry?.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => material.dispose())
  })
}

function rememberBaseMaterial(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return
      if (!material.userData.phiformBase) {
        material.userData.phiformBase = {
          color: material.color.getHexString(),
          metalness: material.metalness,
          roughness: material.roughness,
        }
      }
    })
  })
}

function applyMaterialOverride(object: THREE.Object3D, edits: WorkspaceEditState) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return
      const base = material.userData.phiformBase as
        | { color: string; metalness: number; roughness: number }
        | undefined

      if (edits.material.enabled) {
        material.color.set(edits.material.color)
        material.metalness = edits.material.metalness
        material.roughness = edits.material.roughness
      } else if (base) {
        material.color.set(`#${base.color}`)
        material.metalness = base.metalness
        material.roughness = base.roughness
      }
      material.needsUpdate = true
    })
  })
}

function meshCounts(mesh: THREE.Mesh): { vertices: number; triangles: number } {
  const position = mesh.geometry.getAttribute('position')
  const vertices = position?.count ?? 0
  const triangles = mesh.geometry.index
    ? Math.floor(mesh.geometry.index.count / 3)
    : Math.floor(vertices / 3)
  return { vertices, triangles }
}

function indexMeshes(object: THREE.Object3D): MeshTarget[] {
  let index = 0
  const targets: MeshTarget[] = []
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const meshId = `mesh-${String(index).padStart(3, '0')}`
    child.userData.phiformMeshId = meshId
    child.userData.phiformMeshName = child.name || `Mesh ${index + 1}`
    targets.push(targetForMesh(child))
    index += 1
  })
  return targets
}

function targetForMesh(mesh: THREE.Mesh): MeshTarget {
  const counts = meshCounts(mesh)
  return {
    id: String(mesh.userData.phiformMeshId || 'mesh-unknown'),
    name: String(mesh.userData.phiformMeshName || mesh.name || 'Unnamed mesh'),
    vertices: counts.vertices,
    triangles: counts.triangles,
  }
}

function findMeshByTarget(
  object: THREE.Object3D,
  target: EditTarget,
): THREE.Mesh | null {
  if (target.kind !== 'mesh') return null
  let found: THREE.Mesh | null = null
  object.traverse((child) => {
    if (found || !(child instanceof THREE.Mesh)) return
    if (child.userData.phiformMeshId === target.mesh.id) found = child
  })
  return found
}

function statsFor(object: THREE.Object3D): MeshStats {
  let meshes = 0
  let vertices = 0
  let triangles = 0
  const materials = new Set<THREE.Material>()

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    meshes += 1
    const counts = meshCounts(child)
    vertices += counts.vertices
    triangles += counts.triangles

    const meshMaterials = Array.isArray(child.material) ? child.material : [child.material]
    meshMaterials.forEach((material) => materials.add(material))
  })

  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  box.getSize(size)

  return {
    meshes,
    vertices,
    triangles,
    materials: materials.size,
    bounds: [size.x, size.y, size.z],
  }
}

interface ViewportProps {
  artifact: ModelArtifact
  edits: WorkspaceEditState
  transformMode: TransformMode
  selected: boolean
  target: EditTarget
  exportRequest: number
  productionProfileId: ProductionProfileId
  productionRequest: number
  onSelectedChange: (selected: boolean) => void
  onTargetChange: (target: EditTarget) => void
  onMeshTargetsChange: (targets: MeshTarget[]) => void
  onEditsChange: (edits: WorkspaceEditState) => void
  onStatsChange: (stats: MeshStats) => void
  onProductionAuditChange: (audit: ProductionAudit) => void
  onExportComplete: (blob: Blob) => void
  onProductionComplete: (result: ProductionRuntimeResult) => void
  onError: (message: string) => void
}

export function Viewport({
  artifact,
  edits,
  transformMode,
  selected,
  target,
  exportRequest,
  productionProfileId,
  productionRequest,
  onSelectedChange,
  onTargetChange,
  onMeshTargetsChange,
  onEditsChange,
  onStatsChange,
  onProductionAuditChange,
  onExportComplete,
  onProductionComplete,
  onError,
}: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const objectRef = useRef<THREE.Object3D | null>(null)
  const transformRef = useRef<TransformControls | null>(null)
  const helperRef = useRef<THREE.BoxHelper | null>(null)
  const targetHelperRef = useRef<THREE.BoxHelper | null>(null)
  const applyingRef = useRef(false)
  const editsRef = useRef(edits)
  const exportSeenRef = useRef(0)
  const productionSeenRef = useRef(0)
  const [loadState, setLoadState] = useState<'ready' | 'loading' | 'error'>('ready')

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

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    host.appendChild(renderer.domElement)

    const orbit = new OrbitControls(camera, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.08

    const transform = new TransformControls(camera, renderer.domElement)
    transform.setMode(transformMode)
    transform.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !Boolean(event.value)
    })
    transform.addEventListener('objectChange', () => {
      if (applyingRef.current) return
      const object = objectRef.current
      if (!object) return

      const current = editsRef.current
      onEditsChange({
        ...current,
        position: [object.position.x, object.position.y, object.position.z],
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        scale: [object.scale.x, object.scale.y, object.scale.z],
        revision: current.revision + 1,
      })
      onStatsChange(statsFor(object))
    })
    scene.add(transform.getHelper())
    transformRef.current = transform

    const grid = new THREE.GridHelper(12, 24, 0x3c5a72, 0x19232d)
    grid.position.y = -1.5
    scene.add(grid)

    const key = new THREE.DirectionalLight(0xd9f4ff, 4.2)
    key.position.set(4, 6, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8c7bff, 3.4)
    rim.position.set(-5, 1, -4)
    scene.add(rim)
    scene.add(new THREE.HemisphereLight(0x8fdcff, 0x121019, 1.6))

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const selectFromPointer = (event: PointerEvent) => {
      if (transform.dragging || !objectRef.current) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObject(objectRef.current, true)
      const mesh = hits.find((hit) => hit.object instanceof THREE.Mesh)?.object

      if (mesh instanceof THREE.Mesh) {
        onSelectedChange(true)
        onTargetChange({ kind: 'mesh', mesh: targetForMesh(mesh) })
      } else {
        onSelectedChange(false)
        onTargetChange({ kind: 'artifact' })
      }
    }
    renderer.domElement.addEventListener('pointerdown', selectFromPointer)

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
      orbit.update()
      helperRef.current?.update()
      targetHelperRef.current?.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', selectFromPointer)
      orbit.dispose()
      transform.detach()
      transform.dispose()
      if (objectRef.current) disposeObject(objectRef.current)
      if (helperRef.current) {
        scene.remove(helperRef.current)
        helperRef.current.geometry.dispose()
        helperRef.current.material.dispose()
      }
      if (targetHelperRef.current) {
        scene.remove(targetHelperRef.current)
        targetHelperRef.current.geometry.dispose()
        targetHelperRef.current.material.dispose()
      }
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      objectRef.current = null
      transformRef.current = null
      helperRef.current = null
      targetHelperRef.current = null
    }
  }, [])

  useEffect(() => {
    editsRef.current = edits
  }, [edits])

  useEffect(() => {
    transformRef.current?.setMode(transformMode)
  }, [transformMode])

  useEffect(() => {
    const scene = sceneRef.current
    const transform = transformRef.current
    const object = objectRef.current
    if (!scene || !transform) return

    transform.detach()
    if (helperRef.current) {
      scene.remove(helperRef.current)
      helperRef.current.geometry.dispose()
      helperRef.current.material.dispose()
      helperRef.current = null
    }

    if (selected && object) {
      transform.attach(object)
      const helper = new THREE.BoxHelper(object, 0x71dfff)
      scene.add(helper)
      helperRef.current = helper
    }
  }, [selected, artifact.id])

  useEffect(() => {
    const scene = sceneRef.current
    const object = objectRef.current
    if (!scene || !object) return

    if (targetHelperRef.current) {
      scene.remove(targetHelperRef.current)
      targetHelperRef.current.geometry.dispose()
      targetHelperRef.current.material.dispose()
      targetHelperRef.current = null
    }

    const targetMesh = findMeshByTarget(object, target)
    if (targetMesh) {
      const helper = new THREE.BoxHelper(targetMesh, 0xb89cff)
      scene.add(helper)
      targetHelperRef.current = helper
    }
  }, [target, artifact.id])

  useEffect(() => {
    const object = objectRef.current
    if (!object) return

    applyingRef.current = true
    object.position.set(...edits.position)
    object.rotation.set(...edits.rotation)
    object.scale.set(...edits.scale)
    applyMaterialOverride(object, edits)
    onStatsChange(statsFor(object))
    onProductionAuditChange(
      auditObject(object, productionProfile(productionProfileId).requireUvs),
    )
    applyingRef.current = false
  }, [edits])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    let cancelled = false

    if (objectRef.current) {
      scene.remove(objectRef.current)
      disposeObject(objectRef.current)
      objectRef.current = null
    }

    const install = (object: THREE.Object3D) => {
      onMeshTargetsChange(indexMeshes(object))
      rememberBaseMaterial(object)
      object.position.set(...edits.position)
      object.rotation.set(...edits.rotation)
      object.scale.set(...edits.scale)
      applyMaterialOverride(object, edits)
      scene.add(object)
      objectRef.current = object
      onStatsChange(statsFor(object))
      onProductionAuditChange(
        auditObject(object, productionProfile(productionProfileId).requireUvs),
      )
      setLoadState('ready')
      onSelectedChange(true)

      if (target.kind === 'mesh' && !findMeshByTarget(object, target)) {
        onTargetChange({ kind: 'artifact' })
      }
    }

    if (artifact.kind === 'primitive') {
      const material = new THREE.MeshStandardMaterial({
        color: 0xb8efff,
        metalness: artifact.material.metalness,
        roughness: artifact.material.roughness,
      })
      const mesh = new THREE.Mesh(geometryFor(artifact.primitive), material)
      mesh.name = artifact.label
      install(mesh)
      return
    }

    setLoadState('loading')
    new GLTFLoader().load(
      artifact.url,
      (gltf) => {
        if (cancelled) {
          disposeObject(gltf.scene)
          return
        }

        const model = gltf.scene
        const wrapper = new THREE.Group()
        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        model.position.set(-center.x, -center.y, -center.z)
        const largest = Math.max(size.x, size.y, size.z, 0.0001)
        model.scale.setScalar(2.2 / largest)
        wrapper.add(model)
        install(wrapper)
      },
      undefined,
      () => {
        if (!cancelled) {
          setLoadState('error')
          onError('GLB load failed. Check the bridge artifact or project file.')
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [artifact])

  useEffect(() => {
    const object = objectRef.current
    if (!object) return
    onProductionAuditChange(
      auditObject(object, productionProfile(productionProfileId).requireUvs),
    )
  }, [productionProfileId])

  useEffect(() => {
    if (
      productionRequest <= 0 ||
      productionRequest === productionSeenRef.current
    ) {
      return
    }
    productionSeenRef.current = productionRequest

    const object = objectRef.current
    if (!object) {
      onError('Nothing is loaded for production export.')
      return
    }

    const profile = productionProfile(productionProfileId)
    const exporter = new GLTFExporter()

    prepareProductionVariants(object, profile)
      .then(async (prepared) => {
        const files: ProductionRuntimeResult['files'] = []

        for (const variant of prepared.variants) {
          try {
            const result = await exporter.parseAsync(variant.object, {
              binary: true,
              onlyVisible: true,
              trs: true,
            })
            if (!(result instanceof ArrayBuffer)) {
              throw new Error('Production exporter returned JSON instead of binary GLB.')
            }
            files.push({
              lod: variant.lod,
              ratio: variant.ratio,
              audit: variant.audit,
              operations: variant.operations,
              blob: new Blob([result], { type: 'model/gltf-binary' }),
            })
          } finally {
            disposeObject(variant.object)
          }
        }

        onProductionComplete({
          profileId: productionProfileId,
          before: prepared.before,
          operations: prepared.operations,
          files,
        })
      })
      .catch((cause) => {
        onError(
          cause instanceof Error
            ? cause.message
            : 'Production export failed.',
        )
      })
  }, [productionRequest])

  useEffect(() => {
    if (exportRequest <= 0 || exportRequest === exportSeenRef.current) return
    exportSeenRef.current = exportRequest
    const object = objectRef.current
    if (!object) {
      onError('Nothing is loaded to export.')
      return
    }

    new GLTFExporter()
      .parseAsync(object, {
        binary: true,
        onlyVisible: true,
        trs: true,
      })
      .then((result) => {
        if (!(result instanceof ArrayBuffer)) {
          throw new Error('Exporter returned JSON instead of binary GLB.')
        }
        onExportComplete(new Blob([result], { type: 'model/gltf-binary' }))
      })
      .catch((error) => {
        onError(error instanceof Error ? error.message : 'GLB export failed.')
      })
  }, [exportRequest])

  const targetLabel = target.kind === 'mesh'
    ? `TARGET · ${target.mesh.name}`
    : 'TARGET · WHOLE ARTIFACT'

  return (
    <div className="viewport" ref={hostRef}>
      <div className="viewport-badge">
        <span className="status-dot" />
        {artifact.kind === 'glb' ? 'EDITABLE GLB' : 'EDITABLE GEOMETRY'}
      </div>
      <div className="viewport-tool-badge">
        {selected ? `SELECTED · ${transformMode.toUpperCase()}` : 'CLICK MODEL TO SELECT'}
      </div>
      <div className="viewport-target-badge">{targetLabel}</div>
      {loadState === 'loading' && <div className="viewport-state">LOADING GLB…</div>}
      {loadState === 'error' && (
        <div className="viewport-state error">GLB LOAD FAILED</div>
      )}
      <div className="viewport-help">orbit · select mesh target · gizmo edit</div>
    </div>
  )
}
