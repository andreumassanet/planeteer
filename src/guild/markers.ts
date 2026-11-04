/**
 * The marks over the guild's people, as quest givers wear them: a gold `!`
 * over somebody with something new for you, a gold `?` over somebody waiting
 * for you to come back to them, and a sky-blue `!` over the dispatcher while
 * today's commissions are open. Inked like the world, flat and unlit so they
 * read at night, turning slowly and bobbing; widened with distance so one is
 * still a few pixels across the square.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';

export type MarkKind = 'quest' | 'ready' | 'daily';

/** How tall a mark is close to, units, and how high its foot hangs over the crown. */
const MARK_HEIGHT = AVATAR_HEIGHT * 0.36;
const MARK_LIFT = AVATAR_HEIGHT * 0.42;
/** Past this distance a mark grows with it, so it keeps its size on screen. */
const GROW_FROM = 30;
/** How fast it turns, radians a second, and how far and how fast it bobs. */
const SPIN = 1.3;
const BOB = AVATAR_HEIGHT * 0.035;
const BOB_RATE = 2.2;

/** A bar tapering to its foot and a dot under it, its dot's foot on y = 0, a unit tall. */
function bangGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.13, 0.07, 0.62, 7, 1);
  stem.translate(0, 0.38 + 0.31, 0);
  const dot = new THREE.IcosahedronGeometry(0.11, 1);
  dot.translate(0, 0.11, 0);
  return merge([stem, dot]);
}

/** A hook and a dot, its dot's foot on y = 0, a unit tall. */
function askGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  // The hook: from the left of its bowl, over the top, round to the right and down to the stem.
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI * 1.05 - (i / 14) * Math.PI * 1.55;
    points.push(new THREE.Vector3(Math.cos(a) * 0.2, 0.72 + Math.sin(a) * 0.2, 0));
  }
  points.push(new THREE.Vector3(0.02, 0.44, 0), new THREE.Vector3(0, 0.33, 0));
  const hook = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, 0.075, 6, false);
  const dot = new THREE.IcosahedronGeometry(0.1, 1);
  dot.translate(0, 0.1, 0);
  return merge([hook.toNonIndexed(), dot]);
}

/** Pieces as one non-indexed geometry, positions and normals only. */
function merge(pieces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = pieces.map((piece) => (piece.index === null ? piece : piece.toNonIndexed()));
  let count = 0;
  for (const piece of flat) count += piece.getAttribute('position').count;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  let at = 0;
  for (const piece of flat) {
    piece.computeVertexNormals();
    position.set(piece.getAttribute('position').array as Float32Array, at * 3);
    normal.set(piece.getAttribute('normal').array as Float32Array, at * 3);
    at += piece.getAttribute('position').count;
  }
  for (const piece of [...pieces, ...flat]) piece.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function material(color: number): THREE.MeshBasicMaterial {
  const made = new THREE.MeshBasicMaterial({ color, fog: false });
  made.name = 'guild:mark';
  return made;
}

export interface Marks {
  readonly group: THREE.Group;
  /** Each frame: every mark wanted, over the crown it hangs above, and the eye. */
  update(time: number, wanted: readonly { key: string; kind: MarkKind; crown: THREE.Vector3 }[], eye: THREE.Vector3): void;
  dispose(): void;
}

export function createMarks(): Marks {
  const group = new THREE.Group();
  group.name = 'guild:marks';
  const shapes = { bang: bangGeometry(), ask: askGeometry() };
  const materials: Record<MarkKind, THREE.MeshBasicMaterial> = {
    quest: material(PALETTE.gold),
    ready: material(PALETTE.gold),
    daily: material(PALETTE.skyBlue),
  };
  const meshes = new Map<string, THREE.Mesh>();
  const seen = new Set<string>();
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const spin = new THREE.Quaternion();

  function meshFor(key: string, kind: MarkKind): THREE.Mesh {
    let mesh = meshes.get(key);
    const geometry = kind === 'ready' ? shapes.ask : shapes.bang;
    if (mesh === undefined) {
      mesh = new THREE.Mesh(geometry, materials[kind]);
      mesh.name = `guild:mark:${key}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      meshes.set(key, mesh);
      group.add(mesh);
    } else {
      mesh.geometry = geometry;
      mesh.material = materials[kind];
    }
    return mesh;
  }

  return {
    group,
    update(time, wanted, eye) {
      seen.clear();
      for (const item of wanted) {
        seen.add(item.key);
        const mesh = meshFor(item.key, item.kind);
        up.copy(item.crown).normalize();
        // Any tangent will do for a mark that turns: one off the world's x, else z.
        ahead.set(1, 0, 0).projectOnPlane(up);
        if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, 1).projectOnPlane(up);
        ahead.normalize();
        // X = Y x Z, a proper rotation.
        side.crossVectors(up, ahead).normalize();
        basis.makeBasis(side, up, ahead);
        if (basis.determinant() <= 0) throw new Error('guild: a mark would be drawn mirrored');
        mesh.quaternion.setFromRotationMatrix(basis);
        spin.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, time * SPIN + item.key.length);
        mesh.quaternion.multiply(spin);
        const far = mesh.position.copy(item.crown).distanceTo(eye);
        const scale = MARK_HEIGHT * Math.max(1, far / GROW_FROM);
        mesh.scale.setScalar(scale);
        mesh.position.addScaledVector(up, MARK_LIFT * Math.max(1, far / GROW_FROM) + Math.sin(time * BOB_RATE + item.key.length) * BOB);
      }
      for (const [key, mesh] of meshes) {
        if (seen.has(key)) continue;
        mesh.removeFromParent();
        meshes.delete(key);
      }
    },
    dispose() {
      for (const mesh of meshes.values()) mesh.removeFromParent();
      meshes.clear();
      shapes.bang.dispose();
      shapes.ask.dispose();
      for (const made of Object.values(materials)) made.dispose();
      group.removeFromParent();
    },
  };
}
