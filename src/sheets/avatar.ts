import * as THREE from 'three';
import { AVATAR_HEIGHT, FALL_AFTER, FIGURE, RUN_SPEED, SWIM_STROKE, WALK_SPEED, buildAvatar, prepareAvatar } from '../avatar.ts';
import type { Avatar } from '../avatar.ts';
import { measure } from '../monuments/contract.ts';
import { OutlineEffect } from '../outline.ts';
import { PALETTE, SKY_TOP } from '../theme.ts';
import { BOAT_DECK, PLANE_SEAT, buildBoat, buildPlane } from '../vehicles.ts';

/**
 * The avatar's review sheet, and the reason it exists is one sentence: *a
 * character you have only seen in one still frame is not finished*.
 *
 * A cell for everything the body does, all animating, all at the game's own
 * framing, because every decision in `avatar.ts` was taken against a size and
 * an angle: 30 units back, 15 up, 55 degree lens, which puts the figure at
 * about 175 px and the smallest legible feature at 0.14 units. A turntable at arm's length would have said
 * yes to detail that is ink at the distance this is played from.
 *
 * It also exists because the world's dev server reloads whenever anybody
 * touches anything, and a walk cycle cannot be judged through a reload.
 */

type Mode = 'foot' | 'boat' | 'plane' | 'swim';

/**
 * A cell that loops through something the game does once: off the ground for
 * `air` seconds of every `period`, landing with `hardness`; or the speed
 * swung between a walk and a run; or the body turned to and fro on the spot.
 */
interface Loop {
  air?: number;
  period: number;
  hardness?: number;
  swing?: 'speed' | 'turn';
}

interface CellSpec {
  label: string;
  note: string;
  /** Degrees around the figure. 0 is dead astern, where the game camera lives. */
  azimuth: number;
  speed: number;
  airborne?: boolean;
  mode?: Mode;
  loop?: Loop;
  /** Degrees above the horizon. The game is 26.6 on foot and swings overhead in the air. */
  elevation?: number;
}

const CELLS: CellSpec[] = [
  { label: 'idle · astern', note: 'where the camera lives', azimuth: 0, speed: 0 },
  { label: 'idle · three-quarter', note: 'the pack, the straps, the nape', azimuth: 40, speed: 0 },
  { label: 'idle · front', note: 'fringe, eyes, ribbed cuffs', azimuth: 180, speed: 0 },
  { label: 'walk · astern', note: 'bob, sway, the sole lifting', azimuth: 0, speed: WALK_SPEED },
  { label: 'walk · three-quarter', note: '', azimuth: 40, speed: WALK_SPEED },
  { label: 'walk · side', note: 'the knee is what lifts the foot', azimuth: 90, speed: WALK_SPEED },
  { label: 'run · astern', note: '', azimuth: 0, speed: RUN_SPEED },
  { label: 'run · three-quarter', note: '', azimuth: 40, speed: RUN_SPEED },
  { label: 'run · side', note: 'bent elbows, longer stride', azimuth: 90, speed: RUN_SPEED },
  { label: 'jump · side', note: 'the library loop, and the knees at landing', azimuth: 70, speed: WALK_SPEED, loop: { air: 0.68, period: 1.6, hardness: 0 } },
  { label: 'fall · side', note: `arms up past ${FALL_AFTER} s, a hard landing`, azimuth: 80, speed: 0, loop: { air: 2.2, period: 4.2, hardness: 1 } },
  { label: 'walk ↔ run · side', note: 'the blend: no foot changes step', azimuth: 90, speed: 0, loop: { period: 5, swing: 'speed' } },
  { label: 'turn on the spot', note: 'a shuffle, not a turntable', azimuth: 30, speed: 0, loop: { period: 3, swing: 'turn' } },
  { label: 'swim · three-quarter', note: 'the crawl, stroke by distance', azimuth: 40, speed: SWIM_STROKE * 0.7, mode: 'swim' },
  { label: 'tread water · front', note: 'head and shoulders out', azimuth: 160, speed: 0, mode: 'swim' },
  // **There is no cell that shows the grip, and that was tried rather than
  // assumed.** The wheel is enclosed: the helmsman covers it from astern and
  // from either beam — `vehicles.ts` raycast it at 0 px from the boat camera —
  // and the windscreen leans back *over* it, its top edge at z 1.62 against a
  // hub at 1.15, so from ahead and above it is behind the glass. 65, 105 and 180
  // degrees were each built and each showed nothing. What is reviewable from
  // astern is the arms: elbows clear of the torso and forearms running forward
  // and in, against the old pose's hands splayed down onto a ledge.
  { label: 'boat · astern', note: 'elbows out, forearms on the wheel', azimuth: 15, speed: 0, mode: 'boat' },
  { label: 'plane · above', note: 'seated, head out of the cockpit', azimuth: 20, speed: 380, mode: 'plane', elevation: 40 },
];

