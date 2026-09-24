import * as THREE from 'three';
import { buildAvatar, prepareAvatar } from '../avatar.ts';
import type { Avatar } from '../avatar.ts';
import { OutlineEffect } from '../outline.ts';
import { SKY_TOP } from '../theme.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { loadCraft } from '../craft/index.ts';
import { bodyFrame } from '../craft/body.ts';
import { reviewCraft } from '../craft/review.ts';
import type { CraftReview } from '../craft/review.ts';
import type { CraftModel, Seat } from '../craft/contract.ts';

/**
 * The craft sheet: every vehicle a player can take, full.
 *
 * **A seat is only reviewed with somebody in it.** Every number in
 * `src/craft/` is argued from the hero's seated and standing body, and the one
 * way to see whether the arguments hold is to put that body — the real cast,
 * posed by `avatar.ts`, placed by the same rule the fleet uses (`bodyFrame`) —
 * in every seat at once and look from where the game looks. A chase camera
 * astern, a three-quarter from ahead where the faces are, and the side, where
 * a hull's sheer and a car's roof line are; the plane adds the overhead,
 * which is the framing it spends a flight in, and the balloon a close look at
 * its basket, because at the whole balloon's framing the basket is a crumb.
 *
 * **One more hero stands beside each craft**, on the ground or on a jetty,
 * because a model without a person next to it has no size.
 *
 * Under each craft is `reviewCraft`, the function `pnpm craft` asserts with,
 * so a red line here is a failing check there. Everything is drawn into one
 * WebGL context scissored cell by cell, as on the other sheets.
 */

const H = AVATAR_HEIGHT;
const DEG = Math.PI / 180;
/** The game's lens on foot, from `camera.ts`. */
const FOV = 45;

interface ViewSpec {
  label: string;
  note: string;
  /** Degrees round the craft. 0 is dead astern, where the chase camera lives. */
  azimuth: number;
  /** Degrees over the horizon. */
  elevation: number;
  /** Frame the whole craft, or only the people in it. */
  frame: 'whole' | 'seats';
}

const VIEWS: ViewSpec[] = [
  { label: 'chase', note: 'where the camera lives', azimuth: 0, elevation: 18, frame: 'whole' },
  { label: 'three-quarter front', note: 'the faces', azimuth: 140, elevation: 16, frame: 'whole' },
  { label: 'side', note: 'the sheer, the roof line', azimuth: 90, elevation: 5, frame: 'whole' },
];
const EXTRA: Record<string, ViewSpec[]> = {
  'light-plane': [{ label: 'overhead', note: 'the map camera: four heads from above', azimuth: 25, elevation: 72, frame: 'whole' }],
  balloon: [{ label: 'the basket', note: 'four standing, the rim at the chest', azimuth: 150, elevation: 20, frame: 'seats' }],
  launch: [{ label: 'the cockpit', note: 'hips on the pans, feet on the sole', azimuth: 200, elevation: 38, frame: 'seats' }],
};

interface Rider {
  avatar: Avatar;
  seat: Seat;
}

interface Cell {
  model: CraftModel;
  view: ViewSpec;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  slot: THREE.Group;
  riders: Rider[];
  scale: Avatar;
  frame: HTMLElement;
  target: THREE.Vector3;
  distance: number;
}

/**
 * Everything waits on the hero's body and the craft, and the wait is inside
 * a function rather than at the top level: a module whose evaluation awaits
 * is one every chunk importing from it waits on, which a bundle can turn into
 * a sheet waiting on itself.
 */
