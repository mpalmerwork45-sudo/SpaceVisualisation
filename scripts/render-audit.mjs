// Start Vite and Chrome with --remote-debugging-port=9222 first.
// Node 20: node --experimental-websocket scripts/render-audit.mjs /tmp/sky-before
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const output = process.argv[2] || '/tmp/space-render-audit';
await mkdir(output, { recursive: true });
const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
const socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown' ||
    (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') ||
    (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')) {
    errors.push(message);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${output}/${name}.png`, Buffer.from(result.data, 'base64'));
}
try {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(`performance.getEntriesByType('resource').some(e => e.name.includes('/src/engine/SpaceEngine.ts')) && !!document.querySelector('canvas')`)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate(`(async () => {
    const url = performance.getEntriesByType('resource').find(e => e.name.includes('/src/engine/SpaceEngine.ts')).name;
    const { SpaceEngine } = await import(url);
    await new Promise(resolve => {
      const original = SpaceEngine.prototype.updateCameraPosition;
      SpaceEngine.prototype.updateCameraPosition = function(...args) {
        window.auditEngine = this;
        SpaceEngine.prototype.updateCameraPosition = original;
        original.apply(this, args);
        resolve();
      };
    });
  })()`);
  await evaluate(`cancelAnimationFrame(auditEngine.animationFrameId)`);
  if (process.argv.includes('--baseline')) {
    // Run the previous full-resolution shader in the same browser/scene. This
    // changes only runtime state, never files or the Git checkout.
    const source = execFileSync('git', ['show', '0dc4605:src/engine/GalacticSkyModel.ts'], { encoding: 'utf8' });
    const chunks = [...source.matchAll(/\/\* glsl \*\/ `([\s\S]*?)`;/g)].map(match => match[1]);
    const fragment = chunks[1].replace('${GALACTIC_DUST_GLSL}', chunks[0]);
    await evaluate(`{
      const e = auditEngine, m = e.milkyWay.mesh.material;
      e.milkyWay.update = undefined;
      m.vertexShader = 'varying vec3 vDirection; void main() { vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
      m.fragmentShader = ${JSON.stringify(fragment)};
      m.needsUpdate = true;
    }`);
  }
  await screenshot('startup');
  const results = await evaluate(`(async () => {
    const e = auditEngine;
    window.auditDraw = () => {
      e.camera.updateMatrixWorld();
      e.milkyWay.mesh.position.copy(e.camera.position);
      e.starField.points.position.copy(e.camera.position);
      e.milkyWay.update?.(e.renderer, e.camera, e.viewMode);
      e.deepSpaceRenderer.animate(0, e.camera, e.viewMode);
      e.renderer.render(e.scene, e.camera);
      e.renderer.getContext().finish();
      const gl = e.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    };
    window.auditPose = (direction, fov = 55) => {
      e.camera.position.set(0, 0, 0);
      e.camera.up.set(0, 1, 0);
      e.camera.lookAt(...direction);
      e.camera.fov = fov;
      e.camera.updateProjectionMatrix();
      auditDraw();
    };
    e.setPlaneAlignment('galactic');
    e.gridRenderer.setGridVisible(false);
    e.gridRenderer.setRingsVisible(false);
    // Isolate the diffuse sky for repeatable radiance/structure comparisons.
    e.scene.children.forEach(child => child.visible = child === e.milkyWay.mesh);
    document.querySelectorAll('body > *').forEach(el => {
      if (!el.querySelector('canvas') && el.tagName !== 'SCRIPT') el.style.display = 'none';
    });
    document.querySelectorAll('body *').forEach(el => {
      if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
    });
    auditPose([1, 0, 0]);
    const bench = moving => {
      const times = [];
      for (let i = 0; i < 14; i++) {
        if (moving) e.camera.lookAt(1, 0, i * .0002);
        const start = performance.now();
        auditDraw();
        if (i >= 4) times.push(performance.now() - start);
      }
      return { medianMs: times.sort((a,b)=>a-b)[5], samplesMs: times };
    };
    const gl = e.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      resolution: [1280,800], stationary: bench(false), moving: bench(true) };
  })()`);
  for (const [name, direction] of [['centre',[1,0,0]], ['anticentre',[-1,0,0]], ['cygnus',[0,0,1]], ['pole',[0,1,.00001]]]) {
    await evaluate(`auditPose(${JSON.stringify(direction)})`);
    await screenshot(`${name}-eye`);
  }
  await evaluate(`auditEngine.setObservationMode('enhancedOptical'); auditPose([1,0,0])`);
  await screenshot('centre-enhanced');
  await evaluate(`(async()=>{await auditEngine.setMilkyWayMode('photo'); auditDraw()})()`);
  await screenshot('centre-photo');
  results.errors = errors;
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  socket.close();
}
