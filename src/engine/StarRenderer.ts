import * as THREE from 'three';
import { STARS_CATALOG, StarData } from '../data/stars';
import {
  equatorialToCartesian,
  equatorialToGalactic,
  equatorialToEcliptic,
  scaleDistance,
  getSpectralColor,
  ViewMode,
  CelestialAlignment
} from '../utils/coordinates';

export type PlaneAlignment = CelestialAlignment;

export interface RenderedStarNode {
  data: StarData;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  baseRadius: number;
}

export class StarRenderer {
  public group: THREE.Group;
  public starsMap: Map<string, RenderedStarNode> = new Map();

  constructor() {
    this.group = new THREE.Group();
    console.log('⭐ [StarRenderer] Instantiated with dynamic distance-based mesh scaling (Zero low-poly ball artifacts).');
  }

  public calculateStarPosition(star: StarData, viewMode: ViewMode, planeAlignment: PlaneAlignment): THREE.Vector3 {
    if (viewMode === 'realistic') {
      const eqPos = equatorialToCartesian(star.ra, star.dec, 1200);
      if (planeAlignment === 'galactic') return equatorialToGalactic(eqPos);
      if (planeAlignment === 'ecliptic') return equatorialToEcliptic(eqPos);
      return eqPos;
    }

    const dist = scaleDistance(star.dist, viewMode);
    let pos = equatorialToCartesian(star.ra, star.dec, dist);

    if (planeAlignment === 'galactic') {
      pos = equatorialToGalactic(pos);
    } else if (planeAlignment === 'ecliptic') {
      pos = equatorialToEcliptic(pos);
    }

    return pos;
  }

  public updateStars(
    viewMode: ViewMode,
    planeAlignment: PlaneAlignment,
    spectralFilter: string = 'ALL',
    maxDistLy: number = 100000
  ) {
    console.log(`⭐ [StarRenderer] Updating stars (Mode: ${viewMode}, Alignment: ${planeAlignment}, Filter: ${spectralFilter})...`);

    // Clear existing star meshes
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    this.starsMap.clear();

    let countAdded = 0;

    STARS_CATALOG.forEach((star) => {
      if (viewMode !== 'realistic' && maxDistLy < 10000 && star.dist > maxDistLy) return;
      if (spectralFilter !== 'ALL') {
        const firstChar = star.spectral.trim().toUpperCase().charAt(0);
        if (firstChar !== spectralFilter) return;
      }

      const pos = this.calculateStarPosition(star, viewMode, planeAlignment);
      const colorHex = getSpectralColor(star.spectral);

      let coreRadius: number;

      if (viewMode === 'realistic') {
        const brightnessFactor = Math.max(0.25, 2.5 - star.mag * 0.35);
        coreRadius = Math.min(2.5, Math.max(0.3, brightnessFactor));
      } else {
        if (star.id === 'sol') {
          coreRadius = 0.05; // Tight Sol radius
        } else {
          // Physical/visual radius scale in light-years
          const magScale = Math.max(0.015, 0.04 - star.mag * 0.003);
          coreRadius = star.isProminent ? magScale * 1.5 : magScale;
        }
      }

      // Smooth high-density sphere for star body
      const coreGeo = new THREE.SphereGeometry(coreRadius, 32, 32);
      const coreMat = new THREE.MeshBasicMaterial({
        color: colorHex,
      });

      const starMesh = new THREE.Mesh(coreGeo, coreMat);
      starMesh.position.copy(pos);
      starMesh.userData = { starData: star, type: 'star' };

      this.group.add(starMesh);

      this.starsMap.set(star.id, {
        data: star,
        position: pos,
        mesh: starMesh,
        baseRadius: coreRadius
      });

      countAdded++;
    });

    console.log(`⭐ [StarRenderer] Rendered ${countAdded} pinpoint star nodes.`);
  }

  /**
   * Dynamically scales star meshes based on camera proximity
   * Prevents stars from ever turning into large low-poly polygon balls when zooming close!
   */
  public animate(camera: THREE.PerspectiveCamera) {
    if (!camera) return;

    this.starsMap.forEach((node) => {
      const distToCam = camera.position.distanceTo(node.position);

      // Dynamically scale mesh down as camera approaches so star stays a clean pinpoint disc
      // rather than expanding into a giant polygon sphere on screen
      const scaleFactor = Math.min(1.0, Math.max(0.0001, distToCam * 0.015));
      node.mesh.scale.setScalar(scaleFactor);
    });
  }
}
