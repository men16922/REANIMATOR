// Actor build/dispose pairing. rebuildActorInstances() used to free only cloned materials, so every level rebuild
// leaked each actor's skeleton bone texture (DataTexture) and procedural geometry (hero gear, pick proxy, fallback
// shapes): +10 geometries and +5 textures per soak iteration. disposeActorTree/disposeActor3D must release all of
// them and leave glTF-shared geometry alone. Runs in node, no WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectGeometries, disposeActorTree } from '../src/render3d/disposeActor.ts';
import { disposeActor3D, instantiateRiggedModel3D, instantiateStaticModel3D } from '../src/render3d/riggedModels.ts';

/** Counts 'dispose' events per resource, the same signal WebGLRenderer uses to free GPU memory. */
function watchDispose(): { watch: (o: THREE.EventDispatcher<{ dispose: object }>) => void; count: () => number; watched: () => number } {
  const watched = new Set<unknown>();
  const disposed = new Set<unknown>();
  return {
    watch(o): void {
      watched.add(o);
      o.addEventListener('dispose', () => disposed.add(o));
    },
    count: () => disposed.size,
    watched: () => watched.size,
  };
}

/** A skinned two-bone mesh the way a glTF clone looks after SkeletonUtils.clone, with its bone texture allocated. */
function buildSkinned(sharedGeo: THREE.BufferGeometry): { root: THREE.Group; skeleton: THREE.Skeleton } {
  const root = new THREE.Group();
  const b0 = new THREE.Bone();
  const b1 = new THREE.Bone();
  b0.add(b1);
  const skeleton = new THREE.Skeleton([b0, b1]);
  const mesh = new THREE.SkinnedMesh(sharedGeo, new THREE.MeshStandardMaterial());
  mesh.add(b0);
  mesh.bind(skeleton);
  skeleton.computeBoneTexture();
  root.add(mesh);
  return { root, skeleton };
}

test('disposeActorTree frees skeleton bone texture, owned geometry and materials, and keeps shared geometry', () => {
  const shared = new THREE.BoxGeometry(1, 1, 1);
  const w = watchDispose();
  w.watch(shared);
  const N = 25;
  let ownedExpected = 0;
  for (let i = 0; i < N; i++) {
    const { root, skeleton } = buildSkinned(shared);
    assert.ok(skeleton.boneTexture, 'bone texture allocated');
    w.watch(skeleton.boneTexture as THREE.DataTexture);
    const skin = root.children[0] as THREE.SkinnedMesh;
    w.watch(skin.material as THREE.Material);
    // Procedural gear on the same actor: geometry and material owned by this clone.
    const gear = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 18), new THREE.MeshStandardMaterial());
    root.add(gear);
    w.watch(gear.geometry);
    w.watch(gear.material as THREE.Material);
    ownedExpected += 4;
    disposeActorTree(root, { isSharedGeometry: (g) => g === shared });
  }
  assert.equal(w.count(), ownedExpected, 'every created owned resource has a matching dispose');
  assert.equal(w.watched() - 1, ownedExpected);
  assert.equal(w.count(), w.watched() - 1, 'the shared geometry is the only one left alive');
});

test('disposeActorTree without skinned meshes and with array materials', () => {
  const w = watchDispose();
  const g = new THREE.PlaneGeometry();
  const m1 = new THREE.MeshBasicMaterial();
  const m2 = new THREE.MeshBasicMaterial();
  [g, m1, m2].forEach((o) => w.watch(o));
  const root = new THREE.Group();
  root.add(new THREE.Mesh(g, [m1, m2]));
  disposeActorTree(root);
  assert.equal(w.count(), 3);
});

test('collectGeometries gathers every mesh geometry of a loaded scene', () => {
  const a = new THREE.BoxGeometry();
  const b = new THREE.SphereGeometry();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(a, new THREE.MeshBasicMaterial()));
  const child = new THREE.Group();
  child.add(new THREE.Mesh(b, new THREE.MeshBasicMaterial()));
  root.add(child);
  const into = new Set<THREE.BufferGeometry>();
  collectGeometries(root, into);
  assert.deepEqual([...into].sort((x, y) => x.id - y.id), [a, b].sort((x, y) => x.id - y.id));
});

test('instantiate then disposeActor3D repeated (no glTF cache: fallback shapes) releases all geometry and materials', () => {
  const w = watchDispose();
  let created = 0;
  for (let i = 0; i < 30; i++) {
    const rig = instantiateRiggedModel3D('operative', 1.8, false);
    const st = instantiateStaticModel3D('crawler', 1, true);
    for (const root of [rig.root, st.root]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) {
          w.watch(m.geometry);
          created++;
        }
        if (m.material) {
          w.watch(m.material as THREE.Material);
          created++;
        }
      });
    }
    // Pick proxy added by the renderer for rigged enemies.
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
    w.watch(proxy.geometry);
    w.watch(proxy.material as THREE.Material);
    created += 2;
    rig.root.add(proxy);
    disposeActor3D(rig.root, rig.mixer, rig.modelRoot);
    disposeActor3D(st.root);
  }
  assert.ok(created > 0);
  assert.equal(w.count(), w.watched(), 'created === disposed after repeated build/dispose');
});

test('rebuildActorInstances releases actors through disposeActor3D (skeleton textures included)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/render3d/scene3dFull.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('private rebuildActorInstances'), src.indexOf('// Operative with attached Pulse Rifle'));
  for (const what of ['this.operativeRig.root', 'r.root', 'st.root', 'b.root']) assert.match(body, new RegExp(`disposeActor3D\\(${what.replace('.', '\\.')}`), what);
  assert.doesNotMatch(body, /freeMats/, 'material-only cleanup leaks bone textures and gear geometry');
});
