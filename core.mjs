export const DRUMS = {
  kick: { label: 'Kick', key: 'B', midi: [35, 36], y: 87 },
  snare: { label: 'Snare', key: 'F', midi: [38, 40], y: 59 },
  hihat: { label: 'Hi-hat', key: 'J', midi: [42, 44, 46], y: 31 },
  tom: { label: 'Tom', key: 'G', midi: [47, 48, 50], y: 52 },
  floor: { label: 'Floor tom', key: 'H', midi: [41, 43, 45], y: 73 },
  crash: { label: 'Crash', key: 'K', midi: [49, 51, 57, 59], y: 24 }
};
export const mod = (n, m) => ((n % m) + m) % m;
export const PRESETS = {
  pulse: { title: '01 / Find the pulse', bpm: 65, description: 'Right hand: hi-hat on 1, 2, 3, 4. Right foot: kick on 1 and 3.' },
  backbeat: { title: '02 / Your first backbeat', bpm: 75, description: 'Hi-hat: every eighth note. Snare: 2 and 4. Kick: 1 and 3.' },
  variation: { title: '03 / Add a kick', bpm: 80, description: 'Keep the backbeat. Add a kick on the & after 3 in each bar.' },
  fill: { title: '04 / A little fill', bpm: 75, description: 'Play the groove, then snare, tom and floor tom on the final two beats.' }
};
export function makePreset(name = 'backbeat') {
  const p = PRESETS[name];
  if (!p) throw new Error('Unknown exercise.');
  const notes = [];
  for (let bar = 0; bar < 2; bar++) {
    const at = bar * 4;
    for (let n = 0; n < 8; n += name === 'pulse' ? 2 : 1) {
      if (!(name === 'fill' && bar === 1 && n >= 4)) notes.push({ beat: at + n / 2, drum: 'hihat' });
    }
    [0, 2].forEach(n => notes.push({ beat: at + n, drum: 'kick' }));
    if (name !== 'pulse') [1, 3].forEach(n => {
      if (!(name === 'fill' && bar === 1 && n === 3)) notes.push({ beat: at + n, drum: 'snare' });
    });
    if (name === 'variation') notes.push({ beat: at + 2.5, drum: 'kick' });
  }
  if (name === 'fill') [[6,'snare'],[6.5,'snare'],[7,'tom'],[7.5,'floor']].forEach(([beat,drum])=>notes.push({beat,drum}));
  return validateChart({ version: 1, title: p.title, bpm: p.bpm, beatsPerBar: 4, bars: 2, notes });
}
export function validateChart(value) {
  if (!value || value.version !== 1 || value.beatsPerBar !== 4) throw new Error('Use chart version 1 and beatsPerBar: 4.');
  if (!Number.isFinite(value.bpm) || value.bpm < 35 || value.bpm > 200) throw new Error('BPM must be between 35 and 200.');
  if (!Number.isInteger(value.bars) || value.bars < 1 || value.bars > 64) throw new Error('Choose 1 to 64 bars.');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100) throw new Error('Give the chart a title of 1 to 100 characters.');
  if (!Array.isArray(value.notes) || !value.notes.length || value.notes.length > 4096) throw new Error('Include 1 to 4096 notes.');
  const seen = new Set();
  const notes = value.notes.map(n => {
    if (!n || !Object.hasOwn(DRUMS,n.drum) || !Number.isFinite(n.beat) || n.beat < 0 || n.beat >= value.bars * 4 || !Number.isInteger(n.beat * 2)) throw new Error('Notes need a known drum and an eighth-note beat within the chart.');
    const key = `${n.beat}:${n.drum}`;
    if (seen.has(key)) throw new Error(`Duplicate note: ${key}.`);
    seen.add(key);
    return { beat: n.beat, drum: n.drum };
  }).sort((a,b)=>a.beat-b.beat);
  return {version:1,title:value.title.trim(),bpm:value.bpm,beatsPerBar:4,bars:value.bars,notes};
}
export function loopRegion(chart, first, last) {
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > chart.bars) throw new Error('Loop bars must lie within the chart, with the first before the last.');
  return { start: (first - 1) * 4, length: (last - first + 1) * 4 };
}
export function loopBeat(elapsedBeats, region) { return region.start + mod(elapsedBeats, region.length); }
export function notesAt(chart, beat) { return chart.notes.filter(n=>Math.abs(n.beat-beat)<0.00001); }
export function midiDrum(data) {
  if (!data || (data[0] & 0xf0) !== 0x90 || !data[2]) return null;
  return Object.keys(DRUMS).find(d=>DRUMS[d].midi.includes(data[1])) || null;
}
export function audioRegion(chart, region, offset, duration) {
  const start = offset + region.start * 60 / chart.bpm;
  const end = start + region.length * 60 / chart.bpm;
  if (!Number.isFinite(offset) || offset < 0 || end > duration || start >= duration) throw new Error('This loop extends beyond the song; reduce the offset or loop length.');
  return {start,end};
}
