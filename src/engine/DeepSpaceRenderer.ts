import * as THREE from 'three';
import { DEEP_SPACE_OBJECTS, DeepSpaceObjectData } from '../data/deepSpace';
import {
  angularDiameterToWorldSize,
  equatorialToCartesian,
  equatorialToEcliptic,
  equatorialToGalactic,
  scaleDistance,
  ViewMode
} from '../utils/coordinates';
import { PlaneAlignment } from './StarRenderer';
import { GalaxyRenderer } from './GalaxyRenderer';

export class DeepSpaceRenderer {
  public group: THREE.Group;
  public galaxyRenderer: GalaxyRenderer;
  public objectsMap: Map<string, { data: DeepSpaceObjectData; position: THREE.Vector3; mesh: THREE.Object3D }> = new Map();

  constructor() {
    this.group = new THREE.Group();
    this.galaxyRenderer = new GalaxyRenderer();
    this.group.add(this.galaxyRenderer.group);
    console.log('🌌 [DeepSpaceRenderer] Using angularly sized analytic galaxy surfaces.');
  }

  public updateDeepSpace(viewMode: ViewMode, planeAlignment: PlaneAlignment) {
    this.disposeNebulaChildren();
    this.galaxyRenderer.clear();
    this.objectsMap.clear();

    DEEP_SPACE_OBJECTS.forEach((dso) => {
      let distance = scaleDistance(dso.dist, viewMode);
      if (viewMode === 'realistic') distance = 1200;

      let position = equatorialToCartesian(dso.ra, dso.dec, distance);
      if (planeAlignment === 'galactic') {
        position = equatorialToGalactic(position);
      } else if (planeAlignment === 'ecliptic') {
        position = equatorialToEcliptic(position);
      }

      let mesh: THREE.Object3D;
      if (dso.type === 'nebula') {
        mesh = this.createNebulaMesh(dso, distance);
        mesh.position.copy(position);
        this.group.add(mesh);
      } else {
        const galaxyNode = this.galaxyRenderer.createGalaxy(dso, viewMode, planeAlignment, position);
        mesh = galaxyNode.mesh;
      }

      mesh.userData = { ...(mesh.userData || {}), deepObjectData: dso, type: 'deepSpace' };
      this.objectsMap.set(dso.id, { data: dso, position, mesh });
    });
  }

  public setExposure(exposure: number) {
    this.galaxyRenderer.setExposure(exposure);
  }

  public animate(_timeSec: number, camera?: THREE.PerspectiveCamera, viewMode: ViewMode = 'linear') {
    if (camera) this.galaxyRenderer.updateCloseLod(camera, viewMode);
  }

  public dispose() {
    this.disposeNebulaChildren();
    this.galaxyRenderer.dispose();
    this.objectsMap.clear();
  }

  private createNebulaMesh(dso: DeepSpaceObjectData, distance: number): THREE.Group {
    const group = new THREE.Group();
    // Preserve the catalogue's apparent extent in every mode. In linear
    // mode this reduces to the physical diameter implied by distance and
    // angular size; in compressed/sky modes it scales to the rendered shell.
    const diameter = angularDiameterToWorldSize(dso.angularSizeArcmin, distance);
    const radius = Math.max(0.4, diameter * 0.5);
    const particleCount = 180;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const c1 = new THREE.Color(dso.colorHex);
    const c2 = new THREE.Color(dso.secondaryColorHex);
    const random = this.seededRandom(dso.id);

    for (let i = 0; i < particleCount; i++) {
      const r = Math.pow(random(), 0.62) * radius;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const col = c1.clone().lerp(c2, random());
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: Math.max(0.04, radius * 0.08),
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    points.userData = { deepObjectData: dso, type: 'deepSpace' };
    group.add(points);
    return group;
  }

  private disposeNebulaChildren() {
    const children = this.group.children.slice();
    children.forEach(child => {
      if (child === this.galaxyRenderer.group) return;
      this.group.remove(child);
      child.traverse(node => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Points) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach(material => material.dispose());
        }
      });
    });
  }

  private seededRandom(id: string): () => number {
    let state = 2166136261;
    for (let i = 0; i < id.length; i++) state = Math.imul(state ^ id.charCodeAt(i), 16777619);
    return () => {
      state = Math.imul(state ^ (state >>> 13), 1274126177);
      return ((state >>> 0) % 100000) / 100000;
    };
  }
}
