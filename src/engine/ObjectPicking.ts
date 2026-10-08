import * as THREE from 'three';

/** Background clouds, grids, hidden ancestors and invisible stars never enter
 * the raycaster. Flat traversal also avoids recursively testing a subtree twice. */
export function selectableObjects(roots: THREE.Object3D[]): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  for (const root of roots) {
    root.traverseVisible(object => {
      if (object.userData.type && (object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) objects.push(object);
    });
  }
  return objects;
}

export function isSelectableHit(hit: THREE.Intersection): boolean {
  const mesh = hit.object;
  if (mesh instanceof THREE.Mesh && mesh.userData.deepObjectData?.galaxy && hit.uv) {
    // Same hard footprint as the analytic galaxy shader, rather than the
    // enclosing quad's transparent corners.
    const x = hit.uv.x * 2 - 1, y = hit.uv.y * 2 - 1;
    if (x*x + y*y > 1) return false;
  }
  return true;
}
