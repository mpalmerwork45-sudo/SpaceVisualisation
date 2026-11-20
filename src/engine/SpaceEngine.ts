import * as THREE from 'three';
import { StarRenderer, PlaneAlignment } from './StarRenderer';
import { ConstellationRenderer } from './ConstellationRenderer';
import { SolSystemRenderer } from './SolSystemRenderer';
import { DeepSpaceRenderer } from './DeepSpaceRenderer';
import { GridRenderer } from './GridRenderer';
import { MilkyWayBackground, MilkyWayMode } from './MilkyWayBackground';
import { StarFieldBackground } from './StarFieldBackground';
import { angularDiameterToWorldSize, frameRotation, galacticFrameQuaternion, inwardViewDirection, orbitOffset, scaleDistance, viewDirectionToOrbitAngles, ViewMode } from '../utils/coordinates';
import { StarData, STARS_CATALOG } from '../data/stars';
import { DeepSpaceObjectData } from '../data/deepSpace';
import { ConstellationData, CONSTELLATIONS } from '../data/constellations';
import type { KeplerianElements } from '../utils/ephemeris';
import { isSelectableHit, selectableObjects } from './ObjectPicking';

interface SelectionData {
  star: StarData;
  planet: KeplerianElements;
  deepSpace: DeepSpaceObjectData;
  constellation: ConstellationData;
}

export type SelectedObjectType = keyof SelectionData;
export type ObjectSelection = {
  [Type in SelectedObjectType]: { type: Type; data: SelectionData[Type]; position: THREE.Vector3 }
}[SelectedObjectType];

export type CameraPreset =
  | 'sol_center'
  | 'galactic_center'
  | 'galactic_north' // Backward-compatible alias for the old misleading name.
  | 'look_galactic_pole'
  | 'ecliptic_north'
  | 'realistic_sky';

const MIN_CAMERA_PHI = 0.0001;
const MAX_CAMERA_PHI = Math.PI - MIN_CAMERA_PHI;
const MIN_CAMERA_RADIUS = 0.0000000001;
const MAX_CAMERA_RADIUS = 2500000;
const SOL_CAMERA_RADIUS = 0.0003; // ~19 AU: close view of the planetary system.
const SKY_CAMERA_RADIUS = 0.01;
const MILLISECONDS_PER_DAY = 86_400_000;
const MIN_SIMULATION_TIME = Date.parse('0001-01-01T00:00:00Z');
const MAX_SIMULATION_TIME = Date.parse('9999-12-31T23:59:59.999Z');

