/**
 * What the space bake converts, by the id the worlds ask for, grouped by
 * output file. Sources are under ../.cache/assets/.
 */

const Q_SPACE = 'quaternius/ultimate-space-kit/';
const Q_MONSTERS = 'quaternius/ultimate-monsters/';
const K_SPACE = 'kenney/space-kit/Models/GLTF format/';
const K_STATION = 'kenney/space-station-kit/Models/GLB format/';
/** Quaternius's two atlases: 32 swatches a side (16 px of 512, 32 px of 1024). */
export const Q_GRID: [number, number] = [32, 32];
/** Kenney's colormap: 16 swatches by 4, each shaded top to bottom. */
const K_GRID: [number, number] = [16, 4];

/** The pack a source belongs to, for the manifest and the licence. */
export function packOf(source: string): string {
  if (source.startsWith(Q_SPACE)) return 'Quaternius, Ultimate Space Kit';
  if (source.startsWith(Q_MONSTERS)) return 'Quaternius, Ultimate Monsters';
  if (source.startsWith(K_STATION)) return 'Kenney, Space Station Kit';
  if (source.startsWith(K_SPACE)) return 'Kenney, Space Kit';
  throw new Error(`no pack for ${source}`);
}

export interface StaticEntry {
  id: string;
  source: string;
  /** Radians about Y that turn the pack's model to face +Z. */
  yaw?: number;
  grid?: [number, number];
  /** Free words for a consumer to choose by: `dome`, `ice`, `lava`, `seat`... */
  tags?: string[];
}

const q = (path: string, id: string, tags: string[] = [], yaw?: number): StaticEntry => ({ id, source: `${Q_SPACE}${path}.gltf`, grid: Q_GRID, tags, yaw });
const k = (name: string, id: string, tags: string[] = [], yaw?: number): StaticEntry => ({ id, source: `${K_SPACE}${name}.glb`, tags, yaw });
const st = (name: string, tags: string[] = []): StaticEntry => ({ id: name, source: `${K_STATION}${name}.glb`, grid: K_GRID, tags });

/** The colony: modules, domes, a hangar, the masts and dishes round them. */
export const BUILDINGS: StaticEntry[] = [
  q('Environment/GLTF/Base_Large', 'base-large', ['hub']),
  q('Environment/GLTF/Building_L', 'building-l', ['module']),
  q('Environment/GLTF/GeodesicDome', 'geodesic-dome', ['dome']),
  q('Environment/GLTF/House_Cylinder', 'house-cylinder', ['module']),
  q('Environment/GLTF/House_Long', 'house-long', ['module']),
  q('Environment/GLTF/House_Open', 'house-open', ['module', 'door']),
  q('Environment/GLTF/House_OpenBack', 'house-open-back', ['module', 'door']),
  q('Environment/GLTF/House_Single', 'house-single', ['module']),
  q('Environment/GLTF/House_Single_Support', 'house-single-support', ['module', 'stilts']),
  q('Environment/GLTF/Connector', 'connector', ['tube']),
  q('Environment/GLTF/MetalSupport', 'metal-support', ['frame']),
  q('Environment/GLTF/Stairs', 'stairs', ['access']),
  q('Environment/GLTF/Ramp', 'ramp', ['access']),
  q('Environment/GLTF/Roof_Antenna', 'roof-antenna', ['roof']),
  q('Environment/GLTF/Roof_Radar', 'roof-radar', ['roof']),
  q('Environment/GLTF/Roof_Opening', 'roof-opening', ['roof']),
  q('Environment/GLTF/SolarPanel_Ground', 'solar-ground', ['power']),
  q('Environment/GLTF/SolarPanel_Structure', 'solar-array', ['power']),
  k('hangar_largeA', 'hangar-large', ['hangar']),
  k('hangar_roundA', 'hangar-round', ['hangar']),
  k('hangar_roundGlass', 'hangar-glass', ['hangar', 'dome']),
  k('hangar_smallA', 'hangar-small', ['hangar']),
  k('gate_complex', 'gate', ['gate']),
  k('satelliteDish_large', 'dish-large', ['mast']),
  k('satelliteDish_detailed', 'dish', ['mast']),
  k('machine_generatorLarge', 'generator', ['power']),
  k('machine_wireless', 'beacon', ['mast']),
  k('structure_detailed', 'scaffold', ['frame']),
];

