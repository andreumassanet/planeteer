/** What a world's game hands the explorers' runtime (`explorers.ts`), and what it gets back. */
import type * as THREE from 'three';
import type { Appearance } from '../appearance.ts';
import type { Cue } from '../audio.ts';
import type { FieldGuide } from '../field-guide.ts';
import type { Folk } from '../folk.ts';
import type { Guild } from '../guild.ts';
import type { GuildSquare } from '../guild/square.ts';
import type { JobBrief } from '../guild/services.ts';
import type { MinimapSpot } from '../minimap/types.ts';
import type { RigSource } from '../models.ts';
import type { PeerMark } from '../peers/types.ts';
import type { Place } from '../places.ts';
import type { Progress, ProgressEvent, ProgressRecords } from '../progress.ts';
import type { IconName } from '../ui.ts';

/** The traveller this frame, as the guild and the followers read them. */
export interface ExplorerTraveller {
  /** Between the feet, world space. */
  position: THREE.Vector3;
  /** Away from the planet's centre, and the way they face across it; both unit. */
  up: THREE.Vector3;
  forward: THREE.Vector3;
  /** On their own feet (not seated, not swimming): a companion trots after them. */
  onFoot: boolean;
  /** Standing on the ground, free to talk: the guild's people answer `E`. */
  afoot: boolean;
  /** In a vehicle's seat: a trail goes quiet. */
  inVehicle: boolean;
}

/** The others near, as the trails and the companions read them. */
export interface ExplorerPeers {
  readonly marks: readonly PeerMark[];
  positionOf(id: string): THREE.Vector3 | null;
  lookOf(id: string): string;
}

/** Earth's jobs, as the dispatcher and the minimap read them. */
export interface ExplorerJobs {
  briefs(): readonly JobBrief[];
  track(id: string): boolean;
  /** The noticeboard read without the dispatcher: the next job near. */
  cycle(): void;
  /** The pickups near, into `out`. */
  spots(out: MinimapSpot[]): void;
}

/** Earth's courses, as the marshal reads them. */
export interface ExplorerCourses {
  /** The courses near, nearest first, with how far each is (units) and the best run. */
  near(): readonly { id: string; name: string; kind: 'air' | 'land' | 'sea'; units: number; best: { ms: number; medal: number } | null }[];
  lead(id: string): void;
  best(id: string): { ms: number; medal: number } | undefined;
}

/** A landmark the cartographer may suggest: one not yet collected. */
export interface ExplorerLandmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  iso: string;
}

export interface ExplorersHost {
  /** The radius distances are measured at, units. */
  radius: number;
  /** The towns, by the index the squares and the guilds use. */
  places: readonly Place[];
  /** Which of them keep a guild. */
  guildPlaces: readonly number[];
  /** The guild squares raised near the traveller now. */
  squares(): readonly GuildSquare[];
  /** The passport, the rings and the jobs, as this world's game keeps them. */
  records(): ProgressRecords;
  scene: THREE.Scene;
  /** Where the banner and the guild's name tags go. */
  hudRoot: HTMLElement;
  lockTarget: HTMLElement;
  folk: Folk;
  rigs: RigSource;
  camera(): THREE.Camera;
  traveller(): ExplorerTraveller;
  /** The ground's radius under a direction, for a companion's feet. */
  groundAt?(direction: THREE.Vector3): number;
  peers(): ExplorerPeers | null;
  cue(name: Cue): void;
  /** The sound's effects bus once a gesture has opened it. */
  sound(): { context: AudioContext; node: AudioNode } | null;
  announce(text: string, icon?: IconName): void;
  /** Points the compass, the minimap and the guide at a place. */
  mark(lat: number, lon: number, name: string, landmark: boolean): void;
  setSpots(spots: readonly MinimapSpot[]): void;
  name(): string;
  countryName(iso: string): string;
  /** The nations stamped in the book. */
  stamped(): ReadonlySet<string>;
  /** The landmarks not yet collected. */
  landmarks(): readonly ExplorerLandmark[];
  /** The smallest town the cartographer suggests for a new stamp. */
  suggestPopulation: number;
  openMap(): void;
  openPassport(): void;
  openWardrobe(): void;
  /** How the traveller looks, and dressing them again (what is worn and not earned comes off). */
  appearance(): Appearance;
  dress?(appearance: Appearance): void;
  /** The optional account: who is signed in (null for nobody), and the ways to sign in and to its page. */
  account?: { available(): boolean; signedIn(): string | null; signIn(): void; openAccount(): void };
  jobs?: ExplorerJobs;
  courses?: ExplorerCourses;
}

export interface Explorers {
  readonly progress: Progress;
  readonly guild: Guild;
  readonly fieldGuide: FieldGuide;
  emit(event: ProgressEvent): void;
  /** What is earned to wear now. */
  unlocked(): ReadonlySet<string>;
  /** Every frame: the guild's people and marks, the spots, the boards and the followers. */
  frame(now: number, dt: number, width: number, height: number): void;
  debug(): Record<string, unknown>;
  dispose(): void;
}
