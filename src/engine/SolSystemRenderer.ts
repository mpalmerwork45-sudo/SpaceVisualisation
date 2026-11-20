import * as THREE from 'three';
import { createEarthClouds, createPlanetMaterial, createSaturnRings } from './PlanetMaterials';
import { PLANET_FIGURES, planetPoleFrame, planetSpinAngle } from '../data/planetFigure';
import { PLANET_APPEARANCE } from '../data/planetAppearance';
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
  poleFrame: THREE.Quaternion;
  clouds?: ReturnType<typeof createEarthClouds>;
  rings?: ReturnType<typeof createSaturnRings>;
}

export class SolSystemRenderer {
  public group: THREE.Group;
  public planetsMap: Map<string, RenderedPlanet> = new Map();
  private orbitLinesGroup: THREE.Group;
  private isOrbitsVisible: boolean = false; // Default OFF as requested
  private surfaceMaps = new Map<string, THREE.Texture>();
  private retrySurfaceAfter = new Map<string, number>();
  private viewport = new THREE.Vector2();
  private viewCentre = new THREE.Vector3();

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
    for (const { mesh, data, poleFrame } of this.planetsMap.values()) {
      mesh.position.copy(calculatePlanetPositionAU(data, date)).multiplyScalar(LY_PER_AU);
      mesh.quaternion.copy(poleFrame);
      mesh.rotateY(planetSpinAngle(PLANET_FIGURES[data.id], date));
    }
    this.updateSunlight();
  }

  private updateSunlight() {
    const inverse = new THREE.Quaternion();
    for (const { mesh, rings } of this.planetsMap.values()) {
      const sun = mesh.material.uniforms.uSun.value as THREE.Vector3;
      sun.copy(mesh.position).negate().normalize();
      const localSun = mesh.material.uniforms.uLocalSun.value as THREE.Vector3;
      localSun.copy(sun).applyQuaternion(inverse.copy(mesh.quaternion).invert());
      if (rings) {
        rings.material.uniforms.uSun.value.copy(localSun)
          .applyQuaternion(inverse.copy(rings.quaternion).invert());
      }
      sun.applyQuaternion(this.group.quaternion);
    }
  }

  private clearBodies() {
    // Includes the cloud deck, Saturn's rings, and the separate orbit group.
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

  public dispose() {
    this.clearBodies();
    this.surfaceMaps.forEach(texture => texture.dispose());
    this.surfaceMaps.clear();
    this.retrySurfaceAfter.clear();
  }

  private prepareSurfaceMap(id: string, mesh: RenderedPlanet['mesh'], filename: string) {
    const cached = this.surfaceMaps.get(id);
    if (cached?.image) {
      mesh.material.uniforms.uSurfaceMap.value = cached;
      mesh.material.uniforms.uMapReady.value = true;
      return;
    }
    mesh.onBeforeRender = (renderer, _scene, camera) => {
      if (this.surfaceMaps.has(id)) return;
      if (performance.now() < (this.retrySurfaceAfter.get(id) ?? 0)) return;
      this.viewCentre.setFromMatrixPosition(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const height = renderer.getDrawingBufferSize(this.viewport).height;
      const diameter = mesh.userData.displayRadius * height * camera.projectionMatrix.elements[5] / Math.max(-this.viewCentre.z, 1e-12);
      if (diameter < 24) return;

      const url = import.meta.env.BASE_URL + 'textures/' + filename;
      const map = new THREE.TextureLoader().load(url, texture => {
        // A rebuild can replace this mesh while its texture is downloading.
        const current = this.planetsMap.get(id);
        if (current && this.surfaceMaps.get(id) === texture) {
          current.mesh.material.uniforms.uSurfaceMap.value = texture;
          current.mesh.material.uniforms.uMapReady.value = true;
        }
      }, undefined, () => {
        if (this.surfaceMaps.get(id) !== map) return;
        this.surfaceMaps.delete(id);
        map.dispose();
        this.retrySurfaceAfter.set(id, performance.now() + 15_000);
      });
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = THREE.RepeatWrapping;
      this.surfaceMaps.set(id, map);
    };
  }

  public createSolSystem(currentDate: Date = new Date()) {
    this.clearBodies();

    PLANET_EPHEMERIS.forEach((planet) => {
      // Planet sphere mesh radius scaled proportionally for close-up viewing
      // Compress size ratios for navigation, retaining distinct relative sizes.
      // Positions remain in AU; the UI explicitly describes enlarged bodies.
      const radiusLY = 0.000002 * Math.pow(planet.radiusKm / 6371, 0.35);
      const figure = PLANET_FIGURES[planet.id];
      const geo = new THREE.SphereGeometry(radiusLY, 96, 64).scale(1, figure.polarRatio, 1);
      const mat = createPlanetMaterial(planet.id, planet.color, figure.polarRatio);

      const planetMesh = new THREE.Mesh(geo, mat);
      planetMesh.userData = { planetData: planet, type: 'planet', displayRadius: radiusLY };
      this.group.add(planetMesh);
      const surfaceMap = PLANET_APPEARANCE[planet.id].surfaceMap;
      if (surfaceMap) this.prepareSurfaceMap(planet.id, planetMesh, surfaceMap);

      const clouds = planet.id === 'earth' ? createEarthClouds(radiusLY, mat) : undefined;
      if (clouds) {
        clouds.userData = { planetData: planet, type: 'planet' };
        planetMesh.add(clouds);
      }

      const rings = planet.id === 'saturn' ? createSaturnRings(radiusLY, figure.polarRatio) : undefined;
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
        poleFrame: planetPoleFrame(figure),
        clouds,
        rings
      });
    });

    this.updateDate(currentDate);
  }

  public animate(timeSec: number) {
    const earth = this.planetsMap.get('earth');
    if (earth) earth.mesh.material.uniforms.uTime.value = timeSec;
  }
}
