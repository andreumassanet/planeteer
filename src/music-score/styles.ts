/** The twenty styles, as data. */
import type { Chord, Style, StyleId } from './style-types.ts';

export const ch = (...tones: number[]): Chord => ({ root: tones[0]!, tones });

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10];
const KURD = [0, 1, 3, 5, 7, 8, 10];
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
/** Miyako-bushi's in scale. */
const IN = [0, 1, 5, 7, 8];
/** Five near-equal steps of 240 cents. */
const SLENDRO = [0, 2.4, 4.8, 7.2, 9.6];

export const STYLES: Record<StyleId, Style> = {
  // Flamenco's rumba: the Andalusian cadence onto the Phrygian tonic, the
  // guitar's rasgueado in 3-3-2, palmas and a cajón in town.
  iberia: {
    id: 'iberia', name: 'Flamenco guitar', tonic: 52, scale: PHRYGIAN_DOMINANT,
    progressions: [
      [ch(5, 8, 0), ch(3, 7, 10), ch(1, 5, 8), ch(0, 4, 7)],
      [ch(10, 1, 5), ch(5, 8, 0), ch(1, 5, 8), ch(0, 4, 7)],
      [ch(0, 4, 7), ch(1, 5, 8), ch(3, 7, 10), ch(1, 5, 8), ch(0, 4, 7)],
    ],
    cadence: [0], bpm: [84, 100], beats: 4, steps: 4, barsPerChord: 1, swing: 0,
    lead: { instrument: 'guitar', low: 59, high: 81, density: 0.42, ornament: 'grace' },
    answer: null,
    accomp: { instrument: 'guitar', low: 52, high: 71, count: 4, figures: ['d..d..d.d.u.d.u.', 'd...d.u.d...d.u.', 'b..2.1b.3.2.b.1.'] },
    bass: null, pad: null, drone: null,
    kits: [[
      { instrument: 'clap', pattern: '..-.x.-...-.x.-.' },
      { instrument: 'cajon', pattern: 'x......x..x.....' },
      { instrument: 'slap', pattern: '....x.......x...' },
    ]],
    reverb: 0.3,
  },
  // A bolero's guitar and a son's clave: minor, with the dominant raised.
  latin: {
    id: 'latin', name: 'Bolero and son', tonic: 57, scale: MINOR,
    progressions: [
      [ch(0, 3, 7), ch(5, 8, 0), ch(7, 11, 2, 5), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(10, 2, 5), ch(8, 0, 3), ch(7, 11, 2, 5)],
      [ch(5, 8, 0), ch(10, 2, 5), ch(3, 7, 10), ch(7, 11, 2, 5)],
    ],
    cadence: [0, 7], bpm: [88, 104], beats: 4, steps: 4, barsPerChord: 1, swing: 0,
    lead: { instrument: 'guitar', low: 62, high: 81, density: 0.38, ornament: 'grace' },
    answer: { instrument: 'flute', low: 67, high: 86, density: 0.3, ornament: 'none' },
    accomp: { instrument: 'guitar', low: 52, high: 71, count: 3, figures: ['0.2.1.2.0.2.1.2.', 'b..1..2.b..1..2.'] },
    bass: { instrument: 'bass', low: 33, high: 50, figures: ['......r.....f...', 'r.....r.....f...'] },
    pad: null, drone: null,
    kits: [[
      { instrument: 'rim', pattern: 'x..x..x.........|....x...x.......' },
      { instrument: 'shaker', pattern: 'o-o-o-o-o-o-o-o-' },
      { instrument: 'bongo', pattern: '....x..o....x..o' },
    ]],
    reverb: 0.28,
  },
  // Bossa nova: sevenths round the circle, the thumb on the dotted bass, the
  // fingers on the clave.
  brazil: {
    id: 'brazil', name: 'Bossa nova', tonic: 53, scale: MAJOR,
    progressions: [
      [ch(0, 4, 7, 11), ch(9, 1, 4, 7), ch(2, 5, 9, 0), ch(7, 11, 2, 5)],
      [ch(0, 4, 7, 11), ch(9, 0, 4, 7), ch(2, 5, 9, 0), ch(7, 11, 2, 5)],
      [ch(5, 9, 0, 4), ch(4, 7, 11, 2), ch(2, 5, 9, 0), ch(7, 11, 2, 5)],
    ],
    cadence: [0, 7], bpm: [120, 134], beats: 4, steps: 2, barsPerChord: 1, swing: 0.06,
    lead: { instrument: 'flute', low: 65, high: 84, density: 0.4, ornament: 'none' },
    answer: { instrument: 'guitar', low: 62, high: 79, density: 0.45, ornament: 'none' },
    accomp: { instrument: 'guitar', low: 52, high: 72, count: 4, figures: ['c..c..c.|..c..c..'] },
    bass: { instrument: 'guitar', low: 40, high: 55, figures: ['r..fr..f'] },
    pad: null, drone: null,
    kits: [[
      { instrument: 'rim', pattern: 'x..x..x.|..x..x..' },
      { instrument: 'shaker', pattern: '-o-o-o-o', always: true },
    ]],
    reverb: 0.28,
  },
  // A huayno: the minor pentatonic on panpipes, a charango strumming, the bombo.
  andes: {
    id: 'andes', name: 'Huayno', tonic: 57, scale: MINOR_PENTATONIC,
    progressions: [
      [ch(0, 3, 7), ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7)],
      [ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(7, 10, 2), ch(10, 2, 5), ch(0, 3, 7)],
    ],
    cadence: [0], bpm: [100, 116], beats: 2, steps: 4, barsPerChord: 2, swing: 0,
    lead: { instrument: 'panflute', low: 64, high: 86, density: 0.5, ornament: 'none' },
    answer: { instrument: 'charango', low: 64, high: 84, density: 0.55, ornament: 'none' },
    accomp: { instrument: 'charango', low: 57, high: 76, count: 3, figures: ['d.dud.du', 'd.d.d.du'] },
    bass: null, pad: null, drone: null,
    kits: [[
      { instrument: 'bombo', pattern: 'x..xx...' },
      { instrument: 'shaker', pattern: '-o-o-o-o', always: true },
    ]],
    reverb: 0.35,
  },
  // Front-porch folk: a steel-string guitar Travis-picked, a melody that
  // slides into its notes, brushes in town.
  'north-america': {
    id: 'north-america', name: 'Folk and country', tonic: 55, scale: MAJOR,
    progressions: [
      [ch(0, 4, 7), ch(5, 9, 0), ch(0, 4, 7), ch(7, 11, 2)],
      [ch(0, 4, 7), ch(9, 0, 4), ch(5, 9, 0), ch(7, 11, 2)],
      [ch(5, 9, 0), ch(0, 4, 7), ch(7, 11, 2), ch(0, 4, 7)],
    ],
    cadence: [0, 7], bpm: [96, 112], beats: 4, steps: 2, barsPerChord: 1, swing: 0.14,
    lead: { instrument: 'steel', low: 62, high: 81, density: 0.45, ornament: 'slide' },
    answer: null,
    accomp: { instrument: 'steel', low: 40, high: 67, count: 4, figures: ['b2f3b2f3', 'b3f2b3f2'] },
    bass: null, pad: null, drone: null,
    kits: [[
      { instrument: 'brush', pattern: '..o...o.' },
      { instrument: 'kick', pattern: 'x...x...' },
    ]],
    reverb: 0.22,
  },
  // A jig in D Dorian: the flute with its cuts, the harp under it, a bodhrán in town.
  'atlantic-folk': {
    id: 'atlantic-folk', name: 'Celtic folk', tonic: 50, scale: DORIAN,
    progressions: [
      [ch(0, 3, 7), ch(10, 2, 5), ch(0, 3, 7), ch(7, 10, 2)],
      [ch(0, 3, 7), ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7)],
      [ch(3, 7, 10), ch(10, 2, 5), ch(5, 9, 0), ch(0, 3, 7)],
    ],
    cadence: [0, 7], bpm: [92, 106], beats: 2, steps: 3, barsPerChord: 2, swing: 0,
    lead: { instrument: 'flute', low: 69, high: 88, density: 0.6, ornament: 'grace' },
    answer: { instrument: 'harp', low: 62, high: 84, density: 0.5, ornament: 'none' },
    accomp: { instrument: 'harp', low: 50, high: 74, count: 4, figures: ['0.21.2', '0.12.3'] },
    bass: null,
    pad: { instrument: 'pad', low: 50, high: 69, count: 2 },
    drone: null,
    kits: [[{ instrument: 'frame', pattern: 'x.ox.o' }]],
    reverb: 0.35,
  },
  // Slow and aeolian in three: a kantele, a flute, a pad, and the modal
  // cadence through the flattened seventh.
  nordic: {
    id: 'nordic', name: 'Nordic folk', tonic: 52, scale: MINOR,
    progressions: [
      [ch(0, 3, 7), ch(8, 0, 3), ch(10, 2, 5), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(5, 8, 0), ch(8, 0, 3), ch(10, 2, 5)],
      [ch(8, 0, 3), ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7)],
    ],
    cadence: [0, 7, 10], bpm: [66, 78], beats: 3, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'kantele', low: 64, high: 84, density: 0.35, ornament: 'none' },
    answer: { instrument: 'flute', low: 64, high: 84, density: 0.3, ornament: 'none' },
    accomp: { instrument: 'harp', low: 52, high: 74, count: 3, figures: ['0.1.2.', '0.2.1.'] },
    bass: null,
    pad: { instrument: 'pad', low: 52, high: 71, count: 3 },
    drone: null, kits: [], reverb: 0.5,
  },
  // Harmonic minor in two, the balalaika's tremolo over an oom-pa.
  'east-europe': {
    id: 'east-europe', name: 'Balalaika', tonic: 57, scale: HARMONIC_MINOR,
    progressions: [
      [ch(0, 3, 7), ch(5, 8, 0), ch(7, 11, 2, 5), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(10, 2, 5), ch(3, 7, 10), ch(7, 11, 2, 5)],
      [ch(5, 8, 0), ch(0, 3, 7), ch(7, 11, 2, 5), ch(0, 3, 7)],
    ],
    cadence: [0, 7], bpm: [96, 118], beats: 2, steps: 4, barsPerChord: 2, swing: 0,
    lead: { instrument: 'balalaika', low: 64, high: 86, density: 0.45, ornament: 'tremolo' },
    answer: null,
    accomp: { instrument: 'balalaika', low: 57, high: 74, count: 3, figures: ['....c.c.', '..c...c.'] },
    bass: { instrument: 'bass', low: 40, high: 55, figures: ['r...f...'] },
    pad: null, drone: null, kits: [], reverb: 0.3,
  },
  // A waltz in D minor: the mandolin's tremolo, the guitar's bass and two chords.
  mediterranean: {
    id: 'mediterranean', name: 'Mandolin waltz', tonic: 50, scale: HARMONIC_MINOR,
    progressions: [
      [ch(0, 3, 7), ch(5, 8, 0), ch(7, 11, 2, 5), ch(0, 3, 7)],
      [ch(3, 7, 10), ch(10, 2, 5), ch(0, 3, 7), ch(7, 11, 2, 5)],
      [ch(0, 3, 7), ch(8, 0, 3), ch(5, 8, 0), ch(7, 11, 2, 5)],
    ],
    cadence: [0, 7], bpm: [96, 112], beats: 3, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'mandolin', low: 62, high: 86, density: 0.45, ornament: 'tremolo' },
    answer: { instrument: 'guitar', low: 60, high: 79, density: 0.45, ornament: 'grace' },
    accomp: { instrument: 'guitar', low: 45, high: 69, count: 3, figures: ['b.c.c.', 'b.2.1.'] },
    bass: null, pad: null, drone: null, kits: [], reverb: 0.32,
  },
  // Maqam Hijaz on D: the oud sliding into its notes, the ney answering, the
  // qanun's arpeggios and the maqsum on a frame drum.
  maghreb: {
    id: 'maghreb', name: 'Maqam Hijaz', tonic: 50, scale: PHRYGIAN_DOMINANT,
    progressions: [
      [ch(0, 4, 7), ch(1, 5, 8), ch(0, 4, 7), ch(0, 4, 7)],
      [ch(0, 4, 7), ch(10, 1, 5), ch(1, 5, 8), ch(0, 4, 7)],
      [ch(5, 8, 0), ch(10, 1, 5), ch(1, 5, 8), ch(0, 4, 7)],
    ],
    cadence: [0], bpm: [92, 106], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'oud', low: 57, high: 79, density: 0.5, ornament: 'slide' },
    answer: { instrument: 'ney', low: 62, high: 84, density: 0.35, ornament: 'bend' },
    accomp: { instrument: 'qanun', low: 57, high: 81, count: 4, figures: ['0...2.1.', '0.1.2.3.'] },
    bass: { instrument: 'oud', low: 38, high: 52, figures: ['r..r.r..', 'r...r...'] },
    pad: null, drone: null,
    kits: [
      [{ instrument: 'doum', pattern: 'x...x...' }, { instrument: 'tek', pattern: '.x.x..x.' }],
      [{ instrument: 'doum', pattern: 'x..x..x.' }, { instrument: 'tek', pattern: '...o...x' }],
    ],
    reverb: 0.3,
  },
  // Maqam Kurd, slower: the ney over a held drone, the oud answering, a santur.
  'middle-east': {
    id: 'middle-east', name: 'Maqam Kurd', tonic: 50, scale: KURD,
    progressions: [
      [ch(0, 3, 7), ch(1, 5, 8), ch(0, 3, 7), ch(0, 3, 7)],
      [ch(0, 3, 7), ch(10, 1, 5), ch(8, 0, 3), ch(0, 3, 7)],
      [ch(8, 0, 3), ch(10, 1, 5), ch(1, 5, 8), ch(0, 3, 7)],
    ],
    cadence: [0], bpm: [70, 84], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'ney', low: 62, high: 86, density: 0.35, ornament: 'bend' },
    answer: { instrument: 'oud', low: 57, high: 79, density: 0.5, ornament: 'slide' },
    accomp: { instrument: 'santur', low: 62, high: 86, count: 3, figures: ['0.1.2.1.', '0...1.2.'] },
    bass: null, pad: null,
    drone: { instrument: 'drone', notes: [-12, -5], figure: '*.......', hold: true },
    kits: [[{ instrument: 'doum', pattern: 'x.......' }, { instrument: 'tek', pattern: '....o.o.' }]],
    reverb: 0.4,
  },
  // Twelve-eight with three against two: a kalimba's interlocking ostinato, a
  // balafon on the tune, the bell pattern.
  'sub-saharan': {
    id: 'sub-saharan', name: 'Kalimba and balafon', tonic: 60, scale: MAJOR_PENTATONIC,
    progressions: [
      [ch(0, 4, 7), ch(5, 9, 0), ch(0, 4, 7), ch(7, 11, 2)],
      [ch(0, 4, 7), ch(9, 0, 4), ch(5, 9, 0), ch(7, 11, 2)],
      [ch(5, 9, 0), ch(0, 4, 7), ch(7, 11, 2), ch(0, 4, 7)],
    ],
    cadence: [0, 7], bpm: [96, 110], beats: 4, steps: 3, barsPerChord: 1, swing: 0,
    lead: { instrument: 'marimba', low: 67, high: 86, density: 0.45, ornament: 'grace' },
    answer: null,
    accomp: { instrument: 'kalimba', low: 60, high: 79, count: 4, figures: ['0.21.2.31.2.', '02.1.20.1.3.'] },
    bass: { instrument: 'marimba', low: 43, high: 55, figures: ['r.....f..r..'] },
    pad: null, drone: null,
    kits: [[
      { instrument: 'agogo', pattern: 'x.x.xx.x.x.x' },
      { instrument: 'djembe', pattern: 'x.....x..o..' },
      { instrument: 'slap', pattern: '...o.....x.x' },
      { instrument: 'shaker', pattern: 'o--o--o--o--', always: true },
    ]],
    reverb: 0.25,
  },
  // A raga over the tanpura: Bhairav in the morning, Yaman at night, Kafi
  // between; the sitar's meend, the tabla's keherwa in town.
  'south-asia': {
    id: 'south-asia', name: 'Raga', tonic: 50, scale: DORIAN,
    modes: [
      { scale: [0, 1, 4, 5, 7, 8, 11], from: 4, to: 11 },
      { scale: LYDIAN, from: 17, to: 4 },
    ],
    progressions: [[ch(0, 7), ch(0, 7), ch(0, 7), ch(0, 7)]],
    cadence: [0], bpm: [76, 92], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'sitar', low: 62, high: 86, density: 0.45, ornament: 'meend' },
    answer: null, accomp: null, bass: null, pad: null,
    drone: { instrument: 'tanpura', notes: [-5, 0, 0, -12], figure: '0.1.2.3.', hold: false },
    kits: [[
      { instrument: 'tabla-ge', pattern: 'x...x...|x.......' },
      { instrument: 'tabla-na', pattern: '.o.x.o.o|.o.x.x.o', pitch: 12 },
    ]],
    reverb: 0.35,
  },
  // The gong mode: a major pentatonic over open fifths, the dizi's bright
  // breath, the guzheng's arpeggios and its sweep.
  'east-asia': {
    id: 'east-asia', name: 'Guzheng and dizi', tonic: 50, scale: MAJOR_PENTATONIC,
    progressions: [
      [ch(0, 7), ch(7, 2), ch(9, 4), ch(0, 7)],
      [ch(0, 7), ch(2, 9), ch(7, 2), ch(0, 7)],
      [ch(9, 4), ch(7, 2), ch(2, 9), ch(0, 7)],
    ],
    cadence: [0, 7], bpm: [66, 80], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'dizi', low: 69, high: 91, density: 0.4, ornament: 'grace' },
    answer: { instrument: 'guzheng', low: 62, high: 86, density: 0.45, ornament: 'slide' },
    accomp: { instrument: 'guzheng', low: 50, high: 74, count: 4, figures: ['0.1.2.3.', '0..2.1.3'] },
    bass: null, pad: null, drone: null,
    kits: [[{ instrument: 'woodblock', pattern: 'x.......|....x...' }]],
    reverb: 0.45, glissando: true,
  },
  // The in scale: a shakuhachi bending into its notes, a koto answering.
  japan: {
    id: 'japan', name: 'Koto and shakuhachi', tonic: 52, scale: IN,
    progressions: [
      [ch(0, 7), ch(5, 0), ch(1, 8), ch(0, 7)],
      [ch(0, 7), ch(1, 8), ch(5, 0), ch(7, 0)],
      [ch(5, 0), ch(7, 0), ch(1, 8), ch(0, 7)],
    ],
    cadence: [0, 7], bpm: [58, 70], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'shakuhachi', low: 64, high: 84, density: 0.3, ornament: 'bend' },
    answer: { instrument: 'koto', low: 64, high: 86, density: 0.4, ornament: 'slide' },
    accomp: { instrument: 'koto', low: 52, high: 74, count: 3, figures: ['0.1.2...', '0...2.1.'] },
    bass: null, pad: null, drone: null, kits: [], reverb: 0.5,
  },
  // Gamelan in slendro: the saron's core melody walking to each gatra's goal,
  // the bonang doubling it, and the colotomic gongs marking the cycle.
  'southeast-asia': {
    id: 'southeast-asia', name: 'Gamelan', tonic: 62, scale: SLENDRO,
    progressions: [
      [ch(4.8), ch(2.4), ch(7.2), ch(0)],
      [ch(2.4), ch(0), ch(9.6), ch(7.2)],
      [ch(9.6), ch(7.2), ch(4.8), ch(0)],
    ],
    cadence: [0, 7.2], bpm: [60, 72], beats: 4, steps: 2, barsPerChord: 1, swing: 0,
    lead: { instrument: 'bonang', low: 74, high: 88, density: 1, ornament: 'none' },
    answer: null,
    accomp: { instrument: 'saron', low: 62, high: 75, count: 1, figures: ['0'] },
    bass: null, pad: null, drone: null,
    kits: [[
      { instrument: 'gong', pattern: '........|........|........|......x.', pitch: -24, always: true },
      { instrument: 'gong', pattern: '........|......o.|......o.|........', pitch: -12, always: true },
      { instrument: 'bonang', pattern: '......o.|......o.|......o.|........', pitch: -12, always: true },
      { instrument: 'kendhang', pattern: 'x..o.x.o' },
    ]],
    reverb: 0.45, gamelan: true,
  },
  // Island time: a ukulele strumming, a lap steel sliding over it.
  oceania: {
    id: 'oceania', name: 'Island ukulele', tonic: 60, scale: MAJOR,
    progressions: [
      [ch(0, 4, 7), ch(9, 0, 4), ch(5, 9, 0), ch(7, 11, 2, 5)],
      [ch(5, 9, 0), ch(7, 11, 2, 5), ch(0, 4, 7), ch(0, 4, 7)],
      [ch(2, 5, 9), ch(7, 11, 2, 5), ch(0, 4, 7), ch(0, 4, 7)],
    ],
    cadence: [0, 7], bpm: [84, 96], beats: 4, steps: 2, barsPerChord: 1, swing: 0.18,
    lead: { instrument: 'steel', low: 64, high: 84, density: 0.42, ornament: 'slide' },
    answer: null,
    accomp: { instrument: 'ukulele', low: 60, high: 72, count: 4, figures: ['d.du.udu'] },
    bass: { instrument: 'bass', low: 36, high: 50, figures: ['r...f...', 'r..rf...'] },
    pad: null, drone: null,
    kits: [[{ instrument: 'shaker', pattern: '-o-o-o-o' }]],
    reverb: 0.28,
  },
  // Ice: a slow pad and a bell now and then.
  polar: {
    id: 'polar', name: 'Ice', tonic: 50, scale: DORIAN,
    progressions: [
      [ch(0, 3, 7, 2), ch(8, 0, 3, 7), ch(3, 7, 10, 2), ch(10, 2, 5)],
      [ch(0, 3, 7, 2), ch(3, 7, 10, 2), ch(10, 2, 5), ch(0, 3, 7, 2)],
    ],
    cadence: [0, 10], bpm: [52, 60], beats: 4, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'bell', low: 69, high: 91, density: 0.18, ornament: 'none' },
    answer: null, accomp: null, bass: null,
    pad: { instrument: 'pad', low: 50, high: 74, count: 3 },
    drone: null, kits: [], reverb: 0.65,
  },
  // Open water: a lydian pad and a harp, slow.
  sea: {
    id: 'sea', name: 'Open water', tonic: 50, scale: LYDIAN,
    progressions: [
      [ch(0, 4, 7, 11), ch(5, 9, 0, 4), ch(2, 6, 9), ch(7, 11, 2)],
      [ch(9, 0, 4, 7), ch(5, 9, 0, 4), ch(2, 6, 9), ch(0, 4, 7, 11)],
    ],
    cadence: [0, 7], bpm: [54, 64], beats: 4, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'harp', low: 69, high: 86, density: 0.2, ornament: 'none' },
    answer: null,
    accomp: { instrument: 'harp', low: 50, high: 76, count: 4, figures: ['0...2...', '0.1...2.'] },
    bass: null,
    pad: { instrument: 'pad', low: 50, high: 72, count: 3 },
    drone: null, kits: [], reverb: 0.6,
  },
  // Altitude: a wide airy pad, a bell, a flute far off.
  sky: {
    id: 'sky', name: 'High air', tonic: 48, scale: LYDIAN,
    progressions: [
      [ch(0, 4, 7, 11), ch(2, 6, 9), ch(4, 7, 11, 2), ch(0, 4, 7, 11)],
      [ch(9, 0, 4, 7), ch(2, 6, 9), ch(0, 4, 7, 11), ch(7, 11, 2)],
    ],
    cadence: [0, 7], bpm: [50, 58], beats: 4, steps: 2, barsPerChord: 2, swing: 0,
    lead: { instrument: 'bell', low: 72, high: 91, density: 0.15, ornament: 'none' },
    answer: { instrument: 'flute', low: 72, high: 88, density: 0.2, ornament: 'none' },
    accomp: null, bass: null,
    pad: { instrument: 'airpad', low: 55, high: 79, count: 3 },
    drone: null, kits: [], reverb: 0.7,
  },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];
