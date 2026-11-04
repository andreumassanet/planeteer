/**
 * The guild people's name plates: a small inked plate over each one near
 * enough to read, their name and under it what they do, with their role's
 * icon, faded with distance. Mounted in the HUD's root, so `H` hides them with
 * the rest; the 3D marks over them (`markers.ts`) say whether they have
 * something for you.
 */
import * as THREE from 'three';
import { icon } from '../ui.ts';
import type { GuildRole } from './roles.ts';
import { ROLE_INFO } from './roles.ts';

/** Inside this a plate is whole and past `TAG_FAR` it is gone, camera distance in units. */
const TAG_NEAR = 14;
const TAG_FAR = 55;
const MAX_TAGS = 8;

const STYLE = `
.atlas-guild-tag {
  position: absolute; left: 0; top: 0;
  display: flex; align-items: center; gap: 6px;
  padding: 3px 10px 3px 4px;
  border-radius: 999px;
  border: 2.5px solid var(--ui-ink);
  background: var(--ui-paper);
  box-shadow: 0 3px 0 var(--ui-ink);
  white-space: nowrap;
  pointer-events: none;
  will-change: transform, opacity;
  font-family: var(--ui-font);
}
.atlas-guild-tag-glyph {
  display: grid; place-items: center;
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--ui-gold); color: var(--ui-ink);
  border: 2px solid var(--ui-ink);
}
.atlas-guild-tag-glyph svg { width: 14px; height: 14px; }
.atlas-guild-tag-text { display: flex; flex-direction: column; line-height: 1.05; }
.atlas-guild-tag-name { font-size: 13px; font-weight: 900; color: var(--ui-ink); }
.atlas-guild-tag-role { font-size: 10.5px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: #9e1328; }
`;

let styled = false;

export interface GuildTag {
  role: GuildRole;
  name: string;
  /** Over their head, in the world. */
  crown: THREE.Vector3;
}

export interface GuildTags {
  /** Each frame, with the near people and the camera; `hide` names who is being talked to. */
  update(tags: readonly GuildTag[], camera: THREE.Camera, width: number, height: number, hide: string | null, blocksSight?: (point: THREE.Vector3) => boolean): void;
  dispose(): void;
}

export function createGuildTags(parent: HTMLElement): GuildTags {
  if (!styled) {
    styled = true;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
  }
  const holder = document.createElement('div');
  holder.className = 'atlas-guild-tags';
  parent.append(holder);
  const plates: { root: HTMLElement; glyph: HTMLElement; name: HTMLElement; role: HTMLElement; shown: string }[] = [];
  for (let i = 0; i < MAX_TAGS; i++) {
    const root = document.createElement('div');
    root.className = 'atlas-guild-tag';
    root.style.display = 'none';
    const glyph = document.createElement('span');
    glyph.className = 'atlas-guild-tag-glyph';
    const text = document.createElement('span');
    text.className = 'atlas-guild-tag-text';
    const name = document.createElement('span');
    name.className = 'atlas-guild-tag-name';
    const role = document.createElement('span');
    role.className = 'atlas-guild-tag-role';
    text.append(name, role);
    root.append(glyph, text);
    holder.append(root);
    plates.push({ root, glyph, name, role, shown: '' });
  }
  const projected = new THREE.Vector3();
  const sight = new THREE.Vector3();
  const order: { tag: GuildTag; distance: number }[] = [];

  return {
    update(tags, camera, width, height, hide, blocksSight) {
      order.length = 0;
      for (const tag of tags) {
        if (hide !== null && tag.name === hide) continue;
        const distance = camera.position.distanceTo(tag.crown);
        if (distance < TAG_FAR) order.push({ tag, distance });
      }
      order.sort((a, b) => a.distance - b.distance);
      camera.updateMatrixWorld();
      let used = 0;
      for (const { tag, distance } of order) {
        if (used >= MAX_TAGS) break;
        // Behind a building or a landmark, from where the camera is: not drawn.
        if (blocksSight !== undefined && distance > TAG_NEAR * 0.5 && [0.4, 0.75].some((t) => blocksSight(sight.copy(camera.position).lerp(tag.crown, t)))) continue;
        projected.copy(tag.crown).project(camera);
        if (projected.z > 1 || projected.z < -1) continue;
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (0.5 - projected.y * 0.5) * height;
        if (x < -80 || x > width + 80 || y < -40 || y > height + 40) continue;
        const plate = plates[used++]!;
        const key = `${tag.role}|${tag.name}`;
        if (plate.shown !== key) {
          plate.shown = key;
          plate.glyph.replaceChildren(icon(ROLE_INFO[tag.role].icon, 14));
          plate.name.textContent = tag.name;
          plate.role.textContent = ROLE_INFO[tag.role].title;
        }
        const fade = 1 - Math.min(1, Math.max(0, (distance - TAG_NEAR) / (TAG_FAR - TAG_NEAR)));
        plate.root.style.display = '';
        plate.root.style.opacity = (0.35 + 0.65 * fade).toFixed(2);
        // Over the mark, which hangs over the crown.
        plate.root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 8)}px) translate(-50%, -100%)`;
      }
      for (let i = used; i < MAX_TAGS; i++) {
        const plate = plates[i]!;
        if (plate.root.style.display !== 'none') plate.root.style.display = 'none';
      }
    },
    dispose() {
      holder.remove();
    },
  };
}
