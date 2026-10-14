import './leave.ts';
import { type WorldSpec } from '../../src/worlds/contract.ts';
import { resolve } from 'node:path';
import { ROOT, fail } from './setup.ts';
import { readFileSync } from 'node:fs';
import { AVATAR_HEIGHT } from '../../src/stature.ts';
import * as THREE from 'three';
import { PARKED_KITS } from '../../src/worlds/settlements.ts';
import { DEFAULT_KITS, createCraft } from '../../src/worlds/craft.ts';
import { provideWorldKit } from '../../src/worlds/kit.ts';
import { ctx, gradientMap } from './ground.ts';
import { FIGURE } from '../../src/avatar.ts';
import { isGlassMaterial } from '../../src/craft/cabin.ts';
import { glassFaults, uncovered, meshTriangles, probeOfMeshes, wheelFaults } from '../cabin-contract.ts';
import { cockpitOf } from '../../src/worlds/cockpit.ts';
import { SEAT_EYE, HERO, COCKPIT_NEAR } from '../../src/craft/body.ts';
import { ids } from './loop.ts';
import { loadWorldSpec } from '../../src/worlds/registry.ts';

// ===========================================================================
// 5. The craft's insides
// ===========================================================================

/**
 * Every craft a traveller takes on the worlds checked, with the space kit's
 * models read off disk, held to the contract Earth's closed craft are
 * (`cabin-contract.ts`, `check-craft.ts`): a closed one has a cabin and
 * see-through glass that writes no depth, carries no ink and casts no shadow,
 * its shell lined, every seated crown under its roof, and its driver seen;
 * every craft has a seated eye for `V` with nothing inside the near plane
 * (`COCKPIT_NEAR`); and whatever the driver holds is within reach of both
 * shoulders and drawn where the seat holds it. Run after the worlds' own
 * checks, which measure the code-built craft the kit replaces.
 */
