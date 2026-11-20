import { writeFile } from 'node:fs/promises';

/** Capture the catalogue inspection poses on black so the sky cannot mask a missing model. */
export async function checkCatalogueModels(page, output) {
  const { sheets, coverage } = await page.evaluate(async () => {
    const { PLANET_APPEARANCE } = await import('/src/data/planetAppearance.ts');
    const e = window.engine;
    const { renderer, camera } = e;
    const originalSize = renderer.getSize(new THREE.Vector2());
    const originalAspect = camera.aspect;
    const originalDate = e.simulationDate;
    const width = 360, height = 280, labelHeight = 28;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0);
    const tile = document.createElement('canvas');
    tile.width = width;
    tile.height = height;
    const ctx = tile.getContext('2d', { willReadFrequently: true });
    const sheets = {}, coverage = {};

    const readFrame = camera => {
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height).data;
    };

    const checkRingOcclusion = (model, rings, radius) => {
      const oblique = camera.clone();
      oblique.position.copy(model.localToWorld(new THREE.Vector3(0, 0.28, 1).setLength(6.5 * radius)));
      oblique.up.set(0, 1, 0).applyQuaternion(model.quaternion);
      oblique.lookAt(model.position);
      const withRings = readFrame(oblique);
      rings.visible = false;
      const bareGlobe = readFrame(oblique);
      const difference = y => {
        const p = rings.localToWorld(new THREE.Vector3(0, y, 0)).project(oblique);
        const x = Math.floor((1 + p.x) * width / 2);
        const row = Math.floor((1 - p.y) * height / 2);
        const i = 4 * (row * width + x);
        return Math.max(...[0, 1, 2].map(c => Math.abs(bareGlobe[i + c] - withRings[i + c])));
      };
      window.check(difference(1.70) <= 2 && difference(-1.70) > 4,
        'Saturn occludes the far side of its rings and the near side crosses the globe');
    };

    try {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      e.setPresetViewpoint('sol_center');
      e.setSimulationDate(new Date('2025-04-20T12:00:00Z'));
      e.solSystemRenderer.animate(0);
      for (const family of ['planets', 'galaxies', 'nebulae']) {
        const planets = family === 'planets';
        if (family === 'galaxies') e.setViewMode('realistic');
        e.setObservationMode('enhancedOptical');
        const nodes = planets ? [...e.solSystemRenderer.planetsMap.values()]
          : [...e.deepSpaceRenderer.objectsMap.values()].filter(({ data }) =>
            data.type === (family === 'galaxies' ? 'galaxy' : 'nebula'));
        const sheet = document.createElement('canvas');
        sheet.width = width * 3;
        sheet.height = (height + labelHeight) * Math.ceil(nodes.length / 3);
        const labels = sheet.getContext('2d');
        labels.fillStyle = '#000';
        labels.fillRect(0, 0, sheet.width, sheet.height);
        labels.font = '15px sans-serif';
        labels.fillStyle = '#e7e7e7';
        for (const [index, node] of nodes.entries()) {
          const { mesh, data } = node;
          e.focusObject(planets ? 'planet' : 'deepSpace', data.id);
          window.snap();
          if (planets && PLANET_APPEARANCE[data.id].surfaceMap) {
            // An inspection-sized draw of the original mesh requests its local map.
            renderer.render(e.scene, camera);
            const started = performance.now();
            while (!mesh.material.uniforms.uMapReady.value) {
              if (performance.now() - started > 10000) throw new Error(`Timed out loading ${data.name}'s surface`);
              await new Promise(resolve => setTimeout(resolve, 20));
            }
          }
          // Clone the hierarchy with its original materials and world transform,
          // including child cloud and ring meshes. Geometry stays GPU-resident.
          const model = mesh.clone();
          mesh.matrixWorld.decompose(model.position, model.quaternion, model.scale);
          scene.add(model);
          const rgba = readFrame(camera);
          let visible = 0, brightest = 0;
          for (let i = 0; i < rgba.length; i += 4) {
            const value = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
            if (value > 12) visible++;
            brightest = Math.max(brightest, value);
          }
          window.check(visible > 100 && visible < width * height * 0.75 && brightest > 30,
            `${data.name} resolves against the sky at its inspection scale`);
          coverage[data.id] = { visible, brightest };
          const x = index % 3 * width;
          const y = Math.floor(index / 3) * (height + labelHeight);
          labels.drawImage(tile, x, y);
          labels.fillText(data.name, x + 12, y + height + 11, width - 24);

          if (data.id === 'earth') {
            // The same camera pose in planet radii gives the depth buffer far
            // more precision. Surface and clouds should resolve identically.
            const radius = mesh.userData.displayRadius;
            const reference = model.clone();
            reference.scale.multiplyScalar(1 / radius);
            reference.position.set(0, 0, 0);
            const referenceCamera = camera.clone();
            referenceCamera.position.sub(model.position).multiplyScalar(1 / radius);
            scene.remove(model);
            scene.add(reference);
            const resolved = readFrame(referenceCamera);
            scene.remove(reference);
            scene.add(model);
            let unstable = 0;
            for (let i = 0; i < rgba.length; i += 4) {
              const difference = Math.max(Math.abs(resolved[i] - rgba[i]),
                Math.abs(resolved[i + 1] - rgba[i + 1]), Math.abs(resolved[i + 2] - rgba[i + 2]));
              if (difference > 18) unstable++;
            }
            coverage[data.id].unstableFraction = unstable / visible;
            window.check(unstable < visible * 0.015,
              `Earth's cloud deck stays stable at Solar System scale (${unstable} differing pixels)`);
            const cloudDeck = model.children[mesh.children.indexOf(node.clouds)];
            cloudDeck.visible = false;
            const opacity = model.material.uniforms.uCloudOpacity;
            opacity.value = 0;
            const clear = readFrame(camera);
            opacity.value = 1;
            let cloudPixels = 0;
            for (let i = 0; i < rgba.length; i += 4) {
              if (Math.abs(clear[i] - rgba[i]) > 12) cloudPixels++;
            }
            window.check(cloudPixels > visible * 0.02, 'the Earth cloud layer visibly overlays its surface map');
          }
          if (node.rings) {
            checkRingOcclusion(model, model.children[mesh.children.indexOf(node.rings)], mesh.userData.displayRadius);
          }
          if (data.id === 'm57_ring_nebula') {
            const meanAnnulus = radius => {
              let value = 0;
              for (let sample = 0; sample < 36; sample++) {
                const angle = sample * Math.PI / 18;
                const point = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
                model.localToWorld(point).project(camera);
                const px = Math.floor((1 + point.x) * width / 2);
                const py = Math.floor((1 - point.y) * height / 2);
                const i = (py * width + px) * 4;
                value += rgba[i] + rgba[i + 1] + rgba[i + 2];
              }
              return value / 36;
            };
            const rim = Math.max(...[0.40, 0.50, 0.60, 0.70].map(meanAnnulus));
            window.check(rim > meanAnnulus(0.12) * 1.35,
              'the Ring Nebula retains a bright shell around a fainter cavity from Sol');
          }
          scene.remove(model);
        }
        sheets[family] = sheet.toDataURL('image/png').split(',')[1];
      }
    } finally {
      renderer.setSize(originalSize.x, originalSize.y, false);
      camera.aspect = originalAspect;
      camera.updateProjectionMatrix();
      e.setSimulationDate(originalDate);
      e.setPresetViewpoint('sol_center');
      window.snap();
    }
    return { sheets, coverage };
  });
  for (const [family, encoded] of Object.entries(sheets)) {
    await writeFile(`${output}/${family}.png`, Buffer.from(encoded, 'base64'));
  }
  return coverage;
}
