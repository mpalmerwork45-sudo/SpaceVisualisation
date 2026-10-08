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

export function matchesSpectralFilter(star: StarData, filter: string): boolean {
  const spectral = star.spectral.trim().toUpperCase();
  return filter === 'ALL' || (filter === 'BD' ? /^[LTY]/.test(spectral) : spectral.startsWith(filter));
}

export interface RenderedStarNode {
  data: StarData;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  baseRadius: number;
}

export class StarRenderer {
  public group: THREE.Group;
  public starsMap: Map<string, RenderedStarNode> = new Map();
  private viewMode: ViewMode = 'linear';
  private observationMode: 'darkAdaptedEye' | 'enhancedOptical' = 'darkAdaptedEye';

  public setObservationMode(mode: 'darkAdaptedEye' | 'enhancedOptical') {
    this.observationMode = mode;
    this.updatePhotometry();
  }

  private updatePhotometry() {
    const realistic = this.viewMode === 'realistic';
    const enhanced = this.observationMode === 'enhancedOptical';
    // An illustrative dark-sky visual limit, not a telescope or physiological
    // calibration. Map markers deliberately retain the full catalogue.
    const limit = enhanced ? 14 : 6.5;
    this.starsMap.forEach(node => {
      node.mesh.visible = !realistic || node.data.mag <= limit;
      const material = node.mesh.material as THREE.MeshBasicMaterial;
      const color = new THREE.Color(getSpectralColor(node.data.spectral));
      if (realistic) {
        if (!enhanced) color.lerp(new THREE.Color(1, 1, 1), 0.8);
        // Pogson flux ratio; apparent area also grows with brightness below.
        // Compress only the bright end to keep the display in range.
        const flux = Math.pow(10, -0.4 * (node.data.mag - limit));
        color.multiplyScalar(Math.min(3, 0.035 * flux));
      }
      material.color.copy(color);
      material.toneMapped = realistic;
    });
  }

  constructor() {
    this.group = new THREE.Group();
    console.log('⭐ [StarRenderer] Instantiated with dynamic distance-based mesh scaling (Zero low-poly ball artifacts).');
  }

  public calculateStarPosition(star: StarData, viewMode: ViewMode, planeAlignment: PlaneAlignment): THREE.Vector3 {
    if (viewMode === 'realistic' && star.id !== 'sol') {
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
    this.viewMode = viewMode;

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
      // Sol is the observer, not an extra star at the catalogue's placeholder RA.
      if (viewMode === 'realistic' && star.id === 'sol') return;
      if (viewMode !== 'realistic' && maxDistLy < 10000 && star.dist > maxDistLy) return;
      if (!matchesSpectralFilter(star, spectralFilter)) return;

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
    this.updatePhotometry();
  }

  /**
   * Dynamically scales star meshes based on camera proximity
   * Prevents stars from ever turning into large low-poly polygon balls when zooming close!
   */
  public animate(camera: THREE.PerspectiveCamera) {
    if (!camera) return;

    this.starsMap.forEach((node) => {
      const distToCam = camera.position.distanceTo(node.position);
      if (!node.mesh.visible) return;

      if (node.data.id !== 'sol') {
        // Distant stars remain unresolved when the field of view narrows.
        // Otherwise telescope-like zoom turns catalogue points into huge discs.
        const height = typeof window === 'undefined' ? 1000 : window.innerHeight;
        const pixelRadius = this.viewMode === 'realistic'
          ? THREE.MathUtils.clamp(1.3 * Math.pow(10, -0.08 * node.data.mag), 0.6, 2.5)
          : THREE.MathUtils.clamp(2.3 - node.data.mag * 0.18, 0.65, 2.6);
        const radius = distToCam * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov/2)) * pixelRadius / height;
        const geometryRadius = (node.mesh.geometry as THREE.SphereGeometry).parameters.radius;
        node.mesh.scale.setScalar(radius / geometryRadius);
        return;
      }

      // Dynamically scale mesh down as camera approaches so star stays a clean pinpoint disc
      // rather than expanding into a giant polygon sphere on screen
      const scaleFactor = Math.min(1.0, Math.max(0.0001, distToCam * 0.015));
      node.mesh.scale.setScalar(scaleFactor);
    });
  }
}
