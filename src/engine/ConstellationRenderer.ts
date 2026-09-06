import * as THREE from 'three';
import { CONSTELLATIONS, ConstellationData } from '../data/constellations';
import { StarRenderer, PlaneAlignment } from './StarRenderer';
import { ViewMode } from '../utils/coordinates';

export class ConstellationRenderer {
  public group: THREE.Group;
  private lineMaterials: THREE.LineBasicMaterial[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false; // Off by default as requested
  }

  public setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  public updateConstellations(
    starRenderer: StarRenderer,
    viewMode: ViewMode,
    planeAlignment: PlaneAlignment
  ) {
    // Clear existing constellation geometries
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
      }
    }
    this.lineMaterials.forEach(m => m.dispose());
    this.lineMaterials = [];

    CONSTELLATIONS.forEach((constellation) => {
      const positions: number[] = [];

      constellation.lines.forEach(([idA, idB]) => {
        const starA = starRenderer.starsMap.get(idA);
        const starB = starRenderer.starsMap.get(idB);

        if (starA && starB) {
          positions.push(starA.position.x, starA.position.y, starA.position.z);
          positions.push(starB.position.x, starB.position.y, starB.position.z);
        }
      });

      if (positions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        // Depth-test false ensures lines are ALWAYS visible from any camera zoom level
        const material = new THREE.LineBasicMaterial({
          color: 0x00e5ff,
          transparent: true,
          opacity: 0.75,
          linewidth: 2,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });

        this.lineMaterials.push(material);

        const lineSegments = new THREE.LineSegments(geometry, material);
        lineSegments.renderOrder = 999; // Render on top of scene
        lineSegments.userData = { constellationData: constellation, type: 'constellation' };
        this.group.add(lineSegments);
      }
    });
  }

  public animate(timeSec: number) {
    if (!this.group.visible) return;
    // Gentle glow pulse for constellation lines
    const pulseOpacity = 0.65 + 0.20 * Math.sin(timeSec * 2.0);
    this.lineMaterials.forEach(mat => {
      mat.opacity = pulseOpacity;
    });
  }
}
