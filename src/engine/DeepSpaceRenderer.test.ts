import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { DeepSpaceRenderer } from './DeepSpaceRenderer';
import { angularDiameterToWorldSize } from '../utils/coordinates';

describe('deep-space volumes', () => {
  it('renders galaxies once, with a disc axis ratio independent of the bulge footprint', () => {
    const renderer = new DeepSpaceRenderer();
    renderer.setExposure(1.45);
    renderer.updateDeepSpace('realistic','galactic');
    const node = renderer.objectsMap.get('andromeda_m31')!;
    const meshes: THREE.Mesh[] = [];
    node.mesh.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(1);
    const mesh = meshes[0], material = mesh.material as THREE.ShaderMaterial;
    const appearance = node.data.galaxy!;
    expect(mesh.scale.x).toBeCloseTo(angularDiameterToWorldSize(appearance.majorArcmin,1200),8);
    expect(mesh.scale.y).toBe(mesh.scale.x);
    expect(material.uniforms.uAxisRatio.value).toBeCloseTo(
      angularDiameterToWorldSize(appearance.minorArcmin,1200) / mesh.scale.x,8);
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
