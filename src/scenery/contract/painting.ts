import * as THREE from 'three';
import { PALETTE } from '../../theme.ts';
import { shadeByClouds } from '../../cloud-shade.ts';
import { PAINTED_MARK } from '../../monuments/contract.ts';
import type { MonumentContext } from '../../monuments/contract.ts';
import { paintModel } from '../../models.ts';
import type { Model, Paint } from '../../models.ts';
import type { ModelFit, SceneryContext } from './context-type.ts';
import { NARROWEST, doorOf, radiusOf, sceneryModel, shadeUp, stretchBand, windowsOf } from './models.ts';

type Painting = Pick<SceneryContext, 'painted' | 'coloured' | 'fitted'> & { dispose(): void };

/** Baked models and vertex-coloured geometry as meshes of the context's one painted material. */
export function createPainting(base: MonumentContext): Painting {
  let paintedMaterial: THREE.MeshToonMaterial | null = null;
  function vertexColoured(): THREE.MeshToonMaterial {
    if (paintedMaterial === null) {
      const source = base.toon(PALETTE.ink);
      paintedMaterial = shadeByClouds(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: source.gradientMap }));
      paintedMaterial.userData.outlineParameters = { ...source.userData.outlineParameters, outlineNormal: true };
      paintedMaterial.userData.atlasToon = PALETTE.white;
      paintedMaterial.userData[PAINTED_MARK] = true;
    }
    return paintedMaterial;
  }
  function painted(model: Model, paint?: Paint): THREE.Mesh {
    const mesh = new THREE.Mesh(paintModel(model, paint), vertexColoured());
    mesh.name = model.name;
    return mesh;
  }
  function coloured(geometry: THREE.BufferGeometry): THREE.Mesh {
    if (geometry.getAttribute('color') === undefined) throw new Error('coloured() wants geometry with its own colour attribute');
    return new THREE.Mesh(geometry, vertexColoured());
  }

  function fitted(id: string, fit: ModelFit, paint?: Paint): THREE.Group {
    const model = sceneryModel(id);
    const size = model.box.getSize(new THREE.Vector3());
    // With a door and no height, the height is what stands the model's own door that tall.
    const modelDoor = fit.door !== undefined ? (fit.modelDoor ?? doorOf(model, fit.windows ?? (() => false))) : 0;
    const height = fit.height ?? (fit.door !== undefined ? (size.y * fit.door) / modelDoor : undefined);
    let squash = fit.squash ?? 1;
    if (fit.narrow === true && height !== undefined) {
      // The height is the model's and the plan gives way to the footprint.
      const tall = height / size.y;
      const room = Math.min(
        fit.radius !== undefined ? fit.radius / (radiusOf(model) * tall) : Infinity,
        fit.width !== undefined ? fit.width / (size.x * tall) : Infinity,
        fit.length !== undefined ? fit.length / (size.z * tall) : Infinity,
      );
      squash = Math.min(squash, Math.max(NARROWEST, room));
    }
    const k = Math.min(
      height !== undefined ? height / size.y : Infinity,
      fit.width !== undefined ? fit.width / (size.x * squash) : Infinity,
      fit.length !== undefined ? fit.length / (size.z * squash) : Infinity,
      fit.radius !== undefined ? fit.radius / (radiusOf(model) * squash) : Infinity,
    );
    if (!Number.isFinite(k)) throw new Error(`model '${id}': a fit needs a height, a width, a length or a radius`);
    const mesh = painted(model, paint);
    if (fit.door !== undefined) {
      // Where the plan held the model shorter than its door, the band under
      // `lift` is drawn taller to make it up, and the roof keeps its pitch.
      const stretch = Math.max(1, fit.door / (modelDoor * k));
      if (stretch > 1) stretchBand(mesh.geometry, model.box.min.y, fit.lift ?? size.y, stretch);
      mesh.userData.atlasDoorHeight = modelDoor * stretch;
    }
    if (fit.shade !== undefined) shadeUp(model, mesh.geometry, fit.shade);
    if (fit.windows !== undefined) {
      const mask = windowsOf(model, fit.windows);
      if (mask !== null) {
        mesh.geometry.setAttribute('atlasWindow', new THREE.BufferAttribute(mask, 1));
        mesh.userData.atlasLit = 1;
      }
    }
    // Centred on its axis before anything turns it, so a yaw spins it in place.
    mesh.position.set(-(model.box.min.x + model.box.max.x) / 2, -model.box.min.y, -(model.box.min.z + model.box.max.z) / 2);
    mesh.castShadow = true;
    const turned = new THREE.Group();
    turned.rotation.y = fit.yaw ?? 0;
    turned.add(mesh);
    // Scale in a parent of the turn, so the squash stays across whatever the yaw.
    const sized = new THREE.Group();
    sized.scale.set(k * squash, k, k * squash);
    sized.position.y = -(fit.sink ?? 0);
    sized.add(turned);
    const group = new THREE.Group();
    group.add(sized);
    return group;
  }

  return {
    painted,
    coloured,
    fitted,
    dispose() {
      paintedMaterial?.dispose();
      paintedMaterial = null;
    },
  };
}
