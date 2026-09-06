import * as THREE from 'three';

/**
 * The ink: the scene drawn a second time with the back faces of every mesh
 * pushed out along their normals, so each silhouette comes back as a black
 * line. This is a fork of Three's own `OutlineEffect`
 * (`examples/jsm/effects/OutlineEffect.js`), same technique and the same
 * `userData.outlineParameters` contract, so every material in the project keeps
 * the pen it already had.
 *
 * **What changed is one line of the vertex shader, and it is the line that
 * decides whether this world can be inhabited.** Settlements, trees and rocks
 * are tens of thousands of objects, which means `InstancedMesh`, and the stock
 * effect is broken for it. `gl_Position` comes out of `<project_vertex>`, which
 * *does* apply `instanceMatrix`; the point the hull is pushed away from was
 * then rebuilt as `projectionMatrix * modelViewMatrix * vec4(transformed -
 * normal, 1.0)` — *without* it. Subtracting two points that live in different
 * spaces gives a direction with no relation to the surface, identical for every
 * vertex of an instance: the hull stops expanding and starts sliding.
 *
 * The slide is bounded by the thickness, so it is never an explosion across the
 * screen. What it moves is *depth*, and 0.005 of normalised device space is an
 * enormous distance out where the objects are: the hull lands either behind the
 * surface it is copying, where nothing of it is ever drawn, or in front of it,
 * where it swallows the object whole. Both are the same defect with opposite
 * signs. Measured in this scene, six instanced boxes beside six ordinary ones
 * of the same geometry and the same material, counting ink pixels over each
 * box: ordinary 1.9–3.9%, instanced **0–0.5%**. How much of the line survives
 * depends on where the instance sits — none of it in that measurement, a
 * fraction of it in others — which is the tell that the direction is arbitrary
 * rather than merely offset. With the fix the instanced row measures the
 * ordinary row's own figure, whatever that figure is, in every placement
 * tested. The world as it already stands renders byte for byte the same as it
 * did under the stock effect: a full-frame diff at Mallorca and at the Eiffel
 * Tower is zero pixels.
 *
 * **Why a fork and not a patch.** The material the effect generates lives in a
 * closure — there is no accessor, no `onBeforeCompile`, nothing to reach it
 * with. Correcting it from outside means monkey-patching a private variable,
 * which is worse than owning the file.
 *
 * **The second thing that changed is a hook, and it is the same defect one step
 * further out.** `instanceMatrix` was a transform the fill applied and the hull
 * did not; a material that moves its own vertices in `onBeforeCompile` is
 * exactly that again, except that three has no name for it and cannot pass it
 * on. The hull is built from the `position` attribute, so a fill that displaces
 * `transformed` renders inside a silhouette drawn for geometry that is no longer
 * there — and because the hull is `BackSide` and expanded, the mismatch does not
 * come out as a line in the wrong place but as the *whole* of the old shape,
 * painted solid ink, standing over the new one. `outlineParameters.transform`
 * hands the effect the same GLSL the material displaces with, so the two
 * silhouettes are the same silhouette. It is a general contract and not a cloud:
 * anything that writes `transformed` in a vertex shader owes the pen the same
 * function, and the deck is merely the first thing in this world to do it.
 *
 * What was left behind, because nothing here uses it: skinning, morph targets,
 * displacement maps, clipping planes, the keep-alive cache and its 60-frame
 * eviction (a `WeakMap` does that job for free), the per-object
 * `onBeforeRender` swap — redundant once there is exactly one outline material
 * per source material — and the VR entry point. `BatchedMesh` stays
 * unsupported, as it is upstream: `<project_vertex>` reads a `batchingMatrix`
 * that only `<batching_vertex>` declares.
 */

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

uniform float outlineThickness;