export class SpaceEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public starRenderer: StarRenderer;
  public constellationRenderer: ConstellationRenderer;
  public solSystemRenderer: SolSystemRenderer;
  public deepSpaceRenderer: DeepSpaceRenderer;
  public gridRenderer: GridRenderer;
  public milkyWay: MilkyWayBackground;
  public starField: StarFieldBackground;

  public viewMode: ViewMode = 'linear';
  public planeAlignment: PlaneAlignment = 'ecliptic';
  public observationMode: 'darkAdaptedEye' | 'enhancedOptical' = 'darkAdaptedEye';
  public spectralFilter = 'ALL';
  public focusedPlanetId: string | null = null;
  public activePreset: CameraPreset | null = 'sol_center';

  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private container: HTMLElement;

  // Current Camera Orbit State
  public cameraTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public cameraRadius: number = SOL_CAMERA_RADIUS;
  public cameraTheta: number = Math.PI / 4;
  public cameraPhi: number = 0.4;
  public cameraRoll: number = 0;

  // Smooth Target Camera Orbit State (Gliding Flight Transitions)
  public targetCameraTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public targetCameraRadius: number = SOL_CAMERA_RADIUS;
  public targetCameraTheta: number = Math.PI / 4;
  public targetCameraPhi: number = 0.4;
  public targetCameraRoll: number = 0;
  public cameraFov: number = 55;
  public targetCameraFov: number = 55;
  private skyLookDirection: THREE.Vector3 | null = null;
  private catalogueFocus: { type: SelectedObjectType; id: string } | null = null;

  private isDragging: boolean = false;
  private previousMousePosition = { x: 0, y: 0 };
  private pointerStart = { x: 0, y: 0 };
  private suppressClick = false;
  private pointers = new Map<number, THREE.Vector2>();

  // Callbacks
  public onSelectObject?: (selection: ObjectSelection) => void;
  public onHoverObject?: (hovered: ObjectSelection | null, screenPos: { x: number; y: number }) => void;
  public onRenderFrame?: () => void;
  public onStateChange?: () => void;

  private clock: THREE.Clock;
  private simulationTime = Date.now();
  private isSimulationPlaying = false;
  private simulatedDaysPerSecond = 7;
  private animationFrameId: number | null = null;
  private disposed = false;
  private eventController = new AbortController();

  constructor(container: HTMLElement) {
    console.log('🌌 [SpaceEngine] Initializing WebGL Engine with smooth gliding camera transitions & logarithmic depth buffer...');
    this.container = container;
    this.clock = new THREE.Clock();

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = null;

    // 2. Camera setup with high-precision logarithmic depth capability. The
    // catalogue includes objects out to ~31 Mly (M104), so the far plane must
    // not silently clip the linear-distance view.
    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.00000000001, 100000000);

    // 3. Renderer setup with logarithmicDepthBuffer enabled
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true
    });
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    container.appendChild(this.renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(200, 200, 200);
    this.scene.add(dirLight);

    // 5. Astronomical Milky Way Sky Dome
    this.milkyWay = new MilkyWayBackground();
    this.scene.add(this.milkyWay.mesh);

    // 6. Procedural background stars
    this.starField = new StarFieldBackground();
    this.scene.add(this.starField.points);

    // 7. Sub-renderers
    this.starRenderer = new StarRenderer(this.renderer.getPixelRatio());
    this.scene.add(this.starRenderer.group);

    this.constellationRenderer = new ConstellationRenderer();
    this.scene.add(this.constellationRenderer.group);

    this.solSystemRenderer = new SolSystemRenderer(this.simulationDate);
    this.scene.add(this.solSystemRenderer.group);

    this.deepSpaceRenderer = new DeepSpaceRenderer();
    this.scene.add(this.deepSpaceRenderer.group);

    this.setObservationMode('darkAdaptedEye');

    this.gridRenderer = new GridRenderer();
    this.scene.add(this.gridRenderer.group);

    // Raycasting
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Default Viewpoint: Planetary Level zoom centered on Sol
    this.rebuildAllData();
    this.setPresetViewpoint('sol_center');
    // Apply the opening pose before the first frame, without an initial glide.
    this.applyTargetCameraPose();

    // Bind event listeners
    this.bindEvents();

    // Start render loop
    this.animate();
  }

  // --- SINGLE AXIS TILT & ROTATION CONTROLS (SMOOTH) ---
  public adjustPitch(deltaDegrees: number) {
    if (this.skyLookDirection) {
      const right = new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
      this.skyLookDirection.applyAxisAngle(right, THREE.MathUtils.degToRad(deltaDegrees));
      return;
    }
    // Phi describes camera position, while the view points inward. Increasing
    // phi therefore raises the actual line-of-sight elevation.
    this.targetCameraPhi = THREE.MathUtils.clamp(
      this.targetCameraPhi + deltaDegrees * (Math.PI / 180),
      MIN_CAMERA_PHI,
      MAX_CAMERA_PHI
    );
  }

  public adjustYaw(deltaDegrees: number) {
    if (this.skyLookDirection) {
      this.skyLookDirection.applyAxisAngle(this.camera.up, -THREE.MathUtils.degToRad(deltaDegrees));
      return;
    }
    this.targetCameraTheta += deltaDegrees * (Math.PI / 180);
  }

  public adjustRoll(deltaDegrees: number) {
    this.targetCameraRoll += deltaDegrees * (Math.PI / 180);
  }

  public resetOrientation() {
    this.targetCameraRoll = 0;
  }

  /** Orbit around the existing focus, keeping its distance and heading. */
  public setOrbitElevation(degrees: number) {
    if (!Number.isFinite(degrees)) return;
    this.skyLookDirection = null;
    this.targetCameraPhi = THREE.MathUtils.degToRad(90-THREE.MathUtils.clamp(degrees,-85,85));
  }

  /** Optical framing; independent of observer position and orbit radius. */
  public setFieldOfView(degrees: number) {
    if (!Number.isFinite(degrees)) return;
    this.targetCameraFov = THREE.MathUtils.clamp(degrees,0.05,90);
  }

  public turnAround180() {
    const direction = this.skyLookDirection?.clone() ?? this.camera.getWorldDirection(new THREE.Vector3());
    this.turnInPlace(direction.negate());
    this.activePreset = null;
    this.onStateChange?.();
  }

  public setViewMode(mode: ViewMode) {
    const previousMode = this.viewMode;
    const heading = this.camera.getWorldDirection(new THREE.Vector3());
    const focus = this.catalogueFocus;
    this.viewMode = mode;
    this.focusedPlanetId = null;
    this.activePreset = null;
    this.targetCameraFov = 55;
    this.gridRenderer.setRingsVisible(mode !== 'realistic');
    this.gridRenderer.setGridVisible(mode !== 'realistic');
    if (mode === 'realistic') this.setObservationMode('darkAdaptedEye');
    if (mode !== previousMode) this.rebuildAllData();

    const selection = focus && this.resolveSelection(focus.type, focus.id);
    if (selection) this.frameObject(selection);
    else if (mode === 'realistic') this.aimSky(heading, 55);
    else if (previousMode === 'realistic') {
      this.aimOrbit(new THREE.Vector3(), 25);
      this.setTargetViewDirection(heading);
    }

    // The old pose and the new catalogue use different distance scales.
    if (mode !== previousMode) this.applyTargetCameraPose();
    this.onStateChange?.();
  }

  public setObservationMode(mode: 'darkAdaptedEye' | 'enhancedOptical') {
    this.observationMode = mode;
    const exposure = mode === 'enhancedOptical' ? 1.55 : 0.82;
    this.renderer.toneMappingExposure = exposure;
    this.deepSpaceRenderer.setExposure(mode === 'enhancedOptical' ? 1.45 : 0.72);
    this.milkyWay.setObservationMode(mode);
    this.starField.setObservationMode(mode);
    this.starRenderer.setObservationMode(mode);
    this.onStateChange?.();
  }

  public async setMilkyWayMode(mode: MilkyWayMode) {
    await this.milkyWay.setMode(mode);
    if (!this.disposed) this.starField.points.visible = this.milkyWay.mode === 'render';
  }

  public setPlaneAlignment(alignment: PlaneAlignment) {
    if (!this.rotatePlaneAlignment(alignment)) return;
    this.rebuildAllData();
    this.updateCameraPosition();
    this.onStateChange?.();
  }

  private rotatePlaneAlignment(alignment: PlaneAlignment) {
    if (alignment === this.planeAlignment) return false;
    const rotation = frameRotation(this.planeAlignment, alignment);
    this.cameraTarget.applyQuaternion(rotation);
    this.targetCameraTarget.applyQuaternion(rotation);
    const current = viewDirectionToOrbitAngles(orbitOffset(1, this.cameraTheta, this.cameraPhi).applyQuaternion(rotation).negate());
    const target = viewDirectionToOrbitAngles(orbitOffset(1, this.targetCameraTheta, this.targetCameraPhi).applyQuaternion(rotation).negate());
    this.cameraTheta = current.theta;
    this.cameraPhi = current.phi;
    this.targetCameraTheta = target.theta;
    this.targetCameraPhi = target.phi;
    // Preserve physical heading and roll, including a turn-in-place sightline.
    this.camera.up.applyQuaternion(rotation);
    this.skyLookDirection?.applyQuaternion(rotation);
    this.planeAlignment = alignment;
    this.activePreset = null;
    this.milkyWay.setPlaneAlignment(alignment);
    this.starField.setPlaneAlignment(alignment);
    return true;
  }

  public setSpectralFilter(filter: string) {
    if (filter === this.spectralFilter) return;
    this.spectralFilter = filter;
    this.starRenderer.updateStars(this.viewMode, this.planeAlignment, filter);
    this.constellationRenderer.updateConstellations(this.starRenderer, this.viewMode, this.planeAlignment);
    this.onStateChange?.();
  }

  public get simulationDate() { return new Date(this.simulationTime); }
  public get simulationPlaying() { return this.isSimulationPlaying; }
  public get simulationSpeed() { return this.simulatedDaysPerSecond; }

  public setSimulationDate(date: Date) {
    const time = date.getTime();
    if (!Number.isFinite(time)) return;
    this.updateSimulationTime(THREE.MathUtils.clamp(time, MIN_SIMULATION_TIME, MAX_SIMULATION_TIME));
    this.updateCameraPosition();
    this.onStateChange?.();
  }

  public setSimulationPlaying(playing: boolean) {
    this.isSimulationPlaying = playing && this.simulationTime < MAX_SIMULATION_TIME;
    this.onStateChange?.();
  }

  public setSimulationSpeed(daysPerSecond: number) {
    if (!Number.isFinite(daysPerSecond) || daysPerSecond <= 0) return;
    this.simulatedDaysPerSecond = daysPerSecond;
    this.onStateChange?.();
  }

  private advanceSimulation(seconds: number) {
    if (!this.simulationPlaying || seconds <= 0) return;
    const time = Math.min(MAX_SIMULATION_TIME, this.simulationTime + seconds * this.simulationSpeed * MILLISECONDS_PER_DAY);
    this.updateSimulationTime(time);
    if (time === MAX_SIMULATION_TIME) this.setSimulationPlaying(false);
  }

  private updateSimulationTime(time: number) {
    if (time === this.simulationTime) return;
    const planet = this.focusedPlanetId ? this.solSystemRenderer.planetsMap.get(this.focusedPlanetId) : undefined;
    const previous = planet?.mesh.getWorldPosition(new THREE.Vector3());
    this.simulationTime = time;
    this.solSystemRenderer.updateDate(this.simulationDate);
    if (planet && previous) {
      const shift = planet.mesh.getWorldPosition(new THREE.Vector3()).sub(previous);
      this.cameraTarget.add(shift);
      this.targetCameraTarget.add(shift);
    }
  }

  /** Resolve by identity at action time; never reuse coordinates from an old view. */
  public resolveSelection(type: SelectedObjectType, id: string): ObjectSelection | null {
    if (type === 'star') {
      const data = STARS_CATALOG.find(star => star.id === id);
      return data ? { type, data, position: this.starRenderer.calculateStarPosition(data, this.viewMode, this.planeAlignment) } : null;
    }
    if (type === 'planet') {
      const node = this.solSystemRenderer.planetsMap.get(id);
      return node ? { type, data: node.data, position: node.mesh.getWorldPosition(new THREE.Vector3()) } : null;
    }
    if (type === 'deepSpace') {
      const node = this.deepSpaceRenderer.objectsMap.get(id);
      return node ? { type, data: node.data, position: node.position.clone() } : null;
    }
    if (type === 'constellation') {
      const data = CONSTELLATIONS.find(item => item.id === id);
      if (!data) return null;
      const ids = new Set(data.lines.flat());
      const positions = STARS_CATALOG.filter(star => ids.has(star.id))
        .map(star => this.starRenderer.calculateStarPosition(star, this.viewMode, this.planeAlignment));
      const position = positions.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(positions.length || 1);
      return { type, data, position };
    }
    return null;
  }

  public rebuildAllData() {
    this.starRenderer.updateStars(this.viewMode, this.planeAlignment, this.spectralFilter);
    this.solSystemRenderer.setPlaneAlignment(this.planeAlignment);
    this.constellationRenderer.updateConstellations(this.starRenderer, this.viewMode, this.planeAlignment);
    this.deepSpaceRenderer.updateDeepSpace(this.viewMode, this.planeAlignment);
    this.gridRenderer.updateGrid(this.viewMode, this.planeAlignment);
  }

  public setPresetViewpoint(preset: CameraPreset) {
    if (preset === 'galactic_center' || preset === 'galactic_north') {
      const centreDistance = scaleDistance(26700, this.viewMode);
      const direction = new THREE.Vector3(centreDistance, 0, 0)
        .applyQuaternion(galacticFrameQuaternion(this.planeAlignment))
        .sub(this.camera.position).normalize();
      this.turnInPlace(direction);
      this.activePreset = 'galactic_center';
      this.onStateChange?.();
      return;
    }
    if (preset === 'realistic_sky') {
      this.setViewMode('realistic');
      this.activePreset = preset;
      this.onStateChange?.();
      return;
    }
    this.clearFocus();
    this.targetCameraRoll = 0;
    this.targetCameraFov = 55;

    const solView = preset === 'sol_center';
    const frameChanged = this.rotatePlaneAlignment(preset === 'look_galactic_pole' ? 'galactic' : 'ecliptic');
    const modeChanged = this.viewMode !== 'linear';
    this.viewMode = 'linear';
    this.gridRenderer.setRingsVisible(!solView);
    this.gridRenderer.setGridVisible(true);
    if (frameChanged || modeChanged) this.rebuildAllData();
    this.targetCameraTarget.set(0, 0, 0);
    this.targetCameraRadius = solView ? SOL_CAMERA_RADIUS : 85;
    if (solView) {
      // Keep planetary coordinates ecliptic-aligned, but face the Galactic
      // centre (l=0, b=0) through Sol from the anticentre side of the system.
      this.setTargetViewDirection(
        new THREE.Vector3(1, 0, 0).applyQuaternion(galacticFrameQuaternion('ecliptic'))
      );
    } else {
      this.setTargetViewDirection(new THREE.Vector3(0, -1, 0));
    }
    this.camera.up.set(0, 1, 0);
    this.activePreset = preset;
    this.onStateChange?.();
  }

  public flyToPosition(targetPos: THREE.Vector3, focusRadius: number = 15) {
    this.clearFocus();
    this.aimOrbit(targetPos, focusRadius);
    this.onStateChange?.();
  }

  private aimOrbit(targetPos: THREE.Vector3, focusRadius: number) {
    this.skyLookDirection = null;
    this.targetCameraTarget.copy(targetPos);
    this.targetCameraRadius = THREE.MathUtils.clamp(focusRadius, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);
    this.targetCameraFov = 55;
  }

  public focusPlanet(id: string) {
    if (!this.solSystemRenderer.planetsMap.has(id)) return;
    this.clearFocus();
    const frameChanged = this.rotatePlaneAlignment('ecliptic');
    if (frameChanged) this.updateCameraPosition();
    if (this.viewMode !== 'linear') this.setViewMode('linear');
    else if (frameChanged) this.rebuildAllData();
    const selection = this.resolveSelection('planet', id);
    if (selection) this.frameObject(selection);
    this.onStateChange?.();
  }

  public focusObject(type: SelectedObjectType, id: string) {
    if (type === 'planet') return this.focusPlanet(id);
    if (type === 'star' && id === 'sol') return this.setPresetViewpoint('sol_center');
    const selection = this.resolveSelection(type, id);
    if (!selection) return;
    this.frameObject(selection);
    this.onStateChange?.();
  }

  private frameObject(selection: ObjectSelection) {
    const { type, data, position } = selection;
    this.catalogueFocus = { type, id: data.id };
    this.focusedPlanetId = null;
    this.activePreset = null;

    const angularSize = type === 'deepSpace' ? data.galaxy?.majorArcmin ?? data.angularSizeArcmin : 0;
    if (this.viewMode === 'realistic') {
      const fov = type === 'deepSpace' ? angularSize * 1.8 / 60 : type === 'constellation' ? 35 : 12;
      this.aimSky(position, fov);
      return;
    }
    if (type === 'planet') {
      const planet = this.solSystemRenderer.planetsMap.get(data.id)!;
      this.aimOrbit(position, planet.mesh.userData.displayRadius * (data.id === 'saturn' ? 12 : 7));
      // View the sunlit side from slightly above the orbital plane.
      const direction = position.clone().normalize().add(new THREE.Vector3(0, -0.4, -0.25));
      this.setTargetViewDirection(direction);
      this.targetCameraRoll = 0;
      this.camera.up.set(0, 1, 0);
      this.focusedPlanetId = data.id;
      return;
    }

    let radius = Math.max(type === 'constellation' ? 15 : 10, position.length() * 0.5);
    if (type === 'deepSpace') {
      const diameter = angularDiameterToWorldSize(angularSize, Math.max(position.length(), 0.001));
      if (this.viewMode === 'logarithmic') radius = Math.max(2, diameter * 1.4);
      else radius = data.galaxy ? Math.max(20, data.galaxy.physicalDiameterLy * 0.8) : Math.max(0.5, diameter * 1.4);
    }
    this.aimOrbit(position, radius);
  }

  private clearFocus() {
    this.skyLookDirection = null;
    this.catalogueFocus = null;
    this.focusedPlanetId = null;
    this.activePreset = null;
  }

  /** Face a sky direction while keeping the observer at Sol. */
  public focusSkyDirection(targetPos: THREE.Vector3, fieldOfViewDeg: number = 12) {
    if (targetPos.lengthSq() === 0) return;
    this.clearFocus();
    this.aimSky(targetPos, fieldOfViewDeg);
    this.onStateChange?.();
  }

  private aimSky(direction: THREE.Vector3, fieldOfViewDeg: number) {
    this.skyLookDirection = null;
    this.targetCameraTarget.set(0, 0, 0);
    this.targetCameraRadius = SKY_CAMERA_RADIUS;
    this.setTargetViewDirection(direction);
    this.targetCameraFov = THREE.MathUtils.clamp(fieldOfViewDeg, 0.05, 75);
  }

  /** Focus an extended catalogue object at a useful multiple of its angular size. */
  public focusSkyObject(targetPos: THREE.Vector3, angularSizeArcmin: number = 60) {
    this.focusSkyDirection(targetPos, (angularSizeArcmin / 60) * 1.8);
  }

  private applyTargetCameraPose() {
    this.cameraTarget.copy(this.targetCameraTarget);
    this.cameraRadius = this.targetCameraRadius;
    this.cameraTheta = this.targetCameraTheta;
    this.cameraPhi = this.targetCameraPhi;
    this.cameraRoll = this.targetCameraRoll;
    this.cameraFov = this.targetCameraFov;
    this.updateCameraPosition();
  }

  private turnInPlace(direction: THREE.Vector3) {
    this.targetCameraTarget.copy(this.cameraTarget);
    this.targetCameraRadius = this.cameraRadius;
    this.targetCameraTheta = this.cameraTheta;
    this.targetCameraPhi = this.cameraPhi;
    this.targetCameraFov = this.cameraFov;
    this.targetCameraRoll = this.cameraRoll;
    this.skyLookDirection = direction;
  }

  public updateCameraPosition() {
    this.cameraPhi = THREE.MathUtils.clamp(this.cameraPhi, MIN_CAMERA_PHI, MAX_CAMERA_PHI);
    this.cameraRadius = THREE.MathUtils.clamp(this.cameraRadius, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);

    if (this.viewMode === 'realistic') {
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(this.skyLookDirection ?? inwardViewDirection(this.cameraTheta, this.cameraPhi));
    } else {
      this.camera.position.copy(this.cameraTarget).add(orbitOffset(this.cameraRadius, this.cameraTheta, this.cameraPhi));
      this.camera.lookAt(this.skyLookDirection
        ? this.camera.position.clone().add(this.skyLookDirection)
        : this.cameraTarget);
    }

    if (Math.abs(this.camera.fov - this.cameraFov) > 0.001) {
      this.camera.fov = this.cameraFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.cameraRoll !== 0) {
      this.camera.rotateZ(this.cameraRoll);
    }

    this.solSystemRenderer.group.visible = this.viewMode !== 'realistic' && this.camera.position.lengthSq() < 0.005 ** 2;
  }

  private setTargetViewDirection(direction: THREE.Vector3) {
    const { theta, phi } = viewDirectionToOrbitAngles(direction);
    this.targetCameraTheta = theta;
    this.targetCameraPhi = THREE.MathUtils.clamp(phi, MIN_CAMERA_PHI, MAX_CAMERA_PHI);
  }

  private zoomBy(factor: number, immediate = false) {
    if (this.viewMode === 'realistic') {
      this.setFieldOfView(this.targetCameraFov * factor);
      if (immediate) this.cameraFov = this.targetCameraFov;
      return;
    }
    this.targetCameraRadius = THREE.MathUtils.clamp(this.targetCameraRadius * factor, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);
    if (immediate) this.cameraRadius = this.targetCameraRadius;
  }

  /** Release GPU resources when the visualizer is unmounted or replaced. */
  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.eventController.abort();

    this.deepSpaceRenderer.dispose();
    this.starField.dispose();
    this.milkyWay.dispose();
    this.solSystemRenderer.dispose();
    this.scene.remove(this.deepSpaceRenderer.group, this.starField.points, this.milkyWay.mesh, this.solSystemRenderer.group);
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach(item => item.dispose());
        else material.dispose();
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private bindEvents() {
    const signal = this.eventController.signal;
    window.addEventListener('resize', this.onWindowResize, { signal });

    const dom = this.renderer.domElement;
    dom.addEventListener('webglcontextlost', event => event.preventDefault(), { signal });
    dom.addEventListener('webglcontextrestored', () => this.milkyWay.invalidate(), { signal });

    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dom.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));
      this.isDragging = true;
      this.suppressClick = false;
      this.pointerStart = { x: e.clientX, y: e.clientY };
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    }, { signal });

    dom.addEventListener('pointermove', (e) => {
      this.updatePointer(e.clientX, e.clientY);
      const previous = this.pointers.get(e.pointerId);
      if (previous && this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
        const oldDistance = previous.distanceTo(other);
        previous.set(e.clientX, e.clientY);
        const newDistance = previous.distanceTo(other);
        if (newDistance > 0 && oldDistance > 0) this.zoomBy(oldDistance / newDistance, true);
        this.suppressClick = true;
        this.previousMousePosition = { x: e.clientX, y: e.clientY };
        return;
      }
      previous?.set(e.clientX, e.clientY);

      if (this.isDragging) {
        if (Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y) > 4) this.suppressClick = true;
        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        if (this.skyLookDirection) {
          this.adjustYaw(deltaX * 0.25);
          this.adjustPitch(deltaY * 0.25);
          this.previousMousePosition = { x: e.clientX, y: e.clientY };
          return;
        }

        this.targetCameraTheta -= deltaX * 0.005;
        this.targetCameraPhi = THREE.MathUtils.clamp(
          this.targetCameraPhi - deltaY * 0.005,
          MIN_CAMERA_PHI,
          MAX_CAMERA_PHI
        );

        this.cameraTheta = this.targetCameraTheta;
        this.cameraPhi = this.targetCameraPhi;

        this.previousMousePosition = { x: e.clientX, y: e.clientY };
        return;
      }

      this.checkHover(e.clientX, e.clientY);
    }, { signal });

    const releasePointer = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.isDragging = this.pointers.size > 0;
      const remaining = [...this.pointers.values()][0];
      if (remaining) this.previousMousePosition = { x: remaining.x, y: remaining.y };
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    };
    dom.addEventListener('pointerup', releasePointer, { signal });
    dom.addEventListener('pointercancel', releasePointer, { signal });
    dom.addEventListener('lostpointercapture', releasePointer, { signal });

    dom.addEventListener('wheel', (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      this.zoomBy(e.deltaY > 0 ? 1.15 : 0.85);
    }, { passive: false, signal });

    dom.addEventListener('click', e => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      this.updatePointer(e.clientX, e.clientY);
      this.checkClick();
    }, { signal });
  }

  private updatePointer(x: number, y: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
  }

  private pickObject(): ObjectSelection | null {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const canvas = this.renderer.domElement;
    const star = this.starRenderer.pickStar(this.camera, this.mouse, canvas.clientWidth, canvas.clientHeight);
    // A fixed pixel hit tolerance; the default 1-world-unit line threshold
    // swallowed the entire AU-scale Solar System.
    const objects = selectableObjects([this.starRenderer.group, this.solSystemRenderer.group, this.deepSpaceRenderer.group, this.constellationRenderer.group]);
    const hits = this.raycaster.intersectObjects(objects.filter(object => !(object instanceof THREE.LineSegments)), false);
    const angularTolerance = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)) * 4 / (this.renderer.domElement.clientHeight || 1000);
    objects.forEach(object => {
      if (!(object instanceof THREE.LineSegments)) return;
      if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
      const centre = object.localToWorld(object.geometry.boundingSphere!.center.clone());
      this.raycaster.params.Line!.threshold = Math.max(this.camera.near, this.camera.position.distanceTo(centre)) * angularTolerance;
      this.raycaster.intersectObject(object, false, hits);
    });
    hits.sort((a, b) => a.distance - b.distance);
    for (const hit of hits) {
      if (!isSelectableHit(hit)) continue;
      if (star && star.distance < hit.distance) return this.resolveSelection('star', star.id);
      const info = hit.object.userData;
      const data = info.starData || info.planetData || info.deepObjectData || info.constellationData;
      if (data) return this.resolveSelection(info.type, data.id);
    }
    return star ? this.resolveSelection('star', star.id) : null;
  }

  private checkHover(screenX: number, screenY: number) {
    if (!this.onHoverObject) return;

    const selection = this.pickObject();
    if (selection) {
      this.onHoverObject(selection, { x: screenX, y: screenY });
      this.renderer.domElement.style.cursor = 'pointer';
      return;
    }

    this.onHoverObject(null, { x: 0, y: 0 });
    this.renderer.domElement.style.cursor = 'grab';
  }

  private checkClick() {
    const selection = this.pickObject();
    if (selection) this.onSelectObject?.(selection);
  }

  private onWindowResize = () => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private animate = () => {
    if (this.disposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    const deltaSeconds = this.clock.getDelta();
    if (this.renderer.getContext().isContextLost()) return;

    const elapsedTime = this.clock.elapsedTime;
    this.advanceSimulation(deltaSeconds);

    // Smooth Camera Transition Interpolation (Glide Ease-Out)
    if (!this.isDragging) {
      const lerpSpeed = 0.08;

      this.cameraTarget.lerp(this.targetCameraTarget, lerpSpeed);
      this.cameraRadius = THREE.MathUtils.lerp(this.cameraRadius, this.targetCameraRadius, lerpSpeed);

      // Shortest angle lerp for theta angle
      let deltaTheta = (this.targetCameraTheta - this.cameraTheta) % (Math.PI * 2);
      if (deltaTheta > Math.PI) deltaTheta -= Math.PI * 2;
      if (deltaTheta < -Math.PI) deltaTheta += Math.PI * 2;
      this.cameraTheta += deltaTheta * lerpSpeed;

      this.cameraPhi = THREE.MathUtils.lerp(this.cameraPhi, this.targetCameraPhi, lerpSpeed);
      this.cameraRoll = THREE.MathUtils.lerp(this.cameraRoll, this.targetCameraRoll, lerpSpeed);
      this.cameraFov = THREE.MathUtils.lerp(this.cameraFov, this.targetCameraFov, lerpSpeed);
    }

    this.updateCameraPosition();

    // An all-sky panorama has angular coordinates, not a navigable distance.
    this.milkyWay.mesh.position.copy(this.camera.position);
    this.starField.points.position.copy(this.camera.position);
    this.milkyWay.update(this.renderer, this.camera, this.viewMode);

    this.starRenderer.animate(this.camera);
    this.constellationRenderer.animate(elapsedTime);
    this.solSystemRenderer.animate(elapsedTime);
    this.deepSpaceRenderer.animate(elapsedTime, this.camera, this.viewMode);

    if (this.onRenderFrame) {
      this.onRenderFrame();
    }

    this.renderer.render(this.scene, this.camera);
  };
}
