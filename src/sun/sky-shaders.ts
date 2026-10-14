/** The sky dome's shaders: the gradient, the stars and the Milky Way. */
import { unitAt } from '../sphere.ts';

export const skyVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
  }
`;

/**
 * How much light the Milky Way adds at its brightest, in the dome's linear
 * units, before `milky`: the Sagittarius cloud on a moonless night comes to
 * about two and a half of this. Set against the night dome's own zenith,
 * `NIGHT_MOOD.skyTop` (0.008 of luminance): the band has to read against it
 * without turning the night blue grey.
 */
const MILKY_WAY_BRIGHTNESS = 0.018;

/**
 * A galactic direction as a GLSL constant, in `GALACTIC`'s layout:
 * `(cos b cos l, cos b sin l, sin b)`. `unitAt` lays a direction out the way the
 * world lays out a globe, so `y` and `z` trade places on the way in; the shader
 * cannot import, and this keeps the one conversion in `sphere.ts`.
 */
function galacticAt(l: number, b: number): string {
  const v = unitAt(b, l, { x: 0, y: 0, z: 0 });
  return `vec3(${v.x.toFixed(5)}, ${(-v.z).toFixed(5)}, ${v.y.toFixed(5)})`;
}

/**
 * The Milky Way, painted: a band, a bulge, the dust lanes and the clouds, each
 * a soft analytic shape in galactic coordinates, with two octaves of noise over
 * the sphere to break the band into clouds the way a brush would. (A baked
 * texture would be megabytes for a glow that is two gradients and a dozen
 * places.) Each place is where it is on the real sky: the bulge toward
 * Sagittarius and its star clouds, the Great Rift splitting the band from Cygnus
 * to Scorpius, the Coalsack beside the Southern Cross, the star clouds of
 * Scutum, Cygnus and Carina, the two Magellanic Clouds, and Andromeda as the
 * faint smudge it is. The noise is taken on the galactic direction itself, not
 * on `(l, b)`, so it has no seam.
 *
 * Warm toward the centre and cool along the arms, written straight out as
 * linear like everything else here. How bright is `milky`, set by `update`: 0 by
 * day and in the weather (see `MILKY_WAY_LIMITS` and `MOON_WASH`).
 */
const MILKY_WAY_GLSL = /* glsl */ `
  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  // A soft round cloud, size in degrees, about a galactic direction.
  float cloud(vec3 g, vec3 at, float size) {
    return exp(-(1.0 - dot(g, at)) / (size * size * 3.0462e-4));
  }

  vec3 milkyWay(vec3 g) {
    float b = asin(clamp(g.z, -1.0, 1.0)) * 57.29578;
    float l = atan(g.y, g.x) * 57.29578;
    float toward = clamp(0.5 + 0.5 * g.x / max(length(g.xy), 1e-4), 0.0, 1.0);
    float n = valueNoise(g * 7.0) * 0.6 + valueNoise(g * 19.0) * 0.4;

    float width = mix(4.0, 7.0, toward * toward) * (0.8 + 0.4 * n);
    float band = exp(-0.5 * b * b / (width * width)) * mix(0.36, 1.0, toward * sqrt(toward));
    float skirt = exp(-0.5 * b * b / (width * width * 7.0)) * mix(0.1, 0.3, toward);
    float bulge = exp(-0.5 * ((l * l) / 200.0 + (b + 2.0) * (b + 2.0) / 81.0));
    float clouds = 0.9 * cloud(g, ${galacticAt(1.5, -4)}, 3.2)
      + 0.5 * cloud(g, ${galacticAt(12, -1)}, 1.2)
      + 0.55 * cloud(g, ${galacticAt(27, -2.5)}, 2.0)
      + 0.5 * cloud(g, ${galacticAt(77, 1.5)}, 4.5)
      + 0.5 * cloud(g, ${galacticAt(287, -1)}, 3.0)
      + 0.3 * cloud(g, ${galacticAt(330, -2)}, 2.5);
    float light = band * (0.45 + 0.55 * n) * (1.0 + clouds) + skirt + 1.2 * bulge * (0.7 + 0.3 * n);

    // The dust. The Great Rift runs a few degrees north of the plane from
    // Cygnus to Ophiuchus; the Coalsack sits below the Cross.
    float riftAt = mix(1.2, 4.5, smoothstep(60.0, 5.0, l)) + (n - 0.5) * 2.2;
    float rift = exp(-0.5 * (b - riftAt) * (b - riftAt) / 2.6) * smoothstep(-14.0, 0.0, l) * smoothstep(88.0, 72.0, l);
    float dust = max(0.8 * rift, 0.85 * cloud(g, ${galacticAt(301, -1)}, 2.3));
    light *= 1.0 - dust;

    vec3 tint = mix(vec3(0.66, 0.7, 1.0), vec3(1.0, 0.86, 0.7), clamp(toward * toward * 0.7 + bulge * 0.6, 0.0, 1.0));
    float neighbours = 0.8 * cloud(g, ${galacticAt(280.5, -32.9)}, 2.8)
      + 0.55 * cloud(g, ${galacticAt(302.8, -44.3)}, 1.5)
      + 0.2 * cloud(g, ${galacticAt(121.2, -21.6)}, 0.8);
    return tint * light + vec3(0.86, 0.86, 1.0) * neighbours * (0.8 + 0.4 * n);
  }
