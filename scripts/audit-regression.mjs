import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Run against a Vite dev server: AUDIT_URL=http://127.0.0.1:5179 npm run test:browser
// CHROME_PATH can use an installed browser instead of Playwright's Chromium.
const output = process.env.AUDIT_OUTPUT || '/tmp/space-visualisation-regression';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text());
});
const results = {};
try {
  await page.goto(process.env.AUDIT_URL || 'http://127.0.0.1:5179', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas');
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/engine/SpaceEngine.ts'))?.name;
    if (!url) throw new Error('Browser regressions require a Vite dev server');
    const { SpaceEngine } = await import(url);
    await new Promise(resolve => {
      const original = SpaceEngine.prototype.updateCameraPosition;
      SpaceEngine.prototype.updateCameraPosition = function(...args) {
        window.engine = this;
        SpaceEngine.prototype.updateCameraPosition = original;
        original.apply(this, args); resolve();
      };
    });
    cancelAnimationFrame(engine.animationFrameId);
    window.THREE = await import('/node_modules/.vite/deps/three.js');
    window.coords = await import('/src/utils/coordinates.ts');
    window.catalogue = (await import('/src/data/stars.ts')).STARS_CATALOG;
    window.constellations = (await import('/src/data/constellations.ts')).CONSTELLATIONS;
    window.picking = await import('/src/engine/ObjectPicking.ts');
    window.checks = [];
    window.check = (condition, message) => {
      if (!condition) throw new Error(message);
      checks.push(message);
    };
    window.click = id => document.getElementById(id).click();
    window.search = text => {
      const input = document.getElementById('search-input');
      input.value = text; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.search-item')?.click();
    };
    window.snap = () => {
      const e = engine;
      e.cameraTarget.copy(e.targetCameraTarget); e.cameraRadius = e.targetCameraRadius;
      e.cameraTheta = e.targetCameraTheta; e.cameraPhi = e.targetCameraPhi;
      e.cameraRoll = e.targetCameraRoll; e.cameraFov = e.targetCameraFov;
      e.updateCameraPosition(); e.camera.updateMatrixWorld(true); e.scene.updateMatrixWorld(true);
      e.starRenderer.animate(e.camera); e.deepSpaceRenderer.animate(0,e.camera,e.viewMode);
      e.onRenderFrame?.();
    };
    window.draw = () => {
      snap();
      engine.milkyWay.mesh.position.copy(engine.camera.position);
      engine.starField.points.position.copy(engine.camera.position);
      engine.milkyWay.update(engine.renderer,engine.camera,engine.viewMode);
      engine.renderer.render(engine.scene,engine.camera);
    };
  });

  results.frame = await page.evaluate(() => {
    click('btn-view-sol'); snap();
    check(engine.cameraRadius > .0002 && engine.cameraRadius < .0004 && engine.viewMode === 'linear','1: Solar System reset starts at planetary zoom');
    const direction = engine.camera.getWorldDirection(new THREE.Vector3());
    const centre = new THREE.Vector3(1,0,0).applyQuaternion(coords.galacticFrameQuaternion('ecliptic'));
    check(direction.angleTo(centre) < 1e-6,'1: Solar System opening looks toward the Galactic centre');
    engine.focusPlanet('earth'); snap();
    const before = engine.solSystemRenderer.planetsMap.get('earth').mesh.getWorldPosition(new THREE.Vector3());
    const focus = engine.cameraTarget.clone();
    const radius = engine.cameraRadius, fov = engine.cameraFov;
    const rotation = coords.frameRotation('ecliptic','galactic');
    engine.setPlaneAlignment('galactic');
    const after = engine.solSystemRenderer.planetsMap.get('earth').mesh.getWorldPosition(new THREE.Vector3());
    const errorAU = after.distanceTo(before.applyQuaternion(rotation))*63241.077;
    check(errorAU < 1e-9,'1: planets transform with the selected frame');
    check(engine.cameraTarget.distanceTo(focus.applyQuaternion(rotation)) < 1e-12,'1: camera focus transforms with the selected frame');
    check(engine.cameraRadius === radius && engine.cameraFov === fov,'1: alignment preserves zoom');
    return { errorAU };
  });

  results.skyOrientation = await page.evaluate(() => {
    const e = engine;
    click('btn-top-g-pole');
    click('btn-mode-real');
    e.focusSkyDirection(new THREE.Vector3(1, 0, 0), 55);
    snap();
    const east = e.resolveSelection('star', 'nunki').position.project(e.camera);
    const west = e.resolveSelection('star', 'antares').position.project(e.camera);
    check(east.x < 0 && west.x > 0, 'Galactic north-up view places Nunki left of the bulge and Antares right');
    const shell = e.milkyWay.mesh;
    shell.position.copy(e.camera.position);
    shell.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    const imageU = x => {
      raycaster.setFromCamera(new THREE.Vector2(x, 0), e.camera);
      return raycaster.intersectObject(shell)[0].uv.x;
    };
    const left = imageU(-.3), right = imageU(.3);
    check(left < .5 && right > .5, 'ESO panorama samples the same north-up orientation as the catalogue');
    return { east: east.x, west: west.x, imageU: [left, right] };
  });

  results.modeFocus = await page.evaluate(() => {
    const e = engine;
    click('btn-view-sol');
    search('M31'); snap();
    const linearRadius = e.cameraRadius;
    click('btn-mode-log');
    const object = e.resolveSelection('deepSpace', 'andromeda_m31');
    check(e.cameraTarget.distanceTo(object.position) < 1e-10, 'switching maps keeps the camera on Andromeda');
    check(e.cameraRadius < linearRadius / 100, 'the new camera radius uses the logarithmic map scale');
    click('btn-mode-real');
    const skyDirection = e.resolveSelection('deepSpace', 'andromeda_m31').position.normalize();
    check(e.camera.getWorldDirection(new THREE.Vector3()).angleTo(skyDirection) < 1e-6, 'switching to the angular sky keeps Andromeda in view');
    e.renderer.domElement.dispatchEvent(new WheelEvent('wheel', {deltaY:-100, cancelable:true}));
    snap();
    check(e.camera.fov < 5.7 && e.camera.position.lengthSq() === 0, 'sky wheel zoom narrows the field of view from Sol');
    click('btn-mode-log');
    check(e.cameraTarget.distanceTo(object.position) < 1e-10, 'switching back from the sky restores the focused map object');

    click('btn-top-g-pole'); snap();
    const before = e.camera.getWorldDirection(new THREE.Vector3());
    const position = e.camera.position.clone();
    click('btn-turn-180'); e.updateCameraPosition();
    const turnAngle = before.angleTo(e.camera.getWorldDirection(new THREE.Vector3()));
    check(Math.abs(turnAngle - Math.PI) < 1e-7 && e.camera.position.equals(position), 'Turn 180 reverses even a polar sightline in place');
    click('btn-close-modal');
    return { turnDegrees: THREE.MathUtils.radToDeg(turnAngle) };
  });

  results.selectionAndFilters = await page.evaluate(() => {
    click('btn-view-sol');
    document.querySelector('[data-class="G"]').click();
    click('btn-mode-log'); click('btn-plane-align');
    check([...engine.starRenderer.starsMap.values()].every(node => node.data.spectral.startsWith('G')),'4: mode and frame rebuilds retain G filter');
    search('Sirius');
    check(engine.spectralFilter === 'ALL' && engine.starRenderer.starsMap.has('sirius_a'),'4: search reveals a filtered-out catalogue star and synchronizes the filter');
    check(!document.getElementById('detail-modal').classList.contains('hidden'),'4: searching a filtered star opens its information');
    document.querySelector('[data-class="BD"]').click();
    check(engine.starRenderer.starsMap.size === catalogue.filter(star => /^[LTY]/.test(star.spectral)).length,'4: brown-dwarf filter includes L, T and Y');
    document.querySelector('[data-class="ALL"]').click();
    click('btn-mode-real'); snap(); search('Sirius');
    click('btn-mode-log'); click('btn-plane-align'); click('btn-fly-focus');
    const miss = engine.targetCameraTarget.distanceTo(engine.resolveSelection('star','sirius_a').position);
    check(miss < 1e-10,'2: modal Center resolves the current coordinates after mode and frame changes');
    const input = document.getElementById('search-input');
    input.value = ''; input.dispatchEvent(new Event('input',{bubbles:true}));
    check(!document.querySelector('.search-item'),'4: empty search clears stale matches');
    return { missDistance: miss, brownDwarfs: catalogue.filter(star => /^[LTY]/.test(star.spectral)).length };
  });

  results.sky = await page.evaluate(() => {
    click('btn-mode-real'); snap();
    check(!engine.starRenderer.starsMap.has('sol'),'3: observer Sun is not placed on the angular sky');
    check(!engine.starRenderer.starsMap.get('wise_0855').mesh.visible,'3: magnitude-25 brown dwarf is invisible in eye sky');
    check(!engine.starRenderer.starsMap.get('proxima_centauri').mesh.visible,'3: faint star is invisible to the eye');
    click('btn-exposure');
    check(engine.starRenderer.starsMap.get('proxima_centauri').mesh.visible,'3: enhanced exposure can reveal a faint star');
    click('btn-exposure');
    search('WISE 0855');
    check(document.getElementById('modal-content').textContent.includes('Below the unaided-eye sky limit'),'3: invisible searched objects have an explicit visibility explanation');
    click('btn-close-modal');
    return { visibleEyeStars: [...engine.starRenderer.starsMap.values()].filter(node => node.mesh.visible).length };
  });

  results.picking = await page.evaluate(() => {
    const e = engine;
    const node = e.deepSpaceRenderer.objectsMap.get('andromeda_m31');
    const mesh = node.mesh.children[0]; e.scene.updateMatrixWorld(true);
    const corner = mesh.localToWorld(new THREE.Vector3(.49,.49,0));
    e.camera.position.set(0,0,0); e.camera.lookAt(corner); e.camera.updateMatrixWorld(true); e.mouse.set(0,0);
    let selected = null;
    const original = e.onSelectObject;
    e.onSelectObject = value => { selected = value; };
    e.checkClick();
    check(selected?.data.id !== 'andromeda_m31','5: transparent galaxy corners are not selectable');
    click('btn-view-sol'); snap();
    e.solSystemRenderer.group.visible = false; e.scene.updateMatrixWorld(true);
    const position = e.solSystemRenderer.planetsMap.get('jupiter').mesh.getWorldPosition(new THREE.Vector3()).project(e.camera);
    e.mouse.set(position.x,position.y); selected = null; e.checkClick();
    check(selected?.type !== 'planet','5: hidden planetary groups are not selectable');
    e.solSystemRenderer.group.visible = true;
    e.mouse.set(-.95,-.95); selected = null;
    const rect = e.renderer.domElement.getBoundingClientRect();
    e.renderer.domElement.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:rect.left+(position.x+1)/2*rect.width,clientY:rect.top+(1-position.y)/2*rect.height}));
    check(selected?.data.id === 'jupiter','5: clicks use their own position rather than the last hover');
    e.onSelectObject = original;
    const candidates = picking.selectableObjects([e.starRenderer.group,e.solSystemRenderer.group,e.deepSpaceRenderer.group,e.constellationRenderer.group]);
    check(!candidates.some(object => object === e.starField.points || object === e.milkyWay.mesh),'5: background geometry never enters the picking pass');
    click('btn-mode-real'); e.constellationRenderer.setVisible(true); snap();
    const orion = e.constellationRenderer.group.children.find(object => object.userData.constellationData.id === 'orion');
    const points = orion.geometry.getAttribute('position');
    const middle = new THREE.Vector3().fromBufferAttribute(points,0).add(new THREE.Vector3().fromBufferAttribute(points,1)).multiplyScalar(.5);
    e.camera.position.set(0,0,0); e.camera.lookAt(middle); e.camera.updateMatrixWorld(true); e.mouse.set(0,0);
    selected = null; e.onSelectObject = value => { selected = value; }; e.checkClick(); e.onSelectObject = original;
    check(selected?.type === 'constellation' && selected.data.id === 'orion','5: visible constellation lines are selectable');
    e.constellationRenderer.setVisible(false);
    return { selectableCount: candidates.length, backgroundPointsExcluded: e.starField.points.geometry.attributes.position.count };
  });

  results.stateAndKeyboard = await page.evaluate(() => {
    click('btn-mode-real'); snap();
    const earth = engine.resolveSelection('planet','earth');
    engine.onSelectObject(earth);
    click('btn-inspect-planet');
    check(engine.viewMode === 'linear' && document.getElementById('btn-mode-easy').classList.contains('active'),'8: modal planet inspection synchronizes the active view mode');
    check(document.getElementById('chk-rings').checked === engine.gridRenderer.ringsVisible,'8: modal planet inspection synchronizes distance rings');
    check(document.getElementById('btn-plane-align').textContent.includes('Ecliptic'),'8: modal planet inspection synchronizes coordinate frame');
    document.getElementById('orientation-options').open = true;
    const slider = document.getElementById('view-fov');
    slider.focus(); const yaw = engine.targetCameraTheta;
    const key = new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});
    slider.dispatchEvent(key);
    check(engine.targetCameraTheta === yaw && !key.defaultPrevented,'8: range keyboard events are not stolen by camera shortcuts');
    slider.blur();
    click('btn-close-modal'); click('btn-view-sol'); snap();
    return { mode: engine.viewMode };
  });

  await page.evaluate(() => {
    window.selectionCount = 0;
    window.originalSelection = engine.onSelectObject;
    engine.onSelectObject = () => { selectionCount++; };
    window.yawBeforeDrag = engine.targetCameraTheta;
  });
  await page.mouse.move(980,430); await page.mouse.down();
  await page.mouse.move(1010,450,{steps:3}); await page.mouse.up();
  await page.evaluate(() => {
    check(engine.targetCameraTheta !== yawBeforeDrag,'8: pointer drag rotates the view');
    check(selectionCount === 0,'8: releasing a drag does not inspect an incidental object');
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const touchPoints = [{x:980,y:430,id:1},{x:1080,y:430,id:2}];
  const beforePinch = await page.evaluate(() => engine.targetCameraRadius);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchPoints[0],{x:1180,y:430,id:2}]});
  await page.evaluate(before => {
    engine.updateCameraPosition();
    check(engine.pointers.size === 2 && engine.camera.position.length() < before * .9, 'pinch zoom updates the camera while both fingers are down');
  }, beforePinch);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  results.pointer = await page.evaluate(before => {
    check(engine.targetCameraRadius < before*.9,'8: two-finger pinch zooms the view');
    check(!engine.isDragging && engine.pointers.size === 0,'8: touch release clears drag and capture state');
    engine.onSelectObject = originalSelection;
    return {radiusBefore:before,radiusAfter:engine.targetCameraRadius};
  },beforePinch);
  await session.detach();

  results.catalogue = await page.evaluate(() => {
    const missing = constellations.flatMap(item => item.lines.flat().filter(id => !catalogue.some(star => star.id === id)));
    check(missing.length === 0,'9: every constellation endpoint exists in the catalogue');
    return { stars: catalogue.length, missingEndpoints: missing.length };
  });

  results.resources = await page.evaluate(() => {
    draw(); const previouslyAllocated = engine.renderer.info.memory.geometries;
    // Three allocates on first draw: warm the exact current frustum after
    // disposing planets cached by earlier inspection viewpoints.
    engine.solSystemRenderer.createSolSystem(); draw();
    const before = engine.renderer.info.memory.geometries;
    const samples = [];
    for (let i=0; i<5; i++) { engine.solSystemRenderer.createSolSystem(); draw(); samples.push(engine.renderer.info.memory.geometries); }
    const after = engine.renderer.info.memory.geometries;
    check(samples.every(count => count === before),`10: repeated Solar System rebuilds do not accumulate GPU geometries (${before} → ${samples})`);
    return { previouslyAllocated, before, after, rebuilds: 5 };
  });

  results.context = await page.evaluate(async () => {
    engine.setPresetViewpoint('realistic_sky');
    engine.setPlaneAlignment('galactic');
    engine.setObservationMode('enhancedOptical');
    engine.focusSkyDirection(new THREE.Vector3(1200,0,0),25); draw();
    const sample = () => {
      const gl = engine.renderer.getContext();
      const pixel = new Uint8Array(4); gl.readPixels(Math.floor(gl.drawingBufferWidth*.45),Math.floor(gl.drawingBufferHeight*.45),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      return [...pixel];
    };
    const before = sample();
    check(before[0]+before[1]+before[2] > 10,'7: procedural sky has radiance before context loss');
    const extension = engine.renderer.getContext().getExtension('WEBGL_lose_context');
    check(!!extension,'7: browser supports the deliberate context-loss regression');
    await new Promise(resolve => {
      engine.renderer.domElement.addEventListener('webglcontextlost',resolve,{once:true}); extension.loseContext();
    });
    await new Promise(resolve => setTimeout(resolve,100));
    await new Promise(resolve => {
      engine.renderer.domElement.addEventListener('webglcontextrestored',resolve,{once:true}); extension.restoreContext();
    });
    draw(); const after = sample();
    check(after[0]+after[1]+after[2] > 10,'7: unchanged view reintegrates its sky after context restoration');
    check(before.slice(0,3).every((value,index) => Math.abs(value-after[index]) <= 3),'7: restored sky matches the original pixels');
    return { before, after };
  });

  results.layout = [];
  for (const width of [1920,1280,768,390,320]) {
    await page.setViewportSize({width,height:width < 700 ? 844 : 800});
    const dimensions = await page.evaluate(() => {
      click('btn-view-sol'); snap();
      const navigation = document.getElementById('navigation-options');
      const orientation = document.getElementById('orientation-options');
      navigation.open = innerWidth >= 1600; orientation.open = innerWidth >= 1600;
      const selectors = ['.navbar','.search-container','.axis-hud-panel','.spectral-filter-bar','.planet-nav'];
      const boxes = selectors.map(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        check(rect.left >= 0 && rect.right <= innerWidth+.5,`6: ${selector} fits ${innerWidth}px viewport`);
        return {selector,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};
      });
      check(boxes[0].bottom <= boxes[1].top && boxes[0].bottom <= boxes[2].top,'6: navigation, search and orientation controls do not overlap');
      check(document.querySelector('.top-controls').getBoundingClientRect().bottom < innerHeight*.55,'6: collapsed controls leave the sky usable');
      navigation.open = true; orientation.open = true;
      const openHeight = document.querySelector('.top-controls').getBoundingClientRect().bottom;
      check(openHeight < innerHeight-140,'6: expanded mobile controls stay accessible above bottom navigation');
      check(navigation.querySelector('.nav-controls').scrollHeight >= navigation.querySelector('.nav-controls').clientHeight,'6: long control groups support scrolling');
      navigation.open = false; orientation.open = false;
      search('Earth');
      const modal = document.getElementById('detail-modal').getBoundingClientRect();
      check(modal.left >= 0 && modal.right <= innerWidth && modal.bottom <= innerHeight,'6: detail panel fits the viewport and scrolls vertically');
      click('btn-close-modal'); click('btn-view-sol'); snap();
      return {width:innerWidth,boxes,expandedHeight:openHeight};
    });
    results.layout.push(dimensions);
    if (width === 1280 || width === 390) { await page.evaluate(() => draw()); await page.screenshot({path:`${output}/solar-${width}.png`}); }
  }
  results.checks = await page.evaluate(() => checks);
  // Generic network console errors (fonts, favicon) do not represent JS/WebGL errors.
  const runtimeErrors = errors.filter(error => !error.includes('Failed to load resource'));
  assert.deepEqual(runtimeErrors,[],`Browser runtime errors: ${runtimeErrors.join('; ')}`);
  results.errors = runtimeErrors;
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  console.log(`Passed ${results.checks.length} browser assertions covering audit items 1–10.`);
  console.log(JSON.stringify({frame:results.frame,resources:results.resources,context:results.context,output},null,2));
} finally {
  await browser.close();
}
