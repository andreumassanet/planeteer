/**
 * The ground, drawn: a quadtree of tiles on the cube-sphere, as fine as the
 * eye needs and no finer, built a few at a time.
 *
 * ## Why there is no far mesh
 *
 * The six level-0 tiles are the whole planet at 2,048 triangles a face and
 * they are built before the first frame, so the quadtree *is* the far mesh:
 * from orbit nothing splits and the world is twelve thousand triangles, and on
 * foot the tiles under the player are four levels finer than the ones on the
 * horizon. The only rule that keeps it from holes is **a tile is replaced by
 * its four children only once all four are built** — until then the parent is
 * drawn, so a split never shows the sky through the ground, and the swap is a
 * single frame.
 *
 * ## The seams
 *
 * Two neighbours at different levels share an edge whose vertices do not
 * match, and the crack between them would show the space behind. Every tile
 * hangs a **skirt** from its four edges, a strip dropped straight down by more
 * than the largest gap a level can leave; the eye never sees it from the top
 * and it fills the crack from the side. It is the cheapest answer and the
 * common one, and it costs 256 triangles a tile.
 *
 * ## Precision
 *
 * A tile's vertices are stored relative to its own centre, and the centre is
 * the mesh's position — a double in JavaScript. Three composes the model-view
 * matrix in doubles before it becomes a float32 uniform, so the difference
 * between the camera and a vertex is taken at full precision and the vertex
 * itself is never larger than the tile. On Jupiter's 175,600-unit deck that is
 * the difference between a ground that shimmers by two centimetres a frame and
 * one that does not.
 */

import * as THREE from 'three';
import type { Terrain, TerrainSample } from './terrain.ts';
import { linearOf, newSample } from './terrain.ts';
import { FACES, TILE_SEGMENTS, faceDir, keyOf, tileSpan } from './cube.ts';
import type { TileKey } from './cube.ts';
import { fbm } from '../system/noise.ts';

/** A tile splits when the eye is nearer than this many of its own edges. */
const SPLIT = 1.0;
/** Tiles kept built beyond what is drawn, so turning round costs nothing. */
const CACHE = 520;

interface Tile {
  key: TileKey;
  id: string;
  mesh: THREE.Mesh;
  /** Unit vector of the centre, and the angular radius the tile spans. */
  dir: THREE.Vector3;
  angle: number;
  /** Edge length in units, for the split test. */
  edge: number;
  /** The highest and lowest the tile's own ground stands over the radius. */
  top: number;
  bottom: number;
  used: number;
}

export interface GroundStats {
  built: number;
  drawn: number;
  pending: number;
  triangles: number;
  buildMs: number;
}

export interface Ground {
  group: THREE.Group;
  material: THREE.MeshToonMaterial;
  /** Chooses and draws the tiles for an eye; builds for at most `budgetMs`. */
  update(eye: THREE.Vector3, budgetMs: number): void;
  /** Builds everything the eye wants now, whatever it costs: the first frame. */
  prime(eye: THREE.Vector3): void;
  /** The churning clock of a cloud deck, seconds. */
  time: number;
  /**
   * How far the political map is laid over the ground, 0 to 1: each nation's
   * own colour over its own land, the walked worlds' twin of Earth's map layer
   * (`land-flags.ts`). A uniform; nothing is rebuilt to move it.
   */
  political: number;
  /**
   * How far the quadtree splits, as a multiple of its own rule: the settings'
   * detail knob. Below 1 the ground is coarser sooner, above it finer further.
   */
  detail: number;
  readonly stats: GroundStats;
  dispose(): void;
}

