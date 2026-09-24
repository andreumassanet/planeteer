import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { MonumentContext } from '../monuments/contract.ts';
import { bodyPaint, makeRigged, modelFrom, modelMaterial, onPalette, paintModel, rigFrom } from '../models.ts';
import type { Model, Paint } from '../models.ts';
import { PALETTE } from '../theme.ts';
import { createSceneryContext } from '../scenery/contract.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { buildVariant as buildPart } from '../scenery/index.ts';
import { REGIONS } from '../scenery/regions.ts';
import { measure } from '../monuments/contract.ts';
import { buildVariant as buildVehicle, placedScale, createTrafficContext, vehicle as vehicleById } from '../traffic/index.ts';
import { isGlass as vehicleGlass } from '../traffic/contract.ts';
import { registerSceneryModels as registerVehicleModels, sceneryModel as vehicleModel } from '../scenery/contract.ts';
import { loadModels, loadRig } from '../kit.ts';
import { createFolk } from '../folk.ts';
import { castMaterial, loadCast } from '../cast.ts';
import { RIDER_HEIGHT } from '../traffic/contract.ts';
import { SEAT_SHIN, SEAT_THIGH } from '../avatar.ts';
import { TRAFFIC_STYLES } from '../traffic/regions.ts';
import { buildVariant as buildAnimal, animal as animalById } from '../fauna/index.ts';
import { createFaunaContext } from '../fauna/contract.ts';
import { FAUNA_STYLES } from '../fauna/regions.ts';

/**
 * What the lab compares. Each set is a list of cells; a cell builds one object
 * standing on y = 0 at the world's scale.
 */

export interface LabShared {
  ctx: MonumentContext;
  gradientMap: THREE.Texture;
  ink: { thickness: number; color: [number, number, number] };
}

export interface LabCell {
  label: string;
  note?: string;
  /** Starts a new row with this heading. */
  heading?: string;
  /** What the world draws today: a dashed frame. */
  current?: boolean;
  hero?: boolean;
  /** Stand the scale figure in front of the middle rather than at the end. */
  heroFront?: boolean;
  zoom?: number;
  az?: number;
  stats?: string;
  build(shared: LabShared): Promise<{ object: THREE.Object3D; mixer?: THREE.AnimationMixer; stats?: string }>;
}

export interface LabSet {
  note: string;
  cells(shared: LabShared): Promise<LabCell[]>;
}

/** Where `scripts/lab.vite.mjs` serves `../.cache/assets` from. */
export const LAB = '/lab-assets/';

const scenery = createSceneryContext();
const traffic = createTrafficContext(scenery);
const fauna = createFaunaContext(scenery);

/** A code-built vehicle at its placed scale, as the world parks it. */
export function currentVehicle(id: string, region = 'atlantic-europe', variant = 0): LabCell {
  return {
    label: `${id} (code)`,
    note: region,
    current: true,
    async build() {
      const style = TRAFFIC_STYLES[region as keyof typeof TRAFFIC_STYLES];
      const group = buildVehicle(id, traffic, style, variant);
      const [x, y, z] = placedScale(vehicleById(id)!);
      const holder = new THREE.Group();
      holder.scale.set(x, y, z);
      holder.add(group);
      return { object: holder };
    },
  };
}

/** A code-built animal, standing. */
export function currentAnimal(id: string, region = 'atlantic-europe', variant = 0): LabCell {
  return {
    label: `${id} (code)`,
    note: region,
    current: true,
    async build() {
      const style = FAUNA_STYLES[region as keyof typeof FAUNA_STYLES];
      return { object: buildAnimal(id, fauna, style, variant) };
    },
  };
}

export { animalById, vehicleById };

/**
 * A static pack model, painted, scaled so that its longest horizontal side is
 * `length` world units (or its height is `height`), feet on y = 0, facing +Z.
 */
export function staticModel(
  label: string,
  url: string,
  fit: Fit,
  options: { note?: string; paint?: Paint | ((model: Model) => Paint); heading?: string; zoom?: number } = {},
): LabCell {
  return {
    label,
    note: options.note,
    heading: options.heading,
    zoom: options.zoom,
    async build(shared) {
      const loaded = await loadObject(LAB + url);
      const model = modelFrom(loaded.scene, label);
      const registry = ((window as unknown as { labSlots?: Record<string, string[]> }).labSlots ??= {});
      registry[label] = model.slots.map((slot, i) => `${slot}=${model.defaults[i]!.getHexString(THREE.SRGBColorSpace)}`);
      const paint = options.paint === undefined ? undefined : options.paint.length === 1 ? (options.paint as (m: Model) => Paint)(model) : (options.paint as Paint);
      const mesh = new THREE.Mesh(paintModel(model, paint), modelMaterial(shared.gradientMap, shared.ink));
      mesh.castShadow = true;
      return { object: fitted(mesh, model.box, fit) };
    },
  };
}

