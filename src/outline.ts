import * as THREE from 'three';
import { dissolveGLSL } from './fade.ts';

/**
 * The ink: the scene drawn a second time with the back faces of every mesh
 * pushed out along their normals, so each silhouette comes back as a black
 * line. A fork of Three's `OutlineEffect`
 * (`examples/jsm/effects/OutlineEffect.js`) with the same
 * `userData.outlineParameters` contract.
 *
 * Differences from upstream:
 *
 * - Instancing. The stock hull rebuilds the point it is pushed away from
 *   without `instanceMatrix`, so for an `InstancedMesh` the hull slides instead
 *   of expanding and most of the line disappears. The inset here goes through
 *   the same projection as the fill. The material the effect generates lives in
 *   a closure with no accessor, hence a fork.
 * - A vertex transform. A material that moves its own vertices in
 *   `onBeforeCompile` owes the hull the same movement, or the hull is drawn
 *   for geometry that is no longer there and shows as the whole old shape in
 *   solid ink. `outlineParameters.transform` hands the effect the GLSL the
 *   material displaces with (see `OutlineTransform`).
 * - Skinning: the four chunks every skinned material includes, in
 *   `MeshToonMaterial`'s order. All are `#ifdef USE_SKINNING`, so other hulls
 *   compile to the same program. The inset stays exact because skinning is
 *   affine.
 *
 * Left out because nothing here uses it: morph targets, displacement maps,
 * clipping planes, the keep-alive cache (a `WeakMap` does that job), the
 * per-object `onBeforeRender` swap and the VR entry point. `BatchedMesh` is
 * unsupported, as upstream: `<project_vertex>` reads a `batchingMatrix` that
 * only `<batching_vertex>` declares.
 */

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <skinning_pars_vertex>

uniform float outlineThickness;

#ifdef OUTLINE_NORMAL
  attribute vec3 outlineNormal;
#endif

#ifdef OUTLINE_CUT
  varying vec3 vOutlineView;
#endif

void main() {
  #include <beginnormal_vertex>
  #ifdef OUTLINE_NORMAL
    // The hull's own normals: welded smooth where the fill's are creased, so
    // the line is one closed skin rather than a slab per facet.
    objectNormal = outlineNormal;
  #endif
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>

  #ifdef OUTLINE_CUT
    vOutlineView = mvPosition.xyz;
  #endif

  // The same vertex pulled *in* along its normal, taken through the identical
  // object -> clip chain as gl_Position above, instance transform and all.
  // Dropping instanceMatrix here is the upstream bug.
  vec4 inset = vec4( transformed - objectNormal, 1.0 );

  #ifdef USE_INSTANCING
    inset = instanceMatrix * inset;
  #endif

  // Bracketed, because GLSL multiplication is left-associative and the upstream
  // form multiplies the two matrices together first, then applies the product
  // to a point that, once instanceMatrix is in, sits ~16000 units from the
  // origin. gl_Position is built one matrix at a time. Matching that keeps the
  // two points we are about to subtract on the same operation order, so their
  // float32 error is common-mode.
  // (Comments in here stay ASCII: the GLSL source character set is.)
  vec4 reference = projectionMatrix * ( modelViewMatrix * inset );

  // Away from that point is outward. Scaling by w keeps the line a constant
  // width on screen rather than in the world, which is why thickness is 0.005
  // and not a number of units.
  vec4 pos = gl_Position;
  gl_Position = pos + normalize( pos - reference ) * outlineThickness * pos.w;

  #include <fog_vertex>
}
`;

/**
 * The hull's vertex shader, with a material's own vertex transform spliced in.
 *
 * Without a transform this returns the string above unchanged, so every
 * material that does not ask for one compiles the program it always did. With
 * one, three things move: the declaration goes in beside `outlineThickness`
 * (it brings its own uniforms, so the hook is a function rather than a fixed
 * set of parameters); `transformed` is passed through it before
 * `<project_vertex>`; and the inset point is passed through it too, before the
 * assignment overwrites `transformed`. `normalize(pos - reference)` subtracts
 * two points, so both must have been through the same map or the hull expands
 * along the normal of a shape that is not on the screen.
 */
function hullVertexShader(transform?: string): string {
  if (transform === undefined) return vertexShader;
  return vertexShader
    .replace('uniform float outlineThickness;', `uniform float outlineThickness;\n\n${transform}`)
    .replace(
      '  #include <begin_vertex>',
      '  #include <begin_vertex>\n\n' +
        '  // The material displaces its own vertices; see OutlineParameters.transform.\n' +
        '  // The inset first, because the line below overwrites what it reads.\n' +
        '  vec3 outlineInset = atlasVertex( transformed - objectNormal );\n' +
        '  transformed = atlasVertex( transformed );',
    )
    .replace('vec4 inset = vec4( transformed - objectNormal, 1.0 );', 'vec4 inset = vec4( outlineInset, 1.0 );');
}

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 outlineColor;
uniform float outlineAlpha;

#ifdef OUTLINE_DISSOLVE
  uniform float atlasFade;
#endif

#ifdef OUTLINE_CUT
  varying vec3 vOutlineView;
  OUTLINE_CUT_DECLARATION
#endif

void main() {
  #ifdef OUTLINE_CUT
    OUTLINE_CUT_DISCARD
  #endif
  #ifdef OUTLINE_DISSOLVE
    // The same screen door as the fill it belongs to; see fade.ts.
    ${dissolveGLSL('atlasFade')}
  #endif
  gl_FragColor = vec4( outlineColor, outlineAlpha );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <premultiplied_alpha_fragment>
}
`;

