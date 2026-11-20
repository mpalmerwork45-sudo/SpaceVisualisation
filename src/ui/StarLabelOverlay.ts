import * as THREE from 'three';
import { SpaceEngine } from '../engine/SpaceEngine';

export class StarLabelOverlay {
  private engine: SpaceEngine;
  private containerElem: HTMLElement;
  private labelMap: Map<string, HTMLElement> = new Map();
  private isVisible: boolean = true;
  private maxVisibleLabels: number = 15; // De-cluttering cap

  constructor(engine: SpaceEngine, containerElem: HTMLElement) {
    this.engine = engine;
    this.containerElem = containerElem;
    console.log('🏷️ [StarLabelOverlay] Initialized with smart screen decluttering & 50px spatial threshold.');
  }

  public setVisible(visible: boolean) {
    this.isVisible = visible;
    if (!visible) {
      this.labelMap.forEach(label => { label.style.display = 'none'; });
    }
  }

  /**
   * Updates 2D screen positions of star labels with smart de-cluttering & spatial proximity filtering
   */
  public updateLabels() {
    if (!this.isVisible) return;

    const camera = this.engine.camera;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerScreen = new THREE.Vector2(width / 2, height / 2);

    interface LabelCandidate {
      id: string;
      star: any;
      position: THREE.Vector3;
      screenPos: THREE.Vector2;
      distToCenter: number;
      score: number; // Lower score = higher priority
    }

    const candidates: LabelCandidate[] = [];

    // 1. Gather all candidate stars currently in front of camera
    this.engine.starRenderer.starsMap.forEach((starNode, id) => {
      if (!starNode.mesh.visible) return;
      // At planetary scale reserve the foreground for planet labels.
      if (this.engine.cameraRadius < 0.005 && this.engine.solSystemRenderer.group.visible && id !== 'sol') return;
      const star = starNode.data;
      const pos = starNode.position.clone();
      pos.project(camera);

      const isInFront = pos.z < 1.0;
      const x = (pos.x * 0.5 + 0.5) * width;
      const y = (-(pos.y * 0.5) + 0.5) * height;

      const isInsideScreen = x >= 30 && x <= width - 30 && y >= 30 && y <= height - 30;

      if (isInFront && isInsideScreen) {
        const screenPos = new THREE.Vector2(x, y);
        const distToCenter = screenPos.distanceTo(centerScreen);

        // Priority score based on apparent magnitude and proximity to view center
        const magScore = star.mag !== undefined ? star.mag : 5.0;
        const score = magScore * 2.0 + (distToCenter / width) * 5.0;

        candidates.push({
          id,
          star,
          position: starNode.position,
          screenPos,
          distToCenter,
          score
        });
      }
    });

    // 2. Sort candidates by priority score (brightest & most central first)
    candidates.sort((a, b) => a.score - b.score);

    // 3. Select non-overlapping candidates up to maxVisibleLabels cap
    const acceptedLabels: LabelCandidate[] = [];
    const minPixelDistance = 55; // Minimum 55px distance between label anchors

    for (const cand of candidates) {
      if (acceptedLabels.length >= this.maxVisibleLabels) break;

      let overlap = false;
      for (const acc of acceptedLabels) {
        if (cand.screenPos.distanceTo(acc.screenPos) < minPixelDistance) {
          overlap = true;
          break;
        }
      }

      if (!overlap) {
        acceptedLabels.push(cand);
      }
    }

    const acceptedSet = new Set(acceptedLabels.map(c => c.id));

    // 4. Update DOM elements
    this.labelMap.forEach((labelElem, id) => {
      if (!acceptedSet.has(id)) {
        labelElem.style.display = 'none';
      }
    });

    acceptedLabels.forEach((cand) => {
      let labelElem = this.labelMap.get(cand.id);

      if (!labelElem) {
        labelElem = document.createElement('div');
        labelElem.className = 'star-label';
        labelElem.setAttribute('data-id', cand.id);
        labelElem.innerHTML = `
          <span class="label-name">${cand.star.name}</span>
          <span class="label-meta">${cand.star.mag !== undefined ? cand.star.mag + 'm' : ''} • ${cand.star.dist}ly</span>
        `;

        labelElem.addEventListener('click', (e) => {
          e.stopPropagation();
          const selection = this.engine.resolveSelection('star', cand.id);
          if (!selection) return;
          this.engine.focusObject('star', cand.id);
          this.engine.onSelectObject?.(selection);
        });

        this.containerElem.appendChild(labelElem);
        this.labelMap.set(cand.id, labelElem);
      }

      labelElem.style.transform = `translate3d(${cand.screenPos.x}px, ${cand.screenPos.y}px, 0)`;
      labelElem.style.display = 'flex';
    });
  }
}