const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

/**
 * Blender writes an MTL's `Kd` in linear light and `MTLLoader` reads it as sRGB,
 * so every Quaternius OBJ came out a stop and a half too dark.
 */
function linearKd(scene: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(material)) continue;
      seen.add(material);
      (material as THREE.MeshPhongMaterial).color?.convertLinearToSRGB();
    }
  });
}

/** Any of the formats the packs ship: glTF, OBJ with its MTL beside it, FBX. */
export async function loadObject(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const lower = url.toLowerCase();
  if (lower.endsWith('.gltf') || lower.endsWith('.glb')) {
    const gltf = await gltfLoader.loadAsync(url);
    return { scene: gltf.scene, animations: gltf.animations };
  }
  if (lower.endsWith('.fbx')) {
    const group = await fbxLoader.loadAsync(url);
    return { scene: group, animations: group.animations };
  }
  if (lower.endsWith('.obj')) {
    const mtl = url.replace(/\.obj$/i, '.mtl');
    const objLoader = new OBJLoader();
    try {
      const materials = await new MTLLoader().loadAsync(mtl);
      materials.preload();
      objLoader.setMaterials(materials);
    } catch {
      // No MTL: every face white, which the lab will show.
    }
    const scene = await objLoader.loadAsync(url);
    linearKd(scene);
    return { scene, animations: [] };
  }
  throw new Error(`lab: no loader for ${url}`);
}

/** How a model is sized and turned into the kit's frame: feet on y = 0, facing +Z. */
export interface Fit {
  length?: number;
  height?: number;
  yaw?: number;
}

function fitted(object: THREE.Object3D, box: THREE.Box3, fit: Fit): THREE.Group {
  const size = box.getSize(new THREE.Vector3());
  // A vehicle or an animal is always longer than it is wide, so the length is
  // the longer plan side whichever way the pack authored it.
  const k = fit.height !== undefined ? fit.height / size.y : (fit.length ?? 10) / Math.max(size.x, size.z, 1e-6);
  object.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const inner = new THREE.Group();
  inner.rotation.y = fit.yaw ?? 0;
  inner.add(object);
  const holder = new THREE.Group();
  holder.scale.setScalar(k);
  holder.add(inner);
  return holder;
}

/**
 * An animated pack model through the world's own pipeline — merged, painted,
 * creased and inked like the cast — playing one clip.
 */
export function animatedModel(
  label: string,
  url: string,
  fit: Fit,
  options: { note?: string; clip?: RegExp; heading?: string; paint?: Paint } = {},
): LabCell {
  return {
    label,
    note: options.note,
    heading: options.heading,
    async build(shared) {
      const loaded = await loadObject(LAB + url);
      const rig = rigFrom(loaded.scene, loaded.animations, label, modelMaterial(shared.gradientMap, shared.ink));
      const made = makeRigged(rig, options.paint);
      const clip = rig.clips.find((a) => (options.clip ?? /^eat|graz/i).test(a.name)) ?? rig.clips[0];
      if (clip) made.actions.get(clip.name)!.play();
      return { object: fitted(made.root, rig.box, fit), mixer: made.mixer, stats: `${rig.triangles} tris skinned · ${clip?.name ?? 'no clip'}` };
    },
  };
}

/** The length a vehicle is placed at, which is what a candidate is sized to. */
const placedLength = (id: string): number => {
  const entry = vehicleById(id)!;
  return entry.size[0] * placedScale(entry)[2];
};

const Q = 'quaternius/';
const K = 'kenney/';
const KC = `${K}car-kit/Models/GLB format/`;
const KW = `${K}watercraft-kit/Models/GLB format/`;
const UAA = `${Q}ultimate-animated-animals/glTF/`;
const FARM = `${Q}farm-animals/FBX/`;

/** A row: what the world has, then what might replace it, all at the same length. */
function vehicleRow(heading: string, current: string[], candidates: [string, string, number?][], length = placedLength(current[0]!)): LabCell[] {
  const cells: LabCell[] = current.map((id) => currentVehicle(id));
  cells[0]!.heading = heading;
  for (const [label, url, yaw] of candidates) cells.push(staticModel(label, url, { length, yaw: yaw ?? 0 }));
  return cells;
}

function animalRow(heading: string, current: string | null, candidates: [string, string, number?][], length: number): LabCell[] {
  const cells: LabCell[] = current ? [currentAnimal(current)] : [];
  for (const [label, url, yaw] of candidates) cells.push(animatedModel(label, url, { length, yaw: yaw ?? 0 }));
  cells[0]!.heading = heading;
  return cells;
}

