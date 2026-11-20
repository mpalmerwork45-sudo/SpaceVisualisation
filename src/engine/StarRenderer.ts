import * as THREE from 'three';
import { STARS_CATALOG, StarData } from '../data/stars';
import {
  equatorialToCartesian, equatorialToGalactic, equatorialToEcliptic, scaleDistance,
  getSpectralColor, ViewMode, CelestialAlignment
} from '../utils/coordinates';

export type PlaneAlignment = CelestialAlignment;

export function matchesSpectralFilter(star: StarData, filter: string): boolean {
  const spectral = star.spectral.trim().toUpperCase();
  return filter === 'ALL' || (filter === 'BD' ? /^[LTY]/.test(spectral) : spectral.startsWith(filter));
}

const VERTEX_SHADER = /* glsl */ `
  attribute float diameter;
  uniform float uPixelRatio;
  varying vec3 vColour;
  #include <common>
  #include <logdepthbuf_pars_vertex>

  void main() {
    vColour = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    gl_PointSize = diameter * uPixelRatio;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColour;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  void main() {
    float radius = 2.0 * length(gl_PointCoord - 0.5);
    float alpha = 1.0 - smoothstep(0.60, 1.0, radius);
    if (alpha < 0.015) discard;
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(vColour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface RenderedStarNode {
  data: StarData;
  position: THREE.Vector3;
  visible: boolean;
  pixelRadius: number;
  pointIndex?: number;
}

export class StarRenderer {
  public readonly group = new THREE.Group();
  public readonly starsMap = new Map<string, RenderedStarNode>();
  public readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly sun = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshBasicMaterial({ toneMapped: false }));
  private viewMode: ViewMode = 'linear';
  private observationMode: 'darkAdaptedEye' | 'enhancedOptical' = 'darkAdaptedEye';

  constructor(pixelRatio = 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STARS_CATALOG.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(STARS_CATALOG.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('diameter', new THREE.BufferAttribute(new Float32Array(STARS_CATALOG.length), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: { uPixelRatio: { value: pixelRatio } },
      vertexColors: true,
      transparent: true,
      toneMapped: false
    }));
    this.points.frustumCulled = false;
    // Write stellar depths before the transparent nebulae and galaxies.
    this.points.renderOrder = -1;
    this.sun.visible = false;
    this.group.add(this.sun, this.points);
  }

  public setObservationMode(mode: 'darkAdaptedEye' | 'enhancedOptical') {
    this.observationMode = mode;
    this.updatePhotometry();
  }

  public calculateStarPosition(star: StarData, viewMode: ViewMode, planeAlignment: PlaneAlignment): THREE.Vector3 {
    const distance = viewMode === 'realistic' && star.id !== 'sol' ? 1200 : scaleDistance(star.dist, viewMode);
    const position = equatorialToCartesian(star.ra, star.dec, distance);
    if (planeAlignment === 'galactic') return equatorialToGalactic(position);
    if (planeAlignment === 'ecliptic') return equatorialToEcliptic(position);
    return position;
  }

  public updateStars(
    viewMode: ViewMode,
    planeAlignment: PlaneAlignment,
    spectralFilter = 'ALL',
    maxDistLy = 100000
  ) {
    this.viewMode = viewMode;
    this.starsMap.clear();
    const realistic = viewMode === 'realistic';
    for (const star of STARS_CATALOG) {
      if (realistic && star.id === 'sol') continue;
      if (!realistic && maxDistLy < 10000 && star.dist > maxDistLy) continue;
      if (!matchesSpectralFilter(star, spectralFilter)) continue;

      const position = this.calculateStarPosition(star, viewMode, planeAlignment);
      const pixelRadius = realistic
        ? THREE.MathUtils.clamp(1.3 * Math.pow(10, -0.08 * star.mag), 0.6, 2.5)
        : THREE.MathUtils.clamp(2.3 - star.mag * 0.18, 0.65, 2.6);
      this.starsMap.set(star.id, { data: star, position, visible: true, pixelRadius });
    }
    if (this.points.material.toneMapped !== realistic) {
      this.points.material.toneMapped = realistic;
      this.points.material.needsUpdate = true;
    }
    this.updatePhotometry();
  }

  private updatePhotometry() {
    const realistic = this.viewMode === 'realistic';
    const enhanced = this.observationMode === 'enhancedOptical';
    const limit = enhanced ? 14 : 6.5;
    const { geometry } = this.points;
    const positions = geometry.getAttribute('position');
    const colours = geometry.getAttribute('color');
    const diameters = geometry.getAttribute('diameter');
    const colour = new THREE.Color();
    const neutral = new THREE.Color(1, 1, 1);

    let count = 0;
    this.sun.visible = false;
    for (const node of this.starsMap.values()) {
      const { data, position } = node;
      node.visible = !realistic || data.mag <= limit;
      node.pointIndex = undefined;
      if (!node.visible) continue;
      colour.setHex(getSpectralColor(data.spectral));

      if (data.id === 'sol') {
        this.sun.position.copy(position);
        this.sun.material.color.copy(colour);
        this.sun.userData = { starData: data, type: 'star' };
        this.sun.visible = true;
        continue;
      }

      if (realistic) {
        if (!enhanced) colour.lerp(neutral, 0.8);
        // Pogson flux ratio with bright-end display compression.
        const flux = Math.pow(10, -0.4 * (data.mag - limit));
        colour.multiplyScalar(Math.min(3, 0.035 * flux));
      }
      node.pointIndex = count;
      positions.setXYZ(count, position.x, position.y, position.z);
      colours.setXYZ(count, colour.r, colour.g, colour.b);
      diameters.setX(count, node.pixelRadius * 2);
      count++;
    }
    geometry.setDrawRange(0, count);
    this.points.visible = count > 0;
    positions.needsUpdate = colours.needsUpdate = diameters.needsUpdate = true;
  }

  /** Catalogue markers are sized and picked in screen pixels at every zoom. */
  public pickStar(camera: THREE.PerspectiveCamera, pointer: THREE.Vector2, width: number, height: number) {
    if (!this.group.visible || !this.points.visible) return null;
    const projected = new THREE.Vector3();
    let closest: { id: string; distance: number } | null = null;
    for (const node of this.starsMap.values()) {
      if (node.pointIndex === undefined) continue;
      projected.copy(node.position).applyMatrix4(camera.matrixWorldInverse);
      if (-projected.z < camera.near || -projected.z > camera.far) continue;
      projected.applyMatrix4(camera.projectionMatrix);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
      const dx = (projected.x - pointer.x) * width * 0.5;
      const dy = (projected.y - pointer.y) * height * 0.5;
      if (dx * dx + dy * dy > node.pixelRadius ** 2) continue;

      const distance = camera.position.distanceTo(node.position);
      if (!closest || distance < closest.distance) closest = { id: node.data.id, distance };
    }
    return closest;
  }

  public animate(camera: THREE.PerspectiveCamera) {
    if (!this.sun.visible) return;
    const distance = camera.position.distanceTo(this.sun.position);
    this.sun.scale.setScalar(THREE.MathUtils.clamp(distance * 0.015, 0.0001, 1));
  }
}