/**
 * A vertex transform the source material applies, handed to the hull so it
 * applies the same one.
 *
 * `declaration` is GLSL that must define `vec3 atlasVertex(vec3 p)` and
 * declare whatever uniforms it reads. The source material calls that same
 * function on `transformed` in its own `onBeforeCompile`; the two shaders
 * share one string and one uniform object, so they cannot disagree about a
 * silhouette.
 *
 * `uniforms` are held by reference, not cloned, so the fill and the hull read
 * the same values on the same frame.
 */
export interface OutlineTransform {
  declaration: string;
  uniforms: Record<string, THREE.IUniform>;
}

/**
 * Pixels the hull drops by where they are, as its fill drops them
 * (`see-through.ts`). `declaration` is fragment GLSL; `discard` a statement
 * that may read `vOutlineView`, the hull's view-space position. The uniforms
 * are held by reference.
 */
export interface OutlineCut {
  declaration: string;
  discard: string;
  uniforms: Record<string, THREE.IUniform>;
}

/** What a material asks for in `userData.outlineParameters`. */
export interface OutlineParameters {
  /** Screen-space width. The planet and the monuments use 0.005, the avatar 0.006. */
  thickness?: number;
  /** Linear RGB, 0..1. */
  color?: [number, number, number];
  alpha?: number;
  /** `false` suppresses the outline entirely — how the sky dome opts out. */
  visible?: boolean;
  /**
   * Push the hull out along a geometry's `outlineNormal` attribute instead of
   * its `normal`. For shading that keeps hard creases (a low-poly character),
   * where creased normals would split the hull at every crease. Read once, like
   * `transform`; every geometry drawn with the material must carry the attribute.
   */
  outlineNormal?: boolean;
  /**
   * See `OutlineTransform`. Read once, when this material's hull is first built,
   * because it is compiled into the program (as `fog` and `toneMapped` are). Its
   * uniforms are live; the GLSL is not.
   */
  transform?: OutlineTransform;
  /**
   * The fade of a dissolving fill (`fade.ts`), held by reference like a
   * transform's uniforms: the hull discards the pixels the fill does, or its
   * back faces show through the holes as black speckle. Read once.
   */
  dissolve?: THREE.IUniform<number>;
  /** See `OutlineCut`. Read once. */
  cut?: OutlineCut;
}

export interface OutlineOptions {
  defaultThickness?: number;
  defaultColor?: [number, number, number];
  defaultAlpha?: number;
}

interface OutlineUniforms {
  outlineThickness: THREE.IUniform<number>;
  outlineColor: THREE.IUniform<THREE.Color>;
  outlineAlpha: THREE.IUniform<number>;
}

/** How many instance matrices one mesh is sampled at. See `checkInstanceBasis`. */
const BASIS_SAMPLES = 64;

/**
 * Pixels of projected radius under which a mesh gets no hull, and the factor
 * it has to grow past that before it gets one back. 0 turns it off.
 *
 * The pen is a constant screen-space width, so below a few pixels the hull
 * covers the fill and a distant wood tile or house reads as a dark speck; it
 * is also a second draw call per mesh. A mesh whose bounding sphere projects
 * under this radius is left out of the ink pass and must grow by a third
 * before it is put back, so one sitting on the line does not flicker.
 */