/** Glass, by name or by being a pale sky-coloured swatch. */
const isGlass = (slot: string, c: THREE.Color): boolean => {
  if (/window|glass/i.test(slot)) return true;
  const hsl = { h: 0, s: 0, l: 0 };
  c.clone().convertLinearToSRGB().getHSL(hsl);
  return hsl.h > 0.52 && hsl.h < 0.64 && hsl.l > 0.72 && hsl.s > 0.4;
};
const painted = (body: number) => (model: Model): Paint => bodyPaint(model, body, isGlass);
const snapped: Paint = (_slot, original) => onPalette(original);

/** Several cells' objects in one row along X, spaced by their own widths, for a street. */
function street(label: string, members: LabCell[], note = ''): LabCell {
  return {
    label,
    note,
    hero: true,
    heroFront: true,
    zoom: 0.62,
    az: -0.35,
    async build(shared) {
      const row = new THREE.Group();
      let x = 0;
      const mixers: THREE.AnimationMixer[] = [];
      for (const member of members) {
        const made = await member.build(shared);
        const box = new THREE.Box3().setFromObject(made.object, true);
        const width = box.max.x - box.min.x;
        made.object.position.x = x - box.min.x;
        x += width + 3;
        row.add(made.object);
        if (made.mixer) mixers.push(made.mixer);
      }
      row.position.x = -x / 2;
      const holder = new THREE.Group();
      holder.add(row);
      const mixer = mixers[0];
      return { object: holder, mixer };
    },
  };
}

