import { readFile, writeFile } from 'node:fs/promises';

/** Real WebGL sky passes compared to independently observed, offline reference fields. */
export async function checkSurveySky(page, output) {
  const reference = async name => JSON.parse(await readFile(new URL(
    `./data/references/${name}.json`, import.meta.url), 'utf8'));
  const [planck, gaia] = await Promise.all([reference('planck-coalsack'), reference('gaia-apertures')]);
  const { image, ...results } = await page.evaluate(async ({ planck, gaia }) => {
    const e = window.engine;
    check(await e.localDust.load(), 'the bundled local extinction volume loads');
    check(e.localDust.uniforms.uCloudsReady.value, 'both high-resolution 3D cloud patches are available');
    const { MilkyWayBackground } = await import('/src/engine/MilkyWayBackground.ts');
    const { LY_PER_KPC } = await import('/src/engine/GalacticSkyModel.ts');
    const { LOCAL_DUST_GLSL } = await import('/src/engine/LocalDustVolume.ts');
    const { StarFieldBackground } = await import('/src/engine/StarFieldBackground.ts');
    const { renderer } = e;
    const width = 320, height = 216, label = 27;
    const originalSize = renderer.getSize(new THREE.Vector2());
    const originalExposure = renderer.toneMappingExposure;
    const sky = new MilkyWayBackground(e.localDust);
    const stars = new StarFieldBackground(1, e.localDust);
    const skyStars = new StarFieldBackground(undefined, e.localDust);
    sky.setPlaneAlignment('galactic');
    stars.setPlaneAlignment('galactic');
    skyStars.setPlaneAlignment('galactic');
    sky.setObservationMode('enhancedOptical');
    stars.setObservationMode('enhancedOptical');
    skyStars.setObservationMode('enhancedOptical');
    const camera = new THREE.PerspectiveCamera(12, width / height, 0.02, 1e8);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0);
    scene.add(sky.mesh);
    const sheet = document.createElement('canvas');
    sheet.width = width * 3;
    sheet.height = (height + label) * 2;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.fillStyle = '#ededed';
    ctx.font = '14px sans-serif';

    const direction = (l, b) => {
      const lon = THREE.MathUtils.degToRad(l), lat = THREE.MathUtils.degToRad(b);
      return new THREE.Vector3(Math.cos(lat)*Math.cos(lon), Math.sin(lat), -Math.cos(lat)*Math.sin(lon));
    };
    const origin = new THREE.Vector3();
    const line = direction(302, -2);
    function pose(position, dir, fov) {
      camera.position.copy(position).multiplyScalar(LY_PER_KPC);
      camera.up.set(0, 1, 0);
      if (Math.abs(dir.y) > 0.999) camera.up.set(1, 0, 0);
      camera.lookAt(camera.position.clone().add(dir));
      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      sky.mesh.position.copy(camera.position);
    }
    function panel(index, title, canvas) {
      const x = (index % 3) * width, y = Math.floor(index / 3) * (height + label);
      ctx.drawImage(canvas, x, y, width, height);
      ctx.fillText(title, x + 8, y + height + 18);
    }
    // Pixel readback is bottom-up. Keep the reference rays and display flip explicit.
    function radiance() {
      sky.update(renderer, camera, 'linear');
      const target = sky.radiance;
      const values = new Uint16Array(4 * target.width * target.height);
      renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, values);
      return { w: target.width, h: target.height, values };
    }
    const fromHalf = THREE.DataUtils.fromHalfFloat;
    const correlation = (a, b) => {
      const mean = v => v.reduce((sum, x) => sum + x, 0) / v.length;
      const ma = mean(a), mb = mean(b);
      let ab = 0, aa = 0, bb = 0;
      for (let i = 0; i < a.length; i++) {
        const x = a[i] - ma, y = b[i] - mb;
        ab += x*y; aa += x*x; bb += y*y;
      }
      return ab / Math.sqrt(aa*bb);
    };

    // Use the same angular lookup, tapered radial integral and data texture as the sky shader.
    const columnMaterial = new THREE.ShaderMaterial({
      uniforms: { ...e.localDust.uniforms, unproject: { value: new THREE.Matrix4() } },
      vertexShader: 'varying vec2 ndc; void main() { ndc=position.xy; gl_Position=vec4(ndc,0.,1.); }',
      fragmentShader: `varying vec2 ndc; uniform mat4 unproject;
        ${LOCAL_DUST_GLSL}
        void main() { vec3 ray=normalize((unproject*vec4(ndc,1.,1.)).xyz);
          gl_FragColor=vec4(solarDustColumn(dustUV(ray),dustFar),0.,0.,1.); }`
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), columnMaterial);
    quad.frustumCulled = false;
    const columns = new THREE.Scene();
    columns.add(quad);
    const target = new THREE.WebGLRenderTarget(Math.ceil(width/2), Math.ceil(height/2),
      { type: THREE.HalfFloatType, depthBuffer: false });
    try {
      renderer.setSize(width, height, false);
      renderer.toneMappingExposure = 1.25;
      pose(origin, line, 12);
      const sol = radiance();
      scene.add(skyStars.points);
      skyStars.update(camera, 'linear');
      renderer.render(scene, camera);
      panel(0, 'Coalsack from Sol', renderer.domElement);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      pose(right.multiplyScalar(0.035), line, 12);
      const offset = radiance();
      skyStars.update(camera, 'linear');
      renderer.render(scene, camera);
      panel(1, '35 pc sideways, same heading', renderer.domElement);
      pose(line.clone().multiplyScalar(0.35), line, 12);
      const beyond = radiance();
      skyStars.update(camera, 'linear');
      renderer.render(scene, camera);
      panel(2, '350 pc along the sightline, same heading', renderer.domElement);
      scene.remove(skyStars.points);
      // In the central two degrees the Coalsack obscures the Solar view.
      const centreGreen = frame => {
        let light = 0, count = 0;
        for (let y = 0; y < frame.h; y++) for (let x = 0; x < frame.w; x++) {
          if (Math.hypot(x + 0.5 - frame.w/2, y + 0.5 - frame.h/2) >= frame.h/12) continue;
          light += fromHalf(frame.values[4*(y*frame.w+x)+1]);
          count++;
        }
        return light/count;
      };
      const coalsackGreen = { sol: centreGreen(sol), sideways: centreGreen(offset), beyond: centreGreen(beyond) };
      check(coalsackGreen.beyond > coalsackGreen.sol * 1.2 && coalsackGreen.sideways > coalsackGreen.sol * 1.1,
        'translation to the side of the Coalsack or past it exposes background light at the original heading');

      pose(origin, line, 12);
      const unproject = columnMaterial.uniforms.unproject.value;
      unproject.copy(camera.matrixWorld).multiply(camera.projectionMatrixInverse);
      renderer.setRenderTarget(target);
      renderer.render(columns, camera);
      renderer.setRenderTarget(null);
      const w = target.width, h = target.height;
      const values = new Uint16Array(4 * w * h);
      renderer.readRenderTargetPixels(target, 0, 0, w, h, values);
      const planckLog = [], surveyLog = [], lightLog = [];
      const originRay = new THREE.Vector3();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          originRay.set(2*(x+0.5)/w-1, 2*(y+0.5)/h-1, 1).applyMatrix4(unproject).normalize();
          const l = (THREE.MathUtils.radToDeg(Math.atan2(-originRay.z, originRay.x)) + 360) % 360;
          const b = THREE.MathUtils.radToDeg(Math.asin(originRay.y));
          const px = Math.floor((l-planck.longitudeEdges[0])/(planck.longitudeEdges[1]-planck.longitudeEdges[0])*planck.width);
          const py = Math.floor((b-planck.latitudeEdges[0])/(planck.latitudeEdges[1]-planck.latitudeEdges[0])*planck.height);
          if (px < 0 || px >= planck.width || py < 0 || py >= planck.height) throw new Error('Reference footprint too small');
          planckLog.push(Math.log(planck.values[py*planck.width+px] * planck.scale));
          surveyLog.push(Math.log(Math.max(0.001, fromHalf(values[4*(y*w+x)]))));
          const j = 4*(Math.floor((y+0.5)*sol.h/h)*sol.w + Math.floor((x+0.5)*sol.w/w));
          lightLog.push(Math.log(Math.max(1e-8, fromHalf(sol.values[j+1]))));
        }
      }
      function columnPanel(index, title, data) {
        const ranks = data.toSorted((a,b) => a-b);
        const lo = ranks[Math.floor(0.01*ranks.length)], hi = ranks[Math.floor(0.99*ranks.length)];
        const tile = document.createElement('canvas'); tile.width=w; tile.height=h;
        const paint = tile.getContext('2d');
        const img = paint.createImageData(w,h);
        data.forEach((v,i) => {
          const intensity = 255 * THREE.MathUtils.clamp((v-lo)/(hi-lo),0,1);
          const j = 4*((h-1-Math.floor(i/w))*w + i%w);
          img.data.set([intensity,intensity,intensity,255], j);
        });
        paint.putImageData(img,0,0);
        panel(index,title,tile);
      }
      columnPanel(3, 'Planck 353 GHz optical depth · all distances', planckLog);
      columnPanel(4, 'Model V optical depth · local 1.25 kpc', surveyLog);
      const planckColumnR = correlation(planckLog, surveyLog);
      const planckLightR = correlation(planckLog, lightLog);
      // The sub-mm map includes the distant midplane, which is also rich in stars.
      // Full-sightline opacity and optical surface brightness need not anticorrelate.
      // CPU integration of the reprojected native survey for this framing gives r=0.1965.
      check(Math.abs(planckColumnR-0.1965) < 0.03, 'WebGL matches the registered local-survey and Planck column comparison');

      pose(new THREE.Vector3(26700/LY_PER_KPC,32,0), new THREE.Vector3(0,-1,0), 39);
      radiance(); renderer.render(scene, camera);
      panel(5, 'Milky Way from 32 kpc above the disc', renderer.domElement);

      // Equal intrinsic point colours isolate the actual foreground attenuation in the star vertex shader.
      scene.remove(sky.mesh);
      scene.add(stars.points);
      pose(origin, direction(303,-1), 12);
      stars.update(camera,'linear');
      const geo = stars.points.geometry;
      geo.getAttribute('color').setXYZ(0,0.8,0.8,0.8);
      geo.getAttribute('size').setX(0,3);
      const rgba = new Uint8Array(4*9*9);
      function starFlux(kpc) {
        const p = direction(303,-1).multiplyScalar(kpc * LY_PER_KPC);
        geo.getAttribute('position').setXYZ(0,p.x,p.y,p.z);
        geo.getAttribute('position').needsUpdate = true;
        renderer.render(scene,camera);
        const gl = renderer.getContext();
        gl.readPixels(Math.floor(gl.drawingBufferWidth/2)-4,Math.floor(gl.drawingBufferHeight/2)-4,
          9,9,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
        let flux = 0;
        for (let i=1;i<rgba.length;i+=4) flux += rgba[i];
        return flux;
      }
      const foreground = starFlux(0.12), behind = starFlux(0.35);
      check(foreground > 0 && behind < foreground * 0.9,
        'a star behind the measured Coalsack is dimmer than the same star at 120 pc');

      // Sample intrinsic HDR averaged over the same circular apertures as the catalogue.
      // The camera has a square field one degree across to inscribe each 0.5-degree cone.
      renderer.setSize(32,32,false);
      camera.aspect=1;
      const measured = [];
      for (const field of gaia.fields) {
        pose(origin,direction(field.l,field.b), 2*gaia.radiusDegrees);
        const { w, h, values } = radiance();
        const sum=[0,0,0]; let count=0;
        for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
          if (Math.hypot(2*(x+0.5)/w-1,2*(y+0.5)/h-1)>1) continue;
          for (let c=0;c<3;c++) sum[c] += fromHalf(values[4*(y*w+x)+c]);
          count++;
        }
        measured.push({ ...field, modelGreen: sum[1]/count, modelBlueRed: sum[2]/sum[0] });
      }
      const gaiaBrightnessR = correlation(measured.map(f=>Math.log(f.g)), measured.map(f=>Math.log(f.modelGreen)));
      const gaiaColourR = correlation(measured.map(f=>Math.log(f.bp/f.rp)), measured.map(f=>Math.log(f.modelBlueRed)));
      const pole = measured.find(f=>f.b===70), bulge = measured.find(f=>f.l===0);
      check(bulge.g>pole.g && bulge.modelGreen>pole.modelGreen, 'the model and Gaia both resolve the bulge field above the high-latitude field');
      const core = measured.find(f=>f.l===302), adjacent=measured.find(f=>f.l===305);
      check(core.g<adjacent.g && core.bp/core.rp<adjacent.bp/adjacent.rp &&
        core.modelGreen<adjacent.modelGreen && core.modelBlueRed<adjacent.modelBlueRed,
        'Gaia and the optical model both show a dimmer, redder Coalsack core than the adjacent field');
      return { planckColumnR, planckLightR, gaiaBrightnessR, gaiaColourR, fields: measured, coalsackGreen,
        coalsackStarGreen: { foreground, behind }, image: sheet.toDataURL('image/png').split(',')[1] };
    } finally {
      renderer.setRenderTarget(null);
      renderer.setSize(originalSize.x,originalSize.y,false);
      renderer.toneMappingExposure = originalExposure;
      target.dispose(); columnMaterial.dispose(); quad.geometry.dispose();
      sky.dispose(); stars.dispose(); skyStars.dispose();
    }
  }, { planck, gaia });
  await writeFile(`${output}/survey-sky.png`, Buffer.from(image,'base64'));
  return results;
}
