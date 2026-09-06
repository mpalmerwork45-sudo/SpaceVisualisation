import * as THREE from 'three';
import { scaleDistance, ViewMode } from '../utils/coordinates';
import { PlaneAlignment } from './StarRenderer';

export class GridRenderer {
  public group: THREE.Group;
  private ringsGroup: THREE.Group;
  private gridMesh: THREE.GridHelper;
  private axisLines: THREE.LineSegments;

  constructor() {
    this.group = new THREE.Group();
    this.ringsGroup = new THREE.Group();
    this.group.add(this.ringsGroup);

    // Grid plane helper
    this.gridMesh = new THREE.GridHelper(120, 24, 0x00e5ff, 0x1a237e);
    (this.gridMesh.material as THREE.Material).transparent = true;
    (this.gridMesh.material as THREE.Material).opacity = 0.22;
    this.group.add(this.gridMesh);

    // Axis indicator lines
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 45, 0), // North Pole Vector
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(45, 0, 0), // X Axis
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 45)  // Z Axis
    ]);
    const axisMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.35
    });
    this.axisLines = new THREE.LineSegments(axisGeo, axisMat);
    this.group.add(this.axisLines);

    this.createDistanceRings('linear');
  }

  public setGridVisible(visible: boolean) {
    this.gridMesh.visible = visible;
    this.axisLines.visible = visible;
  }

  public setRingsVisible(visible: boolean) {
    this.ringsGroup.visible = visible;
  }

  public updateGrid(viewMode: ViewMode, _planeAlignment: PlaneAlignment) {
    this.createDistanceRings(viewMode);
  }

  private createDistanceRings(viewMode: ViewMode) {
    while (this.ringsGroup.children.length > 0) {
      const child = this.ringsGroup.children[0];
      this.ringsGroup.remove(child);
      if (child instanceof THREE.LineLoop) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => material.dispose());
      }
    }

    const ringDistancesLy = [10, 25, 50, 100];

    ringDistancesLy.forEach((distLy) => {
      const radius = scaleDistance(distLy, viewMode);
      const points: THREE.Vector3[] = [];
      const segments = 128;

      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(radius * Math.cos(theta), 0, radius * Math.sin(theta)));
      }

      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineDashedMaterial({
        color: 0x00b0ff,
        transparent: true,
        opacity: distLy === 50 ? 0.6 : 0.3, // Highlight 50 ly boundary ring as requested!
        dashSize: 1.5,
        gapSize: 0.8
      });

      const line = new THREE.LineLoop(geo, mat);
      line.computeLineDistances();
      this.ringsGroup.add(line);
    });
  }
}
