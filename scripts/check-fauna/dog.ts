import * as THREE from 'three';
import { MeshBasicMaterial } from 'three';
import { AVATAR_HEIGHT } from '../../src/stature.ts';
import { dogScale } from '../../src/folk/dogs.ts';
import { makeRigged } from '../../src/models.ts';
import { rigFromDisk } from '../kit-node.ts';
import { check } from './setup.ts';

// --- the dog -------------------------------------------------------------------
//
// The townsfolk's dog (`folk/dogs.ts`) is the pack's Shiba Inu, baked as `dog`:
// it walks and stands, comes up about a fifth of a person at the withers, and
// its paws keep to the floor through the walk.

console.log('\nthe dog:');
{
  const rig = await rigFromDisk('dog', new MeshBasicMaterial());
  const names = rig.clips.map((clip) => clip.name);
  check(names.includes('Walk') && names.includes('Idle'), 'the dog rig walks and stands', names.join(', '));
  const rigged = makeRigged(rig);
  rigged.root.scale.setScalar(dogScale(rig));
  const walk = rigged.actions.get('Walk')!;
  walk.play();
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  let lowest = Infinity;
  let highest = -Infinity;
  const duration = walk.getClip().duration;
  for (let k = 0; k < 12; k++) {
    rigged.mixer.setTime((k / 12) * duration);
    rigged.root.updateMatrixWorld(true);
    rigged.body.skeleton.update();
    box.makeEmpty();
    const position = rigged.body.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 3) {
      rigged.body.getVertexPosition(i, vertex);
      vertex.applyMatrix4(rigged.body.matrixWorld);
      box.expandByPoint(vertex);
    }
    lowest = Math.min(lowest, box.min.y);
    highest = Math.max(highest, box.max.y);
  }
  const share = highest / AVATAR_HEIGHT;
  check(share > 0.2 && share < 0.45, 'a dog comes up to a walker\'s knee or thigh', `${share.toFixed(2)} of a body at its ears`);
  check(Math.abs(lowest) < AVATAR_HEIGHT * 0.03, 'and its paws keep to the floor through the walk', `lowest ${lowest.toFixed(3)} units`);
}
