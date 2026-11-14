// Playwright headless WebGL2 visual rig & rifle-socket audit.
// Loads src/render3d/riggedModels.ts via the live Vite dev server (http://127.0.0.1:5173)
// and renders a 4-panel contact sheet of animated rigged characters & props for visual inspection.
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const SCRATCH_OUT = '/Users/men1692/.gemini/antigravity-cli/brain/cfd514a8-c51e-44ec-b9e3-f8bf4cf035a0/scratch/rigged_audit.png';
const URL = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5173/';

async function main(): Promise<void> {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().includes('favicon.ico')) {
        errs.push(`HTTP ${res.status()} ${res.url()}`);
      }
    });

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    const summary = await page.evaluate(async () => {
      const rmPath = '/src/render3d/riggedModels.ts';
      const rm = await import(/* @vite-ignore */ rmPath);
      const { THREE } = rm;
      const load = await rm.preloadAllModels3D();

      // Hide game overlays and render 4 crisp isolated turntables into a dedicated fullscreen canvas
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      document.body.style.background = '#090d12';
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 800;
      canvas.style.display = 'block';
      document.body.appendChild(canvas);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(1280, 800, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.45;
      renderer.setScissorTest(true);

      const makeScene = () => {
        const s = new THREE.Scene();
        s.background = new THREE.Color(0x0f161f);
        s.add(new THREE.HemisphereLight(0xaad4ff, 0x261d18, 1.35));
        const key = new THREE.DirectionalLight(0xffffff, 2.4);
        key.position.set(4, 7, 5);
        s.add(key);
        const rim = new THREE.DirectionalLight(0x2bf0ff, 1.4);
        rim.position.set(-5, 4, -4);
        s.add(rim);
        const grid = new THREE.GridHelper(6, 12, 0x2bf0ff, 0x1e2c3a);
        s.add(grid);
        return s;
      };

      const op = rm.instantiateRiggedModel3D('operative', 1.82, true);
      rm.stepRiggedAnimation3D(op, 'run', 0.28, 1, 0, true);
      op.root.rotation.y = 0.65;

      const warden = rm.instantiateRiggedModel3D('warden', 3.15, false);
      rm.stepRiggedAnimation3D(warden, 'attack', 0.85, 1, 0);
      warden.root.rotation.y = 0.45;

      const stalker = rm.instantiateRiggedModel3D('bio-stalker', 1.78, false);
      rm.stepRiggedAnimation3D(stalker, 'attack', 1.15, 1, 0);
      stalker.root.rotation.y = 0.6;

      const propsScene = makeScene();
      const barrel = rm.instantiateStaticModel3D('bio-barrel', 1.25);
      barrel.root.position.set(-0.7, 0, 0);
      propsScene.add(barrel.root);
      const rifle = rm.instantiateStaticModel3D('pulse-rifle', 1.5);
      rifle.root.position.set(0.65, 0.75, 0);
      rifle.root.rotation.y = -0.35;
      propsScene.add(rifle.root);

      const panels = [
        { scene: makeScene(), actor: op.root, camPos: [0, 1.35, 3.2], look: [0, 0.95, 0], vx: 0, vy: 400 },
        { scene: makeScene(), actor: warden.root, camPos: [0, 2.2, 5.2], look: [0, 1.5, 0], vx: 640, vy: 400 },
        { scene: makeScene(), actor: stalker.root, camPos: [0, 1.35, 3.2], look: [0, 0.9, 0], vx: 0, vy: 0 },
        { scene: propsScene, actor: null, camPos: [0, 1.15, 3.0], look: [0, 0.65, 0], vx: 640, vy: 0 },
      ];

      for (const p of panels) {
        if (p.actor) p.scene.add(p.actor);
        const cam = new THREE.PerspectiveCamera(40, 640 / 400, 0.1, 50);
        cam.position.set(p.camPos[0], p.camPos[1], p.camPos[2]);
        cam.lookAt(p.look[0], p.look[1], p.look[2]);
        renderer.setViewport(p.vx, p.vy, 640, 400);
        renderer.setScissor(p.vx, p.vy, 640, 400);
        renderer.render(p.scene, cam);
      }

      return {
        load,
        opClips: Object.keys(op.actions),
        hasRightHand: !!op.rightHand,
        wardenClips: Object.keys(warden.actions),
        stalkerClips: Object.keys(stalker.actions),
      };
    });

    await page.screenshot({ path: resolve(SCRATCH_OUT) });
    console.log('Rig audit summary:', JSON.stringify(summary, null, 2));
    console.log('Errors:', errs);
    if (errs.length > 0 || !summary.load.ok || !summary.hasRightHand) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
