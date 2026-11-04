/** The Hall of Fame's board in each guild square near: the top ten explorers, painted on its face. */
import * as THREE from 'three';
import type { GuildSquare } from '../guild/square.ts';

type Leaderboard = typeof import('../leaderboard.ts');

/** How near a board is painted, units; how often its rows are asked again, s. */
const BOARD_REACH = 320;
const FAME_EVERY = 180;

interface Board {
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
}

export interface FameBoards {
  update(dt: number, squares: readonly GuildSquare[], viewer: THREE.Vector3): void;
  dispose(): void;
}

export function createFameBoards(scene: THREE.Object3D, leaderboard: Leaderboard): FameBoards {
  const boards = new Map<number, Board>();
  const basis = new THREE.Matrix4();
  const side = new THREE.Vector3();
  let rows: Parameters<Leaderboard['paintFameBoard']>[1] = [];
  let askIn = 0;

  function paint(board: Board): void {
    leaderboard.paintFameBoard(board.canvas, rows, 'Explorers', { unit: 'XP', onRepaint: () => (board.texture.needsUpdate = true) });
    board.texture.needsUpdate = true;
  }

  function refresh(): void {
    if (!leaderboard.leaderboardsAvailable()) return;
    void leaderboard.leaderboards().board('xp', { limit: 10 }).then((answer) => {
      if (answer.state !== 'ok') return;
      rows = answer.value;
      for (const board of boards.values()) paint(board);
    });
  }

  function drop(index: number, board: Board): void {
    board.mesh.removeFromParent();
    board.mesh.geometry.dispose();
    (board.mesh.material as THREE.Material).dispose();
    board.texture.dispose();
    boards.delete(index);
  }

  function raise(index: number, face: GuildSquare['boards'][number]): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1280;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    material.userData.outlineParameters = { visible: false };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(face.width, face.height), material);
    mesh.name = `guild:fame:${index}`;
    // The plane's +Z is the face's normal, its +Y the board's up; X = Y x Z.
    side.crossVectors(face.up, face.normal).normalize();
    basis.makeBasis(side, face.up, face.normal);
    if (basis.determinant() <= 0) throw new Error('guild: the Hall of Fame board would be mirrored');
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.copy(face.at).addScaledVector(face.normal, 0.08);
    const board = { mesh, texture, canvas };
    boards.set(index, board);
    scene.add(mesh);
    paint(board);
    if (rows.length === 0) askIn = 0;
  }

  return {
    update(dt, squares, viewer) {
      const near = new Set<number>();
      for (const square of squares) {
        const face = square.boards.find((board) => board.kind === 'fame');
        if (face === undefined || face.at.distanceTo(viewer) > BOARD_REACH) continue;
        near.add(square.index);
        if (!boards.has(square.index)) raise(square.index, face);
      }
      for (const [index, board] of boards) if (!near.has(index)) drop(index, board);
      askIn -= dt;
      if (boards.size > 0 && askIn <= 0) {
        askIn = FAME_EVERY;
        refresh();
      }
    },
    dispose() {
      for (const [index, board] of boards) drop(index, board);
    },
  };
}