// ---------------------------------------------------------------------------
// Scene per cell
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

interface Cell {
  spec: CellSpec;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  avatar: Avatar;
  craft: THREE.Group;
  propeller: THREE.Object3D | null;
  frame: HTMLElement;
  swell: number;
  /** Seconds this cell has run, for its loop. */
  clock: number;
  wasAirborne: boolean;
}

function buildCell(spec: CellSpec): Cell {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_TOP);

  // The same light as `main.ts`, minus the sun's travel. Deliberately little
  // ambient: flatten it and the cel ramp has no range to step across.
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-0.8, 1.25, 0.75);
  scene.add(sun, sun.target);

  const mode = spec.mode ?? 'foot';
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(60, 60, 1.6, 48),
    new THREE.MeshToonMaterial({ color: mode === 'foot' ? PALETTE.green : 0x2b7fa8 }),
  );
  // A swimmer's origin is the surface, and the water is drawn opaque as the sea is.
  ground.position.y = -0.8 - (mode === 'foot' || mode === 'swim' ? 0 : BOAT_DECK);
  scene.add(ground);

  const avatar = buildAvatar();
  const craft = new THREE.Group();
  // A seat between the craft and the body, for the same reason `player.ts` has
  // one: `sit` leaves the hip at the origin and the *vehicle* places it. This
  // sheet used to parent the avatar straight to the plane and drew the pilot
  // `PLANE_SEAT.y` too high for as long as there has been a plane — plausible
  // enough either way that two rounds of review looked straight past it, which
  // is what a review tool that does not use the real plumbing is worth.
  const seat = new THREE.Group();
  seat.add(avatar.group);
  craft.add(seat);
  scene.add(craft);

  let propeller: THREE.Object3D | null = null;
  if (mode === 'boat') craft.add(buildBoat());
  if (mode === 'plane') {
    const plane = buildPlane();
    craft.add(plane.group);
    propeller = plane.propeller;
    seat.position.set(0, PLANE_SEAT.y - FIGURE.hipY, PLANE_SEAT.z);
    craft.position.y = 26;
    ground.position.y = -40;
  }

  const camera = new THREE.PerspectiveCamera(55, 0.8, 1, 400);

  const frame = document.createElement('div');
  frame.className = 'cell';
  const box = document.createElement('div');
  box.className = 'frame';
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.innerHTML = `<b></b><span></span>`;
  bar.querySelector('b')!.textContent = spec.label;
  bar.querySelector('span')!.textContent = spec.note;
  frame.append(box, bar);
  document.getElementById('grid')!.append(frame);

  return { spec, scene, camera, avatar, craft, propeller, frame: box, swell: 0, clock: 0, wasAirborne: false };
}

await prepareAvatar();
const cells = CELLS.map(buildCell);

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// Screen-space, so the pen on this page is the pen in the world.
const outline = new OutlineEffect(renderer, {
  defaultThickness: 0.005,
  defaultColor: [0.11, 0.02, 0.01],
});

const closeInput = document.getElementById('close') as HTMLInputElement;
const freezeInput = document.getElementById('freeze') as HTMLInputElement;
const turnInput = document.getElementById('turn') as HTMLInputElement;

/** The game's own third-person framing, from `camera.ts`. */
const WALK_FRAMING = { distance: 30, height: 15 };
const PIVOT_HEIGHT = 5;
/**
 * How near "close up" goes. `?close=0.2` pulls it in further, for looking at a
 * face; the game never frames the body that tight, so it is a query and not a
 * checkbox.
 */
const CLOSE = Number(new URLSearchParams(location.search).get('close') ?? 0.45);
if (new URLSearchParams(location.search).has('close')) closeInput.checked = true;

let spin = 0;
let last = performance.now();

