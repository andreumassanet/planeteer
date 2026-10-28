/** Builds one tile: the plants and the countryside placed on it, merged into a mesh. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { UNITS_PER_DEGREE } from '../globe.ts';
import { PROBE_SURE } from '../land-probe.ts';
import type { LandProbe } from '../land-probe.ts';
import { reliefAt, shoreDistance } from '../terrain.ts';
import { biomeSample } from '../biome.ts';
import { leafDepthMaterial, woodDepthMaterial } from '../foliage.ts';
import type { RegionStyle } from '../scenery/index.ts';
import type { CountryFrame } from '../countryside-tile.ts';
import type { CountryPlan } from '../countryside.ts';
import { legibleFloor, SCALE_OF } from './levels.ts';
import { createKeepoutSet } from './keepouts.ts';
import type { Keepouts } from './keepouts.ts';
import type { Framer } from './frame.ts';
import { layoutSites } from './layout.ts';
import { packTile } from './pack.ts';
import { createPlanter } from './plant.ts';
import { styleOf } from './style.ts';
import type { TileRun } from './plant.ts';
import { CARD_LEVEL, SOLID_LEVEL } from './tiles.ts';
import type { Built, Tile } from './tiles.ts';
import type { VegetationCountry } from './country.ts';
import type { Variants } from './variants.ts';
import type { PlantSeat } from './types.ts';

export interface TileBuilderDeps {
  world: World;
  framer: Framer;
  keepouts: Keepouts;
  variants: Variants;
  country: VegetationCountry | null;
  land: LandProbe | undefined;
  landReady: () => boolean;
  continentOf: Map<string, string>;
  /** The wood's material, and the near tiles' wood and leaf-card materials. */
  material: THREE.Material;
  windMaterial: THREE.Material;
  leafCards: THREE.Material;
  broken: string[];
  /** `current` is set by `sample` while it asks where each plant's base went. */
  seatLog: { current: PlantSeat[] | null };
}

export interface TileBuilder {
  /** Builds the tile as the streamer does; `mesh` is null when nothing grows there. */
  raise(tile: Tile): Built;
}

function emptyBuilt(): Built {
  return {
    mesh: null,
    machines: null,
    priced: 0,
    leaves: null,
    triangles: 0,
    plants: 0,
    bytes: 0,
    plots: 0,
    inTheSea: 0,
    builtOver: 0,
    onRoad: 0,
    onSlope: 0,
    onCountry: 0,
    fastPath: false,
    pieces: 0,
    fields: 0,
    fences: 0,
    motion: null,
    provisional: false,
    walls: null,
    crowns: null,
    props: null,
  };
}

