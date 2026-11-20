import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { selectableObjects } from './ObjectPicking';

describe('selectable-only object picking', () => {
  it('ignores invisible ancestors, invisible meshes, background points and untagged guides', () => {
    const root = new THREE.Group();
    const hidden = new THREE.Group(); hidden.visible = false;
    const planet = new THREE.Mesh(); planet.userData.type = 'planet'; hidden.add(planet);
    const faint = new THREE.Mesh(); faint.userData.type = 'star'; faint.visible = false;
    const star = new THREE.Mesh(); star.userData.type = 'star';
    const lines = new THREE.LineSegments(); lines.userData.type = 'constellation';
    root.add(hidden, faint, star, lines, new THREE.Points(), new THREE.Mesh());
    expect(selectableObjects([root])).toEqual([star, lines]);
  });
});
