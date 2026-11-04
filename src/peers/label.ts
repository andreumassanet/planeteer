import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { hex } from '../ui.ts';

/** The name's line and the title's under it, in canvas pixels. */
const NAME_FONT = '600 28px system-ui, sans-serif';
const TITLE_FONT = '800 18px system-ui, sans-serif';
const NAME_TALL = 40;
const TITLE_TALL = 24;
/** The name's line as a share of the view's height (`sizeAttenuation` off). */
const LINE = 0.035;

/** What a label was drawn with, so it is drawn again only when that changes. */
interface Drawn {
  name: string;
  title: string | null;
}

/** Draws `name` and, smaller and gold under it, `title` into a canvas sized to them. */
function paint(name: string, title: string | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  context.font = NAME_FONT;
  const nameWidth = context.measureText(name).width;
  context.font = TITLE_FONT;
  const titled = title === null ? '' : title.toUpperCase();
  const titleWidth = title === null ? 0 : context.measureText(titled).width + titled.length * 1.5;
  const width = Math.ceil(Math.max(nameWidth, titleWidth)) + 24;
  const tall = NAME_TALL + (title === null ? 0 : TITLE_TALL);
  canvas.width = width;
  canvas.height = tall;
  context.fillStyle = 'rgba(20, 16, 12, 0.72)';
  context.beginPath();
  context.roundRect(0, 0, width, tall, 20);
  context.fill();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = NAME_FONT;
  context.fillStyle = '#fff6e0';
  context.fillText(name, width / 2, 21);
  if (title !== null) {
    context.font = TITLE_FONT;
    context.fillStyle = hex(PALETTE.gold);
    if ('letterSpacing' in context) (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '1.5px';
    context.fillText(titled, width / 2, NAME_TALL + TITLE_TALL / 2 - 6);
  }
  return canvas;
}

function fit(sprite: THREE.Sprite, canvas: HTMLCanvasElement): void {
  const scale = LINE / NAME_TALL;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
}

/** A peer's name, and the title they wear under it, as a sprite floating over its head. */
export function labelOf(name: string, title: string | null = null): THREE.Sprite {
  const canvas = paint(name, title);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthWrite: false });
  // A sprite has no hull; the outline pass would draw it a second time.
  material.userData.outlineParameters = { visible: false };
  const sprite = new THREE.Sprite(material);
  fit(sprite, canvas);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  sprite.userData.label = { name, title } satisfies Drawn;
  return sprite;
}

/** Draws a label again with a new title under its name, if the title changed. */
export function retitle(sprite: THREE.Sprite, title: string | null): void {
  const drawn = sprite.userData.label as Drawn | undefined;
  if (drawn === undefined || drawn.title === title) return;
  const name = drawn.name;
  const canvas = paint(name, title);
  const old = sprite.material.map;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map = texture;
  sprite.material.needsUpdate = true;
  old?.dispose();
  fit(sprite, canvas);
  sprite.userData.label = { name, title } satisfies Drawn;
}