export interface GroundOptions {
  /** Ramp shared with everything else lit. */
  gradientMap: THREE.Texture;
  /**
   * Something to stand on the finest tiles — rocks, drifts — as one geometry in
   * the tile's own frame, or null. Called once per finest tile.
   */
  decorate?(key: TileKey, centre: THREE.Vector3, up: THREE.Vector3): THREE.BufferGeometry | null;
  /** A decorated tile let go of: what `decorate` registered for it can go too. */
  retire?(key: TileKey): void;
  /**
   * Whose ground a direction is — a 1-based index into `colors`, 0 for
   * nobody's — and each nation's colour, for `Ground.political`. Asked at a
   * tile's corners and centre, and at every vertex only of a tile those five
   * do not agree on: most tiles lie inside one nation, and a frontier tile
   * costs a point-in-polygon a vertex.
   */
  nations?: { at(x: number, y: number, z: number): number; colors: readonly number[] };
}

/** One shared index for every tile: the topology is the same everywhere. */
function tileIndex(): THREE.BufferAttribute {
  const S = TILE_SEGMENTS;
  const row = S + 1;
  const indices: number[] = [];
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row + 1;
      const d = a + row;
      indices.push(a, b, c, a, c, d);
    }
  }
  // The skirt: one strip per edge, from the edge vertex down to its copy.
  const skirt = row * row;
  const edge = (from: number, step: number, at: number, flip: boolean): void => {
    for (let k = 0; k < S; k++) {
      const top0 = from + k * step;
      const top1 = from + (k + 1) * step;
      const bottom0 = skirt + at + k;
      const bottom1 = skirt + at + k + 1;
      if (flip) indices.push(top0, bottom1, top1, top0, bottom0, bottom1);
      else indices.push(top0, top1, bottom1, top0, bottom1, bottom0);
    }
  };
  edge(0, 1, 0, true); // j = 0, along u
  edge(S * row, 1, row, false); // j = S
  edge(0, row, 2 * row, false); // i = 0, along v
  edge(S, row, 3 * row, true); // i = S
  return new THREE.BufferAttribute(new Uint16Array(indices), 1);
}

