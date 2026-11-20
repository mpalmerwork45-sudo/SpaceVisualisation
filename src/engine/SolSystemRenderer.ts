import * as THREE from 'three';
import { createPlanetMaterial, createSaturnRings } from './PlanetMaterials';
import { frameRotation, CelestialAlignment } from '../utils/coordinates';
import {
  PLANET_EPHEMERIS,
  KeplerianElements,
  calculatePlanetPositionAU,
  calculatePlanetOrbitPathAU,
  LY_PER_AU
} from '../utils/ephemeris';

export interface RenderedPlanet {
  data: KeplerianElements;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  orbitLine: THREE.LineLoop;
  rings?: ReturnType<typeof createSaturnRings>;
}

export class SolSystemRenderer {
  public group: THREE.Group;
  public planetsMap: Map<string, RenderedPlanet> = new Map();
  private orbitLinesGroup: THREE.Group;
  private isOrbitsVisible: boolean = false; // Default OFF as requested

  constructor(date = new Date()) {
    this.group = new THREE.Group();
    this.orbitLinesGroup = new THREE.Group();
    this.orbitLinesGroup.visible = false; // Default OFF as requested
    this.group.add(this.orbitLinesGroup);

    this.createSolSystem(date);
  }

  public setOrbitsVisible(visible: boolean) {
    console.log(`🪐 [SolSystemRenderer] Planetary orbits visible: ${visible}`);
    this.isOrbitsVisible = visible;
    this.orbitLinesGroup.visible = visible;
  }

  public get orbitsVisible() { return this.isOrbitsVisible; }

  public setPlaneAlignment(alignment: CelestialAlignment) {
    this.group.quaternion.copy(frameRotation('ecliptic', alignment));
    this.updateSunlight();
  }

  public updateDate(date: Date) {
    for (const { mesh, data } of this.planetsMap.values()) {
      mesh.position.copy(calculatePlanetPositionAU(data, date)).multiplyScalar(LY_PER_AU);
    }
    this.updateSunlight();
  }

  private updateSunlight() {
    const inverse = new THREE.Quaternion();
    for (const { mesh, rings } of this.planetsMap.values()) {
      const sun = mesh.material.uniforms.uSun.value as THREE.Vector3;
      sun.copy(mesh.position).negate().normalize();
      if (rings) {
        rings.material.uniforms.uSun.value.copy(sun)
          .applyQuaternion(inverse.copy(mesh.quaternion).invert())
          .applyQuaternion(inverse.copy(rings.quaternion).invert());
      }
      sun.applyQuaternion(this.group.quaternion);
    }
  }

  private clearBodies() {
    // Includes Saturn's child rings, and the orbits retained in a separate group.
    this.group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    this.group.children.filter(child => child !== this.orbitLinesGroup).forEach(child => this.group.remove(child));
    this.orbitLinesGroup.clear();
    this.planetsMap.clear();
  }

  public dispose() { this.clearBodies(); }

  public createSolSystem(currentDate: Date = new Date()) {
    this.clearBodies();

    PLANET_EPHEMERIS.forEach((planet) => {
      // Planet sphere mesh radius scaled proportionally for close-up viewing
      // Compress size ratios for navigation, retaining distinct relative sizes.
      // Positions remain in AU; the UI explicitly describes enlarged bodies.
      const radiusLY = 0.000002 * Math.pow(planet.radiusKm / 6371, 0.35);
      const geo = new THREE.SphereGeometry(radiusLY, 64, 48);
      const mat = createPlanetMaterial(planet.id, planet.color);

      const planetMesh = new THREE.Mesh(geo, mat);
      planetMesh.userData = { planetData: planet, type: 'planet', displayRadius: radiusLY };
      const tilt = planet.id === 'saturn' ? 26.7 : planet.id === 'uranus' ? 97.8 : planet.id === 'earth' ? 23.4 : planet.id === 'mars' ? 25.2 : 3;
      planetMesh.rotation.z = THREE.MathUtils.degToRad(tilt);
      this.group.add(planetMesh);

      // Saturn Rings
      const rings = planet.id === 'saturn' ? createSaturnRings(radiusLY) : undefined;
      if (rings) {
        rings.userData = { planetData: planet, type: 'planet' };
        planetMesh.add(rings);
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
        orbitLine,
        rings
      });
    });

    this.updateDate(currentDate);
  }

  public animate(timeSec: number) {
    this.planetsMap.forEach(planet => {
      planet.mesh.material.uniforms.uTime.value = timeSec;
    });
  }
}
