/**
 * What the kit bake converts: each pack model by the id the world asks for,
 * grouped by output file. Sources are under ../.cache/assets/.
 */

const KENNEY_CARS = 'kenney/car-kit/Models/GLB format/';
const KENNEY_BOATS = 'kenney/watercraft-kit/Models/GLB format/';
const Q_TRANSPORT = 'quaternius/public-transport/';
const UAA = 'quaternius/ultimate-animated-animals/glTF/';
const FARM = 'quaternius/farm-animals/FBX/';

export interface StaticEntry {
  /** What the traffic parts ask for. */
  id: string;
  source: string;
  /** Radians about Y that turn the pack's model to face +Z. */
  yaw?: number;
  /** Mesh names that are wheels, to be rebuilt as a tyre and a hub. */
  wheels?: RegExp;
  /**
   * The atlas's swatch grid, columns by rows, when its swatches are gradients:
   * reads are snapped to each swatch's middle so a large wall is one colour.
   */
  grid?: [number, number];
}

export const TRAFFIC: StaticEntry[] = [
  { id: 'hatchback-sports', source: `${KENNEY_CARS}hatchback-sports.glb`, wheels: /^wheel/ },
  { id: 'sedan', source: `${KENNEY_CARS}sedan.glb`, wheels: /^wheel/ },
  { id: 'sedan-sports', source: `${KENNEY_CARS}sedan-sports.glb`, wheels: /^wheel/ },
  { id: 'taxi', source: `${KENNEY_CARS}taxi.glb`, wheels: /^wheel/ },
  { id: 'suv', source: `${KENNEY_CARS}suv.glb`, wheels: /^wheel/ },
  { id: 'suv-luxury', source: `${KENNEY_CARS}suv-luxury.glb`, wheels: /^wheel/ },
  { id: 'van', source: `${KENNEY_CARS}van.glb`, wheels: /^wheel/ },
  { id: 'delivery-flat', source: `${KENNEY_CARS}delivery-flat.glb`, wheels: /^wheel/ },
  { id: 'truck', source: `${KENNEY_CARS}truck.glb`, wheels: /^wheel/ },
  { id: 'truck-flat', source: `${KENNEY_CARS}truck-flat.glb`, wheels: /^wheel/ },
  { id: 'tractor', source: `${KENNEY_CARS}tractor.glb`, wheels: /^wheel/ },
  // Quaternius draws both buses nose to -X; a quarter turn left faces them +Z.
  { id: 'bus', source: `${Q_TRANSPORT}FBX/Bus.fbx`, yaw: Math.PI / 2 },
  { id: 'school-bus', source: `${Q_TRANSPORT}FBX/SchoolBus.fbx`, yaw: Math.PI / 2 },
  { id: 'ambulance', source: `${Q_TRANSPORT}FBX/Ambulance.fbx` },
  { id: 'bicycle', source: `${Q_TRANSPORT}OBJ/SquareFrameBicycle.obj`, yaw: Math.PI },
  { id: 'boat-row-small', source: `${KENNEY_BOATS}boat-row-small.glb` },
  { id: 'boat-row-large', source: `${KENNEY_BOATS}boat-row-large.glb` },
  { id: 'boat-sail-a', source: `${KENNEY_BOATS}boat-sail-a.glb` },
  { id: 'boat-sail-b', source: `${KENNEY_BOATS}boat-sail-b.glb` },
  { id: 'boat-fishing-small', source: `${KENNEY_BOATS}boat-fishing-small.glb` },
  { id: 'boat-tug-a', source: `${KENNEY_BOATS}boat-tug-a.glb` },
];

/** Rolling stock from Kenney's Train Kit, facing +Z; `railway.ts` builds trains from these ids. */
const KENNEY_TRAINS = 'kenney/train-kit/Models/GLB format/';
export const RAIL: StaticEntry[] = [
  { id: 'bullet-front', source: `${KENNEY_TRAINS}train-electric-bullet-a.glb` },
  { id: 'bullet-car', source: `${KENNEY_TRAINS}train-electric-bullet-b.glb` },
  { id: 'city-front', source: `${KENNEY_TRAINS}train-electric-city-a.glb` },
  { id: 'city-car', source: `${KENNEY_TRAINS}train-electric-city-b.glb` },
  { id: 'diesel', source: `${KENNEY_TRAINS}train-diesel-a.glb` },
  { id: 'diesel-hood', source: `${KENNEY_TRAINS}train-diesel-b.glb` },
  { id: 'steam', source: `${KENNEY_TRAINS}train-locomotive-a.glb` },
  { id: 'coach', source: `${KENNEY_TRAINS}train-locomotive-passenger-a.glb` },
  { id: 'coach-b', source: `${KENNEY_TRAINS}train-locomotive-passenger-b.glb` },
  { id: 'wagon-box', source: `${KENNEY_TRAINS}train-carriage-box.glb` },
  { id: 'wagon-container-red', source: `${KENNEY_TRAINS}train-carriage-container-red.glb` },
  { id: 'wagon-container-blue', source: `${KENNEY_TRAINS}train-carriage-container-blue.glb` },
  { id: 'wagon-container-green', source: `${KENNEY_TRAINS}train-carriage-container-green.glb` },
  { id: 'wagon-tank', source: `${KENNEY_TRAINS}train-carriage-tank.glb` },
  { id: 'wagon-lumber', source: `${KENNEY_TRAINS}train-carriage-lumber.glb` },
  { id: 'wagon-coal', source: `${KENNEY_TRAINS}train-carriage-coal.glb` },
];

