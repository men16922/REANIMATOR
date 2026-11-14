// Renders a 6x4 multi-angle visual orientation & grounding sheet of all optimized public/assets/models/*.glb
// in headless Chrome WebGL2 and saves it for visual verification before locking yawRight / yawFront constants.
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '../..');
const OUT = '/Users/men1692/.gemini/antigravity-cli/brain/cfd514a8-c51e-44ec-b9e3-f8bf4cf035a0/scratch/model_orientations.png';
const MODELS = ['operative', 'warden', 'crawler', 'spitter', 'power-core', 'exit-gate'];
const YAWS = [
  { label: '0', rad: 0 },
  { label: '+PI/2', rad: Math.PI / 2 },
  { label: 'PI', rad: Math.PI },
  { label: '-PI/2', rad: -Math.PI / 2 },
];

const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; background: #0d1117; color: #e6edf3; font: 12px/1.3 ui-monospace, monospace; }
  #grid { display: grid; grid-template-columns: repeat(4, 300px); gap: 4px; padding: 8px; }
  .cell { position: relative; width: 300px; height: 210px; background: #141b24; border: 1px solid #2b3849; overflow: hidden; }
  .cell canvas { width: 300px; height: 210px; display: block; }
  .lbl { position: absolute; top: 4px; left: 6px; padding: 2px 6px; background: rgba(0,0,0,0.72); border-radius: 3px; color: #7ee787; pointer-events: none; }
</style>
<script type="importmap">
{
  "imports": {
    "three": "/three/build/three.module.js",
    "three/addons/": "/three/examples/jsm/"
  }
}
</script>
</head>
<body>
<div id="grid"></div>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODELS = ${JSON.stringify(MODELS)};
const YAWS = ${JSON.stringify(YAWS)};
const grid = document.getElementById('grid');
const loader = new GLTFLoader();

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(300, 210);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x161d26);
scene.add(new THREE.HemisphereLight(0xdce8ff, 0x263242, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(1.5, 2.2, 2.8);
scene.add(key);
const rim = new THREE.DirectionalLight(0x88ccff, 1.0);
rim.position.set(-2.0, 1.4, -2.0);
scene.add(rim);

const floor = new THREE.GridHelper(2.0, 10, 0x557799, 0x2b3b4e);
scene.add(floor);

// Axis triad (X=Red Right, Y=Green Up, Z=Blue Camera)
const axes = new THREE.AxesHelper(0.35);
axes.position.set(-0.75, 0.02, 0);
scene.add(axes);

const cam = new THREE.PerspectiveCamera(42, 300 / 210, 0.05, 50);
cam.position.set(0, 0.56, 1.95);
cam.lookAt(0, 0.48, 0);

const report = {};
for (const id of MODELS) {
  const gltf = await loader.loadAsync('/models/' + id + '.glb');
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  report[id] = { minY: +box.min.y.toFixed(4), maxY: +box.max.y.toFixed(4), size: [size.x, size.y, size.z].map(n => +n.toFixed(3)) };

  scene.add(root);
  for (const y of YAWS) {
    root.rotation.set(0, y.rad, 0);
    renderer.render(scene, cam);

    const cell = document.createElement('div');
    cell.className = 'cell';
    const img = document.createElement('img');
    img.src = renderer.domElement.toDataURL('image/png');
    img.style.width = '300px';
    img.style.height = '210px';
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = id + ' · yaw=' + y.label + ' · H=' + size.y.toFixed(2);
    cell.append(img, lbl);
    grid.append(cell);
  }
  scene.remove(root);
}
window.__previewReport = report;
window.__previewReady = true;
</script>
</body>
</html>`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1240, height: 1320 } });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.route('http://preview.test/**', async (route) => {
  const p = new URL(route.request().url()).pathname;
  if (p === '/') {
    return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
  }
  if (p.startsWith('/three/')) {
    const file = resolve(REPO, 'node_modules/three', p.slice('/three/'.length));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file, contentType: 'text/javascript' });
  }
  if (p.startsWith('/models/')) {
    const file = resolve(REPO, 'public/assets/models', p.slice('/models/'.length));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file, contentType: 'model/gltf-binary' });
  }
  return route.fulfill({ status: 404, body: '' });
});

try {
  await page.goto('http://preview.test/');
  await page.waitForFunction(() => (window as unknown as { __previewReady?: boolean }).__previewReady === true, null, { timeout: 20000 });
  const report = await page.evaluate(() => (window as unknown as { __previewReport: unknown }).__previewReport);
  await page.screenshot({ path: OUT, fullPage: true });
  console.log(JSON.stringify({ status: 'OK', errors: errs, report }, null, 2));
} finally {
  await browser.close();
}