export function createGround(terrain: Terrain, options: GroundOptions): Ground {
  const S = TILE_SEGMENTS;
  const row = S + 1;
  const R = terrain.radius;
  const deck = terrain.spec.ground === 'cloud-deck';
  const index = tileIndex();
  const steep = linearOf(terrain.spec.palette.steep);

  // The deck's motion, from the palette: the boil's rate, and the drift as a
  // whole number of waves round a parallel (so the wave train closes on
  // itself at the antimeridian) travelling at the deck's wind speed.
  const churn = terrain.spec.palette.churn;
  const waves = Math.max(1, Math.round((2 * Math.PI * R) / Math.max(1, churn.wavelength)));
  const uniforms = {
    uTime: { value: 0 },
    uPolitical: { value: 0 },
    uBoil: { value: churn.boil },
    uWaves: { value: waves },
    // Radians of the wave's phase a second: a crest moves `speed` units a
    // second along the equator.
    uDrift: { value: (churn.speed * waves) / R },
    uDriftStrength: { value: churn.strength },
  };
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: options.gradientMap });
  material.name = deck ? 'world:deck' : 'world:ground';
  // A deck has no edge to ink: the pen's hull round each tile, on a surface
  // this flat, is the tile's square drawn on the clouds.
  if (deck) material.userData.outlineParameters = { visible: false };
  // The crust is faceted, as Earth's land is, and the facets are the
  // shader's: `FLAT_SHADED` takes each fragment's normal from the screen-space
  // derivatives of its own position, so the grid stays indexed (a third of the
  // vertices) and needs no normals uploaded at all. `MeshToonMaterial` has no
  // `flatShading` switch of its own; the chunk it would set is this define.
  if (!deck) material.defines = { ...material.defines, FLAT_SHADED: '' };
  // The political map: each vertex carries its nation's colour (`aNation`,
  // linear) and one uniform lays it over the ground's own, after the ground's
  // colour and before the light, so the hills still read through it.
  const nationVertex = ['#include <common>', 'attribute vec3 aNation;', 'varying vec3 vNation;'];
  const nationFragment = ['#include <common>', 'uniform float uPolitical;', 'varying vec3 vNation;'];
  const political = '  diffuseColor.rgb = mix(diffuseColor.rgb, vNation, uPolitical);';
  // The deck churns: a slow wave of light and shade along each vertex's own
  // phase, which is a function of where it is and so continuous from tile
  // to tile, and a wave train drifting along the parallels. The geometry
  // never moves; only the paint does. The longitude is taken per fragment
  // from the world position — the planet is at the origin — because one
  // interpolated across a triangle that straddles the antimeridian would
  // run the whole way round inside it.
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (!deck) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', nationVertex.join('\n'))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNation = aNation;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', nationFragment.join('\n'))
        .replace('#include <color_fragment>', `#include <color_fragment>\n${political}`);
      return;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${nationVertex.join('\n')}\nattribute float aPhase;\nvarying float vPhase;\nvarying vec3 vDeck;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNation = aNation;\nvPhase = aPhase;\nvDeck = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `${nationFragment.join('\n')}\nuniform float uTime;\nuniform float uBoil;\nuniform float uWaves;\nuniform float uDrift;\nuniform float uDriftStrength;\nvarying float vPhase;\nvarying vec3 vDeck;`,
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          political,
          '  float boil = 0.94 + 0.09 * sin(vPhase * 18.0 + uTime * uBoil) + 0.04 * sin(vPhase * 41.0 - uTime * uBoil * 1.7);',
          '  vec3 deckDir = normalize(vDeck);',
          '  float deckLon = atan(-deckDir.z, deckDir.x);',
          '  float drift = sin(deckLon * uWaves + vPhase * 9.0 - uTime * uDrift) + 0.5 * sin(deckLon * uWaves * 2.0 - vPhase * 13.0 - uTime * uDrift * 2.0);',
          '  diffuseColor.rgb *= boil * (1.0 + uDriftStrength * drift * 0.67);',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => (deck ? 'world:deck' : 'world:ground');

  const group = new THREE.Group();
  group.name = 'world-ground';
  const tiles = new Map<string, Tile>();
  const pending = new Map<string, { key: TileKey; priority: number }>();
  const shown: Tile[] = [];
  let frame = 0;
  const stats: GroundStats = { built: 0, drawn: 0, pending: 0, triangles: 0, buildMs: 0 };

  const sample: TerrainSample = newSample();
  const nations = options.nations;
  const nationLinear = (nations?.colors ?? []).map((hex) => new THREE.Color().setHex(hex));
  const noNation = new THREE.Color().setHex(0x808080);
  let detail = 1;
  const point = { x: 0, y: 0, z: 0 };
  const heights = new Float32Array(row * row);
  const dirs = new Float64Array(row * row * 3);

  /**
   * The deck's normals: inside the tile off the grid's own neighbours, and
   * on its edge — which the next tile shares — off the height field, the
   * radial up tilted by the field's slope `step` units either way along two
   * tangents, so both tiles give an edge vertex one normal; a skirt's vertex
   * takes its edge vertex's. `count` vertices, the grid's
   * first and then the skirts', as `build` lays them out.
   */
  const tangentA = new THREE.Vector3();
  const tangentB = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const upward = new THREE.Vector3();
  function deckNormals(count: number, spacing: number, positions: Float32Array): Float32Array {
    const out = new Float32Array(count * 3);
    const step = Math.max(1, spacing);
    const angle = step / R;
    const heightAlong = (t: THREE.Vector3, sign: number): number => {
      probe.copy(upward).addScaledVector(t, sign * angle).normalize();
      return terrain.heightAt(probe.x, probe.y, probe.z);
    };
    for (let k = 0; k < row * row; k++) {
      upward.set(dirs[k * 3]!, dirs[k * 3 + 1]!, dirs[k * 3 + 2]!);
      const i = k % row;
      const j = (k - i) / row;
      if (i > 0 && i < S && j > 0 && j < S) {
        // Inside the tile, off the grid's own neighbours: the field the
        // vertex already has, with no probe of it. The edge's vertices, which
        // the next tile shares, are asked of the field below, so both tiles
        // give them one normal.
        tangentA.set(positions[(k + 1) * 3]! - positions[(k - 1) * 3]!, positions[(k + 1) * 3 + 1]! - positions[(k - 1) * 3 + 1]!, positions[(k + 1) * 3 + 2]! - positions[(k - 1) * 3 + 2]!);
        tangentB.set(positions[(k + row) * 3]! - positions[(k - row) * 3]!, positions[(k + row) * 3 + 1]! - positions[(k - row) * 3 + 1]!, positions[(k + row) * 3 + 2]! - positions[(k - row) * 3 + 2]!);
        probe.crossVectors(tangentA, tangentB).normalize();
        if (probe.dot(upward) < 0) probe.negate();
        out[k * 3] = probe.x;
        out[k * 3 + 1] = probe.y;
        out[k * 3 + 2] = probe.z;
        continue;
      }
      tangentA.set(-upward.z, 0.31, upward.x);
      tangentA.addScaledVector(upward, -tangentA.dot(upward)).normalize();
      tangentB.crossVectors(upward, tangentA);
      const da = (heightAlong(tangentA, 1) - heightAlong(tangentA, -1)) / (2 * step);
      const db = (heightAlong(tangentB, 1) - heightAlong(tangentB, -1)) / (2 * step);
      probe.copy(upward).addScaledVector(tangentA, -da).addScaledVector(tangentB, -db).normalize();
      out[k * 3] = probe.x;
      out[k * 3 + 1] = probe.y;
      out[k * 3 + 2] = probe.z;
    }
    // The skirts, in the order `build` drops them: each its edge vertex's.
    let at = row * row;
    const copy = (from: number): void => {
      out[at * 3] = out[from * 3]!;
      out[at * 3 + 1] = out[from * 3 + 1]!;
      out[at * 3 + 2] = out[from * 3 + 2]!;
      at++;
    };
    for (let i = 0; i <= S; i++) copy(i);
    for (let i = 0; i <= S; i++) copy(S * row + i);
    for (let j = 0; j <= S; j++) copy(j * row);
    for (let j = 0; j <= S; j++) copy(j * row + S);
    return out;
  }

  function build(key: TileKey): Tile {
    const began = performance.now();
    const [u0, v0, size] = tileSpan(key);
    const positions = new Float32Array((row * row + 4 * row) * 3);
    const colors = new Float32Array((row * row + 4 * row) * 3);
    const phases = deck ? new Float32Array(row * row + 4 * row) : null;
    const tint = new Float32Array((row * row + 4 * row) * 3);

    // The centre: its own direction at its own height.
    faceDir(key.face, u0 + size / 2, v0 + size / 2, point);
    const dir = new THREE.Vector3(point.x, point.y, point.z);
    const centreHeight = terrain.heightAt(point.x, point.y, point.z);
    const centre = dir.clone().multiplyScalar(R + centreHeight);

    let k = 0;
    for (let j = 0; j <= S; j++) {
      for (let i = 0; i <= S; i++, k++) {
        faceDir(key.face, u0 + (size * i) / S, v0 + (size * j) / S, point);
        terrain.sample(point.x, point.y, point.z, sample);
        heights[k] = sample.height;
        dirs[k * 3] = point.x;
        dirs[k * 3 + 1] = point.y;
        dirs[k * 3 + 2] = point.z;
        const r = R + sample.height;
        positions[k * 3] = point.x * r - centre.x;
        positions[k * 3 + 1] = point.y * r - centre.y;
        positions[k * 3 + 2] = point.z * r - centre.z;
        colors[k * 3] = sample.r;
        colors[k * 3 + 1] = sample.g;
        colors[k * 3 + 2] = sample.b;
        if (phases !== null) phases[k] = fbm(point.x * 7, point.y * 7, point.z * 7, 2) + sample.height * 0.02;
      }
    }

    // The slope, from the grid's own neighbours: steep ground takes the
    // palette's steep colour, the way a cliff on Earth is rock whatever the
    // biome says.
    const spacing = (R * size * (Math.PI / 4)) / S;
    if (!deck) {
      for (let j = 0; j <= S; j++) {
        for (let i = 0; i <= S; i++) {
          const at = j * row + i;
          const du = heights[j * row + Math.min(S, i + 1)]! - heights[j * row + Math.max(0, i - 1)]!;
          const dv = heights[Math.min(S, j + 1) * row + i]! - heights[Math.max(0, j - 1) * row + i]!;
          const span = spacing * (i === 0 || i === S ? 1 : 2);
          const spanV = spacing * (j === 0 || j === S ? 1 : 2);
          const grade = Math.hypot(du / span, dv / spanV);
          const w = Math.min(1, Math.max(0, (grade - 0.45) / 0.4));
          if (w > 0) {
            colors[at * 3] = colors[at * 3]! + (steep[0] - colors[at * 3]!) * w;
            colors[at * 3 + 1] = colors[at * 3 + 1]! + (steep[1] - colors[at * 3 + 1]!) * w;
            colors[at * 3 + 2] = colors[at * 3 + 2]! + (steep[2] - colors[at * 3 + 2]!) * w;
          }
        }
      }
    }

    // The nations: one colour for a small tile when its corners and its
    // centre agree, a lookup a vertex where they do not. A tile a few degrees
    // across or more is always asked vertex by vertex, because a whole nation
    // fits inside it unseen by five points; there are a few dozen of those.
    if (nations !== undefined) {
      const corner = (a: number): number => nations.at(dirs[a * 3]!, dirs[a * 3 + 1]!, dirs[a * 3 + 2]!);
      const first = nations.at(dir.x, dir.y, dir.z);
      const small = size * 45 < 3;
      const whole = small && corner(0) === first && corner(S) === first && corner(S * row) === first && corner(S * row + S) === first;
      for (let at = 0; at < row * row; at++) {
        const id = whole ? first : corner(at);
        const colour = nationLinear[id - 1] ?? noNation;
        tint[at * 3] = colour.r;
        tint[at * 3 + 1] = colour.g;
        tint[at * 3 + 2] = colour.b;
      }
    }

    // The skirts: each edge vertex again, dropped.
    // Deep enough to close the widest crack a level can leave, which is
    // bounded by how much the ground can do between two vertices — never more
    // than half the planet's whole relief plus the sphere's own sag under a
    // straight edge, and on a fine tile a few spacings.
    const drop = Math.max(4, Math.min(spacing * 3, (terrain.high - terrain.low) * 0.5 + 4 + (spacing * spacing) / (4 * R)));
    const edges: [number, number][] = [];
    for (let i = 0; i <= S; i++) edges.push([0 * row + i, 0]);
    for (let i = 0; i <= S; i++) edges.push([S * row + i, 1]);
    for (let j = 0; j <= S; j++) edges.push([j * row + 0, 2]);
    for (let j = 0; j <= S; j++) edges.push([j * row + S, 3]);
    let s = row * row;
    for (const [from] of edges) {
      const r = R + heights[from]! - drop;
      positions[s * 3] = dirs[from * 3]! * r - centre.x;
      positions[s * 3 + 1] = dirs[from * 3 + 1]! * r - centre.y;
      positions[s * 3 + 2] = dirs[from * 3 + 2]! * r - centre.z;
      colors[s * 3] = colors[from * 3]! * 0.8;
      colors[s * 3 + 1] = colors[from * 3 + 1]! * 0.8;
      colors[s * 3 + 2] = colors[from * 3 + 2]! * 0.8;
      if (phases !== null) phases[s] = phases[from]!;
      tint[s * 3] = tint[from * 3]!;
      tint[s * 3 + 1] = tint[from * 3 + 1]!;
      tint[s * 3 + 2] = tint[from * 3 + 2]!;
      s++;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (phases !== null) geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aNation', new THREE.BufferAttribute(tint, 3));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    // Smooth normals for the deck, which is drawn soft; the crust is flat-shaded
    // in the shader and needs none — and a normal it does not read is 15 KB a
    // tile it does not upload. **Taken from the field, not the mesh**: a
    // tile's own `computeVertexNormals` bent every edge vertex toward its
    // skirt, so the light stepped at each tile's border and a flat deck was
    // drawn as a quilt of squares, a leather ball from above. Asked of the
    // height field either side of the vertex, both tiles that share an edge
    // give it the same normal and the seam is gone.
    if (deck) geometry.setAttribute('normal', new THREE.BufferAttribute(deckNormals(s, spacing, positions), 3));

    const mesh = new THREE.Mesh(geometry, material);
    // Earth's land never casts (`sun.ts`), and takes every shadow on it.
    mesh.receiveShadow = true;
    mesh.position.copy(centre);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.visible = false;
    mesh.name = `tile ${keyOf(key)}`;
    if (options.decorate !== undefined && key.level >= terrain.levels - 1) {
      const decor = options.decorate(key, centre, dir);
      if (decor !== null) {
        const child = new THREE.Mesh(decor, decorMaterial);
        child.matrixAutoUpdate = false;
        mesh.add(child);
      }
    }
    group.add(mesh);

    // The tile's angular radius: half its diagonal, generously.
    const angle = size * (Math.PI / 4) * 0.78;
    let top = -Infinity;
    let bottom = Infinity;
    for (let k = 0; k < row * row; k++) {
      top = Math.max(top, heights[k]!);
      bottom = Math.min(bottom, heights[k]!);
    }
    const tile: Tile = { key, id: keyOf(key), mesh, dir, angle, edge: R * size * (Math.PI / 4), top, bottom, used: frame };
    tiles.set(tile.id, tile);
    stats.buildMs = stats.buildMs * 0.9 + (performance.now() - began) * 0.1;
    return tile;
  }

  const decorMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: options.gradientMap });
  decorMaterial.name = 'world:decor';

  for (let face = 0; face < FACES.length; face++) build({ face, level: 0, i: 0, j: 0 });

  const children = (key: TileKey): TileKey[] => {
    const level = key.level + 1;
    const i = key.i * 2;
    const j = key.j * 2;
    return [
      { face: key.face, level, i, j },
      { face: key.face, level, i: i + 1, j },
      { face: key.face, level, i, j: j + 1 },
      { face: key.face, level, i: i + 1, j: j + 1 },
    ];
  };

  /**
   * Whether all of a tile is under the horizon from an eye at `distance` from
   * the centre: the eye's horizon over a sphere at the lower of the ground
   * under the eye and the tile's own lowest, plus how far past it the tile's
   * own highest ground still shows. The tile's own heights and not the
   * planet's: with Olympus Mons as everybody's top and Hellas as everybody's
   * floor, a third of Mars stood over every horizon. A basin deeper than both
   * between the two could show a sliver more than this allows; at a walking
   * height it is a few units of far ground, and it is the price of not
   * drawing the third.
   */
  function beyond(tile: Tile, eyeDir: THREE.Vector3, distance: number, eyeGround: number): boolean {
    const low = R + Math.min(eyeGround, tile.bottom);
    const reach = Math.acos(Math.min(1, low / Math.max(low, distance))) + Math.acos(Math.min(1, low / Math.max(low, R + tile.top)));
    const between = Math.acos(Math.max(-1, Math.min(1, eyeDir.dot(tile.dir))));
    return between - tile.angle > reach;
  }

  function choose(eye: THREE.Vector3): void {
    shown.length = 0;
    const distance = eye.length();
    const eyeDir = eye.clone().normalize();
    const eyeGround = terrain.heightAt(eyeDir.x, eyeDir.y, eyeDir.z);
    const visit = (tile: Tile): void => {
      tile.used = frame;
      if (beyond(tile, eyeDir, distance, eyeGround)) return;
      // From the tile's own centre, at its own height: measured from the
      // radius, a tile on a plateau four hundred units up never split.
      const nearest = Math.max(0, tile.mesh.position.distanceTo(eye) - tile.edge * 0.71);
      if (tile.key.level < terrain.levels && nearest < SPLIT * detail * tile.edge) {
        const keys = children(tile.key);
        const built: Tile[] = [];
        for (const key of keys) {
          const found = tiles.get(keyOf(key));
          if (found !== undefined) built.push(found);
          else {
            const id = keyOf(key);
            const priority = nearest + key.level;
            const queued = pending.get(id);
            if (queued === undefined || queued.priority > priority) pending.set(id, { key, priority });
          }
        }
        if (built.length === 4) {
          for (const child of built) visit(child);
          return;
        }
      }
      shown.push(tile);
    };
    for (let face = 0; face < FACES.length; face++) visit(tiles.get(keyOf({ face, level: 0, i: 0, j: 0 }))!);
  }

  function draw(): void {
    for (const tile of tiles.values()) tile.mesh.visible = false;
    let triangles = 0;
    for (const tile of shown) {
      tile.mesh.visible = true;
      triangles += 2 * S * S;
    }
    stats.drawn = shown.length;
    stats.triangles = triangles;
  }

  function buildSome(budgetMs: number, began: number): void {
    // Nearest first. A sort a frame over a queue of a few dozen is nothing.
    const queue = [...pending.values()].sort((a, b) => a.priority - b.priority);
    pending.clear();
    let built = 0;
    for (const item of queue) {
      if (built > 0 && performance.now() - began > budgetMs) break;
      if (!tiles.has(keyOf(item.key))) build(item.key);
      built++;
    }
  }

  function evict(): void {
    if (tiles.size <= CACHE) return;
    const old = [...tiles.values()].filter((tile) => tile.key.level > 0 && tile.used < frame).sort((a, b) => a.used - b.used);
    for (const tile of old.slice(0, tiles.size - CACHE)) {
      group.remove(tile.mesh);
      tile.mesh.geometry.dispose();
      for (const child of tile.mesh.children) (child as THREE.Mesh).geometry.dispose();
      tiles.delete(tile.id);
      if (tile.key.level >= terrain.levels - 1) options.retire?.(tile.key);
    }
  }

  return {
    group,
    material,
    get time() {
      return uniforms.uTime.value;
    },
    set time(value: number) {
      uniforms.uTime.value = value;
    },
    get political() {
      return uniforms.uPolitical.value;
    },
    set political(value: number) {
      uniforms.uPolitical.value = Math.min(1, Math.max(0, value));
    },
    get detail() {
      return detail;
    },
    set detail(value: number) {
      detail = Math.min(8, Math.max(0.25, value));
    },
    stats,
    update(eye, budgetMs) {
      frame++;
      const began = performance.now();
      choose(eye);
      draw();
      buildSome(budgetMs, began);
      stats.built = tiles.size;
      stats.pending = pending.size;
      evict();
    },
    prime(eye) {
      const began = performance.now();
      for (let round = 0; round < 40; round++) {
        frame++;
        choose(eye);
        if (pending.size === 0 || performance.now() - began > 6000) break;
        buildSome(Infinity, performance.now());
      }
      draw();
      stats.built = tiles.size;
    },
    dispose() {
      for (const tile of tiles.values()) {
        tile.mesh.geometry.dispose();
        for (const child of tile.mesh.children) (child as THREE.Mesh).geometry.dispose();
      }
      tiles.clear();
      material.dispose();
      decorMaterial.dispose();
    },
  };
}