void main() {
  #include <beginnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>

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
  // float32 error is common-mode. Measured, it is worth 5e-7 of NDC z against
  // the 5.8e-3 that separates a box's own front and back faces: not the
  // difference between right and wrong here, just one less asymmetry.
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
 * **Without a transform this returns the string above unchanged**, character for
 * character, which is the point: every material in the world that does not ask
 * for one compiles the program it has always compiled, so "nothing else moved"
 * is a property of the source rather than a result someone has to keep
 * re-measuring.
 *
 * With one, three lines move. The declaration goes in beside `outlineThickness`
 * — it brings its own uniforms, so the hook is a function and not a fixed set of
 * parameters this file would have to know the meaning of. `transformed` is then
 * passed through it before `<project_vertex>`, which is what puts the hull on
 * the same silhouette as the fill. And the *inset* point is passed through it
 * too, before the assignment overwrites `transformed`: that is the half that is
 * easy to leave out and it is the half `instanceMatrix` was already the lesson
 * about. `normalize(pos - reference)` subtracts two points, so both have to have
 * been through the same map or the direction the hull expands along is the
 * normal of a shape that is not on the screen — the same class of mistake as
 * subtracting two points in different spaces, just with a different transform
 * missing.
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

void main() {
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
 * `declaration` is GLSL that must define **`vec3 atlasVertex(vec3 p)`** and
 * declare whatever uniforms it reads. The source material is expected to call
 * that same function on `transformed` in its own `onBeforeCompile` — which is
 * why this carries the GLSL rather than a name: the two shaders share one string
 * and one uniform object, so they cannot drift into disagreeing about a
 * silhouette. Anything else is two copies of an equation, which is the failure
 * this project sees more than any other.
 *
 * `uniforms` are held **by reference**, not cloned, so the fill and the hull
 * read the same values on the same frame with nothing to synchronise.
 */
export interface OutlineTransform {
  declaration: string;
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
   * See `OutlineTransform`. **Read once**, when this material's hull is first
   * built, because it is compiled into the program — the same rule `fog` and
   * `toneMapped` already follow. Its uniforms are live; the GLSL is not.
   */
  transform?: OutlineTransform;
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

  // One outline material per source material, both ways. Weak on purpose: a
  // material that goes out of scope takes its outline with it, which is the
  // whole of the eviction logic the upstream version needs 50 lines for.
  private readonly outlines = new WeakMap<THREE.Material, THREE.ShaderMaterial>();
  private readonly sources = new WeakMap<THREE.Material, THREE.Material>();
  /** Instance matrices already judged, by the attribute version they were judged at. */
  private readonly basisVersion = new WeakMap<THREE.InstancedMesh, number>();
  private readonly basisWarned = new WeakSet<THREE.InstancedMesh>();

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
    // one left, must not let anything move between the two, and must not redo
    // the shadow maps or paint the background over the image.
    //
    // The first pass, unlike upstream, is left on the renderer's own autoClear.
    // `OutlineEffect` forces it to `this.autoClear`, which its constructor never
    // assigns — so the base pass never clears, and it only looks right because
    // the browser wipes the drawing buffer between frames anyway. Same pixels,
    // one less thing that is true by accident.
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.enabled;
    const autoUpdate = scene.matrixWorldAutoUpdate;
    const background = scene.background;
    renderer.autoClear = false;
    renderer.shadowMap.enabled = false;
    scene.matrixWorldAutoUpdate = false;
    scene.background = null;

    scene.traverse(this.swapIn);
    renderer.render(scene, camera);
    scene.traverse(this.swapOut);
    for (const object of this.hidden) object.visible = true;
    this.hidden.length = 0;

    renderer.autoClear = autoClear;
    renderer.shadowMap.enabled = shadows;
    scene.matrixWorldAutoUpdate = autoUpdate;
    scene.background = background;
  }

  /**
   * Objects hidden for the ink pass because they are not meshes and asked not to
   * be drawn in it. Cleared by `swapOut`.
   *
   * **The pass renders the whole scene a second time, so anything the hull
   * cannot replace is simply drawn twice — and for an *additive* object that is
   * not a redundancy, it is double brightness.** `src/lights.ts`'s city lights
   * are a `Points` with `AdditiveBlending`; measured over the Ruhr, the same
   * frame gave the brightest lights `(253, 253, 199)` through one pass and
   * `(255, 255, 238)` through two — the second copy pushes the blue channel up
   * by 39 and takes an amber sodium light to white. It looks like a colour
   * mistake in the light and it is an arithmetic one in the pass.
   *
   * A mesh never showed this because the second pass *replaces* its material
   * with the hull, which draws behind it. Anything that is not a mesh — points,
   * lines, sprites — keeps its own material and accumulates. So the ink pass
   * honours `outlineParameters.visible === false` for those too, by leaving them
   * out of it entirely, which is what "no outline" can only mean for something
   * that was never going to be hulled.
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
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => this.outlineFor(material))
      : this.outlineFor(mesh.material);
  };

  /**
   * Warns once about instance matrices built from a reflected basis.
   *
   * `makeBasis(east, up, north)` has determinant -1, because X cross Y is Z and
   * east cross up is *minus* north. A reflection reverses the winding, and
   * three decides front from back on the object's own matrix without ever
   * looking at the per-instance one — so the outward faces of the hull stop
   * being culled and the object comes back as a solid blob of ink.
   *
   * **An ordinary `Mesh` cannot show you this.** `setFromRotationMatrix` can
   * only carry a proper rotation, so the same wrong basis is silently repaired
   * on its way into a quaternion. Side by side, the ordinary row looks right
   * and the instanced row is destroyed, which is exactly the shape of an
   * afternoon lost to blaming the renderer.
   *
   * A warning and not a throw: this runs inside the frame loop, and an
   * exception here would abandon the pass with every mesh in the scene still
   * wearing its outline material and `matrixWorldAutoUpdate` off — a world
   * permanently in ink, which is worse than the one object it was reporting.
   *
   * The check is a sample, because the error is systematic: one basis function
   * builds every instance in a kit, so a stride through the array finds it, and
   * a hundred thousand houses must not pay a determinant each per frame.
   *
   * **It is keyed on `instanceMatrix.version`, and checking once per mesh would
   * be worse than not checking at all.** Three fills a new `InstancedMesh` with
   * *identity* matrices, not with zeros — measured, after this check first
   * shipped and silently passed everything. A one-shot check therefore reads
   * determinant +1 from a mesh nobody has written to yet, marks it clean, and
   * never looks again, which is precisely what a kit that allocates the mesh
   * and streams its matrices in afterwards does. The version bumps on
   * `needsUpdate`, so the sample is retaken exactly when the data changes, and
   * costs one integer compare per instanced mesh on every other frame.
   *
   * A determinant of exactly zero is a slot nobody has filled — a kit may park
   * unused instances there — so it is skipped, and a mesh with nothing readable
   * is left unjudged rather than passing by default.
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
    // Once per mesh, not once per rewrite: a kit that restreams its matrices
    // every frame would otherwise fill the console with the same sentence.
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
      outline = this.createMaterial(
        (source.userData.outlineParameters as OutlineParameters | undefined)?.transform,
      );
      // Copied once, not per frame: these three are baked into the compiled
      // program, so changing one later needs a `needsUpdate` anyway. `fog` is
      // declared on the concrete materials rather than on the base class, hence
      // the read through a shape.
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

  private createMaterial(transform?: OutlineTransform): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib['fog']),
        // Not cloned, unlike the fog: sharing the object is the whole mechanism.
        ...(transform?.uniforms ?? {}),
        outlineThickness: { value: this.thickness },
        outlineColor: { value: this.color.clone() },
        outlineAlpha: { value: this.alpha },
      },
      vertexShader: hullVertexShader(transform?.declaration),
      fragmentShader,
      // The hull is the *inside* of the mesh: front faces would z-fight with
      // the surface they are copying.
      side: THREE.BackSide,
    });
  }
}
