/**
 * `/sheets/world-craft.html` — every craft a world names, as `createCraft`
 * builds it in the world (the kit's model where there is one, the code's where
 * not), on a disc of ground under the world's own light, beside a column a
 * person tall. `?world=<id>` keeps one world; `?yaw=<degrees>` turns the view,
 * `?spin=1` turns it slowly; `?near=<k>` frames the k-th craft alone. A
 * saucer is shown twice: parked on its legs, and beside it hovering low, as
 * `craft.update` leaves it after a short climb — its legs folded, its lamps
 * chasing and its beam down to the floor.
 *
 * Every seat that has a driver has one — the hero's own body, sat as the
 * world sits it (`Avatar.sit` with the craft's `pose`: the legs to the
 * pedals, the hands on the wheel, the sticks, the T-handle), so a closed
 * craft is seen with its driver behind the glass. `?eye=<k>` looks out of
 * the k-th craft from its driver's eye, as `V` does in the seat: the body
 * headless (`Avatar.setHeadless`), the near plane Earth's seat's
 * (`COCKPIT_NEAR`); `?pitch=<degrees>` tips the look down, `?yaw=` turns it.
 *
 * Dev-only, like every sheet.
 */
import * as THREE from 'three';
import { OutlineEffect } from '../outline.ts';
import { createSceneryContext } from '../scenery/contract.ts';
import { createToonRamp, PALETTE } from '../theme.ts';
import { WORLD_IDS, loadWorldSpec } from '../worlds/registry.ts';
import { prepareWorldKit } from '../worlds/kit.ts';
import { createCraft } from '../worlds/craft.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { buildAvatar, prepareAvatar } from '../avatar.ts';
import type { Avatar } from '../avatar.ts';
import { COCKPIT_NEAR } from '../craft/body.ts';

const params = new URLSearchParams(location.search);
const only = params.get('world');
const near = params.get('near');
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const outline = new OutlineEffect(renderer, { defaultThickness: 0.004, defaultColor: [0.11, 0.02, 0.01] });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1530);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5b4b47, 0.4));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(-30, 50, 40);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
sun.shadow.camera.right = sun.shadow.camera.top = 80;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
const ctx = createSceneryContext();
const gradientMap = createToonRamp(4);
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 2000);
const label = document.getElementById('label')!;

const ids = only === null ? WORLD_IDS : [only];
const eyeOf = params.get('eye');
await prepareAvatar();
/** Each craft's driver, and the craft, for `?eye=`. */
const drivers: { body: Avatar; craft: ReturnType<typeof createCraft>; holder: THREE.Object3D }[] = [];
const placed: THREE.Object3D[] = [];
let row = 0;
const names: string[] = [];
// `?kits=a:length,b:length` lays out kit models as landers, to try one.
const trying = (params.get('kits') ?? '').split(',').filter(Boolean).map((one) => {
  const [id, length] = one.split(':');
  return { kind: 'lander' as const, name: id!, kit: { id: id!, length: Number(length ?? 10), seat: [0, 0.4, 0] as [number, number, number] } };
});
for (const id of ids) {
  const spec = await loadWorldSpec(id);
  await prepareWorldKit(spec);
  let col = 0;
  for (const vehicle of trying.length > 0 ? trying : spec.vehicles) {
    const at = new THREE.Vector3(col * 18, 0, -row * 20);
    // A craft is built at a point on a sphere; a tiny planet's top stands in for the sheet's floor.
    const R = 100000;
    const craft = createCraft(vehicle, ctx, gradientMap, new THREE.Vector3(0, R, 0), new THREE.Vector3(0, 0, 1));
    craft.object.position.set(0, 0, 0);
    craft.object.quaternion.identity();
    const holder = new THREE.Group();
    holder.position.copy(at);
    holder.add(craft.object);
    craft.object.traverse((one) => {
      one.castShadow = true;
      one.receiveShadow = true;
    });
    scene.add(holder);
    // The driver, as the world seats one (`worlds/player.ts`): in a basket
    // standing, else sat as the craft's pose says.
    const body = buildAvatar();
    body.group.position.copy(craft.seat);
    craft.object.add(body.group);
    body.group.visible = !craft.closed;
    drivers.push({ body, craft, holder });
    placed.push(holder);
    names.push(`${spec.body.name}: ${craft.name}`);
    const person = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, AVATAR_HEIGHT, 12), ctx.toon(PALETTE.crimson));
    person.position.set(at.x + 6, AVATAR_HEIGHT / 2, at.z + 2);
    scene.add(person);
    col++;
    if (craft.kind === 'ufo') {
      // Up off flat ground for two thirds of a second, then held: a low hover.
      const aloft = createCraft(vehicle, ctx, gradientMap, new THREE.Vector3(0, R, 0), new THREE.Vector3(0, 0, 1));
      for (let k = 0; k < 90; k++) aloft.update(1 / 30, { throttle: 0, steer: 0, climb: k < 20, descend: false }, () => 0, 9.8, R);
      aloft.object.position.set(0, aloft.position.length() - R, 0);
      aloft.object.quaternion.identity();
      const hovering = new THREE.Group();
      hovering.position.set(col * 18 + 4, 0, -row * 20);
      hovering.add(aloft.object);
      aloft.object.traverse((one) => {
        one.castShadow = true;
        one.receiveShadow = true;
      });
      scene.add(hovering);
      placed.push(hovering);
      names.push(`${spec.body.name}: ${aloft.name}, hovering`);
      col += 2;
    }
  }
  row++;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), ctx.toon(PALETTE.steel));
