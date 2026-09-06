import * as THREE from 'three';
import { createPlanetMaterial, createSaturnRings } from './PlanetMaterials';
import {
  PLANET_EPHEMERIS,
  KeplerianElements,
  calculatePlanetPositionAU,
  calculatePlanetOrbitPathAU,
  LY_PER_AU
} from '../utils/ephemeris';

export interface RenderedPlanet {
  data: KeplerianElements;
  mesh: THREE.Mesh;
  orbitLine: THREE.LineLoop;
}

export class SolSystemRenderer {
  public group: THREE.Group;
  public planetsMap: Map<string, RenderedPlanet> = new Map();
  private orbitLinesGroup: THREE.Group;
  private isOrbitsVisible: boolean = false; // Default OFF as requested

  constructor() {
    this.group = new THREE.Group();
    this.orbitLinesGroup = new THREE.Group();
    this.orbitLinesGroup.visible = false; // Default OFF as requested
    this.group.add(this.orbitLinesGroup);

    console.log('🪐 [SolSystemRenderer] Instantiated with exact Keplerian ephemeris & astronomical AU light-year scaling.');
    this.createSolSystem();
  }

  public setOrbitsVisible(visible: boolean) {
    console.log(`🪐 [SolSystemRenderer] Planetary orbits visible: ${visible}`);
    this.isOrbitsVisible = visible;
    this.orbitLinesGroup.visible = visible;
  }

  public createSolSystem(currentDate: Date = new Date()) {
    console.log(`🪐 [SolSystemRenderer] Computing real-time planet positions for date: ${currentDate.toISOString()}`);

    // Clear existing
    while (this.group.children.length > 1) { // keep orbitLinesGroup
      const child = this.group.children[this.group.children.length - 1];
      if (child !== this.orbitLinesGroup) {
        this.group.remove(child);
      }
    }
    while (this.orbitLinesGroup.children.length > 0) {
      this.orbitLinesGroup.remove(this.orbitLinesGroup.children[0]);
    }
    this.planetsMap.clear();

    PLANET_EPHEMERIS.forEach((planet) => {
      // 1. Calculate 3D position in AU at user's current date
      const posAU = calculatePlanetPositionAU(planet, currentDate);
      // Convert AU to light-years
      const posLY = posAU.clone().multiplyScalar(LY_PER_AU);

      // Planet sphere mesh radius scaled proportionally for close-up viewing
      // Compress size ratios for navigation, retaining distinct relative sizes.
      // Positions remain in AU; the UI explicitly describes enlarged bodies.
      const radiusLY = 0.000002 * Math.pow(planet.radiusKm / 6371, 0.35);
      const geo = new THREE.SphereGeometry(radiusLY, 64, 48);
      const mat = createPlanetMaterial(planet.id, planet.color, posLY);

      const planetMesh = new THREE.Mesh(geo, mat);
      planetMesh.position.copy(posLY);
      planetMesh.userData = { planetData: planet, type: 'planet', displayRadius: radiusLY };
      const tilt = planet.id === 'saturn' ? 26.7 : planet.id === 'uranus' ? 97.8 : planet.id === 'earth' ? 23.4 : planet.id === 'mars' ? 25.2 : 3;
      planetMesh.rotation.z = THREE.MathUtils.degToRad(tilt);
      this.group.add(planetMesh);

      // Saturn Rings
      if (planet.id === 'saturn') {
        const sun = posLY.clone().negate().normalize()
          .applyQuaternion(planetMesh.quaternion.clone().invert())
          .applyAxisAngle(new THREE.Vector3(1,0,0), Math.PI / 2);
        const ringMesh = createSaturnRings(radiusLY, sun);
        ringMesh.userData = { planetData: planet, type: 'planet' };
        planetMesh.add(ringMesh);
      }

      // 2. Calculate true tilted orbital path points in AU -> convert to LY
      const pathPointsAU = calculatePlanetOrbitPathAU(planet, 128);
      const pathPointsLY = pathPointsAU.map(pt => pt.multiplyScalar(LY_PER_AU));

      const orbitGeo = new THREE.BufferGeometry().setFromPoints(pathPointsLY);
      const orbitMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(planet.color),
        transparent: true,
        opacity: 0.22
      });
      const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
      this.orbitLinesGroup.add(orbitLine);

      this.planetsMap.set(planet.id, {
        data: planet,
        mesh: planetMesh,
        orbitLine
      });
    });

    console.log(`🪐 [SolSystemRenderer] Real-time planet positions generated for all 9 planets.`);
  }

  public animate(timeSec: number) {
    this.planetsMap.forEach(planet => {
      (planet.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = timeSec;
    });
  }
}
