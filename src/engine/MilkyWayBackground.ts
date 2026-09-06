import * as THREE from 'three';
import { PlaneAlignment } from './StarRenderer';
import { galacticFrameQuaternion } from '../utils/coordinates';
import { GALACTIC_SKY_FRAGMENT_SHADER } from './GalacticSkyModel';

export type MilkyWayMode = 'render' | 'photo';

/**
 * Live texture-free volumetric sky with an optional photographic reference.
 */
export class MilkyWayBackground {
  public mesh: THREE.Mesh;
  private texture: THREE.Texture;
  private material: THREE.MeshBasicMaterial;
  private disposed = false;
  public mode: MilkyWayMode = 'render';
  private proceduralMaterial: THREE.ShaderMaterial;
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

    this.proceduralMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: GALACTIC_SKY_FRAGMENT_SHADER,
      uniforms: { uEyeAdapted: { value: 1 } },
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
    this.texture.dispose();
  }

  public setPlaneAlignment(alignment: PlaneAlignment) {
    // Both sky sources use the same local Galactic frame.
    this.mesh.quaternion.copy(galacticFrameQuaternion(alignment));
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
