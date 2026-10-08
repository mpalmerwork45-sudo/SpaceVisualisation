import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isSelectableHit, selectableObjects } from './ObjectPicking';

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
  it('rejects transparent galaxy corners but keeps the centre and ordinary meshes', () => {
    const galaxy = new THREE.Mesh(); galaxy.userData.deepObjectData = { galaxy: {} };
    expect(isSelectableHit({ object: galaxy, uv: new THREE.Vector2(.99,.99) } as any)).toBe(false);
    expect(isSelectableHit({ object: galaxy, uv: new THREE.Vector2(.5,.5) } as any)).toBe(true);
    expect(isSelectableHit({ object: new THREE.Mesh(), uv: new THREE.Vector2(.99,.99) } as any)).toBe(true);
  });
});
