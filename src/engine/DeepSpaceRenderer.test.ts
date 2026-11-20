import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DeepSpaceRenderer } from './DeepSpaceRenderer';
import { angularDiameterToWorldSize } from '../utils/coordinates';

describe('deep-space volumes', () => {
  it('adds compact nuclear starlight above the Galactic bulge at its physical size', () => {
    const renderer = new DeepSpaceRenderer();
    renderer.updateDeepSpace('linear', 'galactic');
    const cluster = renderer.objectsMap.get('milky_way_core')!.mesh as THREE.Mesh;
    const radiusPc = cluster.scale.x / 3.26156;
    expect(radiusPc).toBeCloseTo(20, 0);
    expect(cluster.scale.z).toBe(cluster.scale.x);
    expect(cluster.scale.y / cluster.scale.x).toBeCloseTo(0.71, 5);
    const minorAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(cluster.quaternion);
    expect(Math.abs(minorAxis.y)).toBeGreaterThan(0.999);
    const material = cluster.material as THREE.ShaderMaterial;
    expect(material.blendSrc).toBe(THREE.OneMinusDstColorFactor);
    expect(material.blendDst).toBe(THREE.OneFactor);
    renderer.dispose();
  });

  it('renders one inclined galaxy volume with the catalogue’s projected major and minor extents', () => {
    const renderer = new DeepSpaceRenderer();
    renderer.setExposure(1.45);
    renderer.updateDeepSpace('realistic','galactic');
    const node = renderer.objectsMap.get('andromeda_m31')!;
    const meshes: THREE.Mesh[] = [];
    node.mesh.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0], material = mesh.material as THREE.ShaderMaterial;
    const appearance = node.data.galaxy!;
    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(mesh.scale.x * 2).toBeCloseTo(angularDiameterToWorldSize(appearance.majorArcmin,1200),8);
    expect(mesh.scale.y).toBe(mesh.scale.x);
    const lineOfSight = node.position.clone().normalize().negate();
    const normal = new THREE.Vector3(0,0,1).applyQuaternion(mesh.quaternion);
    const angle = normal.angleTo(lineOfSight);
    expect(THREE.MathUtils.radToDeg(angle)).toBeCloseTo(appearance.inclinationDeg,8);
    const projectedMinor = 2 * Math.hypot(mesh.scale.y * Math.cos(angle), mesh.scale.z * Math.sin(angle));
    expect(projectedMinor).toBeCloseTo(angularDiameterToWorldSize(appearance.minorArcmin,1200),8);
    expect(mesh.scale.z).toBeLessThan(mesh.scale.x);
    expect(material.uniforms.uExposure.value).toBe(1.45);
    renderer.dispose();
  });
  it('preserves angular extents and exposure when the coordinate frame changes', () => {
    const renderer = new DeepSpaceRenderer();
    renderer.setExposure(1.2);
    renderer.updateDeepSpace('realistic', 'ecliptic');
    const ring = renderer.objectsMap.get('m57_ring_nebula')!;
    expect(ring.mesh).toBeInstanceOf(THREE.Mesh);
    expect(ring.mesh.scale.x * 2).toBeCloseTo(angularDiameterToWorldSize(ring.data.angularSizeArcmin,1200),8);
    const material = (ring.mesh as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(material.uniforms.uExposure.value).toBe(1.2);
    const disposed = vi.fn();
    material.addEventListener('dispose', disposed);
    renderer.updateDeepSpace('realistic','galactic');
    expect(disposed).toHaveBeenCalledOnce();
    const next = renderer.objectsMap.get('m57_ring_nebula')!;
    expect(next.mesh.scale.x).toBeCloseTo(ring.mesh.scale.x,8);
    expect(((next.mesh as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uExposure.value).toBe(1.2);
    renderer.dispose();
  });

  it('tracks the observer in local volume coordinates for off-axis and internal views', () => {
    const renderer = new DeepSpaceRenderer();
    renderer.updateDeepSpace('linear','ecliptic');
    const node = renderer.objectsMap.get('m42_orion_nebula')!;
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(node.position).add(new THREE.Vector3(1,2,3));
    renderer.animate(0,camera,'linear');
    const local = ((node.mesh as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uCamera.value;
    expect(node.mesh.localToWorld(local.clone()).distanceTo(camera.position)).toBeLessThan(1e-8);
    renderer.dispose();
  });
});
