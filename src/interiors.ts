import * as THREE from 'three';
import type { ClipName, Person } from './cast.ts';
import type { CountryPlan } from './countryside.ts';
import type { Folk, Talker } from './folk.ts';
import { buildRoom } from './interior-kit.ts';
import { BODY, COUNTRY_DOORS, ROOM_METRE, enterLabel, planInterior, roomSolids } from './interior-plan.ts';
import type { DoorIdentity, InteriorPlan, Sound } from './interior-plan.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { createSceneryContext } from './scenery/contract.ts';
import { regionFor } from './scenery/regions.ts';
import { enclosed, freeSpot, pushOut, solidField } from './scenery/solids.ts';
import type { SolidField } from './scenery/solids.ts';
import { AVATAR_HEIGHT } from './stature.ts';

/**
 * Going in: `E` at a door fades the world to black, and the player stands in
 * a room of his own (`interior-plan.ts`, `interior-kit.ts`); `E` at its door
 * fades back and puts him on the doorstep, facing the street.
 *
 * **The room is built where the door is, and nothing outside is drawn while
 * he is in it.** It stands on the tangent plane at the doorstep, turned so
 * its door is the building's, which keeps everything that asks where the
 * player is — the streamers, the clock, the chip, the music — asking about
 * the right town: they see a man standing at a door. What changes is what is
 * drawn and what is walked on: `main.ts` renders this file's `scene` instead
 * of the world's, and hands the player this file's floor, walls and camera
 * test in place of the town's for as long as `inside` holds. A room is a few
 * thousand triangles and a handful of draw calls against a world of hundreds,
 * so a room is also the cheapest frame there is.
 *
 * **The same door is the same room.** A plan is a function of the door's
 * identity, and the last few rooms built are kept, so going out and back in
 * costs nothing and a room is built at most once a visit — under the black of
 * the fade, where its build (a few milliseconds) is never seen.
 *
 * To the other players the traveller stays on the doorstep (`standIn` in
 * `main.ts`): someone went in and has not come out.
 */

/** A door, found: what is behind it, and where its step is in the world. */
export interface Door extends DoorIdentity {
  /** On the ground at the middle of the doorway, in the world. */
  position: THREE.Vector3;
  /** Out of the building, along the ground. */
  outward: THREE.Vector3;
  /** From whoever asked. */
  distance: number;
}

export const newDoor = (): Door => ({
  key: '',
  building: '',
  kind: 'dwelling',
  region: '',
  population: 0,
  central: 0,
  height: 0,
  position: new THREE.Vector3(),
  outward: new THREE.Vector3(),
  distance: Infinity,
});

/** Copies a found door into a kept one: `Door` objects are scratch that the finders reuse. */
export function copyDoor(from: Door, to: Door): Door {
  const { position, outward } = to;
  Object.assign(to, from, { position: position.copy(from.position), outward: outward.copy(from.outward) });
  if (from.monument === undefined) delete to.monument;
  if (from.name === undefined) delete to.name;
  if (from.note === undefined) delete to.note;
  return to;
}

/** How near the doorstep a body has to be for `E` to go in: a stride. */
export const DOOR_REACH = BODY + 1.6;
/** How near the inside of the door, likewise, for `E` to go out. */
const EXIT_REACH = 1.6 * ROOM_METRE;
/** The fade to black, and back. Short: a door is a moment, not a loading screen. */
const FADE_OUT = 0.22;
const FADE_IN = 0.32;
/** Rooms kept built, the most recently left last. */
const KEEP_ROOMS = 4;
/** A body further than this from the room it is in has been sent somewhere else. */
const STRAYED = 400;

export interface InteriorsOptions {
  ctx: MonumentContext;
  /** The cast, once the townsfolk have it; nobody is inside until then. */
  folk: Folk | null;
  /** The world's scene, which the player's object goes back to on the way out. */
  world: THREE.Scene;
  /** The player's object: carried into the room's scene and back. */
  body: THREE.Object3D;
  /** Stands the player at a point facing along the ground, and snaps the camera behind him. */
  teleport(point: THREE.Vector3, forward: THREE.Vector3): void;
  /** A landmark's miniature for its museum; null when there is none. */
  miniature?: (id: string) => THREE.Object3D | null;
  /** Where a sound made here joins the world's: the effects' master, once the sound is open. */
  sound?: () => { context: BaseAudioContext; node: AudioNode } | null;
  /** Compiles a scene's programs, so a first entry does not stall inside the fade in. */
  compile?: (scene: THREE.Scene) => void;
}