export function createTileBuilder(deps: TileBuilderDeps): TileBuilder {
  const { world, framer, keepouts, variants, country, land, continentOf } = deps;
  const { frame } = framer;
  const tileSet = createKeepoutSet(frame.across, frame.north);
  const planter = createPlanter({
    world,
    framer,
    tileSet,
    variants,
    country,
    land,
    broken: deps.broken,
    seatLog: deps.seatLog,
  });
  const scratch = new THREE.Vector3();
  const sample = biomeSample();

  function newRun(tile: Tile, style: RegionStyle): TileRun {
    // The fast path: a tile entirely inland asks the expensive point-in-
    // polygon elevation once and adds the cheap relief per plot. "Entirely
    // inland" is a distance to the sea (`shoreDistance`), not a handful of
    // probes, which a fjord narrower than their spacing would fool.
    const radiusDeg = Math.hypot(tile.halfEast, tile.halfNorth) / UNITS_PER_DEGREE;
    const centreElevation = world.elevationAt(tile.direction);
    return {
      tile,
      style,
      cards: tile.level <= CARD_LEVEL,
      inland: centreElevation > 0 && shoreDistance(tile.lat, tile.lon) > radiusDeg + 0.5,
      shelf: centreElevation - reliefAt(tile.direction.x, tile.direction.y, tile.direction.z),
      levelScale: SCALE_OF[tile.level]!,
      placed: [],
      vertices: 0,
      leafVertices: 0,
      pricedVertices: 0,
      plots: 0,
      inTheSea: 0,
      builtOver: 0,
      onRoad: 0,
      onSlope: 0,
      onCountry: 0,
      checked: false,
      fellBack: false,
    };
  }

  /** The countryside's pieces, fields and fences placed into the same buffer as the plants. */
  function addCountry(run: TileRun, plans: CountryPlan[], countryFrame: CountryFrame, pieceSeats: NonNullable<CountryFrame['seats']>) {
    const { tile } = run;
    const built = country === null
      ? null
      // Wherever the probe has the tile, whatever it says of the viewer: a
      // point it has not gathered answers null and takes the relief.
      : country.builder.build(plans, countryFrame, legibleFloor(tile.level), land, land !== undefined && (deps.landReady() || land.covers(tile.direction)));
    for (const seat of pieceSeats) deps.seatLog.current?.push({ id: `country:${seat.id}`, tree: true, drawn: seat.drawn, x: seat.x, y: seat.y, z: seat.z, height: 0, reach: seat.reach });
    if (built !== null) {
      for (const item of built.placed) {
        run.placed.push(item);
        if (item.leaves != null) run.leafVertices += item.leaves.position.length / 3;
      }
      run.vertices += built.vertices;
      run.pricedVertices += built.priced;
    }
    return built;
  }

  function meshesOf(tile: Tile, run: TileRun): { mesh: THREE.Mesh; leaves: THREE.Mesh | null; machines: Built['machines']; props: Built['props'] } | null {
    const { cards } = run;
    const packed = packTile(run.placed, run.vertices, run.leafVertices, cards, framer.machineWalls, tile.level <= SOLID_LEVEL ? framer.propWalls : null);
    const { geometry, cardGeometry } = packed;
    let leaves: THREE.Mesh | null = null;
    if (cardGeometry !== null) {
      leaves = new THREE.Mesh(cardGeometry, deps.leafCards);
      leaves.name = `leaves:${tile.key}`;
      leaves.castShadow = true;
      leaves.receiveShadow = true;
      leaves.customDepthMaterial = leafDepthMaterial();
    }
    // A near tile of nothing but bushes has no wood: its sphere is its leaves'.
    if (run.vertices > 0) geometry.computeBoundingSphere();
    else if (leaves !== null) geometry.boundingSphere = leaves.geometry.boundingSphere!.clone();
    else return null;

    const mesh = new THREE.Mesh(geometry, cards ? deps.windMaterial : deps.material);
    if (cards) mesh.customDepthMaterial = woodDepthMaterial();
    // In the tile's frame too, so the parent's transform is theirs.
    if (leaves !== null) mesh.add(leaves);
    mesh.name = `flora:${tile.key}`;
    // Only the two finest levels cast: the shadow box is 600 units across and a
    // level-2 tile is 696, so a coarser tile would be drawn into the map for its
    // bounding sphere alone. Every level receives.
    mesh.castShadow = tile.level <= 1;
    mesh.receiveShadow = true;
    // Built in the tile's own tangent frame and placed by one transform, so the
    // bounding sphere is the tile's and vertex coordinates stay under a
    // thousand units, where a float steps by 2^-14 rather than 2^-10.
    mesh.position.copy(frame.origin);
    mesh.quaternion.setFromRotationMatrix(frame.basis);
    return { mesh, leaves, machines: packed.machines.length > 0 ? packed.machines : null, props: packed.props.length > 0 ? packed.props : null };
  }

  function raise(tile: Tile): Built {
    const empty = emptyBuilt();
    if (!framer.frameTile(tile)) return empty;
    const style = styleOf(world, framer, continentOf, tile, scratch);
    const run = newRun(tile, style);

    keepouts.gather(tile.direction, Math.hypot(tile.halfEast, tile.halfNorth), tileSet);
    // The countryside's plans under the tile, whose pieces, fields and fences
    // the wood keeps off at every level, drawn or not.
    const plans = country === null ? [] : country.builder.plansUnder(tile.level, tile.row, tile.column);
    const pieceSeats: NonNullable<CountryFrame['seats']> = [];
    const countryFrame: CountryFrame = {
      level: tile.level,
      across: frame.across,
      north: frame.north,
      inverse: frame.inverse,
      cards: run.cards,
      seats: deps.seatLog.current === null ? undefined : pieceSeats,
    };
    country?.builder.prepare(plans, countryFrame);

    for (const site of layoutSites(tile, framer.directionAt, scratch, sample)) {
      if (!planter.placeSite(run, site)) return empty;
    }

    const plants = run.placed.length;
    const built = addCountry(run, plans, countryFrame, pieceSeats);
    const landReady = deps.landReady();
    const countryside = {
      pieces: built?.pieces ?? 0,
      fields: built?.fields ?? 0,
      fences: built?.fences ?? 0,
      motion: built?.motion ?? null,
      // A tile with a plant on the relief, all of it inside the ground the probe
      // always answers, is built again once the probe is ready, so every plant
      // of it finds the drawn land.
      provisional: land !== undefined && (((built?.provisional ?? false) && !landReady) ||
        (run.fellBack && tile.distance + Math.hypot(tile.halfEast, tile.halfNorth) < PROBE_SURE)),
      walls: tile.level <= SOLID_LEVEL ? framer.wallsOf(tile, run.placed) : null,
      crowns: run.cards ? framer.crownsOf(run.placed) : null,
    };
    const counts = {
      plots: run.plots,
      inTheSea: run.inTheSea,
      builtOver: run.builtOver,
      onRoad: run.onRoad,
      onSlope: run.onSlope,
      onCountry: run.onCountry,
      fastPath: run.inland,
    };
    if (run.placed.length === 0) return { ...empty, ...counts, ...countryside };

    const made = meshesOf(tile, run);
    if (made === null) return { ...empty, ...counts, ...countryside };
    const { cards, vertices, leafVertices } = run;
    return {
      mesh: made.mesh,
      leaves: made.leaves,
      priced: run.pricedVertices / 3,
      triangles: (vertices + leafVertices) / 3,
      plants,
      bytes: vertices * (cards ? 25 : 21) + leafVertices * 26,
      machines: made.machines,
      props: made.props,
      ...counts,
      ...countryside,
    };
  }

  return { raise };
}
