// R11 final fix pass: hunter steel on every material slot, plates fitted to the body in bone-local space,
// pause Escape resumes from the root menu, English UI chrome with localized story text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { HUNTER_ARMOUR_BONES, HUNTER_STEEL, applyHunterSteel, armourParts, hunterFit, plateLocalMatrix } from '../src/render3d/hunterView.ts';
import { pauseEscapeAction } from '../src/ui/menu.ts';
import { CHROME_LANG, LORE_UI, chromeLabel } from '../src/ui/lore.ts';

test('hunter steel reaches every material slot, including arrays, shared and non-standard materials', () => {
  const tex = new THREE.Texture();
  const shared = new THREE.MeshStandardMaterial({ color: 0xffccaa, map: tex, metalnessMap: tex, roughnessMap: tex, emissive: 0x442211 });
  const basic = new THREE.MeshBasicMaterial({ color: 0xffccaa });
  const root = new THREE.Group();
  const multi = new THREE.Mesh(new THREE.BoxGeometry(), [shared, basic, new THREE.MeshStandardMaterial({ map: tex })]);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const child = new THREE.Group();
  child.add(legs);
  root.add(multi, child);
  const mats = applyHunterSteel(root);
  const all: THREE.Material[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) all.push(...(Array.isArray(m) ? m : [m]));
  });
  assert.equal(all.length, 4);
  for (const m of all) {
    assert.ok(m instanceof THREE.MeshStandardMaterial, 'every slot is a standard material');
    const s = m as THREE.MeshStandardMaterial;
    assert.equal(s.color.getHex(), new THREE.Color(HUNTER_STEEL.color).getHex());
    assert.equal(s.map, null);
    assert.equal(s.metalnessMap, null, 'the flesh metal/rough texture no longer turns the steel matte');
    assert.equal(s.roughnessMap, null);
    assert.equal(s.emissive.getHex(), new THREE.Color(HUNTER_STEEL.emissive).getHex());
  }
  assert.equal(mats.length, 3, 'unique materials, the shared one counted once');
  assert.ok(mats.includes(shared));
});

test('plate local matrix divides out a scaled, rotated bone so the plate lands at its rig-root placement', () => {
  const root = new THREE.Group();
  root.position.set(64, 0, 0);
  root.rotation.y = -Math.PI / 2;
  const model = new THREE.Group();
  model.scale.setScalar(2.9 / 1.7);
  const bone = new THREE.Bone();
  bone.position.set(0.01, 1.3, -0.01);
  bone.rotation.set(0.3, -0.2, 0.5);
  model.add(bone);
  root.add(model);
  root.updateMatrixWorld(true);
  const want = new THREE.Matrix4().compose(new THREE.Vector3(0.1, 2.2, 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, 0)), new THREE.Vector3(1, 1, 1));
  const plate = new THREE.Object3D();
  plateLocalMatrix(bone.matrixWorld, root.matrixWorld, want).decompose(plate.position, plate.quaternion, plate.scale);
  bone.add(plate);
  root.updateMatrixWorld(true);
  const got = new THREE.Vector3().setFromMatrixPosition(plate.matrixWorld);
  const exp = new THREE.Vector3(0.1, 2.2, 0.25).applyMatrix4(root.matrixWorld);
  assert.ok(got.distanceTo(exp) < 1e-6, `plate at ${got.toArray()} want ${exp.toArray()}`);
  const ws = plate.getWorldScale(new THREE.Vector3());
  assert.ok(Math.abs(ws.x - 1) < 1e-6 && Math.abs(ws.y - 1) < 1e-6, 'model scale is compensated (plates keep metre sizes)');
});

// Bio-Stalker rest pose at 2.9 m, rig-root space, measured from public/assets/models/bio-stalker.glb
const STALKER = {
  spine1: new THREE.Vector3(0.006, 2.03, -0.006),
  spine2: new THREE.Vector3(0.006, 2.217, -0.02),
  neck: new THREE.Vector3(0.006, 2.345, -0.03),
  leftArm: new THREE.Vector3(0.295, 2.278, -0.085),
  rightArm: new THREE.Vector3(-0.285, 2.276, -0.085),
  leftForeArm: new THREE.Vector3(0.506, 1.949, -0.076),
  rightForeArm: new THREE.Vector3(-0.481, 1.965, -0.085),
  leftHand: new THREE.Vector3(0.754, 1.637, 0.084),
  rightHand: new THREE.Vector3(-0.723, 1.662, 0.071),
};

test('armour plates sit on the measured torso: below the head, within the chest depth, no oversized slabs', () => {
  const fit = hunterFit(STALKER, { front: 0.24, back: -0.27 });
  for (const key of HUNTER_ARMOUR_BONES) {
    const p = STALKER[key];
    const end = key === 'leftForeArm' ? STALKER.leftHand : key === 'rightForeArm' ? STALKER.rightHand : undefined;
    const parts = armourParts(fit, key, p, end);
    const box = new THREE.Box3();
    for (const g of [...parts.steel, ...parts.accent, ...parts.hazard]) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    assert.ok(box.max.y < 2.62, `${key} top ${box.max.y.toFixed(2)} stays under the head top`);
    assert.ok(box.max.z < fit.front + 0.16 && box.min.z > fit.back - 0.2, `${key} z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)} hugs the body`);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(size.x < 0.75 && size.y < 0.85, `${key} size ${size.toArray().map((v) => v.toFixed(2))}`);
    for (const g of [...parts.steel, ...parts.accent, ...parts.hazard]) g.dispose();
  }
});

