import * as THREE from 'three';
import { clipsOf, keyOf, ordered, sourceOf } from './source.ts';
import { assemble, paintInto, spawnPerson } from './template.ts';
import { IDLE_MIXES, YOUNG_HEAD, type Cast, type Person, type Source, type Template } from './types.ts';
import { OUTFITS, PARTS, type OutfitId, type Wardrobe } from './wardrobe.ts';

/**
 * Loads the outfits asked for and the shared clips. Everything after this is
 * synchronous, which is what lets `buildAvatar` stay a plain function; more
 * outfits arrive through `ensure`.
 */
export async function loadCast(material: THREE.Material, outfits: readonly OutfitId[] = OUTFITS): Promise<Cast> {
  const clips = await clipsOf();
  const loaded = new Map<OutfitId, Source>();
  const load = async (list: readonly OutfitId[]): Promise<void> => {
    const got = await Promise.all(list.map((id) => sourceOf(id)));
    for (const source of got) loaded.set(source.outfit, source);
  };
  await load(outfits);

  const templates = new Map<string, Template>();
  const spare = new Map<string, Person[]>();
  /** Mixed wardrobes nobody wears, oldest first. */
  const idle: string[] = [];

  const need = (outfit: OutfitId): Source => {
    const found = loaded.get(outfit);
    if (found === undefined) throw new Error(`cast: ${outfit} was not loaded`);
    return found;
  };

  function templateFor(dress: OutfitId | Wardrobe): { key: string; template: Template } {
    const whole = typeof dress === 'string';
    const parts = whole
      ? PARTS.filter((part) => need(dress).parts.has(part)).map((part) => ({ outfit: dress, part }))
      : ordered(dress);
    const key = whole ? dress : keyOf(parts);
    let template = templates.get(key);
    if (template === undefined) {
      template = assemble(material, need, parts, !whole);
      templates.set(key, template);
    }
    const waiting = idle.indexOf(key);
    if (waiting >= 0) idle.splice(waiting, 1);
    return { key, template };
  }

  /** Lets go of the oldest idle mixed wardrobes past `IDLE_MIXES`, and every spare person in them. */
  function trim(): void {
    while (idle.length > IDLE_MIXES) {
      const key = idle.shift()!;
      const template = templates.get(key);
      templates.delete(key);
      for (const person of spare.get(key) ?? []) {
        person.mesh.geometry.dispose();
        person.mesh.skeleton.dispose();
      }
      spare.delete(key);
      template?.mesh.geometry.dispose();
    }
  }

  return {
    get outfits() {
      return [...loaded.keys()];
    },
    clips,
    has: (outfit) => loaded.has(outfit),
    ensure: (outfits) => load(outfits.filter((outfit) => !loaded.has(outfit))),
    materialsOf: (worn) => need(worn.outfit).parts.get(worn.part)?.materials.map((own) => own.name) ?? [],
    release(person) {
      person.mixer.stopAllAction();
      // A person let go mid-gesture keeps the weights it was blending with.
      for (const action of person.actions.values()) action.setEffectiveWeight(1).timeScale = 1;
      person.root.removeFromParent();
      person.root.position.set(0, 0, 0);
      person.root.quaternion.identity();
      // Hidden by whoever held it (a peer in a closed cab), it would be
      // handed to the next townsman invisible.
      person.root.visible = true;
      const pool = spare.get(person.outfit) ?? [];
      pool.push(person);
      spare.set(person.outfit, pool);
      const template = templates.get(person.outfit);
      if (template !== undefined && --template.live <= 0 && template.mixed) {
        template.live = 0;
        idle.push(person.outfit);
        trim();
      }
    },
    make(dress, paint, height, young = false) {
      const { key, template } = templateFor(dress);
      template.live++;
      const reused = spare.get(key)?.pop();
      if (reused !== undefined) {
        const attribute = reused.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        paintInto(template, paint, attribute.array as Float32Array);
        attribute.needsUpdate = true;
        reused.root.scale.setScalar(height / template.height);
        reused.bones.get('Head')?.scale.setScalar(young ? YOUNG_HEAD : 1);
        reused.height = height;
        return reused;
      }
      return spawnPerson(template, key, clips, paint, height, young);
    },
  };
}
