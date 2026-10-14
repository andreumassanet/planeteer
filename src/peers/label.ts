import * as THREE from 'three';

/** A peer's name as a sprite floating over its head. */
export function labelOf(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const font = '600 28px system-ui, sans-serif';
  context.font = font;
  const width = Math.ceil(context.measureText(name).width) + 24;
  canvas.width = width;
  canvas.height = 40;
  context.font = font;
  context.fillStyle = 'rgba(20, 16, 12, 0.72)';
  context.beginPath();
  context.roundRect(0, 0, width, 40, 20);
  context.fill();
  context.fillStyle = '#fff6e0';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name, width / 2, 21);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthWrite: false });
  // A sprite has no hull; the outline pass would draw it a second time.
  material.userData.outlineParameters = { visible: false };
  const sprite = new THREE.Sprite(material);
  const tall = 0.035;
  sprite.scale.set((tall * width) / 40, tall, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}
