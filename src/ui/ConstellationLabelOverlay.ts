import * as THREE from 'three';
import { SpaceEngine } from '../engine/SpaceEngine';
import { CONSTELLATIONS, ConstellationData } from '../data/constellations';

export class ConstellationLabelOverlay {
  private engine: SpaceEngine;
  private containerElem: HTMLElement;
  private labelMap: Map<string, HTMLElement> = new Map();
  private isVisible: boolean = false; // Syncs with chkConstellations (default off)

  constructor(engine: SpaceEngine, containerElem: HTMLElement) {
    this.engine = engine;
    this.containerElem = containerElem;
    console.log('✨ [ConstellationLabelOverlay] Initialized screen-space constellation title labels.');
  }

  public setVisible(visible: boolean) {
    this.isVisible = visible;
    if (!visible) {
      this.labelMap.forEach(label => { label.style.display = 'none'; });
    }
  }

  public updateLabels() {
    if (!this.isVisible) return;

    const camera = this.engine.camera;
    const width = window.innerWidth;
    const height = window.innerHeight;

    CONSTELLATIONS.forEach((constellation) => {
      // 1. Calculate 3D centroid of all stars in the constellation.
      const centroid = this.calculateCentroid(constellation);
      let labelElem = this.labelMap.get(constellation.id);
      if (!centroid) {
        if (labelElem) labelElem.style.display = 'none';
        return;
      }

      // 2. Project 3D centroid to 2D screen space
      const pos = centroid.clone().project(camera);
      const isInFront = pos.z < 1.0;
      const x = (pos.x * 0.5 + 0.5) * width;
      const y = (-(pos.y * 0.5) + 0.5) * height;

      const isInsideScreen = x >= 40 && x <= width - 40 && y >= 40 && y <= height - 40;

      if (!labelElem) {
        labelElem = document.createElement('div');
        labelElem.className = 'constellation-label';
        labelElem.setAttribute('data-id', constellation.id);
        labelElem.innerHTML = `
          <span class="constellation-icon">✨</span>
          <span class="constellation-title">${constellation.name.toUpperCase()}</span>
        `;

        labelElem.addEventListener('click', (e) => {
          e.stopPropagation();
          const selection = this.engine.resolveSelection('constellation', constellation.id);
          if (!selection) return;
          this.engine.focusObject('constellation', constellation.id);
          this.engine.onSelectObject?.(selection);
        });

        this.containerElem.appendChild(labelElem);
        this.labelMap.set(constellation.id, labelElem);
      }

      if (isInFront && isInsideScreen) {
        labelElem.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        labelElem.style.display = 'flex';
      } else {
        labelElem.style.display = 'none';
      }
    });
  }

  private calculateCentroid(constellation: ConstellationData): THREE.Vector3 | null {
    const uniqueIds = new Set(constellation.lines.flatMap(([idA, idB]) => [idA, idB]));
    const sum = new THREE.Vector3();
    let count = 0;
    uniqueIds.forEach(id => {
      const node = this.engine.starRenderer.starsMap.get(id);
      if (!node) return;
      sum.add(node.position);
      count++;
    });
    return count > 0 ? sum.divideScalar(count) : null;
  }
}