export interface Interiors {
  /** What is drawn instead of the world while `inside`. */
  readonly scene: THREE.Scene;
  /** The room is what is drawn and walked: from the black of going in to the black of coming out. */
  readonly inside: boolean;
  /** A fade is running: nothing should move the player. */
  readonly busy: boolean;
  readonly plan: InteriorPlan | null;
  /** The door the player went in by, while `inside`. */
  readonly door: Door | null;
  /** The floor's radius while inside, which is the ground and the made ground both. */
  readonly floor: number;
  /** Starts going in by `door`; nothing while a fade runs or already inside. */
  enter(door: Door): void;
  /** Starts going out; nothing unless inside. */
  leave(): void;
  /** Out now, without a fade or a teleport: the player has been sent somewhere else. */
  abandon(): void;
  /** Inside, the words for `E` at the door when `point` is at it, or null. */
  exitOffer(point: THREE.Vector3): string | null;
  /** Every frame: the fades, the people, the light through the windows. */
  update(dt: number, player: THREE.Vector3, daylight: number): void;
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  /** Whether the camera may not be at `point`: out of the room, above its ceiling, inside a tall piece. */
  blocks(point: THREE.Vector3): boolean;
  /** The nearest person in the room within `reach` of `point`, or null. One reused object. */
  nearest(point: THREE.Vector3, reach: number): Talker | null;
  crownOf(key: string, out: THREE.Vector3): boolean;
  /** Holds `key` in conversation, turned to `towards`, or lets them go with null. */
  engage(key: string | null, towards?: THREE.Vector3): boolean;
  readonly stats: { rooms: number; lastBuildMs: number; triangles: number; people: number; type: string };
}

interface Built {
  plan: InteriorPlan;
  room: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  field: SolidField;
  triangles: number;
}

interface Inmate {
  key: string;
  person: Person;
  holder: THREE.Group;
  base: THREE.AnimationAction;
  talk: THREE.AnimationAction;
  yaw: number;
  targetYaw: number;
  talking: number;
  held: boolean;
  height: number;
}

/** The light through a window by day, at dusk and at night: `material.color` of the glass. */
const DAY_GLASS = new THREE.Color(0xe8f6fb);
const DUSK_GLASS = new THREE.Color(0xf8a658);
const NIGHT_GLASS = new THREE.Color(0x1c2240);
/** The room's own light: a warm key from above the door and a fill, brighter by day. */
const KEY_DAY = new THREE.Color(0xfff0d8);
const KEY_NIGHT = new THREE.Color(0xffc890);

/** What each kind of room sounds like under its own noise: a filter's corner and a level. */
const HUSH: Record<Sound, { corner: number; level: number }> = {
  home: { corner: 220, level: 0.018 },
  shop: { corner: 320, level: 0.03 },
  office: { corner: 500, level: 0.02 },
  church: { corner: 160, level: 0.012 },
  mosque: { corner: 160, level: 0.012 },
  temple: { corner: 180, level: 0.012 },
  barn: { corner: 260, level: 0.025 },
  sea: { corner: 420, level: 0.05 },
  museum: { corner: 200, level: 0.012 },
};