/** What can be taken: rovers on the ground, ships for the sky. */
export const CRAFT: StaticEntry[] = [
  q('Vehicles/GLTF/Rover_1', 'rover', ['ground']),
  q('Vehicles/GLTF/Rover_2', 'rover-cab', ['ground']),
  q('Vehicles/GLTF/Rover_Round', 'rover-round', ['ground']),
  q('Vehicles/GLTF/Spaceship_BarbaraTheBee', 'ship-bee', ['air']),
  q('Vehicles/GLTF/Spaceship_FernandoTheFlamingo', 'ship-flamingo', ['air']),
  q('Vehicles/GLTF/Spaceship_FinnTheFrog', 'ship-frog', ['air']),
  q('Vehicles/GLTF/Spaceship_RaeTheRedPanda', 'ship-panda', ['air']),
  k('rover', 'buggy', ['ground']),
  k('craft_speederA', 'speeder-a', ['air', 'hover']),
  k('craft_speederB', 'speeder-b', ['air', 'hover']),
  k('craft_speederD', 'speeder-d', ['air', 'hover']),
  k('craft_racer', 'racer', ['air']),
  k('craft_miner', 'miner', ['air', 'heavy']),
  k('craft_cargoA', 'cargo-a', ['air', 'heavy']),
  k('craft_cargoB', 'cargo-b', ['air', 'heavy']),
];

/** Rocks, crystals and the colony's clutter. */
export const PROPS: StaticEntry[] = [
  ...['Rock_1', 'Rock_2', 'Rock_3', 'Rock_4'].map((n, i) => q(`Environment/GLTF/${n}`, `rock-${i + 1}`, ['rock'])),
  ...['Rock_Large_1', 'Rock_Large_2', 'Rock_Large_3'].map((n, i) => q(`Environment/GLTF/${n}`, `rock-large-${i + 1}`, ['rock', 'large'])),
  k('rock_crystals', 'crystals', ['crystal']),
  k('rock_crystalsLargeA', 'crystals-large-a', ['crystal', 'large']),
  k('rock_crystalsLargeB', 'crystals-large-b', ['crystal', 'large']),
  k('meteor_detailed', 'meteor', ['rock', 'meteor']),
  k('meteor_half', 'meteor-half', ['rock', 'meteor']),
  k('craterLarge', 'crater-large', ['crater']),
  k('crater', 'crater', ['crater']),
  k('bones', 'bones', ['remains']),
  k('barrels', 'barrels', ['clutter']),
  k('machine_barrel', 'tank', ['clutter']),
  q('Items/GLTF/Pickup_Crate', 'crate', ['clutter']),
  q('Items/GLTF/Pickup_Jar', 'jar', ['clutter']),
];

/** Alien plants: the space kit's trees, bushes and grass. */
export const FLORA: StaticEntry[] = [
  ...['Blob_3', 'Floating_1', 'Lava_1', 'Lava_2', 'Lava_3', 'Light_1', 'Light_2', 'Spikes_1', 'Spikes_2', 'Spiral_1', 'Spiral_2', 'Spiral_3', 'Swirl_1', 'Swirl_2'].map((n) =>
    q(`Environment/GLTF/Tree_${n}`, `tree-${n.toLowerCase().replace('_', '-')}`, ['tree', n.split('_')[0]!.toLowerCase()]),
  ),
  ...['Bush_1', 'Bush_2', 'Bush_3', 'Plant_1', 'Plant_2', 'Plant_3', 'Grass_1', 'Grass_2', 'Grass_3'].map((n) =>
    q(`Environment/GLTF/${n}`, n.toLowerCase().replace('_', '-'), [n.split('_')[0]!.toLowerCase()]),
  ),
];

