/**
 * Ejecta: angular blocks thrown out of a crater and left where they fell.
 *
 * On an airless body nothing rounds a rock but other rocks, so a block on
 * Mercury keeps the faces it broke along; and a young one is bright, because
 * the sun has not yet had time to darken it — space weathering, the reason
 * old ground on Mercury is dark and rays are white. Boxes, turned, one leaning
 * on another, in pale colours that read against the grey.
 */
import type { Decoration } from '../contract.ts';
import { PALETTE } from '../../theme.ts';

export const MERCURY_EJECTA_BLOCK: Decoration = {
  id: 'mercury-ejecta-block',
  footprint: 2.4,
  bodies: ['mercury'],
  build(ctx, rng) {
    const group = new ctx.THREE.Group();
    const size = rng.range(1.1, 1.6);
    const tall = size * rng.range(0.7, 1.2);
    const main = ctx.box(size * rng.range(1.1, 1.4), tall, size, PALETTE.bone);
    main.rotation.y = rng.range(0, Math.PI);
    group.add(main);
    // A cap of a different face, so the block reads as broken and not cut.
    const cap = ctx.taper(size * 0.55, size * 0.3, size * 0.45, PALETTE.white, 4);
    cap.position.y = tall;
    cap.rotation.y = rng.range(0, Math.PI);
    group.add(cap);
    const chips = rng.between(1, 3);
    for (let k = 0; k < chips; k++) {
      const s = rng.range(0.3, 0.6);
      const chip = ctx.box(s, s * rng.range(0.5, 1), s * rng.range(0.6, 1), k % 2 === 0 ? PALETTE.tan : PALETTE.bone);
      const angle = rng.range(0, Math.PI * 2);
      const out = rng.range(1.3, 1.85);
      chip.position.set(Math.cos(angle) * out, 0, Math.sin(angle) * out);
      chip.rotation.y = rng.range(0, Math.PI);
      group.add(chip);
    }
    return group;
  },
};
