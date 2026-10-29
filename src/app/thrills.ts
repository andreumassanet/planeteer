/**
 * The flourishes on top of travelling: the rush (the lens opening and the
 * speed lines as the ground streams past, a tremor at full speed), the guide
 * to the marker or a course's next ring, and the rings themselves, whose
 * passing punches the lens. One phase, after the camera has moved.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { createGuide } from '../guide.ts';
import type { Guide, GuideFrame, GuideMedium } from '../guide.ts';
import { createRings } from '../rings.ts';
import type { CourseKind, Rings } from '../rings.ts';
import { isWater } from '../vehicles.ts';
import { createChime } from '../rings/chime.ts';
import { createRingPanel } from '../rings/panel.ts';
import { easeRush, rushOf } from '../rush.ts';
import { unitAt } from '../sphere.ts';
import { createSpeedLines } from '../speed-lines.ts';
import type { SpeedLines } from '../speed-lines.ts';
import type { App } from './context.ts';
import { photoModeOn } from './photo-mode.ts';
import type { Tick } from './frame/tick.ts';
import type { FlightAssist } from '../player/types.ts';

/** A ring flown through punches the lens this much of a full rush, and a course's last ring or a landmark's this much. */
const PULSE_RING = 0.45;
const PULSE_FINISHED = 0.8;
/** Seconds the punch takes to die away. */
const PULSE_TIME = 0.4;
/** Over this much rush in a vehicle, the lens trembles, up to `TREMOR` of a knock at a full rush. */
const TREMOR_FROM = 0.45;
const TREMOR = 0.12;
/** How much stronger the speed lines are than the rush the lens opens by. */
const LINES_GAIN = 1.5;
/** How high over the marker an aircraft's line leads, units: the navigation's waypoint height. */
const AIR_RISE = 90;
/** On foot this high over the ground (a fall, a canopy), the line is an aircraft's. */
const FALLING = 40;


export interface Thrills {
  rings: Rings;
  guide: Guide;
  speedLines: SpeedLines;
  /** The rush as last eased, 0 to 1. */
  readonly rush: number;
  /** The ring course's pull on an aircraft this frame (`PlayerInput.assist`), or null. */
  readonly assist: FlightAssist | null;
  /** A punch through the lens, 0 to 1, as a ring's. */
  pulse(strength: number): void;
  frame(tick: Tick): void;
}