/** A ship's bridge: the Space Station Kit, and the Space Kit's desk seats. */
export const INTERIOR: StaticEntry[] = [
  ...['floor', 'floor-detail', 'floor-corner', 'floor-panel', 'floor-panel-straight', 'floor-panel-end', 'floor-panel-corner'].map((n) => st(n, ['floor'])),
  ...['wall', 'wall-detail', 'wall-banner', 'wall-corner', 'wall-corner-round', 'wall-pillar', 'wall-switch'].map((n) => st(n, ['wall'])),
  ...['wall-window', 'wall-window-frame', 'wall-window-banner', 'wall-window-shutters'].map((n) => st(n, ['wall', 'window'])),
  ...['wall-door', 'wall-door-wide', 'door-double', 'door-single'].map((n) => st(n, ['wall', 'door'])),
  ...['computer', 'computer-screen', 'computer-system', 'computer-wide', 'display-wall', 'display-wall-wide'].map((n) => st(n, ['console'])),
  ...['table-display', 'table-display-planet', 'table-display-small', 'table', 'table-inset'].map((n) => st(n, ['table'])),
  ...['chair', 'chair-headrest', 'chair-armrest', 'chair-armrest-headrest', 'chair-cushion-headrest'].map((n) => st(n, ['seat'])),
  ...['container', 'container-tall', 'container-wide', 'pipe', 'pipe-bend', 'pipe-ring-colored', 'structure-panel', 'rail', 'stairs', 'stairs-handrail'].map((n) => st(n, ['fitting'])),
  k('desk_chairArms', 'desk-chair', ['seat']),
  k('desk_computerCorner', 'desk-console-corner', ['console']),
  k('desk_computerScreen', 'desk-console', ['console']),
];

/** `crew` are the astronauts; `walker`, `blob` and `flyer` the aliens, by how they move. */
export type CreatureKind = 'crew' | 'walker' | 'blob' | 'flyer';

export interface RigEntry {
  id: string;
  source: string;
  kind: CreatureKind;
  clips: RegExp;
  tags?: string[];
}

const BIG_CLIPS = /^(Idle|Walk|Run|Wave|Yes|No|Jump)$/;
const BLOB_CLIPS = /^(Idle|Walk|Dance|Yes|No|Jump)$/;
const FLY_CLIPS = /^(Flying_Idle|Fast_Flying|Yes|No)$/;
const CREW_CLIPS = /^(Idle|Walk|Run|Wave|Yes|No|Jump|Jump_Idle|Jump_Land)$/;

const big = (name: string, tags: string[] = []): RigEntry => ({ id: name.toLowerCase(), source: `${Q_MONSTERS}Big/glTF/${name}.gltf`, kind: 'walker', clips: BIG_CLIPS, tags });
const blob = (name: string, tags: string[] = []): RigEntry => ({ id: name.toLowerCase().replace('_', '-'), source: `${Q_MONSTERS}Blob/glTF/${name}.gltf`, kind: 'blob', clips: BLOB_CLIPS, tags });
const flyer = (name: string, tags: string[] = []): RigEntry => ({ id: name.toLowerCase(), source: `${Q_MONSTERS}Flying/glTF/${name}.gltf`, kind: 'flyer', clips: FLY_CLIPS, tags });

/**
 * The creatures. Chosen for shapes that read as another world's people and
 * not as Earth's fantasy: no orcs, ninjas, demons, wizards or skulls, which
 * the same packs carry.
 */
export const CREATURES: RigEntry[] = [
  ...['BarbaraTheBee', 'FernandoTheFlamingo', 'FinnTheFrog', 'RaeTheRedPanda'].map(
    (name): RigEntry => ({ id: `astronaut-${name.replace(/^(\w+?)The/, '').toLowerCase()}`, source: `${Q_SPACE}Characters/GLTF/Astronaut_${name}.gltf`, kind: 'crew', clips: CREW_CLIPS }),
  ),
  { id: 'greyling', source: `${Q_SPACE}Characters/GLTF/Enemy_Large.gltf`, kind: 'walker', clips: BIG_CLIPS, tags: ['alien'] },
  { id: 'drifter', source: `${Q_SPACE}Characters/GLTF/Enemy_Flying.gltf`, kind: 'flyer', clips: FLY_CLIPS, tags: ['alien'] },
  big('Alien', ['alien']),
  big('Cactoro', ['desert']),
  big('MushroomKing', ['fungus']),
  big('Fish', ['water']),
  big('Frog', ['water']),
  big('Birb', ['feathered']),
  big('Monkroose', ['furred']),
  big('Yeti', ['ice']),
  blob('GreenBlob', ['slime']),
  blob('PinkBlob', ['slime']),
  blob('Mushnub', ['fungus']),
  flyer('Squidle', ['tentacled']),
  flyer('Glub', ['water']),
  flyer('Hywirl', ['wind']),
];
