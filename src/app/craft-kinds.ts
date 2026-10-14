/** Per-kind tables for the vehicles a player takes: the HUD's icon, the engine's sound, the music's mode. */
import type { CraftKind } from '../craft/contract.ts';
import type { Soundscape } from '../audio.ts';
import type { MusicMoment } from '../music.ts';
import type { IconName } from '../ui.ts';

const KIND_ICON: Readonly<Record<CraftKind, IconName>> = {
  car: 'car', van: 'car', bus: 'car', tractor: 'car', jeep: 'car', tuktuk: 'car',
  boat: 'boat', sailboat: 'boat', jetski: 'jetski',
  plane: 'plane', balloon: 'balloon', helicopter: 'heli',
  bicycle: 'bike', motorbike: 'moto', horse: 'horse', submarine: 'sub',
};

/** `Soundscape.mode` per kind: a tuk-tuk sounds like a motorbike. */
export const SOUND_OF: Readonly<Record<CraftKind, Soundscape['mode']>> = {
  car: 'car', van: 'car', jeep: 'car', bus: 'heavy', tractor: 'heavy', tuktuk: 'motorbike',
  bicycle: 'bicycle', motorbike: 'motorbike', horse: 'horse',
  boat: 'boat', jetski: 'jetski', sailboat: 'sail', submarine: 'boat',
  plane: 'plane', balloon: 'balloon', helicopter: 'helicopter',
};

/** What the music takes each kind for: road, sea or sky. */
export const MUSIC_OF: Readonly<Record<CraftKind, MusicMoment['mode']>> = {
  car: 'car', van: 'car', jeep: 'car', bus: 'car', tractor: 'car', tuktuk: 'car',
  bicycle: 'car', motorbike: 'car', horse: 'car',
  boat: 'boat', jetski: 'boat', sailboat: 'boat', submarine: 'boat',
  plane: 'plane', balloon: 'balloon', helicopter: 'plane',
};

/** The HUD's icon for a kind of vehicle, and a neutral one for none. */
export function modeIcon(kind: CraftKind | null): IconName {
  return kind === null ? 'sparkle' : KIND_ICON[kind];
}
