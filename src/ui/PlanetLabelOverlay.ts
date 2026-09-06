import * as THREE from 'three';
import { SpaceEngine } from '../engine/SpaceEngine';
import { LY_PER_AU } from '../utils/ephemeris';

/** Small foreground labels with collision avoidance and click-to-inspect. */
export class PlanetLabelOverlay {
  private labels = new Map<string, HTMLButtonElement>();
  constructor(private engine: SpaceEngine, private container: HTMLElement, private select: (id: string) => void) {}

  public updateLabels() {
    const visible = this.engine.solSystemRenderer.group.visible && this.engine.cameraRadius < 0.005;
    const width = this.container.clientWidth, height = this.container.clientHeight;
    const occupied: Array<{ x: number; y: number }> = [];
    this.labels.forEach(label => { label.hidden = true; });
    if (!visible) return;
    this.engine.solSystemRenderer.planetsMap.forEach((node, id) => {
      const position = node.mesh.getWorldPosition(new THREE.Vector3()).project(this.engine.camera);
      if (position.z < -1 || position.z > 1) return;
      const x = (position.x + 1) * width / 2;
      const y = (1 - position.y) * height / 2;
      if (x < 12 || x > width - 12 || y < 230 || y > height - 150) return;
      let label = this.labels.get(id);
      if (!label) {
        label = document.createElement('button');
        label.className = 'planet-label';
        label.style.setProperty('--planet-colour', node.data.color);
        label.innerHTML = `<span>${node.data.name}</span><small>${(node.mesh.position.length()/LY_PER_AU).toFixed(2)} AU from Sun</small>`;
        label.title = `Inspect ${node.data.name}`;
        label.addEventListener('click', event => { event.stopPropagation(); this.select(id); });
        this.container.appendChild(label);
        this.labels.set(id,label);
      }
      const radiusPixels = node.mesh.userData.displayRadius * height /
        (2 * Math.tan(THREE.MathUtils.degToRad(this.engine.camera.fov / 2)) * this.engine.camera.position.distanceTo(node.mesh.position));
      const lx = Math.max(12,Math.min(width-150,x+Math.max(18,radiusPixels+12)));
      let ly = y-18;
      let placed = false;
      for (const offset of [0, 40, -40, 80, -80, 120]) {
        ly = y-18+offset;
        if (ly < 230 || ly > height-180) continue;
        if (!occupied.some(p => Math.abs(p.x-lx)<148 && Math.abs(p.y-ly)<39)) { placed = true; break; }
      }
      if (!placed) return;
      occupied.push({x:lx,y:ly});
      label.style.transform = `translate(${lx}px,${ly}px)`;
      label.hidden = false;
    });
  }
}