export function createThrills(app: App): Thrills {
  const { player, rig, scene, groundAt, walls, nav, hud } = app;
  const speedLines = createSpeedLines();
  const guide = createGuide();
  const rings = createRings({
    landmarks: app.placements,
    places: app.places.all,
    countries: app.world.countries,
    roads: app.baked.roads,
    planetRadius: PLANET_RADIUS,
    sea: PLANET_RADIUS,
    groundAt,
    isWater,
    chime: createChime(() => app.sound.audio.bus),
    panel: createRingPanel(hud.root),
  });
  scene.add(guide.group, rings.group);

  let rush = 0;
  let punch = 0;
  const travel = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const sample = new THREE.Vector3();
  /** The marker's ground point and the point over it an aircraft is led to, kept for the marker they were found for. */
  const anchor = new THREE.Vector3();
  const over = new THREE.Vector3();
  let anchoredFor = '';
  const assistTarget = new THREE.Vector3();
  const assisting: FlightAssist = { target: assistTarget, strength: 0 };
  let assist: FlightAssist | null = null;

  /** The pull towards the course's next ring, from an aircraft aloft, once a run is under way; nothing before it. */
  function leadTo(aircraft: boolean): FlightAssist | null {
    const next = rings.next;
    if (!aircraft || !player.airborne || next === null || photoModeOn()) return null;
    assistTarget.copy(next.centre);
    assisting.strength = 1;
    return assisting;
  }

  const surfaceAt = (direction: THREE.Vector3): number => {
    const ground = Math.max(groundAt(direction), PLANET_RADIUS);
    sample.copy(direction).multiplyScalar(ground);
    return Math.max(ground, walls.madeHeightAt(sample));
  };

  const frame: GuideFrame = {
    from: player.position,
    target: anchor,
    medium: 'foot',
    tone: 'marker',
    beacon: null,
    eye: rig.camera.position,
    radius: PLANET_RADIUS,
    surfaceAt,
  };

  /** Which kind of course the player's craft runs: at the controls of an aircraft, a boat or anything on wheels or hooves. */
  function courseKind(): CourseKind | null {
    const ride = player.state === 'seated' ? player.ride : null;
    if (ride === null) return null;
    const medium = ride.model.medium;
    return medium === 'air' ? 'air' : medium === 'water' ? 'sea' : 'land';
  }

  function mediumOf(): GuideMedium {
    const ride = player.state === 'seated' ? player.ride : null;
    if (ride === null) return player.airborne && player.altitude > FALLING ? 'air' : 'foot';
    if (ride.model.medium === 'air') return player.airborne ? 'air' : 'road';
    return ride.model.medium;
  }

  /** Where the line leads this frame, or null: a course's next ring from the air, else the marker. */
  function guideFrame(aircraft: boolean): GuideFrame | null {
    if (photoModeOn() || app.launchPads.riding !== null) return null;
    const medium = mediumOf();
    frame.medium = medium;
    const next = rings.next;
    // A run under way leads on to its next ring, whatever runs it; an aircraft on the ground waits for the sky.
    if (next !== null && (!aircraft || player.airborne)) {
      frame.target = next.centre;
      frame.tone = 'ring';
      frame.beacon = null;
      return frame;
    }
    const marker = nav.marker;
    if (marker === null) return null;
    const key = `${marker.lat},${marker.lon}`;
    if (key !== anchoredFor) {
      anchoredFor = key;
      unitAt(marker.lat, marker.lon, anchor);
      const ground = Math.max(groundAt(anchor), PLANET_RADIUS);
      over.copy(anchor).multiplyScalar(ground + AIR_RISE);
      anchor.multiplyScalar(ground);
    }
    frame.target = medium === 'air' ? over : anchor;
    frame.tone = 'marker';
    frame.beacon = anchor;
    return frame;
  }

  /** Where the streaks leave from: the way the player is going, on screen. */
  function focusOnScreen(): [number | null, number | null] {
    travel.copy(player.forward);
    focus.copy(player.position).addScaledVector(travel, 2000).project(rig.camera);
    if (focus.z > 1 || !Number.isFinite(focus.x)) return [null, null];
    return [(focus.x * 0.5 + 0.5) * innerWidth, (0.5 - focus.y * 0.5) * innerHeight];
  }

  return {
    rings,
    guide,
    speedLines,
    get rush() {
      return rush;
    },
    get assist() {
      return assist;
    },
    pulse(strength) {
      punch = Math.max(punch, Math.min(1, strength));
    },
    frame({ dt, ground }) {
      const seated = player.state === 'seated' && player.ride !== null;
      const aircraft = seated && player.ride!.model.medium === 'air';
      app.guard('rings', () => {
        const pass = rings.update(dt, {
          position: player.position,
          kind: courseKind(),
          airborne: player.airborne,
          camera: rig.camera,
        });
        if (pass !== null && pass.grade !== 'missed') {
          const strong = pass.finished || pass.grade === 'perfect';
          punch = Math.max(punch, strong ? PULSE_FINISHED : PULSE_RING);
          rig.shake(strong ? 0.35 : 0.18);
        }
        assist = leadTo(aircraft);
      });
      app.guard('guide', () => guide.update(dt, guideFrame(aircraft)));

      const speed = Math.max(Math.abs(player.speed), player.velocity);
      // Over the ground under the player, not over the sea, which is what `altitude` is.
      const wanted = photoModeOn() || app.map.open ? 0 : rushOf(speed, player.position.length() - ground);
      rush = easeRush(rush, wanted, dt);
      punch *= Math.exp(-dt / PULSE_TIME);
      if (punch < 1e-3) punch = 0;
      rig.rush = Math.min(1, rush + punch);
      // Aloft, half of it: an aircraft's own frame already sways the lens.
      if (seated && rush > TREMOR_FROM) rig.shake(((aircraft ? TREMOR * 0.5 : TREMOR) * (rush - TREMOR_FROM)) / (1 - TREMOR_FROM));
      // The streaks come in ahead of the lens: a third of the way into the rush they are already plain.
      const lines = Math.min(1, Math.max(rush * LINES_GAIN, punch * 0.9));
      const [x, y] = lines > 0.01 ? focusOnScreen() : [null, null];
      speedLines.update(dt, lines, x, y);
    },
  };
}
