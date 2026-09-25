import * as THREE from 'three';
import { StarRenderer, PlaneAlignment } from './StarRenderer';
import { ConstellationRenderer } from './ConstellationRenderer';
import { SolSystemRenderer } from './SolSystemRenderer';
import { DeepSpaceRenderer } from './DeepSpaceRenderer';
import { GridRenderer } from './GridRenderer';
import { MilkyWayBackground, MilkyWayMode } from './MilkyWayBackground';
import { StarFieldBackground } from './StarFieldBackground';
import { galacticFrameQuaternion, orbitOffset, scaleDistance, viewDirectionToOrbitAngles, ViewMode } from '../utils/coordinates';
import { StarData } from '../data/stars';
import { DeepSpaceObjectData } from '../data/deepSpace';

export type SelectedObjectType = 'star' | 'planet' | 'deepSpace' | 'constellation' | null;

export interface ObjectSelection {
  type: SelectedObjectType;
  data: StarData | DeepSpaceObjectData | any;
  position: THREE.Vector3;
}

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

  private isDragging: boolean = false;
  private previousMousePosition = { x: 0, y: 0 };

  // Callbacks
  public onSelectObject?: (selection: ObjectSelection) => void;
  public onHoverObject?: (hovered: ObjectSelection | null, screenPos: { x: number; y: number }) => void;
  public onRenderFrame?: () => void;

  private clock: THREE.Clock;
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

    // 6. Sub-Pixel 65,000 3D Vector Pinpoint Starfield
    this.starField = new StarFieldBackground(65000);
    this.scene.add(this.starField.points);

    // 7. Sub-renderers
    this.starRenderer = new StarRenderer();
    this.scene.add(this.starRenderer.group);

    this.constellationRenderer = new ConstellationRenderer();
    this.scene.add(this.constellationRenderer.group);

    this.solSystemRenderer = new SolSystemRenderer();
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
    this.setPresetViewpoint('sol_center');
    // Apply the opening pose before the first frame, without an initial glide.
    this.cameraTarget.copy(this.targetCameraTarget);
    this.cameraRadius = this.targetCameraRadius;
    this.cameraTheta = this.targetCameraTheta;
    this.cameraPhi = this.targetCameraPhi;
    this.cameraRoll = this.targetCameraRoll;
    this.cameraFov = this.targetCameraFov;

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
    console.log('🔄 [SpaceEngine] Smoothly turning camera view around by 180 degrees.');
    if (this.skyLookDirection) this.skyLookDirection.negate();
    else this.targetCameraTheta += Math.PI;
  }

  public setViewMode(mode: ViewMode) {
    console.log(`🔄 [SpaceEngine] View mode changed to "${mode}"`);
    this.viewMode = mode;
    this.targetCameraFov = 55;

    if (mode === 'realistic') {
      this.gridRenderer.setRingsVisible(false);
      this.gridRenderer.setGridVisible(false);
    } else {
      this.gridRenderer.setRingsVisible(true);
      this.gridRenderer.setGridVisible(true);
    }

    this.rebuildAllData();
  }

  public setObservationMode(mode: 'darkAdaptedEye' | 'enhancedOptical') {
    this.observationMode = mode;
    const exposure = mode === 'enhancedOptical' ? 1.55 : 0.82;
    this.renderer.toneMappingExposure = exposure;
    this.deepSpaceRenderer.setExposure(mode === 'enhancedOptical' ? 1.45 : 0.72);
    this.milkyWay.setObservationMode(mode);
  }

  public async setMilkyWayMode(mode: MilkyWayMode) {
    await this.milkyWay.setMode(mode);
    if (!this.disposed) this.starField.points.visible = this.milkyWay.mode === 'render';
  }

  public setPlaneAlignment(alignment: PlaneAlignment) {
    console.log(`🔄 [SpaceEngine] Alignment changed to "${alignment}"`);
    this.planeAlignment = alignment;
    this.milkyWay.setPlaneAlignment(alignment);
    this.starField.setPlaneAlignment(alignment);
    this.rebuildAllData();
  }

  public rebuildAllData() {
    this.starRenderer.updateStars(this.viewMode, this.planeAlignment);
    this.constellationRenderer.updateConstellations(this.starRenderer, this.viewMode, this.planeAlignment);
    this.deepSpaceRenderer.updateDeepSpace(this.viewMode, this.planeAlignment);
    this.gridRenderer.updateGrid(this.viewMode, this.planeAlignment);
  }

  public setPresetViewpoint(preset: CameraPreset) {
    console.log(`🎥 [Camera Preset] Smoothly gliding to preset "${preset}"`);
    if (preset === 'galactic_center' || preset === 'galactic_north') {
      // Turn in place. Orbit focus, position, projection, roll and zoom remain
      // intact; the sightline is independent of the orbit anchor.
      this.targetCameraTarget.copy(this.cameraTarget);
      this.targetCameraRadius = this.cameraRadius;
      this.targetCameraTheta = this.cameraTheta;
      this.targetCameraPhi = this.cameraPhi;
      this.targetCameraFov = this.cameraFov;
      this.targetCameraRoll = this.cameraRoll;
      const centreDistance = this.viewMode === 'realistic' ? 9000 : scaleDistance(26700, this.viewMode);
      this.skyLookDirection = new THREE.Vector3(centreDistance, 0, 0)
        .applyQuaternion(galacticFrameQuaternion(this.planeAlignment))
        .sub(this.camera.position).normalize();
      return;
    }
    this.skyLookDirection = null;
    this.targetCameraRoll = 0;
    this.targetCameraFov = 55;

    if (preset === 'sol_center') {
      this.viewMode = 'linear';
      this.planeAlignment = 'ecliptic';
      this.milkyWay.setPlaneAlignment('ecliptic');
      this.starField.setPlaneAlignment('ecliptic');
      this.gridRenderer.setRingsVisible(false);
      this.gridRenderer.setGridVisible(true);
      this.rebuildAllData();
      this.targetCameraTarget.set(0, 0, 0);
      this.targetCameraRadius = SOL_CAMERA_RADIUS;
      // Keep planetary coordinates ecliptic-aligned, but face the Galactic
      // centre (l=0, b=0) through Sol from the anticentre side of the system.
      this.setTargetViewDirection(
        new THREE.Vector3(1, 0, 0).applyQuaternion(galacticFrameQuaternion('ecliptic'))
      );
    } else if (preset === 'look_galactic_pole') {
      this.planeAlignment = 'galactic';
      this.milkyWay.setPlaneAlignment('galactic');
      this.starField.setPlaneAlignment('galactic');
      this.viewMode = 'linear';
      this.gridRenderer.setRingsVisible(true);
      this.gridRenderer.setGridVisible(true);
      this.rebuildAllData();
      this.targetCameraTarget.set(0, 0, 0);
      this.targetCameraRadius = 85;
      this.setTargetViewDirection(new THREE.Vector3(0, -1, 0));
    } else if (preset === 'ecliptic_north') {
      this.planeAlignment = 'ecliptic';
      this.milkyWay.setPlaneAlignment('ecliptic');
      this.starField.setPlaneAlignment('ecliptic');
      this.viewMode = 'linear';
      this.gridRenderer.setRingsVisible(true);
      this.gridRenderer.setGridVisible(true);
      this.rebuildAllData();
      this.targetCameraTarget.set(0, 0, 0);
      this.targetCameraRadius = 85;
      this.setTargetViewDirection(new THREE.Vector3(0, -1, 0));
    } else if (preset === 'realistic_sky') {
      this.viewMode = 'realistic';
      this.setObservationMode('darkAdaptedEye');
      this.gridRenderer.setRingsVisible(false);
      this.gridRenderer.setGridVisible(false);
      this.rebuildAllData();
      this.targetCameraTarget.set(0, 0, 0);
      this.targetCameraRadius = 0.01;
      // Preserve the current heading when entering the observer's sky.
    }
  }

  public flyToPosition(targetPos: THREE.Vector3, focusRadius: number = 15) {
    this.skyLookDirection = null;
    console.log(`✈️ [SpaceEngine] Smooth gliding flight to target position:`, targetPos);
    this.targetCameraTarget.copy(targetPos);
    this.targetCameraRadius = THREE.MathUtils.clamp(focusRadius, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);
    this.targetCameraFov = 55;
  }

  public focusPlanet(id: string) {
    const planet = this.solSystemRenderer.planetsMap.get(id);
    if (!planet) return;
    if (this.viewMode !== 'linear') this.setViewMode('linear');
    if (this.planeAlignment !== 'ecliptic') this.setPlaneAlignment('ecliptic');
    this.flyToPosition(planet.mesh.position, planet.mesh.userData.displayRadius * (id === 'saturn' ? 12 : 7));
    // Present a sunlit three-quarter view; orbiting remains fully interactive.
    const radial = planet.mesh.position.clone().negate().normalize().add(new THREE.Vector3(0, 0.4, 0.25)).normalize();
    this.setTargetViewDirection(radial.negate());
    this.targetCameraRoll = 0;
  }

  /** Face a sky direction while keeping the observer at Sol. */
  public focusSkyDirection(targetPos: THREE.Vector3, fieldOfViewDeg: number = 12) {
    this.skyLookDirection = null;
    const direction = targetPos.clone().normalize();
    if (direction.lengthSq() === 0) return;

    this.targetCameraTarget.set(0, 0, 0);
    this.targetCameraRadius = 0.01;
    this.setTargetViewDirection(direction);
    this.targetCameraFov = THREE.MathUtils.clamp(fieldOfViewDeg, 0.05, 75);
  }

  /** Focus an extended catalogue object at a useful multiple of its angular size. */
  public focusSkyObject(targetPos: THREE.Vector3, angularSizeArcmin: number = 60) {
    this.focusSkyDirection(targetPos, (angularSizeArcmin / 60) * 1.8);
  }

  public updateCameraPosition() {
    this.cameraPhi = THREE.MathUtils.clamp(this.cameraPhi, MIN_CAMERA_PHI, MAX_CAMERA_PHI);
    this.cameraRadius = THREE.MathUtils.clamp(this.cameraRadius, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);

    this.camera.position.copy(this.cameraTarget).add(orbitOffset(this.cameraRadius, this.cameraTheta, this.cameraPhi));
    this.camera.lookAt(this.skyLookDirection
      ? this.camera.position.clone().add(this.skyLookDirection)
      : this.cameraTarget);

    if (Math.abs(this.camera.fov - this.cameraFov) > 0.001) {
      this.camera.fov = this.cameraFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.cameraRoll !== 0) {
      this.camera.rotateZ(this.cameraRoll);
    }

    if (this.cameraRadius > 0.005 && this.cameraTarget.length() < 0.1) {
      this.solSystemRenderer.group.visible = false;
    } else {
      this.solSystemRenderer.group.visible = true;
    }
  }

  private setTargetViewDirection(direction: THREE.Vector3) {
    const { theta, phi } = viewDirectionToOrbitAngles(direction);
    this.targetCameraTheta = theta;
    this.targetCameraPhi = THREE.MathUtils.clamp(phi, MIN_CAMERA_PHI, MAX_CAMERA_PHI);
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
    this.scene.remove(this.deepSpaceRenderer.group, this.starField.points, this.milkyWay.mesh);
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

    dom.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    }, { signal });

    dom.addEventListener('mousemove', (e) => {
      const rect = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isDragging) {
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
      }

      this.checkHover(e.clientX, e.clientY);
    }, { signal });

    dom.addEventListener('mouseup', () => {
      this.isDragging = false;
    }, { signal });

    dom.addEventListener('mouseleave', () => {
      this.isDragging = false;
    }, { signal });

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
      this.targetCameraRadius = THREE.MathUtils.clamp(
        this.targetCameraRadius * zoomFactor,
        MIN_CAMERA_RADIUS,
        MAX_CAMERA_RADIUS
      );
    }, { passive: false, signal });

    dom.addEventListener('click', () => {
      this.checkClick();
    }, { signal });
  }

  private checkHover(screenX: number, screenY: number) {
    if (!this.onHoverObject) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
      for (const hit of intersects) {
        const userData = hit.object.userData;
        if (userData && userData.type) {
          let data = userData.starData || userData.planetData || userData.deepObjectData;
          if (data) {
            const worldPosition = hit.object.getWorldPosition(new THREE.Vector3());
            this.onHoverObject({
              type: userData.type,
              data,
              position: worldPosition
            }, { x: screenX, y: screenY });
            document.body.style.cursor = 'pointer';
            return;
          }
        }
      }
    }

    this.onHoverObject(null, { x: 0, y: 0 });
    document.body.style.cursor = 'default';
  }

  private checkClick() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
      for (const hit of intersects) {
        const userData = hit.object.userData;
        if (userData && userData.type) {
          let data = userData.starData || userData.planetData || userData.deepObjectData;
          if (data && this.onSelectObject) {
            const worldPosition = hit.object.getWorldPosition(new THREE.Vector3());
            this.onSelectObject({
              type: userData.type,
              data,
              position: worldPosition
            });
            return;
          }
        }
      }
    }
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

    const elapsedTime = this.clock.getElapsedTime();

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