`;

/**
 * The dome. It runs from the local horizon to the local zenith (`dot(dir, up)`,
 * not world Y), carries a warm flare around the sun's bearing and a cool band
 * away from it so a dawn is a direction rather than an overall tint, and fades
 * to space with altitude, since a cream horizon band painted behind the globe
 * would wash out the terminator you climbed up to look at.
 *
 * The stars are not here: they are the Bright Star Catalogue, drawn as points
 * by `night-sky.ts` just after this dome. What stays in the dome is the glow
 * that is not points: the Milky Way (`MILKY_WAY_GLSL`).
 */
export const skyFragment = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 glowColor;
  uniform vec3 sunDir;
  uniform vec3 moonDir;
  uniform vec3 upDir;
  uniform float glow;
  uniform float milky;
  uniform mat3 galactic;
  uniform float space;
  uniform float dip;
  varying vec3 vWorld;

  const vec3 SPACE = vec3(0.016, 0.024, 0.055);
  const float MILKY_WAY = ${MILKY_WAY_BRIGHTNESS.toFixed(4)};

  float hash(vec3 cell) {
    vec3 p = fract(cell * 0.1031 + vec3(0.71, 0.113, 0.419));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  ${MILKY_WAY_GLSL}

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float h = dot(dir, upDir);
    // Height above the horizon you can actually see, which at altitude is the
    // limb and not the level plane through your feet. Measuring from zero
    // instead painted the whole lower sky the horizon colour from the air: at
    // dawn, a brown wash over half the frame.
    float above = clamp((h - dip) / (1.0 - dip), 0.0, 1.0);

    // The horizon band is warm only on the sun's side of the compass. A dusk
    // that is apricot all the way round is not a dusk, it is a filter: half the
    // sky at sunrise is the cold one you have just come out of.
    float sunward = smoothstep(-0.4, 0.7, dot(dir, sunDir));
    vec3 low = mix(mix(horizon, top, 0.7), horizon, sunward);
    vec3 color = mix(low, top, pow(above, 0.7));

    // Warm the sun's own bearing, and mostly near the horizon: at dusk the glow
    // is a direction you can walk towards, not a wash over everything.
    float toward = max(dot(dir, sunDir), 0.0);
    float band = 1.0 - smoothstep(0.0, 0.4, abs(h));
    color = mix(color, glowColor, glow * (0.25 + 0.75 * band) * (0.5 * pow(toward, 4.0) + 0.5 * pow(toward, 26.0)));

    // A small solar aureole in the existing sky pass. No bloom target or blur.
    float aureole = smoothstep(0.985, 1.0, toward);
    color = mix(color, glowColor, aureole * aureole * (0.16 + 0.22 * glow));

    // Everything below the dip is planet, so the sky at altitude starts at the
    // limb. Holding the horizon colour in a band just above it leaves an
    // atmosphere around the globe instead of a hard cut into black.
    //
    // Its width is an angle, not a step in the cosine: 0.06 of the cosine is 3.4
    // degrees at the horizon and 26 at the limb seen from the ceiling, which
    // drowned the whole frame in dawn.
    float halo = 1.0 - smoothstep(dip, dip + 0.06 * sqrt(1.0 - dip * dip), h);
    color = mix(color, SPACE, space * (1.0 - 0.8 * halo));

    // The Milky Way comes with the dark or with the altitude, whichever
    // arrives first. The air thins it toward the horizon and the moon near
    // its own bearing; above the air neither does.
    if (milky > 0.0) {
      float air = 1.0 - space;
      float thin = mix(1.0, smoothstep(0.0, 0.35, above), air);
      float moonlit = 1.0 - 0.6 * air * smoothstep(0.82, 0.995, dot(dir, moonDir));
      color += milkyWay(galactic * dir) * (MILKY_WAY * milky * thin * moonlit);
    }

    // Written straight out, with no colour-space conversion, and that is the
    // look: the uniforms arrive linear, so the screen shows a darker, more
    // saturated sky than the hex in \`theme.ts\`. Converting turns the dome into
    // the palette's pale cyan and the cream clouds and buildings lose the
    // ground they are read against.
    gl_FragColor = vec4(color, 1.0);
  }
`;
