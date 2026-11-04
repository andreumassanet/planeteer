/** The canopies, the titles and the companion. */
import * as THREE from 'three';
import { BY_SLOT, DEFAULT_APPEARANCE_TITLE, canopyCell, titleOf } from './extras-imports.ts';
import { buildParachute, paintCanopy, wearCanopy } from '../../src/craft/parachute.ts';
import { createCompanions, type CompanionTraveller } from '../../src/cosmetics.ts';
import { PALETTE } from '../../src/theme.ts';
import { rigFromDisk } from '../kit-node.ts';
import { fail } from './setup.ts';

const PALETTE_COLOURS = new Set<number>(Object.values(PALETTE));

console.log('\nthe canopies:');
{
  for (let canopy = 0; canopy <= BY_SLOT.canopy.length; canopy++) {
    const cells = Array.from({ length: 9 }, (_, i) => canopyCell(canopy, i, 9));
    for (const colour of cells) if (!PALETTE_COLOURS.has(colour)) fail(`canopy ${canopy}: a cell off the palette`);
    if (cells.includes(PALETTE.ink)) fail(`canopy ${canopy}: a cell in the pen's ink`);
    if (new Set(cells).size < 2) fail(`canopy ${canopy}: one colour`);
  }
  const colours = (parachute: THREE.Object3D): string => {
    const body = parachute.getObjectByName('body') as THREE.Mesh;
    return Array.from(body.geometry.getAttribute('color').array as Float32Array).slice(0, 300).join(',');
  };
  const sunset = buildParachute(0);
  const sky = buildParachute(1);
  if (colours(sunset) === colours(sky)) fail('two canopies are the same colours');
  paintCanopy(sunset, 1);
  if (colours(sunset) !== colours(sky)) fail('a canopy repainted is not the canopy built in its colours');
  wearCanopy(0);
  const own = buildParachute();
  wearCanopy(2);
  if (colours(own) !== colours(buildParachute(2))) fail("the traveller's parachute does not follow the canopy they wear");
  wearCanopy(0);
  if (colours(own) !== colours(buildParachute(0))) fail("the traveller's parachute does not come back to the sunset");
  console.log(`  ${BY_SLOT.canopy.length + 1} canopies in the palette, each of several colours; a built one repaints, and the traveller's follows what they wear`);
}

console.log('\nthe titles:');
{
  if (titleOf({ title: 0 }) !== null) fail('no title has a name');
  BY_SLOT.title.forEach((item) => {
    if (titleOf({ title: item.index }) !== item.name) fail(`${item.id} is not called ${item.name}`);
    if (item.name.length > 16) fail(`${item.name} is too long for a name plate`);
  });
  if (titleOf({ title: 999 }) !== null) fail('a title past the table has a name');
  console.log(`  ${BY_SLOT.title.length} titles, each its own name, none past the plate; ${DEFAULT_APPEARANCE_TITLE === 0 ? 'none' : 'one'} worn by default`);
}

console.log('\nthe companion:');
{
  const rig = await rigFromDisk('dog', new THREE.MeshBasicMaterial());
  const companions = createCompanions();
  companions.setRigs({ get: (id) => (id === 'dog' ? rig : null) });
  const R = 32000;
  const traveller: CompanionTraveller = { key: 'hero', position: new THREE.Vector3(0, R, 0), up: new THREE.Vector3(0, 1, 0), forward: new THREE.Vector3(0, 0, 1), pet: 1, onFoot: true };
  let farthest = 0;
  for (let f = 0; f < 600; f++) {
    // Walking, then running, then standing.
    const speed = f < 200 ? 6.5 : f < 400 ? 14 : 0;
    traveller.position.z += speed / 60;
    traveller.position.setLength(R);
    traveller.up.copy(traveller.position).normalize();
    companions.update(1 / 60, [traveller], traveller.position);
    const dog = companions.group.children[0];
    if (dog === undefined) {
      fail('a traveller with the dog has none');
      break;
    }
    farthest = Math.max(farthest, dog.position.distanceTo(traveller.position));
    if (!(dog.matrixWorld.determinant() >= 0)) fail('the dog is drawn through a reflected matrix');
  }
  if (farthest > 3.77 * 8) fail(`the dog fell ${farthest.toFixed(1)} behind`);
  const dog = companions.group.children[0]!;
  dog.updateMatrixWorld(true);
  if (!(dog.matrixWorld.determinant() > 0)) fail('the dog is drawn through a reflected matrix');
  const rest = dog.position.distanceTo(traveller.position);
  if (rest > 3.77 * 0.8) fail(`standing, the dog waits ${rest.toFixed(2)} away`);
  traveller.onFoot = false;
  companions.update(1 / 60, [traveller], traveller.position);
  if (companions.stats.drawn !== 0) fail('the dog is drawn while its traveller is in a vehicle');
  traveller.onFoot = true;
  traveller.pet = 0;
  companions.update(1 / 60, [traveller], traveller.position);
  if (companions.stats.drawn !== 0) fail('a traveller with no pet has a dog');
  traveller.pet = 1;
  const far = traveller.position.clone().multiplyScalar(1.1);
  companions.update(1 / 60, [traveller], far);
  if (companions.stats.drawn !== 0) fail('a dog out of reach is drawn');
  console.log(`  following a walk and a run it fell at most ${farthest.toFixed(2)} behind, and waits ${rest.toFixed(2)} away; not drawn in a vehicle, without a pet, or out of reach`);
  companions.dispose();
}