const KENNEY_NATURE = 'kenney/nature-kit/Models/GLTF format/';
const KAYKIT_FOREST = 'kaykit/forest-nature-pack/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf/';

/**
 * The flora, from Kenney's Nature Kit: flat colours and 16 to 230 triangles a
 * model, light enough for fields of thousands of plants.
 */
export const NATURE: StaticEntry[] = [
  ...['tree_oak', 'tree_default', 'tree_fat', 'tree_tall', 'tree_simple'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundC', 'tree_pineDefaultA', 'tree_pineSmallA'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['tree_palmTall', 'tree_palm', 'tree_palmBend', 'tree_plateau', 'tree_cone'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['cactus_tall', 'cactus_short', 'plant_bushLarge', 'plant_bush', 'plant_bushDetailed'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['stone_largeA', 'stone_largeB', 'stone_largeC', 'stone_largeD', 'grass_leafs', 'plant_flatTall', 'plant_flatShort', 'flower_redA', 'flower_yellowA'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['flower_purpleA', 'flower_redC', 'flower_yellowC'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  // KayKit's grass clumps. Unused at runtime (`grass.ts` draws the grass);
  // dropping them is a re-bake of the nature kit.
  ...['1_A', '1_B', '1_C', '2_A', '2_B', '2_C'].map((name) => ({ id: `grass-${name.replace('_', '-').toLowerCase()}`, source: `${KAYKIT_FOREST}Grass_${name}_Singlesided_Color1.gltf` })),
];

const KENNEY_SUBURBAN = 'kenney/city-kit-suburban/Models/GLB format/';
const KENNEY_COMMERCIAL = 'kenney/city-kit-commercial/Models/GLB format/';
const KENNEY_ROADS = 'kenney/city-kit-roads/Models/GLB format/';
/** Both City Kits' `colormap.png`: 16 swatches by 4, each 32 by 128 pixels. */
const CITY_GRID: [number, number] = [16, 4];

/**
 * Near-town buildings from Kenney's City Kits: suburban houses, commercial
 * blocks, towers. The heaviest models are left out (houses stay under 1,650
 * triangles, blocks under 1,900).
 */
export const BUILDINGS: StaticEntry[] = [
  ...['a', 'c', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 'u'].map((t) => ({ id: `suburban-${t}`, source: `${KENNEY_SUBURBAN}building-type-${t}.glb`, grid: CITY_GRID })),
  ...['a', 'b', 'c', 'd', 'e', 'f', 'h'].map((t) => ({ id: `commercial-${t}`, source: `${KENNEY_COMMERCIAL}building-${t}.glb`, grid: CITY_GRID })),
  ...['a', 'b', 'c', 'd', 'e'].map((t) => ({ id: `skyscraper-${t}`, source: `${KENNEY_COMMERCIAL}building-skyscraper-${t}.glb`, grid: CITY_GRID })),
  // Street furniture, from Kenney's City Kit (Roads).
  { id: 'lamp-curved', source: `${KENNEY_ROADS}light-curved.glb` },
  { id: 'lamp-square', source: `${KENNEY_ROADS}light-square.glb` },
  { id: 'traffic-light', source: `${KENNEY_ROADS}traffic-light.glb` },
  // Props on a near town's building line (`scenery/street-dressing.ts`).
  { id: 'prop-planter', source: `${KENNEY_SUBURBAN}planter.glb`, grid: CITY_GRID },
  { id: 'prop-hydrant', source: 'kaykit/city-builder-bits/gltf/firehydrant.gltf' },
  // CreativeTrio's clapboard church (Poly Pizza, CC0, https://poly.pizza/m/GHzPfvoyzX),
  // coloured through a JPEG palette in the GLB (`decodeJpeg`).
  { id: 'church-clapboard', source: 'polypizza/church-creativetrio/church-creativetrio.glb' },
];

export interface RigEntry {
  id: string;
  source: string;
  /** The clips the world plays; the rest of the pack's are fights and deaths. */
  clips: RegExp;
  /** A hump grown on `bone`, as shares of the animal's length and width, in material `slot` (`addHump`). */
  hump?: { bone: string; slot: string; length: number; height: number; width: number };
}

export const FAUNA: RigEntry[] = [
  { id: 'cow', source: `${UAA}Cow.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'bull', source: `${UAA}Bull.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  // The horse also keeps its gallop and jumps, for riding (`craft/horse.ts`).
  { id: 'horse', source: `${UAA}Horse.gltf`, clips: /^(Eating|Idle|Walk|Gallop|Gallop_Jump|Jump_toIdle)$/ },
  { id: 'donkey', source: `${UAA}Donkey.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'alpaca', source: `${UAA}Alpaca.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'stag', source: `${UAA}Stag.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  // No CC0 camel exists in this style, so the camel is the horse with a hump.
  { id: 'camel', source: `${UAA}Horse.gltf`, clips: /^(Eating|Idle|Walk)$/, hump: { bone: 'Torso2', slot: 'Main', length: 0.38, height: 0.13, width: 0.72 } },
  { id: 'sheep', source: `${FARM}Sheep.fbx`, clips: /Idle$/ },
  // A town's dog, walked on a lead by a stroller (`folk/dogs.ts`); no herd keeps one.
  { id: 'dog', source: `${UAA}ShibaInu.gltf`, clips: /^(Idle|Walk|Eating)$/ },
];