const THIN_INK_PIXELS = 4;
const THIN_INK_HYSTERESIS = 1.3;

/**
 * Determinant of the basis in a 4x4 at `offset`, column-major as three stores
 * them: the scalar triple product of the three axis columns.
 */
function basisDeterminant(m: ArrayLike<number>, offset: number): number {
  const ax = m[offset]!, ay = m[offset + 1]!, az = m[offset + 2]!;
  const bx = m[offset + 4]!, by = m[offset + 5]!, bz = m[offset + 6]!;
  const cx = m[offset + 8]!, cy = m[offset + 9]!, cz = m[offset + 10]!;
  return ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
}

export class OutlineEffect {
  /** Off draws the scene once, with no ink. For A/B in the console. */
  enabled = true;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly thickness: number;
  private readonly color: THREE.Color;
  private readonly alpha: number;

  // One outline material per source material, both ways. Weak, so a material
  // that goes out of scope takes its outline with it.
  private readonly outlines = new WeakMap<THREE.Material, THREE.ShaderMaterial>();
  private readonly sources = new WeakMap<THREE.Material, THREE.Material>();
  /** Instance matrices already judged, by the attribute version they were judged at. */
  private readonly basisVersion = new WeakMap<THREE.InstancedMesh, number>();
  private readonly basisWarned = new WeakSet<THREE.InstancedMesh>();
  /** Meshes left out of the ink pass for being too small; see `THIN_INK_PIXELS`. */
  private readonly thin = new WeakSet<THREE.Object3D>();
  /** The camera of the pass in progress, and pixels per unit of radius at unit distance; 0 skips the test. */
  private readonly eye = new THREE.Vector3();
  private focal = 0;
  private readonly size = new THREE.Vector2();
  private readonly centre = new THREE.Vector3();
  /** Meshes hulls were skipped for in the last pass. */
  thinSkipped = 0;