async function main(): Promise<void> {
  await prepareAvatar();
  const models = await loadCraft();
  let variant = 0;

  function groundFor(model: CraftModel, radius: number): THREE.Object3D {
    const group = new THREE.Group();
    // One disc, not two: its top is the waterline for a boat and the ground for
    // everything else, and a second disc at the same height would z-fight.
    const water = model.medium === 'water';
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 1.6, 48),
      new THREE.MeshToonMaterial({ color: water ? 0x2b7fa8 : 0x91ad78 }),
    );
    disc.position.y = -0.8;
    group.add(disc);
    if (water) {
      // A jetty for the scale figure to stand on.
      const jetty = new THREE.Mesh(new THREE.BoxGeometry(0.9 * H, 0.9 * H, model.size[0] * 1.5), new THREE.MeshToonMaterial({ color: 0x988165 }));
      jetty.position.set(-(model.size[1] / 2 + 0.6 * H), 0.12 * H - 0.45 * H, 0);
      group.add(jetty);
    }
    return group;
  }

  /** Where the scale figure stands: beside the craft, clear of wings and props. */
  function besideOf(model: CraftModel): THREE.Vector3 {
    const seatX = Math.max(...model.seats.map((seat) => Math.abs(seat.x)));
    if (model.kind === 'balloon') return new THREE.Vector3(-(seatX + 1.1 * H), 0, 0);
    if (model.kind === 'plane') return new THREE.Vector3(-(seatX + 1.4 * H), 0, model.size[0] * 0.4);
    if (model.medium === 'water') return new THREE.Vector3(-(model.size[1] / 2 + 0.6 * H), 0.12 * H, 0);
    return new THREE.Vector3(-(model.size[1] / 2 + 0.4 * H), 0, 0);
  }

  function buildCell(model: CraftModel, view: ViewSpec, grid: HTMLElement): Cell {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY_TOP);
    // The world's light, minus the sun's travel; little ambient, or the ramp has
    // no range to step across.
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-0.8, 1.25, 0.75);
    scene.add(sun, sun.target);

    const [length, width, height] = model.size;
    const base = model.medium === 'water' ? -model.draft : 0;
    const whole = 0.5 * Math.hypot(length, width, height);
    scene.add(groundFor(model, Math.max(whole * 3, 6 * H)));

    const slot = new THREE.Group();
    slot.add(model.build(variant));
    scene.add(slot);

    // Somebody in every seat, placed as the fleet places them.
    const riders: Rider[] = model.seats.map((seat) => {
      const avatar = buildAvatar();
      const at = bodyFrame(seat);
      avatar.group.position.set(at.x, at.y, at.z);
      avatar.group.rotation.y = at.yaw;
      slot.add(avatar.group);
      return { avatar, seat };
    });

    const scale = buildAvatar();
    scale.group.position.copy(besideOf(model));
    scale.group.rotation.y = Math.PI * 0.15;
    scene.add(scale.group);

    let target: THREE.Vector3;
    let radius: number;
    if (view.frame === 'seats') {
      const box = new THREE.Box3();
      for (const seat of model.seats) {
        box.expandByPoint(new THREE.Vector3(seat.x, seat.y - 0.5 * H, seat.z));
        box.expandByPoint(new THREE.Vector3(seat.x, seat.y + 0.6 * H, seat.z));
      }
      box.expandByScalar(0.5 * H);
      target = box.getCenter(new THREE.Vector3());
      radius = 0.5 * box.getSize(new THREE.Vector3()).length();
    } else {
      target = new THREE.Vector3(0, base + height / 2, 0);
      radius = whole;
    }
    const distance = (radius / Math.sin((FOV / 2) * DEG)) * 1.02;
    const camera = new THREE.PerspectiveCamera(FOV, 1.25, 0.1, distance * 8 + 200);

    const frame = document.createElement('div');
    frame.className = 'cell';
    const box = document.createElement('div');
    box.className = 'frame';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = '<b></b><span></span>';
    bar.querySelector('b')!.textContent = view.label;
    bar.querySelector('span')!.textContent = view.note;
    frame.append(box, bar);
    grid.append(frame);

    return { model, view, scene, camera, slot, riders, scale, frame: box, target, distance };
  }

  // ---------------------------------------------------------------------------
  // The page
  // ---------------------------------------------------------------------------

  const sections = document.getElementById('sections')!;
  const cells: Cell[] = [];
  const summaries = new Map<string, { heading: HTMLElement; table: HTMLElement }>();

  const f = (value: number): string => value.toFixed(2);

  function describe(review: CraftReview): { heading: string; table: string } {
    const model = models.get(review.id)!;
    const [l, w, h] = model.size;
    const heading =
      `${model.kind} · ${model.medium} · ${f(l)} × ${f(w)} × ${f(h)} ` +
      `(${f(l / H)} × ${f(w / H)} × ${f(h / H)} bodies) · ${review.triangles} triangles in ${review.meshes} meshes · ` +
      `${model.seats.length} seats · colourway ${review.variant + 1} of ${model.variants}` +
      (model.draft > 0 ? ` · draft ${f(model.draft)}` : '') +
      (review.turning.length > 0 ? ` · turning: ${review.turning.join(', ')}` : '');
    const rows = review.seats.map((row) => {
      const s = row.seat;
      const inside = Object.entries(row.inside)
        .map(([name, area]) => `${name} ${area.toFixed(2)}`)
        .join(', ');
      return (
        `seat ${row.index}${row.index === 0 ? ' (drives)' : '         '}  ${s.pose.padEnd(5)} ${s.shown ? 'shown ' : 'hidden'}` +
        `  hip ${f(s.x).padStart(6)} ${f(s.y).padStart(6)} ${f(s.z).padStart(6)}` +
        `  ${row.headroom === null ? 'open over the head  ' : `roof ${f(row.headroom).padStart(5)} over crown`}` +
        `  ${row.under === null ? '                    ' : `under ${s.pose === 'sit' ? 'hip  ' : 'soles'} ${f(row.under).padStart(6)}`}` +
        `  body inside the model: ${inside}`
      );
    });
    const problems = review.problems.length === 0 ? ['no problems'] : review.problems.map((p) => `PROBLEM  ${p}`);
    return { heading, table: [...rows, '', ...problems].join('\n') };
  }

  for (const model of models.values()) {
    const heading = document.createElement('h2');
    heading.textContent = model.id;
    const info = document.createElement('span');
    heading.append(info);
    const grid = document.createElement('div');
    grid.className = 'grid';
    const table = document.createElement('pre');
    table.className = 'seats';
    sections.append(heading, grid, table);
    for (const view of [...VIEWS, ...(EXTRA[model.id] ?? [])]) cells.push(buildCell(model, view, grid));
    summaries.set(model.id, { heading: info, table });
  }

  function refreshReviews(): void {
    for (const model of models.values()) {
      const review = reviewCraft(model, variant % model.variants);
      const { heading, table } = describe(review);
      const summary = summaries.get(model.id)!;
      summary.heading.textContent = heading;
      summary.heading.className = review.problems.length > 0 ? 'bad' : '';
      summary.table.textContent = table;
    }
  }
  refreshReviews();

  function rebuild(): void {
    for (const cell of cells) {
      const old = cell.slot.children.find((child) => child.name === cell.model.id);
      if (old !== undefined) cell.slot.remove(old);
      cell.slot.add(cell.model.build(variant % cell.model.variants));
    }
    refreshReviews();
  }

  document.getElementById('variant')!.addEventListener('click', () => {
    variant++;
    rebuild();
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  // Screen-space, so the pen on this page is the pen in the world.
  const outline = new OutlineEffect(renderer, { defaultThickness: 0.005, defaultColor: [0.11, 0.02, 0.01] });

  const freezeInput = document.getElementById('freeze') as HTMLInputElement;
  const turnInput = document.getElementById('turn') as HTMLInputElement;
  const hiddenInput = document.getElementById('hidden') as HTMLInputElement;

  let spin = 0;
  let last = performance.now();

  function render(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const running = !freezeInput.checked;
    if (running && turnInput.checked) spin += dt * 0.4;

    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.setClearColor(SKY_TOP, 1);
    renderer.clear();
    renderer.setScissorTest(true);

    for (const cell of cells) {
      const rect = cell.frame.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight || rect.width < 4) continue;

      if (running) {
        for (const rider of cell.riders) {
          rider.avatar.group.visible = rider.seat.shown || hiddenInput.checked;
          if (rider.seat.pose === 'sit') rider.avatar.sit(dt);
          else rider.avatar.stride(dt, 0, false);
        }
        cell.scale.stride(dt, 0, false);
        cell.slot.traverse((object) => {
          if (object.name === 'prop') object.rotation.z += dt * 18;
        });
      }

      const azimuth = cell.view.azimuth * DEG + (turnInput.checked ? spin : 0);
      const elevation = cell.view.elevation * DEG;
      // Azimuth 0 is behind the craft, which faces +Z.
      cell.camera.position.set(
        cell.target.x + Math.sin(azimuth) * Math.cos(elevation) * cell.distance,
        cell.target.y + Math.sin(elevation) * cell.distance,
        cell.target.z - Math.cos(azimuth) * Math.cos(elevation) * cell.distance,
      );
      cell.camera.lookAt(cell.target);
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

  (window as unknown as Record<string, unknown>).craft = {
    models,
    /** The review `pnpm craft` asserts, for one craft and colourway. */
    review: (id: string, colourway = variant) => {
      const model = models.get(id);
      if (model === undefined) throw new Error(`no craft '${id}': ${[...models.keys()].join(', ')}`);
      return reviewCraft(model, colourway % model.variants);
    },
    cells,
  };
}

main().catch((error: unknown) => {
  console.error('the craft sheet failed to start', error);
  document.body.append(Object.assign(document.createElement('pre'), { className: 'seats', textContent: String(error) }));
});
