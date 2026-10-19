import './models.ts';
import { kit, craft, fail, f } from './setup.ts';
import * as THREE from 'three';

// --- which way is ahead ---------------------------------------------------------
//
// Every craft is built facing +Z and driven along it, and nothing above can
// tell a model built backwards: the box, the seats and the wheels are the same
// either way round, and the bus drove in reverse with every other assertion
// passing. So each craft's front is found by a witness the build did not use.
// A baked car's, on the kit model it is made of: its headlamps ahead of the
// middle and its tail-lamps behind it, which the pack coloured and nobody here
// chose; the bus's grille and number plate (the pack's `Details`) and its
// bumpers, which the pack puts at the nose. A code-built craft's, on the craft
// itself: a rider's hands ahead of the hip, a propeller on the nose and a tail
// rotor on the tail, a hull narrowest at the bow, and a horse's head (the
// highest of it) ahead of its middle.

console.log('\nwhich way is ahead:');
{
  /** The craft made of a kit model, and the kit model. */
  const KIT_OF: Record<string, string> = { hatchback: 'hatchback-sports', saloon: 'sedan', van: 'van', jeep: 'suv', pickup: 'truck', tractor: 'tractor', bus: 'bus', minibus: 'ambulance' };
  const kitByName = new Map(kit.map((model) => [model.name, model]));
  const colour = new THREE.Color();
  /** Mean z, about the middle, of every corner whose slot passes `test`; NaN if none does. */
  const meanZ = (name: string, test: (slot: string, srgb: THREE.Color) => boolean): number => {
    const model = kitByName.get(name)!;
    const position = model.geometry.getAttribute('position');
    const index = model.geometry.index;
    const middle = (model.box.min.z + model.box.max.z) / 2;
    const passes = model.slots.map((slot, i) => test(slot, colour.copy(model.defaults[i]!).convertLinearToSRGB()));
    let sum = 0;
    let count = 0;
    const corners = index !== null ? index.count : position.count;
    for (let c = 0; c < corners; c++) {
      const v = index !== null ? index.getX(c) : c;
      if (!passes[model.slot[v]!]) continue;
      sum += position.getZ(v) - middle;
      count++;
    }
    return count === 0 ? NaN : sum / count;
  };
  const lamp = (_: string, c: THREE.Color): boolean => c.r > 0.9 && c.g > 0.7 && c.b < 0.45;
  const tail = (_: string, c: THREE.Color): boolean => c.r > 0.8 && c.g < 0.45 && c.b < 0.4;
  /** Width of a built craft within a tenth of its length of each end: [bow, stern]. */
  const endWidths = (group: THREE.Object3D): [number, number] => {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const band = (box.max.z - box.min.z) * 0.1;
    const bow = [Infinity, -Infinity];
    const stern = [Infinity, -Infinity];
    const p = new THREE.Vector3();
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const end = p.z > box.max.z - band ? bow : p.z < box.min.z + band ? stern : null;
        if (end === null) continue;
        end[0] = Math.min(end[0]!, p.x);
        end[1] = Math.max(end[1]!, p.x);
      }
    });
    return [bow[1]! - bow[0]!, stern[1]! - stern[0]!];
  };
  for (const model of craft.values()) {
    const seat = model.seats[0]!;
    const said: string[] = [];
    if (Math.abs(seat.yaw) > 1e-6) fail(`${model.id}: the driver faces ${f(seat.yaw, 3)} rad off the bow`);
    const kitName = KIT_OF[model.id];
    if (kitName !== undefined && !kitByName.has(kitName)) fail(`${model.id}: no kit model '${kitName}' to find its front on`);
    else if (kitName === 'bus' || kitName === 'ambulance') {
      const grille = meanZ(kitName, (slot) => slot === 'Details');
      const bumpers = meanZ(kitName, (slot) => slot === 'Bumper');
      said.push(`grille ${f(grille)}, bumpers ${f(bumpers)} (pack units)`);
      // The minibus's pack has no grille slot: its bumpers say it alone.
      if (!(Number.isNaN(grille) || grille > 0) || !(bumpers > 0)) fail(`${model.id}: its grille and bumpers are behind its middle, so it is built facing -Z and drives backwards`);
    } else if (kitName !== undefined) {
      const ahead = meanZ(kitName, lamp);
      const behind = meanZ(kitName, tail);
      said.push(`headlamps ${f(ahead)}${Number.isNaN(behind) ? '' : `, tail-lamps ${f(behind)}`} (pack units)`);
      if (!(ahead > 0)) fail(`${model.id}: its headlamps are behind its middle, so it is built facing -Z and drives backwards`);
      // Red is a tail-lamp and, on some, a seat or a stripe as well: the mean is held behind the headlamps.
      if (behind >= ahead) fail(`${model.id}: its tail-lamps are not behind its headlamps`);
    } else if (seat.pose === 'ride' && model.kind !== 'horse') {
      said.push(`hands ${f(seat.grip![2])} ahead of the hip`);
      if (!(seat.grip![2] > 0)) fail(`${model.id}: the rider's hands are behind the hip, so the bars are at the tail`);
    }
    const group = model.build(0);
    group.updateMatrixWorld(true);
    if (model.kind === 'plane') {
      const z = group.getObjectByName('prop')?.getWorldPosition(new THREE.Vector3()).z ?? NaN;
      said.push(`propeller at z ${f(z)}`);
      if (!(z > 0)) fail(`${model.id}: the propeller is not on the nose`);
    }
    if (model.kind === 'helicopter') {
      const z = group.getObjectByName('tail')?.getWorldPosition(new THREE.Vector3()).z ?? NaN;
      said.push(`tail rotor at z ${f(z)}`);
      if (!(z < 0)) fail(`${model.id}: the tail rotor is not on the tail`);
    }
    if (model.medium === 'water') {
      const [bow, stern] = endWidths(group);
      said.push(`${f(bow)} across the bow, ${f(stern)} across the stern`);
      if (!(bow < stern)) fail(`${model.id}: the hull is no narrower at the bow than at the stern, so it may be built facing -Z`);
    }
    if (model.kind === 'horse') {
      let body: THREE.SkinnedMesh | null = null;
      group.traverse((object) => {
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) body = object as THREE.SkinnedMesh;
      });
      const skinned = body as THREE.SkinnedMesh | null;
      if (skinned === null) fail(`${model.id}: no skinned body to find its head on`);
      else {
        skinned.skeleton.update();
        const p = new THREE.Vector3();
        let top = -Infinity;
        let headZ = NaN;
        for (let i = 0; i < skinned.geometry.getAttribute('position').count; i++) {
          skinned.getVertexPosition(i, p);
          p.applyMatrix4(skinned.matrixWorld);
          if (p.y > top) {
            top = p.y;
            headZ = p.z;
          }
        }
        said.push(`head at z ${f(headZ)}`);
        if (!(headZ > 0)) fail(`${model.id}: its head is behind its middle`);
      }
    }
    console.log(`  ${model.id.padEnd(12)} ${said.join('; ') || 'no front to find: it is round'}`);
  }
}