  constructor(renderer: THREE.WebGLRenderer, options: OutlineOptions = {}) {
    this.renderer = renderer;
    this.thickness = options.defaultThickness ?? 0.003;
    this.color = new THREE.Color().fromArray(options.defaultColor ?? [0, 0, 0]);
    this.alpha = options.defaultAlpha ?? 1;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const renderer = this.renderer;
    renderer.render(scene, camera);
    if (!this.enabled) return;

    // The second pass redraws the same frame: it must not clear what the first
    // left, must not let anything move between the two, and must not redo the
    // shadow maps or paint the background over the image.
    //
    // The first pass is left on the renderer's own autoClear; upstream forces it
    // to a field its constructor never assigns.
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.enabled;
    const autoUpdate = scene.matrixWorldAutoUpdate;
    const background = scene.background;
    renderer.autoClear = false;
    renderer.shadowMap.enabled = false;
    scene.matrixWorldAutoUpdate = false;
    scene.background = null;

    // The pixel test's camera, for `THIN_INK_PIXELS`: CSS pixels, because the pen
    // is a width on the page and not a count of samples.
    const perspective = camera as THREE.PerspectiveCamera;
    if (THIN_INK_PIXELS > 0 && perspective.isPerspectiveCamera === true) {
      renderer.getSize(this.size);
      this.focal = this.size.y / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2));
      this.eye.setFromMatrixPosition(perspective.matrixWorld);
    } else this.focal = 0;
    this.thinSkipped = 0;

    // In a `finally`, because a throw anywhere in the pass (a shader that will not
    // link, a geometry disposed under a mesh) would otherwise leave every mesh
    // wearing its hull and the scene's matrices frozen. `swapOut` restores
    // whatever `swapIn` reached and leaves the rest alone.
    try {
      scene.traverse(this.swapIn);
      renderer.render(scene, camera);
    } finally {
      scene.traverse(this.swapOut);
      for (const object of this.hidden) object.visible = true;
      this.hidden.length = 0;

      renderer.autoClear = autoClear;
      renderer.shadowMap.enabled = shadows;
      scene.matrixWorldAutoUpdate = autoUpdate;
      scene.background = background;
    }
  }

  /**
   * Compiles the hull of everything under `objects` against `targetScene`'s
   * lights and fog without drawing it: `warm.ts`'s half of the warm-up, since
   * three has never been shown the hull materials.
   *
   * The swap is undone before this returns; the promise only waits for the
   * programs. The shadow map is off for the compile as it is for the ink pass,
   * because whether it is on is part of a program's key.
   */
  compileAsync(objects: THREE.Object3D, camera: THREE.Camera, targetScene: THREE.Scene): Promise<unknown> {
    const renderer = this.renderer;
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    // Every hull, whatever size it is: nothing here is on the screen.
    this.focal = 0;
    try {
      objects.traverse(this.swapIn);
      return renderer.compileAsync(objects, camera, targetScene);
    } finally {
      objects.traverse(this.swapOut);
      for (const object of this.hidden) object.visible = true;
      this.hidden.length = 0;
      renderer.shadowMap.enabled = shadows;
    }
  }

  /**
   * Objects hidden for the ink pass because they are not meshes and asked not to
   * be drawn in it. Cleared by `swapOut`.
   *
   * The pass renders the whole scene a second time, so anything the hull cannot
   * replace is drawn twice, and for an additive object (the city lights, a
   * `Points` with `AdditiveBlending`) that doubles the brightness. A mesh does
   * not show this because the second pass replaces its material with the hull.
   * Points, lines and sprites keep their own material, so the pass honours
   * `outlineParameters.visible === false` for them by leaving them out.
   */
  private readonly hidden: THREE.Object3D[] = [];

  private readonly swapIn = (object: THREE.Object3D): void => {
    const mesh = object as THREE.Mesh;
    // No normals, no hull to invert.
    if (mesh.isMesh !== true || mesh.geometry.attributes.normal === undefined) {
      if (object.visible && this.optsOut(object)) {
        object.visible = false;
        this.hidden.push(object);
      }
      return;
    }
    const instanced = object as THREE.InstancedMesh;
    if (instanced.isInstancedMesh === true) this.checkInstanceBasis(instanced);
    if (this.focal > 0 && object.visible && this.isThin(mesh)) {
      object.visible = false;
      this.hidden.push(object);
      this.thinSkipped++;
      return;
    }
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => this.outlineFor(material))
      : this.outlineFor(mesh.material);
  };

  /**
   * Warns once about instance matrices built from a reflected basis.
   *
   * `makeBasis(east, up, north)` has determinant -1 (X cross Y is Z, but east
   * cross up is minus north). A reflection reverses the winding, and three
   * decides front from back on the object's own matrix without looking at the
   * per-instance one, so the hull's outward faces stop being culled and the
   * object comes back as a solid blob of ink. An ordinary `Mesh` cannot show
   * this, because `setFromRotationMatrix` repairs the basis.
   *
   * A warning and not a throw: this runs inside the frame loop, and an exception
   * would abandon the pass with every mesh still wearing its outline material.
   *
   * It samples, because the error is systematic (one basis function builds every
   * instance in a kit) and a hundred thousand houses must not pay a determinant
   * each per frame. It is keyed on `instanceMatrix.version`: three fills a new
   * `InstancedMesh` with identity matrices, so a one-shot check would pass a mesh
   * whose matrices are streamed in afterwards. A determinant of exactly zero is
   * an unfilled slot and is skipped; a mesh with nothing readable is left
   * unjudged.
   */
  private checkInstanceBasis(mesh: THREE.InstancedMesh): void {
    const version = mesh.instanceMatrix.version;
    if (this.basisVersion.get(mesh) === version) return;
    const matrices = mesh.instanceMatrix.array;
    const count = Math.min(mesh.count, mesh.instanceMatrix.count);
    const stride = Math.max(1, Math.floor(count / BASIS_SAMPLES));
    let read = 0;
    let reflected = 0;
    for (let i = 0; i < count; i += stride) {
      const determinant = basisDeterminant(matrices, i * 16);
      if (determinant === 0) continue;
      read++;
      if (determinant < 0) reflected++;
    }
    if (read === 0) return;
    this.basisVersion.set(mesh, version);
    // Once per mesh, not once per rewrite, so a kit that restreams its matrices
    // every frame does not fill the console.
    if (reflected === 0 || this.basisWarned.has(mesh)) return;
    this.basisWarned.add(mesh);
    console.warn(
      `outline: "${mesh.name || '(unnamed)'}" has ${reflected} of ${read} sampled instance ` +
        'matrices with a negative determinant. A reflected basis reverses the winding, so the ' +
        'inverted-hull outline is drawn front-facing and fills the object with ink. X cross Y is ' +
        'Z, so makeBasis(east, up, north) is a reflection: pass -north, or compose from a ' +
        'quaternion. The geometry is mirrored either way — the ink is only what makes it visible.',
      mesh,
    );
  }

  /**
   * Whether a mesh projects under `THIN_INK_PIXELS` of radius, with the
   * hysteresis. A mesh with no bounding sphere yet (a skinned body that never
   * culls) is never thin: the test is a saving, and a missing line is worse.
   */
  private isThin(mesh: THREE.Mesh): boolean {
    const instanced = mesh as THREE.InstancedMesh;
    const sphere = instanced.isInstancedMesh === true ? instanced.boundingSphere : mesh.geometry.boundingSphere;
    if (sphere === null) return false;
    const centre = this.centre.copy(sphere.center).applyMatrix4(mesh.matrixWorld);
    const radius = sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
    const distance = Math.max(1e-3, centre.distanceTo(this.eye) - radius);
    const pixels = (radius * this.focal) / distance;
    const was = this.thin.has(mesh);
    const thin = pixels < THIN_INK_PIXELS * (was ? THIN_INK_HYSTERESIS : 1);
    if (thin !== was) {
      if (thin) this.thin.add(mesh);
      else this.thin.delete(mesh);
    }
    return thin;
  }

  /** True if this object carries a material that declares `visible: false` ink. */
  private optsOut(object: THREE.Object3D): boolean {
    const material = (object as { material?: THREE.Material | THREE.Material[] }).material;
    if (material === undefined) return false;
    const one = Array.isArray(material) ? material[0] : material;
    const parameters = one?.userData.outlineParameters as OutlineParameters | undefined;
    return parameters?.visible === false;
  }

  private readonly swapOut = (object: THREE.Object3D): void => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    // A miss means `swapIn` skipped this mesh, so what is on it is already the
    // original.
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => this.sources.get(material) ?? material)
      : this.sources.get(mesh.material) ?? mesh.material;
  };

  private outlineFor(source: THREE.Material): THREE.ShaderMaterial {
    let outline = this.outlines.get(source);
    if (outline === undefined) {
      const parameters = source.userData.outlineParameters as OutlineParameters | undefined;
      outline = this.createMaterial(parameters?.transform, parameters?.outlineNormal === true, parameters?.dissolve, parameters?.cut);
      // Copied once, not per frame: these three are baked into the compiled program.
      // `fog` is declared on the concrete materials rather than the base class,
      // hence the read through a shape.
      outline.fog = (source as { fog?: boolean }).fog === true;
      outline.toneMapped = source.toneMapped;
      outline.premultipliedAlpha = source.premultipliedAlpha;
      this.outlines.set(source, outline);
      this.sources.set(outline, source);
    }

    const parameters = source.userData.outlineParameters as OutlineParameters | undefined;
    const uniforms = outline.uniforms as unknown as OutlineUniforms;
    if (parameters?.thickness !== undefined) uniforms.outlineThickness.value = parameters.thickness;
    if (parameters?.color !== undefined) uniforms.outlineColor.value.fromArray(parameters.color);
    uniforms.outlineAlpha.value = parameters?.alpha ?? source.opacity;
    outline.visible = source.visible && (parameters?.visible ?? true);
    outline.transparent = source.transparent || (parameters?.alpha ?? 1) < 1;
    return outline;
  }

  private createMaterial(
    transform?: OutlineTransform,
    outlineNormal = false,
    dissolve?: THREE.IUniform<number>,
    cut?: OutlineCut,
  ): THREE.ShaderMaterial {
    const defines: Record<string, string> = {};
    if (outlineNormal) defines['OUTLINE_NORMAL'] = '';
    if (dissolve !== undefined) defines['OUTLINE_DISSOLVE'] = '';
    if (cut !== undefined) defines['OUTLINE_CUT'] = '';
    return new THREE.ShaderMaterial({
      defines,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']),
        // Not cloned, unlike the fog: sharing the object is the whole mechanism.
        ...(transform?.uniforms ?? {}),
        ...(dissolve !== undefined ? { atlasFade: dissolve } : {}),
        ...(cut?.uniforms ?? {}),
        outlineThickness: { value: this.thickness },
        outlineColor: { value: this.color.clone() },
        outlineAlpha: { value: this.alpha },
      },
      vertexShader: hullVertexShader(transform?.declaration),
      fragmentShader: cut === undefined
        ? fragmentShader
        : fragmentShader
          .replace('OUTLINE_CUT_DECLARATION', () => cut.declaration)
          .replace('OUTLINE_CUT_DISCARD', () => cut.discard),
      // The hull is the *inside* of the mesh: front faces would z-fight with
      // the surface they are copying.
      side: THREE.BackSide,
    });
  }
}
