import * as THREE from 'three';
import { PlaneAlignment } from './StarRenderer';
import { galacticFrameQuaternion, ViewMode } from '../utils/coordinates';
import { GALACTIC_SKY_FRAGMENT_SHADER, LY_PER_KPC } from './GalacticSkyModel';

export type MilkyWayMode = 'render' | 'photo';

/**
 * Live volumetric sky. The expensive integration runs into a linear HDR buffer
 * at half resolution; unchanged views reuse it. No photographic input is used.
 */
export class MilkyWayBackground {
  public mesh: THREE.Mesh;
  private texture: THREE.Texture;
  private material: THREE.MeshBasicMaterial;
  private disposed = false;
  public mode: MilkyWayMode = 'render';
  private proceduralMaterial: THREE.ShaderMaterial;
  private integrationMaterial: THREE.ShaderMaterial;
  private integrationScene = new THREE.Scene();
  private integrationMesh: THREE.Mesh;
  private radiance = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false
  });
  private drawingSize = new THREE.Vector2();
  private inverseFrame = new THREE.Quaternion();
  private lastView = new THREE.Matrix4();
  private lastProjection = new THREE.Matrix4();
  private lastObserver = new THREE.Vector3(Infinity, Infinity, Infinity);
  private dirty = true;
  private textureLoading?: Promise<void>;
  private photoLoaded = false;

  constructor() {
    this.texture = new THREE.Texture();
    this.configureTexture(this.texture);

    const geometry = new THREE.SphereGeometry(9000, 96, 64);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      transparent: false,
      toneMapped: true
    });

    this.integrationMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: GALACTIC_SKY_FRAGMENT_SHADER,
      uniforms: { uObserver: { value: new THREE.Vector3() } },
      side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false
    });
    this.integrationMesh = new THREE.Mesh(geometry, this.integrationMaterial);
    this.integrationMesh.frustumCulled = false;
    this.integrationScene.add(this.integrationMesh);
    this.proceduralMaterial = new THREE.ShaderMaterial({
      vertexShader: `void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
      fragmentShader: `
        uniform sampler2D uRadiance;
        uniform vec2 uViewport;
        uniform float uEyeAdapted;
        void main() {
          vec3 light = texture2D(uRadiance, gl_FragCoord.xy / uViewport).rgb;
          float luminance = dot(light, vec3(0.2126, 0.7152, 0.0722));
          light = mix(light, vec3(luminance), 0.94 * uEyeAdapted);
          gl_FragColor = vec4(light * mix(0.22, 0.045, uEyeAdapted), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      uniforms: {
        uRadiance: { value: this.radiance.texture },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uEyeAdapted: { value: 1 }
      },
      side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: true
    });
    this.mesh = new THREE.Mesh(geometry, this.proceduralMaterial);
    // Draw the diffuse sky behind catalogue stars and planets.
    this.mesh.renderOrder = -10;
    this.setPlaneAlignment('ecliptic');
  }

  public async setMode(mode: MilkyWayMode): Promise<void> {
    this.mode = mode;
    if (mode === 'photo' && !this.photoLoaded) {
      this.textureLoading ??= this.loadObservationalTexture(
        `${import.meta.env.BASE_URL}textures/milky-way-eso0932a.jpg`
      ).catch(error => {
        this.textureLoading = undefined;
        this.mode = 'render';
        throw error;
      });
      await this.textureLoading;
    }
    if (!this.disposed) this.mesh.material = this.mode === 'photo' ? this.material : this.proceduralMaterial;
  }

  public setObservationMode(mode: 'darkAdaptedEye' | 'enhancedOptical') {
    this.proceduralMaterial.uniforms.uEyeAdapted.value = mode === 'darkAdaptedEye' ? 1 : 0;
    this.material.color.setScalar(mode === 'darkAdaptedEye' ? 0.22 : 1);
  }

  /** Restored render targets contain no pixels, even when the view is unchanged. */
  public invalidate() { this.dirty = true; }

  /** Physical navigation moves through the Galaxy. Nonphysical distance maps
   * deliberately retain Sol's sky; their compressed positions are not kpc. */
  public update(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, viewMode: ViewMode) {
    if (this.disposed || this.mode !== 'render') return;
    renderer.getDrawingBufferSize(this.drawingSize);
    this.proceduralMaterial.uniforms.uViewport.value.copy(this.drawingSize);
    const width = Math.max(1, Math.ceil(this.drawingSize.x / 2));
    const height = Math.max(1, Math.ceil(this.drawingSize.y / 2));
    if (width !== this.radiance.width || height !== this.radiance.height) {
      this.radiance.setSize(width, height);
      this.dirty = true;
    }
    const observer = this.integrationMaterial.uniforms.uObserver.value as THREE.Vector3;
    observer.copy(camera.position).applyQuaternion(this.inverseFrame).divideScalar(LY_PER_KPC);
    if (viewMode !== 'linear') observer.set(0, 0, 0);
    camera.updateMatrixWorld();
    if (!this.dirty && this.lastView.equals(camera.matrixWorld) &&
        this.lastProjection.equals(camera.projectionMatrix) && this.lastObserver.equals(observer)) return;

    this.integrationMesh.position.copy(camera.position);
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(this.radiance);
      renderer.render(this.integrationScene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
    }
    this.lastView.copy(camera.matrixWorld);
    this.lastProjection.copy(camera.projectionMatrix);
    this.lastObserver.copy(observer);
    this.dirty = false;
  }

  /**
   * Installs an observational reference for photo mode. This class owns the
   * resulting GPU texture; the procedural material remains independent.
   */
  public setTexture(texture: THREE.Texture) {
    if (this.disposed) {
      texture.dispose();
      return;
    }
    if (texture === this.texture) return;
    this.texture.dispose();
    this.texture = texture;
    this.configureTexture(texture);
    this.material.map = texture;
    this.material.needsUpdate = true;
    this.photoLoaded = true;
  }

  /** Load a Galactic equirectangular panorama (centre at u=.5, north at top). */
  public loadObservationalTexture(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        texture => {
          this.setTexture(texture);
          resolve();
        },
        undefined,
        reject
      );
    });
  }

  public dispose() {
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.proceduralMaterial.dispose();
    this.integrationMaterial.dispose();
    this.radiance.dispose();
    this.texture.dispose();
  }

  public setPlaneAlignment(alignment: PlaneAlignment) {
    // Both sky sources use the same local Galactic frame.
    this.mesh.quaternion.copy(galacticFrameQuaternion(alignment));
    this.integrationMesh.quaternion.copy(this.mesh.quaternion);
    this.inverseFrame.copy(this.mesh.quaternion).invert();
    this.dirty = true;
  }


  private configureTexture(texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
  }
}
