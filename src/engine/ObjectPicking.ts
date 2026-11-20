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
