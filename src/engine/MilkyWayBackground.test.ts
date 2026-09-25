import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MilkyWayBackground } from './MilkyWayBackground';
import { LY_PER_KPC } from './GalacticSkyModel';
import { galacticFrameQuaternion } from '../utils/coordinates';

function harness() {
  const sky = new MilkyWayBackground();
  const camera = new THREE.PerspectiveCamera(55, 1.6, 1e-11, 1e8);
  const size = new THREE.Vector2(1280, 800);
  const target = new THREE.WebGLRenderTarget(4, 4);
  const renderer = {
    autoClear: false,
    getDrawingBufferSize: (out: THREE.Vector2) => out.copy(size),
    getRenderTarget: () => target,
    setRenderTarget: vi.fn(),
    render: vi.fn()
  };
  const draw = (mode: 'linear' | 'realistic' | 'logarithmic' = 'linear') =>
    sky.update(renderer as unknown as THREE.WebGLRenderer, camera, mode);
  return { sky, camera, renderer, size, target, draw };
}

describe('procedural radiance pass', () => {
  it('reuses a static view, including exposure changes, but invalidates pose / FOV / size / frame', () => {
    const { sky, camera, renderer, size, target, draw } = harness();
    draw(); draw();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(target);
    expect(renderer.autoClear).toBe(false);
    sky.setObservationMode('enhancedOptical'); draw();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    camera.lookAt(1, 0, 0); draw();
    camera.position.x = 12; draw();
    camera.fov = 12; camera.updateProjectionMatrix(); draw();
    size.set(800, 600); draw();
    sky.setPlaneAlignment('galactic'); draw();
    expect(renderer.render).toHaveBeenCalledTimes(6);
    const firstBuffer = renderer.setRenderTarget.mock.calls[0][0];
    expect(firstBuffer.width).toBe(400);
    expect(firstBuffer.height).toBe(300);
    sky.dispose(); target.dispose();
  });

  it('uses observer kpc in the Galactic frame only for physical navigation', () => {
    const { sky, camera, renderer, target, draw } = harness();
    camera.position.set(LY_PER_KPC, 2 * LY_PER_KPC, 0)
      .applyQuaternion(galacticFrameQuaternion('ecliptic'));
    draw();
    const scene = renderer.render.mock.calls[0][0] as THREE.Scene;
    const material = (scene.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(material.uniforms.uObserver.value.distanceTo(new THREE.Vector3(1, 2, 0))).toBeLessThan(1e-12);
    draw('realistic');
    expect(material.uniforms.uObserver.value.length()).toBe(0);
    draw('logarithmic');
    expect(material.uniforms.uObserver.value.length()).toBe(0);
    sky.dispose(); target.dispose();
  });

  it('restores render state even if integration throws, and frees the HDR buffer', () => {
    const { sky, renderer, target, draw } = harness();
    renderer.render.mockImplementationOnce(() => { throw new Error('context lost'); });
    expect(draw).toThrow('context lost');
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(target);
    expect(renderer.autoClear).toBe(false);
    draw();
    const buffer = renderer.setRenderTarget.mock.calls[0][0];
    const disposed = vi.fn();
    buffer.addEventListener('dispose', disposed);
    sky.dispose(); sky.update(renderer as unknown as THREE.WebGLRenderer, new THREE.PerspectiveCamera(), 'linear');
    expect(disposed).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    target.dispose();
  });
});