export function createInteriors(options: InteriorsOptions): Interiors {
  const k = createSceneryContext(options.ctx);
  const scene = new THREE.Scene();
  scene.name = 'interior';
  // A fog as far as never, so the materials the world compiled with fog on
  // are the same programs in here.
  scene.fog = new THREE.Fog(0x000000, 1e6, 2e6);
  scene.background = new THREE.Color(0x1e0603);
  const room = new THREE.Group();
  room.name = 'room';
  scene.add(room);
  const hemisphere = new THREE.HemisphereLight(0xfff2e8, 0x6b5b47, 0.45);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
  room.add(key, key.target);
  scene.add(hemisphere, ambient);

  // One material for every room, on the world's ramp and in its pen.
  const inked = options.ctx.toon(options.ctx.palette.ink);
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: inked.gradientMap });
  material.userData.outlineParameters = { ...(inked.userData.outlineParameters as object), outlineNormal: true };
  const glassMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  glassMaterial.userData.outlineParameters = { visible: false };
  const roomMesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  const glassMesh = new THREE.Mesh(new THREE.BufferGeometry(), glassMaterial);
  roomMesh.frustumCulled = false;
  glassMesh.frustumCulled = false;
  room.add(roomMesh, glassMesh);

  const cache = new Map<string, Built>();
  const stats = { rooms: 0, lastBuildMs: 0, triangles: 0, people: 0, type: '' };

  // The room's frame in the world: `origin` on the floor at the door, and the
  // basis that turns the room's +X, +Y, +Z onto the world.
  const origin = new THREE.Vector3();
  const across = new THREE.Vector3();
  const up = new THREE.Vector3();
  const inward = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  let floor = 0;
  let current: Built | null = null;
  const door = newDoor();
  let hasDoor = false;
  const pending = newDoor();

  type Phase = 'out' | 'closing' | 'opening' | 'in' | 'leaving' | 'returning';
  let phase: Phase = 'out';
  let clock = 0;
  const people: Inmate[] = [];

  // The black between the two.
  const curtain = document.createElement('div');
  curtain.style.cssText = 'position:fixed;inset:0;background:#1e0603;opacity:0;pointer-events:none;z-index:3;';
  document.body.appendChild(curtain);

  function builtFor(d: Door): Built {
    const known = cache.get(d.key);
    if (known !== undefined) {
      cache.delete(d.key);
      cache.set(d.key, known);
      return known;
    }
    const t0 = performance.now();
    const plan = planInterior(d);
    const miniature = plan.monument !== null ? options.miniature?.(plan.monument) ?? null : null;
    const made = buildRoom(plan, k, miniature);
    const built: Built = { plan, room: made.room, glass: made.glass, field: solidField(roomSolids(plan)), triangles: made.triangles };
    stats.lastBuildMs = performance.now() - t0;
    stats.rooms++;
    cache.set(d.key, built);
    for (const [key, old] of cache) {
      if (cache.size <= KEEP_ROOMS) break;
      if (old === current || key === d.key) continue;
      old.room.dispose();
      old.glass.dispose();
      cache.delete(key);
    }
    return built;
  }

  /** Points and directions between the room's frame and the world's. */
  const toWorld = (x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 =>
    out.copy(origin).addScaledVector(across, x).addScaledVector(up, y).addScaledVector(inward, z);
  const local = new THREE.Vector3();
  const onFloor = new THREE.Vector3();
  function toLocal(point: THREE.Vector3): void {
    onFloor.copy(point).sub(origin);
    local.set(onFloor.dot(across), onFloor.dot(up), onFloor.dot(inward));
  }

  function standPeople(built: Built): void {
    const folk = options.folk;
    if (folk === null || !folk.ready) return;
    for (const figure of built.plan.people) {
      const person = folk.dress(figure.key, door.region);
      if (person === null) continue;
      const holder = new THREE.Group();
      holder.position.set(figure.x, 0, figure.z);
      holder.rotation.y = figure.yaw;
      holder.add(person.root);
      room.add(holder);
      const stance: ClipName = figure.role === 'keeper' || figure.role === 'staff' ? 'Idle' : figure.key.length % 3 === 0 ? 'Idle_Shift' : 'Idle';
      const base = person.actions.get(stance) ?? person.actions.get('Idle')!;
      base.reset().play();
      base.setEffectiveWeight(1);
      // Out of step with each other, or a room breathes in unison.
      base.time = Math.abs(figure.x * 7.13 + figure.z * 3.7) % base.getClip().duration;
      const talk = person.actions.get('Talk') ?? base;
      if (talk !== base) {
        talk.reset().play();
        talk.setEffectiveWeight(0);
      }
      people.push({ key: figure.key, person, holder, base, talk, yaw: figure.yaw, targetYaw: figure.yaw, talking: 0, held: false, height: person.height });
    }
    stats.people = people.length;
  }

  function clearPeople(): void {
    for (const inmate of people) {
      room.remove(inmate.holder);
      inmate.holder.remove(inmate.person.root);
      options.folk?.release(inmate.person);
    }
    people.length = 0;
    stats.people = 0;
  }

  /** Into the room: the swap, done while the screen is black. */
  function swapIn(): void {
    copyDoor(pending, door);
    hasDoor = true;
    const built = builtFor(door);
    current = built;
    floor = door.position.length();
    up.copy(door.position).normalize();
    origin.copy(up).multiplyScalar(floor);
    inward.copy(door.outward).negate().projectOnPlane(up).normalize();
    across.crossVectors(up, inward).normalize();
    basis.makeBasis(across, up, inward).setPosition(origin);
    room.matrixAutoUpdate = false;
    room.matrix.copy(basis);
    room.matrixWorldNeedsUpdate = true;
    roomMesh.geometry = built.room;
    glassMesh.geometry = built.glass;
    stats.triangles = built.triangles;
    stats.type = built.plan.type;
    // The key light from over the door's shoulder, down into the room.
    key.position.set(-built.plan.width * 0.3, built.plan.height * 2.5, -built.plan.depth * 0.2);
    key.target.position.set(built.plan.width * 0.1, 0, built.plan.depth * 0.6);
    clearPeople();
    standPeople(built);
    scene.add(options.body);
    options.teleport(toWorld(built.plan.spawn.x, 0, built.plan.spawn.z, new THREE.Vector3()), inward);
    options.compile?.(scene);
    startSound(built.plan);
  }

  /** And out: the player back in the world, on the step, facing away from the door. */
  function swapOut(): void {
    stopSound();
    clearPeople();
    options.world.add(options.body);
    current = null;
    const step = door.position.clone().addScaledVector(door.outward, DOOR_REACH * 0.6);
    options.teleport(step, door.outward);
    hasDoor = false;
  }

  // -------------------------------------------------------------------------
  // The sound of a room: its own hush, a bell over a shop's door, a thud
  // -------------------------------------------------------------------------

  let hush: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  let noise: AudioBuffer | null = null;

  function noiseOf(context: BaseAudioContext): AudioBuffer {
    if (noise !== null && noise.sampleRate === context.sampleRate) return noise;
    // Brown noise, two seconds, looped: the murmur through a wall.
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const white = seed / 0xffffffff * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    noise = buffer;
    return buffer;
  }

  function startSound(plan: InteriorPlan): void {
    const out = options.sound?.() ?? null;
    if (out === null) return;
    const { context, node } = out;
    const now = context.currentTime;
    // The door behind you: a low thud.
    thud(context, node, now);
    if (plan.bell) bell(context, node, now + 0.05);
    const shape = HUSH[plan.sound];
    const source = context.createBufferSource();
    source.buffer = noiseOf(context);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = shape.corner;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(shape.level, now + 0.8);
    source.connect(filter).connect(gain).connect(node);
    source.start(now);
    hush = { source, gain };
    // A church and a mosque hold a low chord in their stone; a temple rings a bowl.
    if (plan.sound === 'church' || plan.sound === 'mosque') chord(context, node, now, plan.sound === 'church' ? [110, 164.8, 220] : [146.8, 220]);
    if (plan.sound === 'temple') bowl(context, node, now + 0.6);
  }

  function stopSound(): void {
    const out = options.sound?.() ?? null;
    if (hush !== null && out !== null) {
      const now = out.context.currentTime;
      hush.gain.gain.cancelScheduledValues(now);
      hush.gain.gain.setTargetAtTime(0, now, 0.08);
      hush.source.stop(now + 0.5);
      thud(out.context, out.node, now);
    }
    hush = null;
    for (const voice of voices) {
      try {
        voice.stop();
      } catch {
        // Already stopped.
      }
    }
    voices.length = 0;
  }

  const voices: OscillatorNode[] = [];

  function thud(context: BaseAudioContext, node: AudioNode, at: number): void {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.18);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.22, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    osc.connect(gain).connect(node);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  function bell(context: BaseAudioContext, node: AudioNode, at: number): void {
    for (const [frequency, level, strikes] of [[1318.5, 0.07, 2], [1975.5, 0.04, 2], [2637, 0.025, 2]] as const) {
      for (let i = 0; i < strikes; i++) {
        const t = at + i * 0.14;
        const osc = context.createOscillator();
        osc.frequency.value = frequency * (i === 1 ? 1.003 : 1);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        osc.connect(gain).connect(node);
        osc.start(t);
        osc.stop(t + 1.2);
      }
    }
  }

  function chord(context: BaseAudioContext, node: AudioNode, at: number, notes: readonly number[]): void {
    for (const frequency of notes) {
      const osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.012, at + 2.5);
      osc.connect(gain).connect(node);
      osc.start(at);
      voices.push(osc);
    }
  }

  function bowl(context: BaseAudioContext, node: AudioNode, at: number): void {
    for (const [frequency, level] of [[528, 0.05], [1426, 0.02]] as const) {
      const osc = context.createOscillator();
      osc.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 6);
      osc.connect(gain).connect(node);
      osc.start(at);
      osc.stop(at + 6.2);
    }
  }

  // -------------------------------------------------------------------------

  const push2 = { x: 0, z: 0 };
  const talker: Talker = { key: '', position: new THREE.Vector3(), height: 0, distance: 0 };
  const glassColor = new THREE.Color();

  const api: Interiors = {
    scene,
    get inside() {
      return phase === 'opening' || phase === 'in' || phase === 'leaving';
    },
    get busy() {
      return phase !== 'out' && phase !== 'in';
    },
    get plan() {
      return current?.plan ?? null;
    },
    get door() {
      return hasDoor ? door : null;
    },
    get floor() {
      return floor;
    },
    stats,

    enter(d) {
      if (phase !== 'out') return;
      copyDoor(d, pending);
      phase = 'closing';
      clock = 0;
    },
    leave() {
      if (phase !== 'in') return;
      phase = 'leaving';
      clock = 0;
    },
    abandon() {
      if (phase === 'out') return;
      if (phase === 'closing') {
        phase = 'out';
        curtain.style.opacity = '0';
        return;
      }
      stopSound();
      clearPeople();
      options.world.add(options.body);
      current = null;
      hasDoor = false;
      phase = 'out';
      curtain.style.opacity = '0';
    },
    exitOffer(point) {
      if (phase !== 'in' || current === null) return null;
      toLocal(point);
      return Math.hypot(local.x, local.z) < EXIT_REACH ? current.plan.leave : null;
    },

    update(dt, player, daylight) {
      clock += dt;
      if (phase === 'closing') {
        curtain.style.opacity = String(Math.min(1, clock / FADE_OUT));
        if (clock >= FADE_OUT) {
          // Inside before the swap, so the teleport stands the player on the room's floor.
          phase = 'opening';
          clock = 0;
          try {
            swapIn();
          } catch (error) {
            // A room that will not build is a door that stays shut, not a black screen.
            console.warn(`the room behind ${pending.key} did not build:`, error);
            current = null;
            hasDoor = false;
            phase = 'returning';
          }
        }
      } else if (phase === 'opening' || phase === 'returning') {
        curtain.style.opacity = String(Math.max(0, 1 - clock / FADE_IN));
        if (clock >= FADE_IN) {
          curtain.style.opacity = '0';
          phase = phase === 'opening' ? 'in' : 'out';
        }
      } else if (phase === 'leaving') {
        curtain.style.opacity = String(Math.min(1, clock / FADE_OUT));
        if (clock >= FADE_OUT) {
          // Out before the swap, so the teleport stands the player on the world's.
          phase = 'returning';
          clock = 0;
          swapOut();
        }
      }
      if (current === null) return;
      // Sent somewhere else from inside — the map, a jump, the console: out, at once.
      if (phase === 'in' && player.distanceTo(origin) > STRAYED) {
        api.abandon();
        return;
      }
      // The windows: the hour outside, and the room's own light against it.
      const dusk = Math.max(0, 1 - Math.abs(daylight - 0.35) / 0.25);
      glassColor.copy(NIGHT_GLASS).lerp(DAY_GLASS, THREE.MathUtils.smoothstep(daylight, 0.1, 0.6)).lerp(DUSK_GLASS, dusk * 0.5);
      glassMaterial.color.copy(glassColor);
      key.color.copy(KEY_NIGHT).lerp(KEY_DAY, daylight);
      key.intensity = 1.6 + daylight * 0.8;
      ambient.intensity = 0.28 + daylight * 0.12;
      hemisphere.intensity = 0.35 + daylight * 0.15;
      // The people: breathing, and turning to whoever talks to them.
      for (const inmate of people) {
        const t0 = (inmate.held ? 1 : 0) - inmate.talking;
        inmate.talking += Math.sign(t0) * Math.min(Math.abs(t0), dt / 0.3);
        if (inmate.talk !== inmate.base) {
          inmate.talk.setEffectiveWeight(inmate.talking);
          inmate.base.setEffectiveWeight(1 - inmate.talking);
        }
        let turn = inmate.targetYaw - inmate.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        inmate.yaw += turn * Math.min(1, dt * 6);
        inmate.holder.rotation.y = inmate.yaw;
        inmate.person.mixer.update(dt);
      }
    },

    collide(point, radius, push) {
      push.set(0, 0, 0);
      if (current === null) return false;
      toLocal(onFloor.copy(point).normalize().multiplyScalar(floor));
      if (!pushOut(current.field, local.x, local.z, radius, push2)) return false;
      push.copy(across).multiplyScalar(push2.x).addScaledVector(inward, push2.z);
      return true;
    },
    freeSpotNear(point, radius, out) {
      if (current === null) return false;
      toLocal(onFloor.copy(point).normalize().multiplyScalar(floor));
      if (!freeSpot(current.field, local.x, local.z, radius, push2)) return false;
      toWorld(push2.x, 0, push2.z, out).setLength(point.length());
      return true;
    },
    blocks(point) {
      if (current === null) return false;
      const plan = current.plan;
      toLocal(point);
      const margin = 0.35;
      if (local.y < 0.2 || local.y > plan.height - margin) return true;
      if (plan.shape === 'round') {
        if (Math.hypot(local.x, local.z - plan.depth / 2) > plan.width / 2 - margin) return true;
      } else if (Math.abs(local.x) > plan.width / 2 - margin || local.z < margin || local.z > plan.depth - margin) return true;
      return enclosed(current.field, local.x, local.z, local.y);
    },

    nearest(point, reach) {
      if (current === null || phase !== 'in') return null;
      toLocal(point);
      let best: Inmate | null = null;
      let bestDistance = reach;
      for (const inmate of people) {
        const d = Math.hypot(inmate.holder.position.x - local.x, inmate.holder.position.z - local.z);
        if (d < bestDistance) [best, bestDistance] = [inmate, d];
      }
      if (best === null) return null;
      talker.key = best.key;
      toWorld(best.holder.position.x, 0, best.holder.position.z, talker.position);
      talker.height = best.height;
      talker.distance = bestDistance;
      return talker;
    },
    crownOf(keyOf, out) {
      if (current === null) return false;
      const inmate = people.find((p) => p.key === keyOf);
      if (inmate === undefined) return false;
      toWorld(inmate.holder.position.x, inmate.height, inmate.holder.position.z, out);
      return true;
    },
    engage(keyOf, towards) {
      for (const inmate of people) {
        inmate.held = inmate.key === keyOf;
        if (!inmate.held) inmate.targetYaw = inmate.yaw;
      }
      const held = people.find((p) => p.key === keyOf);
      if (held === undefined) return keyOf === null;
      if (towards !== undefined) {
        toLocal(towards);
        held.targetYaw = Math.atan2(local.x - held.holder.position.x, local.z - held.holder.position.z);
      }
      return true;
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// Doors outside a town
// ---------------------------------------------------------------------------

/** The country pieces' dwellings, which a farmhouse is one of. */
const DWELLINGS: ReadonlySet<string> = new Set(['gabled-house', 'suburban-house', 'flat-roof-house', 'machiya', 'round-hut', 'stilt-house']);

const pieceNorth = new THREE.Vector3();
const pieceAcross = new THREE.Vector3();
const pieceFront = new THREE.Vector3();
const probe = new THREE.Vector3();
const probePush = new THREE.Vector3();

/**
 * The door of the nearest farmhouse, barn, mill, lighthouse, chapel, hut or
 * yurt in `plan` within `reach` of `point`, into `out`; false when there is
 * none. The front is the piece's +Z, turned by its yaw in the frame the
 * countryside draws it in (`frameAt` in `countryside-tile.ts`: north, and
 * `up x north` across); the doorstep is where a walk out from its middle
 * along that front first leaves its walls, which `walls` answers.
 */
export function countryDoorNear(
  point: THREE.Vector3,
  plan: CountryPlan | null,
  walls: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean,
  reach: number,
  out: Door,
): boolean {
  if (plan === null) return false;
  const radius = point.length();
  let found = false;
  for (const piece of plan.pieces) {
    const enterable = piece.scenic ? DWELLINGS.has(piece.part) : COUNTRY_DOORS.has(piece.part);
    if (!enterable) continue;
    const apart = piece.at.angleTo(point) * radius;
    if (apart > piece.footprint + reach + 2) continue;
    pieceNorth.set(0, 1, 0).projectOnPlane(piece.at);
    if (pieceNorth.lengthSq() < 1e-8) pieceNorth.set(1, 0, 0).projectOnPlane(piece.at);
    pieceNorth.normalize();
    pieceAcross.crossVectors(piece.at, pieceNorth).normalize();
    pieceFront.copy(pieceAcross).multiplyScalar(Math.sin(piece.yaw)).addScaledVector(pieceNorth, Math.cos(piece.yaw));
    // Out from the middle until the walls let go.
    let step = piece.footprint * 0.6;
    for (let s = 0.4; s < piece.footprint * 1.6; s += 0.4) {
      probe.copy(piece.at).multiplyScalar(radius).addScaledVector(pieceFront, s);
      if (!walls(probe, 0.05, probePush)) {
        step = s;
        break;
      }
    }
    probe.copy(piece.at).multiplyScalar(radius).addScaledVector(pieceFront, step);
    probe.setLength(radius);
    const distance = probe.distanceTo(point);
    if (distance > reach || distance >= out.distance) continue;
    // In front of it, not beside it.
    if (probePush.copy(point).sub(probe).dot(pieceFront) < -0.25) continue;
    out.key = `${plan.key}:${piece.part}:${plan.pieces.indexOf(piece)}`;
    out.building = piece.scenic ? piece.part : piece.part;
    out.kind = piece.scenic ? 'dwelling' : 'country';
    out.region = plan.style.id;
    out.population = 0;
    out.central = 0;
    out.height = piece.footprint;
    delete out.monument;
    delete out.name;
    delete out.note;
    out.position.copy(probe);
    out.outward.copy(pieceFront).projectOnPlane(probe).normalize();
    out.distance = distance;
    found = true;
  }
  return found;
}

/** A landmark near enough to walk into: its id, name, card's sentence and where it stands. */
export interface Landmark {
  id: string;
  name: string;
  note?: string;
  iso: string;
  continent: string;
  lat: number;
  centre: THREE.Vector3;
  footprint: number;
}

/**
 * The door of a landmark's museum: wherever a body stands at its walls,
 * facing out from them. A monument has no front the kit could name, so its
 * door is the wall you walked up to; the museum's key is the landmark's, so
 * every wall of it opens on the same room.
 */
export function landmarkDoorNear(
  point: THREE.Vector3,
  landmarks: readonly Landmark[],
  walls: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => boolean,
  out: Door,
): boolean {
  const radius = point.length();
  for (const landmark of landmarks) {
    const apart = landmark.centre.angleTo(point) * radius;
    if (apart > landmark.footprint + DOOR_REACH + 4) continue;
    if (!walls(point, BODY + 0.9, probePush)) continue;
    if (probePush.lengthSq() < 1e-10) probePush.copy(point).sub(landmark.centre.clone().multiplyScalar(radius));
    out.key = `monument:${landmark.id}`;
    out.building = 'monument';
    out.kind = 'monument';
    out.region = regionFor(landmark.iso, landmark.continent, landmark.lat).id;
    out.population = 0;
    out.central = 1;
    out.height = AVATAR_HEIGHT * 4;
    out.monument = landmark.id;
    out.name = landmark.name;
    if (landmark.note !== undefined) out.note = landmark.note;
    else delete out.note;
    out.position.copy(point);
    out.outward.copy(probePush).projectOnPlane(point).normalize();
    out.distance = BODY;
    return true;
  }
  return false;
}

/** The words on the prompt at a door. */
export const doorLabel = (door: DoorIdentity): string => enterLabel(door);