floor.receiveShadow = true;
floor.userData.outlineParameters = { visible: false };
scene.add(floor);

// Pose every driver: a few steps, so the clips have settled before the hands are put on.
for (let k = 0; k < 4; k++) {
  for (const { body, craft } of drivers) {
    if (craft.standing) body.stride(1 / 30, 0, false);
    else body.sit(1 / 30, craft.pose ?? undefined, 0);
  }
}
const seated = eyeOf === null ? null : (drivers[Number(eyeOf)] ?? null);
if (seated !== null) seated.body.setHeadless(true);

const box = new THREE.Box3();
let target: THREE.Object3D[] = placed;
if (near !== null) {
  const k = Number(near);
  target = [placed[k]!];
  label.textContent = names[k] ?? '';
} else label.textContent = names.join(' · ');
for (const one of target) box.expandByObject(one);
const centre = box.getCenter(new THREE.Vector3());
const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
let yaw = (Number(params.get('yaw') ?? 35) * Math.PI) / 180;
const spin = params.get('spin') === '1';
const pitch = (Number(params.get('pitch') ?? 12) * Math.PI) / 180;
if (seated !== null) label.textContent = `${names[Number(eyeOf)] ?? ''}, from the driver's eye`;
function frame(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (seated !== null && seated.craft.eye !== null) {
    // From the seated eye, as `V` in the seat: ahead (+Z), turned by `?yaw=`
    // from straight ahead and tipped down by `?pitch=`.
    seated.holder.updateMatrixWorld(true);
    camera.near = COCKPIT_NEAR;
    camera.fov = 60;
    camera.position.copy(seated.craft.eye).applyMatrix4(seated.craft.object.matrixWorld);
    const ahead = new THREE.Vector3(Math.sin(yaw - (35 * Math.PI) / 180) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw - (35 * Math.PI) / 180) * Math.cos(pitch));
    camera.lookAt(camera.position.clone().add(ahead));
  } else {
    const d = (radius / Math.sin((camera.fov * Math.PI) / 360)) * Number(params.get('zoom') ?? 0.7);
    camera.position.set(centre.x + Math.sin(yaw) * d * 0.9, centre.y + d * 0.42, centre.z + Math.cos(yaw) * d * 0.9);
    camera.lookAt(centre);
  }
  camera.updateProjectionMatrix();
  outline.render(scene, camera);
  if (spin) yaw += 0.004;
  requestAnimationFrame(frame);
}
frame();
Object.assign(globalThis, { sheet: { setYaw: (deg: number) => (yaw = (deg * Math.PI) / 180), names } });
