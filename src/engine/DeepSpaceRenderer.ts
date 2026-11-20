import * as THREE from 'three';
import { DEEP_SPACE_OBJECTS, DeepSpaceObjectData } from '../data/deepSpace';
import {
  angularDiameterToWorldSize,
  equatorialToCartesian,
  equatorialToEcliptic,
  equatorialToGalactic,
  positionAngleBasis,
  scaleDistance,
  ViewMode
} from '../utils/coordinates';
import { PlaneAlignment } from './StarRenderer';
import { GalaxyRenderer } from './GalaxyRenderer';
import { createNebulaVolume } from './NebulaVolume';

export class DeepSpaceRenderer {
  public group: THREE.Group;
  public galaxyRenderer: GalaxyRenderer;
  private exposure = 0.72;
  public objectsMap: Map<string, { data: DeepSpaceObjectData; position: THREE.Vector3; mesh: THREE.Object3D }> = new Map();

  constructor() {
    this.group = new THREE.Group();
    this.galaxyRenderer = new GalaxyRenderer();
    this.group.add(this.galaxyRenderer.group);
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
      if (dso.type !== 'galaxy') {
        mesh = this.createNebulaMesh(dso, distance);
        mesh.position.copy(position);
        const axes = positionAngleBasis(dso.ra, dso.dec, dso.positionAngleDeg ?? 0);
        const transform = (v: THREE.Vector3) => planeAlignment === 'galactic' ? equatorialToGalactic(v)
          : planeAlignment === 'ecliptic' ? equatorialToEcliptic(v) : v;
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
          transform(axes.major), transform(axes.minor), position.clone().normalize().negate()
        ));
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
    this.exposure = exposure;
    this.galaxyRenderer.setExposure(exposure);
    this.objectsMap.forEach(node => {
      if (node.data.type !== 'galaxy' && node.mesh instanceof THREE.Mesh && node.mesh.material instanceof THREE.ShaderMaterial) {
        node.mesh.material.uniforms.uExposure.value = exposure;
      }
    });
  }

  public animate(_timeSec: number, camera?: THREE.PerspectiveCamera, _viewMode: ViewMode = 'linear') {
    if (camera) {
      this.objectsMap.forEach(node => {
        if (node.mesh instanceof THREE.Mesh && node.mesh.material instanceof THREE.ShaderMaterial) {
          const observer = node.mesh.material.uniforms.uCamera.value as THREE.Vector3;
          node.mesh.worldToLocal(observer.copy(camera.position));
        }
      });
    }
  }

  public dispose() {
    this.disposeNebulaChildren();
    this.galaxyRenderer.dispose();
    this.objectsMap.clear();
  }

  private createNebulaMesh(dso: DeepSpaceObjectData, distance: number): THREE.Mesh {
    const diameter = angularDiameterToWorldSize(dso.angularSizeArcmin, distance);
    const mesh = createNebulaVolume(dso, this.exposure);
    const aspect = (dso.angularSizeMinorArcmin ?? dso.angularSizeArcmin) / dso.angularSizeArcmin;
    const depthRadius = diameter * (dso.type === 'galacticFeature' ? 0.5 : 0.35);
    mesh.scale.set(diameter * 0.5, diameter * aspect * 0.5, depthRadius);
    mesh.userData = { deepObjectData: dso, type: 'deepSpace' };
    return mesh;
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
}