async function checkInsides(specs: readonly WorldSpec[]): Promise<void> {
  console.log("\n=== the craft's insides ===");
  const g = globalThis as Record<string, unknown>;
  g.ProgressEvent ??= class extends Event {
    constructor(type: string, init: Record<string, unknown> = {}) {
      super(type);
      Object.assign(this, init);
    }
  };
  g.self ??= globalThis;
  const { spaceGroupFrom } = await import('../../src/space-kit.ts');
  const space = resolve(ROOT, 'public/models/space');
  const manifest = (JSON.parse(readFileSync(resolve(space, 'manifest.json'), 'utf8')) as { models: import('../../src/space-kit.ts').SpaceEntry[] }).models;
  const pieces = await spaceGroupFrom(readFileSync(resolve(space, 'craft.bin')), manifest.filter((entry) => entry.group === 'craft'));
  const H = AVATAR_HEIGHT;
  const f = (value: number): string => value.toFixed(2);
  const solidsOf = (root: THREE.Object3D, keep: (mesh: THREE.Mesh) => boolean): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    root.traverse((one) => {
      const mesh = one as THREE.Mesh;
      if (mesh.isMesh === true && (mesh as THREE.InstancedMesh).isInstancedMesh !== true && mesh.visible && keep(mesh)) out.push(mesh);
    });
    return out;
  };
  // Every kind of craft once, by what it is: a world's own, the engine's, and the towns' parked kits.
  const seen = new Set<string>();
  const vehicles: { label: string; vehicle: WorldSpec['vehicles'][number] }[] = [];
  const add = (label: string, vehicle: WorldSpec['vehicles'][number]): void => {
    const key = typeof vehicle === 'string' ? vehicle : `${vehicle.kind}:${vehicle.name}:${vehicle.kit?.id ?? ''}:${vehicle.kit?.length ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    vehicles.push({ label, vehicle });
  };
  for (const spec of specs) for (const vehicle of spec.vehicles) add(`${spec.id}: ${typeof vehicle === 'string' ? `the ${vehicle}` : vehicle.name}`, vehicle);
  for (const kit of PARKED_KITS) add(`a town's parked ${kit.id}`, { kind: 'rover', name: 'the rover', kit });
  add("a town's parked ship", { kind: 'lander', name: 'the ship', kit: DEFAULT_KITS.lander! });

  // First the code-built stand-ins a kit model replaces once it arrives, as
  // a traveller may sit in one before it does; then everything with the kit.
  const passes: { label: string; vehicle: WorldSpec['vehicles'][number]; kitted: boolean }[] = [];
  for (const { label, vehicle } of vehicles) {
    const kit = typeof vehicle === 'string' ? DEFAULT_KITS[vehicle] : vehicle.kit;
    if (kit !== undefined) passes.push({ label: `${label}, in code until the kit arrives`, vehicle, kitted: false });
  }
  for (const { label, vehicle } of vehicles) passes.push({ label, vehicle, kitted: true });
  let given = false;
  for (const { label, vehicle, kitted } of passes) {
    if (kitted && !given) {
      provideWorldKit({ pieces });
      given = true;
    }
    const craft = createCraft(vehicle, ctx, gradientMap, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    const root = craft.object;
    root.updateMatrixWorld(true);
    const said: string[] = [];
    const kit = typeof vehicle === 'string' ? DEFAULT_KITS[vehicle] : vehicle.kit;
    const closed = kitted && kit?.closed === true;
    const hip = craft.seat.clone().setY(craft.seat.y + FIGURE.hipY);
    if (craft.closed) fail(`${label}: its driver is hidden in the hull: no seated body fits it`);
    if (craft.eye === null) {
      fail(`${label}: no eye for V in its seat`);
      continue;
    }
    const eye = craft.eye;
    if (!craft.standing && craft.pose === null) fail(`${label}: its driver sits with no pose, the hands on nothing`);
    const glassMeshes = solidsOf(root, (mesh) => isGlassMaterial(mesh.material as THREE.Material));
    const opaque = solidsOf(root, (mesh) => !isGlassMaterial(mesh.material as THREE.Material) && (mesh.material as THREE.Material).visible !== false && !((mesh.material as THREE.Material).transparent && !(mesh.material as THREE.Material).depthWrite));
    if (closed) {
      const glass = root.getObjectByName('glass') as THREE.Mesh | undefined;
      const cabin = root.getObjectByName('cabin') as THREE.Mesh | undefined;
      const shell = root.getObjectByName('shell') as THREE.Mesh | undefined;
      if (glass === undefined) fail(`${label}: a closed craft with no glass you can see through`);
      else {
        for (const fault of glassFaults(glass)) fail(`${label}: ${fault}`);
        said.push(`glass ${glass.geometry.getAttribute('position').count / 3}`);
      }
      if (cabin === undefined) fail(`${label}: a closed craft with no cabin`);
      else said.push(`cabin ${cabin.geometry.getAttribute('position').count / 3}`);
      if (shell !== undefined && cabin !== undefined && glass !== undefined) {
        const inside = solidsOf(root, (mesh) => mesh !== shell && !isGlassMaterial(mesh.material as THREE.Material));
        const bare = uncovered(eye, meshTriangles([shell], root), probeOfMeshes(inside, root), probeOfMeshes([glass], root));
        // A ray along a pillar's edge, or past a cut-open hull's rim, can slip
        // between the lining's corners: 1.4% on the lander, 0 on the cabs.
        if (bare > 0.02) fail(`${label}: ${(bare * 100).toFixed(1)}% of the shell seen from the seat is unlined, its ink hull showing`);
        said.push(`${(bare * 100).toFixed(1)}% unlined`);
      }
      // Every seat's crown under the roof's lining, and a head's width round
      // it, where the skull has curved a fiftieth of a body down from its top.
      const piece = pieces.get(kit!.id)!;
      const size = piece.model.box.getSize(new THREE.Vector3());
      const cockpit = cockpitOf(piece.model, (kit!.legs ?? 0) > 0 ? 'canopy' : 'cab', kit!.length / size.z);
      const lift = kit!.legs ?? 0;
      const all = probeOfMeshes([...opaque, ...glassMeshes], root);
      let headRoom = Infinity;
      for (const seat of cockpit.seats) {
        for (let k = 0; k <= 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const r = k === 8 ? 0 : 0.05 * H;
          const x = seat.x + Math.cos(a) * r;
          const z = seat.z + SEAT_EYE.ahead * 0.5 + Math.sin(a) * r;
          const from = lift + seat.y + HERO.shoulder;
          const crown = lift + seat.y + HERO.crown - (k === 8 ? 0 : 0.02 * H);
          headRoom = Math.min(headRoom, from + all.cast(x, from, z, 0, 1, 0) - crown);
        }
      }
      if (!(headRoom >= 0)) fail(`${label}: a seated crown is ${f(-headRoom)} through the roof's lining`);
      said.push(`${cockpit.seats.length} seat${cockpit.seats.length === 1 ? '' : 's'}, ${f(headRoom)} over the crowns`);
      // The eye inside the cabin: a roof over it and a wall either side, past the near plane.
      const over = all.cast(eye.x, eye.y, eye.z, 0, 1, 0);
      const left = all.cast(eye.x, eye.y, eye.z, 1, 0, 0);
      const right = all.cast(eye.x, eye.y, eye.z, -1, 0, 0);
      if (!Number.isFinite(over) || !Number.isFinite(left) || !Number.isFinite(right)) fail(`${label}: the seated eye is not inside its cabin`);
      if (over < COCKPIT_NEAR * 1.5) fail(`${label}: the roof is ${f(over)} over the seated eye, inside the near plane's ${f(COCKPIT_NEAR)} and a half`);
    } else if (root.getObjectByName('glass') !== undefined) {
      // A code-built dome: the glass's contract, and the crown under it.
      for (const fault of glassFaults(root.getObjectByName('glass') as THREE.Mesh)) fail(`${label}: ${fault}`);
      const all = probeOfMeshes([...opaque, ...glassMeshes], root);
      const from = hip.y + HERO.shoulder;
      const room = from + all.cast(hip.x, from, hip.z, 0, 1, 0) - (hip.y + HERO.crown);
      if (!(room >= 0.02 * H)) fail(`${label}: the seated crown has ${f(room)} under its dome`);
      said.push(`${f(room)} over the crown`);
    }
    // Nothing drawn inside the near plane round the eye (the body is not part of the craft).
    const near = probeOfMeshes(opaque, root);
    let nearest = Infinity;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 400; i++) {
      const y = 1 - (2 * (i + 0.5)) / 400;
      const r = Math.sqrt(1 - y * y);
      nearest = Math.min(nearest, near.cast(eye.x, eye.y, eye.z, Math.cos(golden * i) * r, y, Math.sin(golden * i) * r));
    }
    if (nearest < COCKPIT_NEAR * 1.5) fail(`${label}: something of it is ${f(nearest)} from the seated eye, inside the near plane's ${f(COCKPIT_NEAR)} and a half`);
    said.push(`nearest ${f(nearest)} from the eye`);
    // What the hands hold.
    const wheel = craft.pose?.wheel;
    if (wheel !== undefined) {
      const grips = craft.kind === 'ufo' || wheel.rest !== undefined;
      const held = wheelFaults(wheel, craft.pose?.legs, !grips);
      for (const fault of held.faults) fail(`${label}: ${fault}`);
      const steer = root.getObjectByName('steer');
      if (steer !== undefined) {
        const at = steer.getWorldPosition(new THREE.Vector3());
        const want = new THREE.Vector3(hip.x + wheel.centre[0], hip.y + wheel.centre[1], hip.z + wheel.centre[2]);
        if (at.distanceTo(want) > 0.01 * H) fail(`${label}: the wheel is drawn ${f(at.distanceTo(want))} off where the seat holds it`);
      } else if (!grips) fail(`${label}: a wheel in the hands and none drawn`);
      said.push(`${grips ? 'grips' : 'wheel'} ${f(held.reach)} from a shoulder`);
    } else if (!craft.standing) said.push('hands idle');
    console.log(`  ${label}: ${said.join(', ')}`);
  }
}
await checkInsides(await Promise.all(ids.map((id) => loadWorldSpec(id))));