test('in the real GLB every skinned slot is steel and every plate stays inside the posed body envelope', async () => {
  // Minimal browser shims so GLTFLoader reads the model from public/ (textures fail and are dropped, which is fine here)
  const g = globalThis as Record<string, unknown>;
  g.self ??= globalThis;
  g.ProgressEvent ??= class { constructor(_t: string, o: object) { Object.assign(this, o); } };
  const realRequest = g.Request;
  const realFetch = g.fetch;
  const warn = console.warn;
  g.Request = class { url: string; constructor(u: unknown) { this.url = String(u); } };
  g.fetch = async (u: unknown) => new Response(readFileSync('public' + (typeof u === 'string' ? u : (u as { url: string }).url)));
  console.warn = () => {};
  try {
    const { preloadAllModels3D } = await import('../src/render3d/riggedModels.ts');
    const { HunterView } = await import('../src/render3d/hunterView.ts');
    const { newWorld3D } = await import('../src/game3d/world3d.ts');
    const r = await preloadAllModels3D();
    assert.ok(r.loaded.includes('bio-stalker'));
    const scene = new THREE.Scene();
    const w = newWorld3D();
    const view = new HunterView(scene, w.level.hunterZone, w.hunter);
    assert.ok(view.fit, 'the rig was measured');
    for (let i = 0; i < 6; i++) view.update(w.hunter, i + 1, 0.5, 1 / 60, 0.1 * i, { x: w.hunter.x - 3, y: 0 }, false);
    scene.updateMatrixWorld(true);
    let skinned: THREE.SkinnedMesh | undefined;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
    });
    assert.ok(skinned);
    const slots = Array.isArray(skinned.material) ? skinned.material : [skinned.material];
    for (const m of slots) {
      const s = m as THREE.MeshStandardMaterial;
      assert.equal(s.map, null);
      assert.equal(s.metalnessMap, null);
      assert.equal(s.color.getHex(), new THREE.Color(HUNTER_STEEL.color).getHex());
    }
    const body = new THREE.Box3();
    const v = new THREE.Vector3();
    const pos = skinned.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) body.expandByPoint(skinned.getVertexPosition(i, v).applyMatrix4(skinned.matrixWorld));
    const env = body.clone().expandByScalar(0.15);
    let plates = 0;
    scene.traverse((o) => {
      if (!o.name.startsWith('hunter-armour') && o.name !== 'hunter-visor') return;
      plates++;
      const mesh = o as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      assert.ok(env.containsBox(b), `${o.name} ${b.min.toArray().map((x) => x.toFixed(2))}..${b.max.toArray().map((x) => x.toFixed(2))} inside body ${body.min.toArray().map((x) => x.toFixed(2))}..${body.max.toArray().map((x) => x.toFixed(2))}`);
    });
    assert.equal(plates, HUNTER_ARMOUR_BONES.length + 1, 'five plate meshes and the visor');
    view.dispose();
  } finally {
    g.Request = realRequest;
    g.fetch = realFetch;
    console.warn = warn;
  }
});

test('pause Escape: sub-panels step back one level, the root pause menu resumes', () => {
  assert.equal(pauseEscapeAction(false, false), 'resume');
  assert.equal(pauseEscapeAction(true, false), 'back');
  assert.equal(pauseEscapeAction(false, true), 'back');
  const src = readFileSync('src/ui/main.ts', 'utf8');
  const pauseAt = src.indexOf("if (mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')");
  const introAt = src.indexOf('  if (introActive) {\n    hideIntro();');
  assert.ok(pauseAt > 0 && pauseAt < introAt, 'pause Escape is handled before the opening skip can swallow it');
});

test('UI chrome stays English in Korean; only story text is localized', () => {
  assert.equal(CHROME_LANG, 'en');
  for (const k of Object.keys(LORE_UI) as (keyof typeof LORE_UI)[]) {
    if (k === 'langButton') continue;
    assert.equal(chromeLabel(k, 'ko'), LORE_UI[k].en, k);
    assert.doesNotMatch(chromeLabel(k, 'ko'), /[\uac00-\ud7a3]/, `${k} has no Hangul`);
  }
  assert.equal(chromeLabel('logsButton', 'ko'), 'Logs', 'the pause archive button matches Resume / Restart / Controls');
  assert.equal(chromeLabel('langButton', 'en'), '한국어', 'the toggle names the language it switches to');
  const src = readFileSync('src/ui/main.ts', 'utf8');
  assert.doesNotMatch(src, /LORE_UI\.\w+\[/, 'main.ts reads chrome labels only through chromeLabel');
});

test('debug advance and showcase exit a held opening and the loading screen', () => {
  const src = readFileSync('src/ui/main.ts', 'utf8');
  const adv = src.slice(src.indexOf('wAny.__reanimatorAdvance = '), src.indexOf('/** Continue the current world'));
  assert.match(adv, /exitShowcase\(\);/);
  assert.match(adv, /if \(setup\?\.skipIntro \|\| openingFrozen \|\| introActive\) hideIntro\(\);/);
  const sc = src.slice(src.indexOf('wAny.__reanimatorShowcase = '), src.indexOf('/** Enter a DEMO TOUR'));
  assert.ok(sc.indexOf('dismissLoading();') > 0 && sc.indexOf('dismissLoading();') < sc.indexOf('hideIntro();'), 'showcase drops the loading screen before building its scene');
});