function render(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const running = !freezeInput.checked;
  if (running && turnInput.checked) spin += dt * 0.5;

  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(SKY_TOP, 1);
  renderer.clear();
  renderer.setScissorTest(true);

  for (const cell of cells) {
    const rect = cell.frame.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.width < 4) continue;

    const mode = cell.spec.mode ?? 'foot';
    if (running) {
      if (mode === 'plane') {
        cell.avatar.sit(dt);
        cell.craft.rotation.set(-0.06, 0, Math.sin(now / 2600) * 0.45);
        if (cell.propeller) cell.propeller.rotation.z += dt * 20;
      } else if (mode === 'boat') {
        cell.swell += dt;
        const heel = Math.sin(cell.swell * 0.9) * 0.05 + Math.sin(cell.swell * 0.37) * 0.09;
        cell.avatar.steer(dt, heel);
        cell.craft.position.y = Math.sin(cell.swell * 1.3) * 0.32;
        cell.craft.rotation.set(Math.sin(cell.swell * 0.7) * 0.035, 0, heel);
      } else if (mode === 'swim') {
        cell.avatar.swim(dt, cell.spec.speed, 0);
      } else {
        cell.clock += dt;
        const loop = cell.spec.loop;
        const u = loop === undefined ? 0 : cell.clock % loop.period;
        let speed = cell.spec.speed;
        let airborne = cell.spec.airborne === true;
        let turn = 0;
        if (loop?.air !== undefined) {
          airborne = u < loop.air;
          // Up and down on the jump's own arc, so a fall reads as one.
          const k = u / loop.air;
          cell.avatar.group.position.y = airborne ? Math.max(0, 4 * k * (1 - k)) * (loop.air > 1 ? 12 : 2.3) : 0;
          if (cell.wasAirborne && !airborne) cell.avatar.land(loop.hardness ?? 0);
          cell.wasAirborne = airborne;
        }
        if (loop?.swing === 'speed') speed = WALK_SPEED + (RUN_SPEED - WALK_SPEED) * (0.5 - 0.5 * Math.cos((u / loop.period) * Math.PI * 2));
        if (loop?.swing === 'turn') {
          const yaw = Math.sin((u / loop.period) * Math.PI * 2) * 1.2;
          turn = (yaw - cell.avatar.group.rotation.y) / Math.max(dt, 1e-3);
          cell.avatar.group.rotation.y = yaw;
        }
        // The camera's look, off the body's facing: see `MotionCues.look`.
        const look = -(cell.spec.azimuth * DEG + (turnInput.checked ? spin : 0)) - cell.avatar.group.rotation.y;
        cell.avatar.stride(dt, speed, airborne, { turn, look: Math.atan2(Math.sin(look), Math.cos(look)) });
      }
    }

    const near = closeInput.checked ? CLOSE : 1;
    const distance = WALK_FRAMING.distance * near;
    const height = WALK_FRAMING.height * near;
    const elevation = cell.spec.elevation !== undefined
      ? cell.spec.elevation * DEG
      : Math.atan2(height, distance);
    const orbit = Math.hypot(distance, height);
    const azimuth = cell.spec.azimuth * DEG + (turnInput.checked ? spin : 0);
    const pivot = new THREE.Vector3(0, PIVOT_HEIGHT + cell.craft.position.y, 0);
    // Azimuth 0 is behind the figure, which faces +Z.
    cell.camera.position.set(
      Math.sin(azimuth) * Math.cos(elevation) * orbit,
      pivot.y + Math.sin(elevation) * orbit,
      -Math.cos(azimuth) * Math.cos(elevation) * orbit,
    );
    cell.camera.lookAt(pivot);
    cell.camera.aspect = rect.width / rect.height;
    cell.camera.updateProjectionMatrix();

    const bottom = innerHeight - rect.bottom;
    renderer.setViewport(rect.left, bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, bottom, rect.width, rect.height);
    outline.render(cell.scene, cell.camera);
  }

  renderer.setScissorTest(false);
  requestAnimationFrame(render);
}

requestAnimationFrame(render);

// The budget, printed where a reviewer will see it rather than in a comment.
const stats = measure(cells[0]!.avatar.group);
document.querySelector('p.note')!.insertAdjacentHTML(
  'beforeend',
  ` <b>${stats.triangles} triangles in ${stats.meshes} meshes</b>, ` +
    `${stats.height.toFixed(2)} tall against an AVATAR_HEIGHT of ${AVATAR_HEIGHT}.`,
);