export const SETS: Record<string, LabSet> = {
  smoke: {
    note: 'The lab itself: a code-built hatchback and cow, to check the framing.',
    async cells() {
      return [currentVehicle('hatchback'), currentAnimal('cattle')];
    },
  },

  vehicles: {
    note: 'Road vehicles and boats: the code-built kit (dashed) against Quaternius (Q) and Kenney (K), each sized to the placed length of the vehicle it would replace.',
    async cells() {
      return [
        ...vehicleRow('hatchback · saloon', ['hatchback', 'saloon-car'], [
          ['Q NormalCar1', `${Q}cars/OBJ/NormalCar1.obj`],
          ['Q NormalCar2', `${Q}cars/OBJ/NormalCar2.obj`],
          ['Q Taxi', `${Q}cars/OBJ/Taxi.obj`],
          ['K hatchback-sports', `${KC}hatchback-sports.glb`],
          ['K sedan', `${KC}sedan.glb`],
          ['K taxi', `${KC}taxi.glb`],
        ]),
        ...vehicleRow('SUV', ['boxy-suv'], [
          ['Q SUV', `${Q}cars/OBJ/SUV.obj`],
          ['K suv', `${KC}suv.glb`],
        ]),
        ...vehicleRow('van · minibus · pickup · truck', ['panel-van', 'minibus', 'pickup-truck', 'box-truck'], [
          ['K van', `${KC}van.glb`],
          ['K delivery', `${KC}delivery.glb`],
          ['K truck', `${KC}truck.glb`],
          ['K truck-flat', `${KC}truck-flat.glb`],
          ['Q Ambulance', `${Q}public-transport/OBJ/Ambulance.obj`],
        ]),
        ...vehicleRow('bus', ['city-bus'], [
          ['Q Bus (FBX)', `${Q}public-transport/FBX/Bus.fbx`],
          ['Q SchoolBus (FBX)', `${Q}public-transport/FBX/SchoolBus.fbx`],
          ['Q Ambulance (FBX)', `${Q}public-transport/FBX/Ambulance.fbx`],
          ['Q Bus (OBJ, yawed)', `${Q}public-transport/OBJ/Bus.obj`, Math.PI / 2],
        ]),
        ...vehicleRow('tractor', ['farm-tractor'], [['K tractor', `${KC}tractor.glb`]]),
        ...vehicleRow('bicycle · scooter', ['bicycle', 'scooter'], [
          ['Q Bicycle', `${Q}public-transport/OBJ/Bicycle.obj`],
          ['Q SquareFrameBicycle', `${Q}public-transport/OBJ/SquareFrameBicycle.obj`],
        ]),
        ...vehicleRow('boats', ['rowing-boat', 'sailing-dinghy', 'fishing-boat'], [
          ['Q Boat', `${Q}ships/OBJ/Boat.obj`],
          ['Q BoatWSail', `${Q}ships/OBJ/BoatWSail.obj`],
          ['Q Lifeboat (FBX)', `${Q}ships/FBX/Lifeboat.fbx`],
          ['K boat-row-small', `${KW}boat-row-small.glb`],
          ['K boat-sail-a', `${KW}boat-sail-a.glb`],
          ['K boat-fishing-small', `${KW}boat-fishing-small.glb`],
        ]),
      ];
    },
  },

  finalists: {
    note: 'The two vehicle families closer, as shipped and on the palette (body paint from TrafficStyle, glass slate at GLASS_TONE, the rest snapped to the nearest palette colour).',
    async cells() {
      const cars: [string, string, string, number][] = [
        ['Q NormalCar1', `${Q}cars/OBJ/NormalCar1.obj`, 'hatchback', PALETTE.crimson],
        ['Q SUV', `${Q}cars/OBJ/SUV.obj`, 'boxy-suv', PALETTE.bone],
        ['K sedan', `${KC}sedan.glb`, 'saloon-car', PALETTE.skyBlue],
        ['K van', `${KC}van.glb`, 'panel-van', PALETTE.white],
      ];
      const cells: LabCell[] = [];
      for (const [label, url, id, body] of cars) {
        const length = placedLength(id);
        cells.push({ ...staticModel(`${label} · shipped`, url, { length }, { zoom: 0.7 }), heading: cells.length === 0 ? 'cars' : undefined });
        cells.push(staticModel(`${label} · palette`, url, { length }, { paint: painted(body), zoom: 0.7 }));
      }
      cells.push({ ...staticModel('Q Bus (FBX) · palette', `${Q}public-transport/FBX/Bus.fbx`, { length: placedLength('city-bus'), yaw: Math.PI / 2 }, { paint: painted(PALETTE.gold), zoom: 0.8 }), heading: 'bus · boats' });
      cells.push(staticModel('K boat-fishing-small · palette', `${KW}boat-fishing-small.glb`, { length: placedLength('fishing-boat') }, { paint: snapped, zoom: 0.8 }));
      cells.push(staticModel('Q BoatWSail · palette', `${Q}ships/OBJ/BoatWSail.obj`, { length: placedLength('sailing-dinghy') }, { paint: snapped, zoom: 0.8 }));
      return cells;
    },
  },

  kit: {
    note: 'Every baked vehicle (scripts/build-kit.ts) at yaw 0, painted on the palette. The camera is off the front right: every nose should face it.',
    async cells() {
      registerVehicleModels(await loadModels('traffic/kit.bin'));
      const ids = ['hatchback-sports', 'sedan', 'sedan-sports', 'taxi', 'suv', 'suv-luxury', 'van', 'delivery', 'delivery-flat', 'truck', 'truck-flat', 'tractor', 'bus', 'school-bus', 'ambulance', 'bicycle', 'boat-row-small', 'boat-row-large', 'boat-sail-a', 'boat-sail-b', 'boat-fishing-small', 'boat-tug-a'];
      const bodies = [PALETTE.crimson, PALETTE.skyBlue, PALETTE.gold, PALETTE.white, PALETTE.green, PALETTE.orange];
      return ids.map((id, i): LabCell => ({
        label: id,
        zoom: 0.8,
        async build() {
          const model = vehicleModel(id);
          const group = traffic.vehicle(id, { width: 4.5 }, bodyPaint(model, bodies[i % bodies.length]!, vehicleGlass));
          // A marker where +Z leaves the model, so a reversed nose is obvious.
          const box = new THREE.Box3().setFromObject(group);
          const marker = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2, 8).rotateX(Math.PI / 2), scenery.toon(PALETTE.violet));
          marker.position.set(0, 0.6, box.max.z + 1.5);
          group.add(marker);
          return { object: group, stats: `${model.slots.length} slots` };
        },
      }));
    },
  },

  riders: {
    note: 'Riders from the cast, held seated and baked into the vehicle, at the placed scale.',
    async cells(shared) {
      registerVehicleModels(await loadModels('traffic/kit.bin'));
      const folk = createFolk(shared.ctx);
      while (!folk.ready) await new Promise((resolve) => setTimeout(resolve, 50));
      const ids = ['bicycle', 'rowing-boat', 'scooter', 'auto-rickshaw'];
      const cells: LabCell[] = [];
      for (const id of ids) {
        for (const region of ['atlantic-europe', 'south-asia']) {
          cells.push({
            label: `${id} · ${region}`,
            zoom: 0.55,
            async build() {
              const entry = vehicleById(id)!;
              const style = TRAFFIC_STYLES[region as keyof typeof TRAFFIC_STYLES];
              const group = buildVehicle(id, traffic, style, 1);
              for (const [index, mount] of entry.mounts.entries()) {
                const astride = mount.pose === 'astride';
                const rider = folk.seated(`lab|${id}|${region}|${index}`, region, RIDER_HEIGHT, {
                  thigh: astride ? new THREE.Vector3(0, -0.8, 1).normalize() : SEAT_THIGH,
                  shin: SEAT_SHIN,
                  grip: mount.grip === undefined ? undefined : new THREE.Vector3(mount.grip[0] - mount.x, mount.grip[1] - mount.y, mount.grip[2] - mount.z),
                });
                if (rider === null) continue;
                rider.material = modelMaterial(shared.gradientMap, shared.ink);
                rider.position.set(mount.x, mount.y, mount.z);
                rider.rotation.y = mount.yaw;
                group.add(rider);
              }
              const [x, y, z] = placedScale(entry);
              const holder = new THREE.Group();
              holder.scale.set(x, y, z);
              holder.add(group);
              return { object: holder };
            },
          });
        }
      }
      return cells;
    },
  },

  camels: {
    note: 'The camel, which no CC0 pack has: the code-built one against a horse and an alpaca each grown a hump at bake time, in sand, playing Idle and Eating.',
    async cells(shared) {
      const baked = (id: string, clip: string): LabCell => ({
        label: `${id} · ${clip}`,
        async build() {
          const rig = await loadRig(id, modelMaterial(shared.gradientMap, shared.ink));
          const sand = (slot: string, original: THREE.Color) => (/^Main$|^Hair$/.test(slot) ? PALETTE.sand : /Light/.test(slot) ? PALETTE.cream : /Dark|Hooves|Muzzle/.test(slot) ? PALETTE.tan : onPalette(original));
          const made = makeRigged(rig, sand);
          made.actions.get(clip)?.play();
          const size = rig.box.getSize(new THREE.Vector3());
          const k = 12.15 / size.z;
          made.root.position.set(-(rig.box.min.x + rig.box.max.x) / 2, -rig.box.min.y, -(rig.box.min.z + rig.box.max.z) / 2);
          const holder = new THREE.Group();
          holder.scale.setScalar(k);
          holder.add(made.root);
          return { object: holder, mixer: made.mixer, stats: `${rig.triangles} tris` };
        },
      });
      return [
        { ...currentAnimal('camel', 'maghreb'), heading: 'camel' },
        baked('camel', 'Idle'),
        baked('camel', 'Eating'),
      ];
    },
  },

  nature: {
    note: 'Plants and rocks: the code-built part (dashed) against Quaternius Ultimate Nature (Q), Kenney Nature Kit (K) and KayKit Forest (KK), each at the height of the code part, on the palette as shipped.',
    async cells() {
      const QN = `${Q}ultimate-nature/OBJ/`;
      const KN = `${K}nature-kit/Models/GLTF format/`;
      const KK = 'kaykit/forest-nature-pack/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf/';
      const heights = new Map<string, number>();
      const code = (id: string, region: string, heading: string): LabCell => ({
        label: `${id} (code)`,
        note: region,
        current: true,
        heading,
        async build() {
          const group = buildPart(id, scenery, REGIONS[region as keyof typeof REGIONS], 0);
          heights.set(id, measure(group).height);
          return { object: group };
        },
      });
      const cand = (id: string, label: string, url: string): LabCell => ({
        label,
        async build(shared) {
          const cell = staticModel(label, url, { height: heights.get(id) ?? 10 }, { paint: snapped });
          return cell.build(shared);
        },
      });
      const row = (id: string, region: string, candidates: [string, string][]): LabCell[] => [
        code(id, region, id),
        ...candidates.map(([label, url]) => cand(id, label, url)),
      ];
      return [
        ...row('broadleaf-tree', 'atlantic-europe', [
          ['Q CommonTree_1', `${QN}CommonTree_1.obj`],
          ['Q BirchTree_2', `${QN}BirchTree_2.obj`],
          ['K tree_oak', `${KN}tree_oak.glb`],
          ['K tree_default', `${KN}tree_default.glb`],
          ['KK Tree_1_A', `${KK}Tree_1_A_Color1.gltf`],
        ]),
        ...row('conifer-tree', 'nordic', [
          ['Q PineTree_1', `${QN}PineTree_1.obj`],
          ['K tree_pineTallA', `${KN}tree_pineTallA.glb`],
          ['K tree_pineRoundC', `${KN}tree_pineRoundC.glb`],
          ['KK Tree_2_A', `${KK}Tree_2_A_Color1.gltf`],
        ]),
        ...row('palm-tree', 'southeast-asia', [
          ['Q PalmTree_1', `${QN}PalmTree_1.obj`],
          ['K tree_palmTall', `${KN}tree_palmTall.glb`],
          ['K tree_palmDetailedTall', `${KN}tree_palmDetailedTall.glb`],
        ]),
        ...row('acacia-tree', 'sub-saharan', [
          ['PP savanna tree', 'polypizza/tree-savanna-hat_my_guy/tree-savanna-hat_my_guy.glb'],
          ['K tree_plateau', `${KN}tree_plateau.glb`],
        ]),
        ...row('cypress-tree', 'mediterranean', [
          ['K tree_cone', `${KN}tree_cone.glb`],
          ['K tree_thin', `${KN}tree_thin.glb`],
          ['Q Willow_1', `${QN}Willow_1.obj`],
        ]),
        ...row('cactus', 'north-america', [
          ['Q Cactus_1', `${QN}Cactus_1.obj`],
          ['Q CactusFlowers_2', `${QN}CactusFlowers_2.obj`],
          ['K cactus_tall', `${KN}cactus_tall.glb`],
        ]),
        ...row('shrub', 'atlantic-europe', [
          ['Q Bush_1', `${QN}Bush_1.obj`],
          ['K plant_bushLarge', `${KN}plant_bushLarge.glb`],
          ['KK Bush_1_A', `${KK}Bush_1_A_Color1.gltf`],
        ]),
        ...row('boulder', 'nordic', [
          ['Q Rock_3', `${QN}Rock_3.obj`],
          ['K rock_largeA', `${KN}rock_largeA.glb`],
          ['KK Rock_1_A', `${KK}Rock_1_A_Color1.gltf`],
        ]),
        ...row('grass-tuft', 'atlantic-europe', [
          ['Q Grass', `${QN}Grass.obj`],
          ['K grass_large', `${KN}grass_large.glb`],
          ['KK Grass_1_A', `${KK}Grass_1_A_Color1.gltf`],
        ]),
      ];
    },
  },

  buildings: {
    note: 'Buildings: the code-built part in its region (dashed) against Kenney City Kits (K), Quaternius Ultimate Buildings, Medieval Village and Simple Buildings (Q), KayKit Medieval Hexagon (KK) and Poly Pizza CC0 (PP), each at the height of the code part. Rows with no candidate are the regions no CC0 pack in the style covers.',
    async cells() {
      const KS = `${K}city-kit-suburban/Models/GLB format/`;
      const KC2 = `${K}city-kit-commercial/Models/GLB format/`;
      const QU = `${Q}ultimate-buildings/OBJ/`;
      const QM = `${Q}medieval-village/Buildings/OBJ/`;
      const QS = `${Q}simple-buildings/OBJ/`;
      const KKM = 'kaykit/medieval-hexagon-pack/KayKit_Medieval_Hexagon_Pack_1.0_FREE/Assets/gltf/buildings/red/';
      const heights = new Map<string, number>();
      const code = (id: string, region: string, heading: string): LabCell => ({
        label: `${id} (code)`,
        note: region,
        current: true,
        heading,
        async build() {
          const group = buildPart(id, scenery, REGIONS[region as keyof typeof REGIONS], 1);
          heights.set(id, measure(group).height);
          return { object: group };
        },
      });
      const cand = (id: string, label: string, url: string): LabCell => ({
        label,
        async build(shared) {
          return staticModel(label, url, { height: heights.get(id) ?? 10 }, { paint: snapped }).build(shared);
        },
      });
      const row = (id: string, region: string, candidates: [string, string][]): LabCell[] => [
        code(id, region, `${id} · ${region}`),
        ...candidates.map(([label, url]) => cand(id, label, url)),
      ];
      return [
        ...row('gabled-house', 'atlantic-europe', [
          ['K suburban a', `${KS}building-type-a.glb`],
          ['K suburban g', `${KS}building-type-g.glb`],
          ['K suburban k', `${KS}building-type-k.glb`],
          ['Q medieval House_1', `${QM}House_1.obj`],
          ['KK home_A', `${KKM}building_home_A_red.gltf`],
          ['PP cottage', 'polypizza/cottage-creativetrio/cottage-creativetrio.glb'],
        ]),
        ...row('flat-roof-house', 'mediterranean', [
          ['Q ultimate 1Story', `${QU}1Story_Mat.obj`],
          ['Q ultimate 2Story', `${QU}2Story_Mat.obj`],
          ['Q ultimate 2Story_Balcony', `${QU}2Story_Balcony_Mat.obj`],
        ]),
        ...row('terrace-block', 'atlantic-europe', [
          ['K commercial a', `${KC2}building-a.glb`],
          ['K commercial c', `${KC2}building-c.glb`],
          ['K commercial low-detail a', `${KC2}low-detail-building-a.glb`],
          ['Q ultimate 4Story', `${QU}4Story_Mat.obj`],
          ['Q ultimate 3Story_Balcony', `${QU}3Story_Balcony_Mat.obj`],
        ]),
        ...row('tower-block', 'north-america', [
          ['K skyscraper a', `${KC2}building-skyscraper-a.glb`],
          ['K skyscraper b', `${KC2}building-skyscraper-b.glb`],
          ['Q simple Flat', `${QS}Flat.obj`],
        ]),
        ...row('steeple-church', 'atlantic-europe', [
          ['PP church', 'polypizza/church-creativetrio/church-creativetrio.glb'],
          ['KK church', `${KKM}building_church_red.gltf`],
          ['Q Bell_Tower', `${QM}Bell_Tower.obj`],
        ]),
        ...row('minaret-mosque', 'maghreb', []),
        ...row('pagoda', 'east-asia', []),
        ...row('machiya', 'east-asia', []),
        ...row('stilt-house', 'southeast-asia', []),
        ...row('round-hut', 'sub-saharan', []),
      ];
    },
  },

  'town-kit': {
    note: 'The baked building parts through the world pipeline: painted by region, glass masked.',
    async cells() {
      registerVehicleModels(await loadModels('buildings/kit.bin'));
      const cells: LabCell[] = [];
      const rows: [string, string][] = [
        ['suburban-house', 'atlantic-europe'],
        ['suburban-house', 'mediterranean'],
        ['city-block', 'atlantic-europe'],
        ['city-block', 'latin-america'],
        ['skyscraper', 'north-america'],
        ['clapboard-church', 'north-america'],
        ['clapboard-church', 'nordic'],
      ];
      for (const [id, region] of rows) {
        for (let variant = 0; variant < 4; variant++) {
          cells.push({
            label: `${id} ${variant}`,
            note: region,
            heading: variant === 0 ? `${id} · ${region}` : undefined,
            async build() {
              return { object: buildPart(id, scenery, REGIONS[region as keyof typeof REGIONS], variant) };
            },
          });
        }
      }
      return cells;
    },
  },

  jump: {
    note: 'The hero playing the clips retargeted from the Universal Animation Library (scripts/retarget-clips.ts) beside the pack\'s own Run. Side on.',
    async cells(shared) {
      const cast = await loadCast(castMaterial(shared.gradientMap, shared.ink), ['man-hoodie']);
      return (['Run', 'Jump_Start', 'Jump', 'Jump_Land'] as const).map((name): LabCell => ({
        label: name,
        hero: false,
        az: Math.PI / 2 - (35 * Math.PI) / 180,
        async build() {
          const person = cast.make('man-hoodie', () => null, AVATAR_HEIGHT);
          const action = person.actions.get(name);
          if (action === undefined) throw new Error(`no clip ${name}`);
          action.play();
          return { object: person.root, mixer: person.mixer, stats: `${action.getClip().duration.toFixed(2)} s` };
        },
      }));
    },
  },

  young: {
    note: 'Townsfolk as the world dresses them: an adult and a child side by side (an adult outfit at 0.62 of the height with a head 1.3 times its own), playing Idle.',
    async cells(shared) {
      const folk = createFolk(shared.ctx);
      for (let i = 0; i < 200 && !folk.ready; i++) await new Promise((resolve) => setTimeout(resolve, 100));
      const adults: string[] = [];
      const children: string[] = [];
      for (let k = 0; k < 400 && (adults.length < 4 || children.length < 4); k++) {
        const key = `lab-young-${k}`;
        const probe = folk.dress(key, 'atlantic-europe');
        if (probe === null) break;
        const bones = [...probe.bones.keys()];
        (window as unknown as { labBones?: string[] }).labBones ??= bones;
        const young = probe.root.scale.x < 0.9 * (folk.dress(key, 'atlantic-europe', undefined, AVATAR_HEIGHT)?.root.scale.x ?? 0);
        folk.release(probe);
        (young ? children : adults).push(key);
      }
      return adults.slice(0, 4).map((adult, i): LabCell => ({
        label: `${adult} · ${children[i]}`,
        hero: false,
        async build() {
          const group = new THREE.Group();
          const a = folk.dress(adult, 'atlantic-europe')!;
          const c = folk.dress(children[i]!, 'atlantic-europe')!;
          a.root.position.x = -1.6;
          c.root.position.x = 1.6;
          group.add(a.root, c.root);
          a.actions.get('Idle')!.play();
          c.actions.get('Idle')!.play();
          const both = { update: (dt: number) => { a.mixer.update(dt); c.mixer.update(dt); } };
          return { object: group, mixer: both as unknown as THREE.AnimationMixer };
        },
      }));
    },
  },

  props: {
    note: 'Street furniture: the code lamp (dashed) against Quaternius Modular Streets (Q), Kenney City Kit Roads (K) and KayKit City Builder Bits (KK), on the palette, each at the height of a real one.',
    async cells() {
      const QS = `${Q}modular-streets/OBJ/`;
      const KR = `${K}city-kit-roads/Models/GLB format/`;
      const KK = 'kaykit/city-builder-bits/gltf/';
      const code: LabCell = {
        label: 'street-lamp (code)',
        note: 'atlantic-europe',
        current: true,
        heading: 'lamps',
        async build() {
          return { object: buildPart('street-lamp', scenery, REGIONS['atlantic-europe'], 1) };
        },
      };
      const m = (label: string, url: string, height: number, heading?: string) => staticModel(label, url, { height }, { paint: snapped, heading });
      return [
        code,
        m('Q Streetlight_Single', `${QS}Streetlight_Single.obj`, 6.5),
        m('Q Streetlight_Double', `${QS}Streetlight_Double.obj`, 6.5),
        m('K light-curved', `${KR}light-curved.glb`, 7.5),
        m('K light-square', `${KR}light-square.glb`, 7.5),
        m('KK streetlight', `${KK}streetlight.gltf`, 7),
        m('Q TrafficLight', `${QS}TrafficLight.obj`, 6, 'traffic lights and signs'),
        m('K traffic-light', `${KR}traffic-light.glb`, 6),
        m('KK trafficlight_A', `${KK}trafficlight_A.gltf`, 6),
        m('Q Sign_Stop', `${QS}Sign_Stop.obj`, 3.6),
        m('K road-sign-stop', `${KR}road-sign-stop.glb`, 3.6),
        m('KK bench', `${KK}bench.gltf`, 1.3, 'furniture'),
        m('KK firehydrant', `${KK}firehydrant.gltf`, 1.1),
        m('KK trash_A', `${KK}trash_A.gltf`, 1.4),
        m('KK dumpster', `${KK}dumpster.gltf`, 2),
        m('K construction-cone', `${KR}construction-cone.glb`, 0.9),
      ];
    },
  },

  streets: {
    note: 'The same street built twice, nose to kerb: Quaternius flat packs (with Kenney only where Quaternius has nothing), and Kenney alone. All on the palette.',
    async cells() {
      const q = (label: string, url: string, id: string, body: number, yaw = 0) =>
        staticModel(label, url, { length: placedLength(id), yaw: yaw + Math.PI / 2 }, { paint: painted(body) });
      const quaternius = street('Quaternius (+K van, truck, tractor)', [
        q('car', `${Q}cars/OBJ/NormalCar1.obj`, 'hatchback', PALETTE.crimson),
        q('suv', `${Q}cars/OBJ/SUV.obj`, 'boxy-suv', PALETTE.skyBlue),
        q('taxi', `${Q}cars/OBJ/Taxi.obj`, 'saloon-car', PALETTE.gold),
        q('van', `${KC}van.glb`, 'panel-van', PALETTE.white),
        q('bus', `${Q}public-transport/FBX/Bus.fbx`, 'city-bus', PALETTE.orange, Math.PI / 2),
        q('bicycle', `${Q}public-transport/OBJ/Bicycle.obj`, 'bicycle', PALETTE.green),
      ]);
      const kenney = street('Kenney alone', [
        q('car', `${KC}hatchback-sports.glb`, 'hatchback', PALETTE.crimson),
        q('suv', `${KC}suv.glb`, 'boxy-suv', PALETTE.skyBlue),
        q('taxi', `${KC}taxi.glb`, 'saloon-car', PALETTE.gold),
        q('van', `${KC}van.glb`, 'panel-van', PALETTE.white),
        q('truck', `${KC}truck.glb`, 'pickup-truck', PALETTE.green),
        q('tractor', `${KC}tractor.glb`, 'farm-tractor', PALETTE.red),
      ]);
      const code = street('today (code)', ['hatchback', 'boxy-suv', 'saloon-car', 'panel-van', 'city-bus', 'bicycle'].map((id) => {
        const cell = currentVehicle(id);
        const inner = cell.build;
        return { ...cell, async build(shared: LabShared) {
          const made = await inner(shared);
          const turned = new THREE.Group();
          made.object.rotation.y = Math.PI / 2;
          turned.add(made.object);
          return { object: turned };
        } };
      }));
      return [{ ...code, heading: 'a street' }, quaternius, kenney];
    },
  },

  animals: {
    note: 'Livestock: the code-built quadruped (dashed) against Quaternius Ultimate Animated Animals (UAA, glTF, playing Eating) and the older Farm Animals (FBX), through the world pipeline, each sized to the length the kit declares.',
    async cells() {
      return [
        ...animalRow('cattle', 'cattle', [
          ['UAA Cow', `${UAA}Cow.gltf`],
          ['UAA Bull', `${UAA}Bull.gltf`],
          ['Farm Cow', `${FARM}Cow.fbx`],
        ], 11.97),
        ...animalRow('horse · donkey', 'horse', [
          ['UAA Horse', `${UAA}Horse.gltf`],
          ['UAA Horse_White', `${UAA}Horse_White.gltf`],
          ['UAA Donkey', `${UAA}Donkey.gltf`],
          ['Farm Horse', `${FARM}Horse.fbx`],
        ], 12.64),
        ...animalRow('sheep · pig', 'sheep', [['Farm Sheep', `${FARM}Sheep.fbx`], ['Farm Pig', `${FARM}Pig.fbx`]], 6.44),
        ...animalRow('llama', 'llama', [
          ['UAA Alpaca', `${UAA}Alpaca.gltf`],
          ['Farm Llama', `${FARM}Llama.fbx`],
        ], 7.09),
        ...animalRow('reindeer · stag', 'reindeer', [
          ['UAA Stag', `${UAA}Stag.gltf`],
          ['UAA Deer', `${UAA}Deer.gltf`],
        ], 9.1),
        ...animalRow('camel (no candidate yet)', 'camel', [], 12.15),
        ...animalRow('not in the world yet', null, [
          ['Farm Zebra', `${FARM}Zebra.fbx`],
          ['UAA Wolf', `${UAA}Wolf.gltf`],
          ['UAA Fox', `${UAA}Fox.gltf`],
        ], 8),
      ];
    },
  },
};
