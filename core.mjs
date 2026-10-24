export const DRUMS = {
  kick: { label: 'Kick', key: 'B', midi: [35, 36], y: 87 },
  snare: { label: 'Snare', key: 'F', midi: [38, 40], y: 59 },
  hihat: { label: 'Hi-hat', key: 'J', midi: [42, 44, 46], y: 31 },
  tom: { label: 'High tom', key: 'G', midi: [48, 50], y: 52 },
  midtom: { label: 'Medium tom', key: 'T', midi: [45, 47], y: 66 },
  floor: { label: 'Floor tom', key: 'H', midi: [41, 43], y: 73 },
  crash: { label: 'Crash', key: 'K', midi: [49, 52, 55, 57], y: 24 },
  ride: { label: 'Ride', key: 'L', midi: [51, 53, 59], y: 17 }
};
export const mod = (n, m) => ((n % m) + m) % m;
export const PRESETS = {
  pulse: { title: '01 / Find the pulse', bpm: 65, description: 'Right hand: hi-hat on 1, 2, 3, 4. Right foot: kick on 1 and 3.' },
  backbeat: { title: '02 / Your first backbeat', bpm: 75, description: 'Hi-hat: every eighth note. Snare: 2 and 4. Kick: 1 and 3.' },
  variation: { title: '03 / Add a kick', bpm: 80, description: 'Keep the backbeat. Add a kick on the & after 3 in each bar.' },
  fill: { title: '04 / A little fill', bpm: 75, description: 'Play the groove, then snare, tom and floor tom on the final two beats.' },
  sixteenths: { title: '05 / Sixteenth-note pulse', bpm: 60, description: 'Count 1 e & a. Play four hi-hat notes per beat, with snare on 2 and 4.' },
  tempo: { title: '06 / Changing tempo', bpm: 60, description: 'Two bars: 60 BPM for bar one, then 90 BPM for bar two. A slower practice setting scales both.' }
};
export function makePreset(name = 'backbeat') {
  const p = PRESETS[name];
  if (!p) throw new Error('Unknown exercise.');
  const notes = [];
  for (let bar = 0; bar < 2; bar++) {
    const at = bar * 4;
    if(name==='sixteenths')for(let n=0;n<16;n++)notes.push({beat:at+n/4,drum:'hihat'});
    for (let n = 0; n < 8 && name!=='sixteenths'; n += name === 'pulse' ? 2 : 1) {
      if (!(name === 'fill' && bar === 1 && n >= 4)) notes.push({ beat: at + n / 2, drum: 'hihat' });
    }
    [0, 2].forEach(n => notes.push({ beat: at + n, drum: 'kick' }));
    if (name !== 'pulse') [1, 3].forEach(n => {
      if (!(name === 'fill' && bar === 1 && n === 3)) notes.push({ beat: at + n, drum: 'snare' });
    });
    if (name === 'variation') notes.push({ beat: at + 2.5, drum: 'kick' });
  }
  if (name === 'fill') [[6,'snare'],[6.5,'snare'],[7,'tom'],[7.5,'floor']].forEach(([beat,drum])=>notes.push({beat,drum}));
  return validateChart({ version: ['sixteenths','tempo'].includes(name)?2:1, title: p.title, bpm: p.bpm, beatsPerBar: 4, bars: 2, notes, ...(name==='tempo'?{tempoMap:[{beat:0,bpm:60},{beat:4,bpm:90}]}:{}) });
}
export function validateChart(value) {
  if (!value || ![1,2].includes(value.version) || value.beatsPerBar !== 4) throw new Error('Use chart version 1 or 2 and beatsPerBar: 4.');
  if (!Number.isFinite(value.bpm) || value.bpm < 35 || value.bpm > 200) throw new Error('BPM must be between 35 and 200.');
  if (!Number.isInteger(value.bars) || value.bars < 1 || value.bars > 64) throw new Error('Choose 1 to 64 bars.');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100) throw new Error('Give the chart a title of 1 to 100 characters.');
  if (!Array.isArray(value.notes) || !value.notes.length || value.notes.length > 4096) throw new Error('Include 1 to 4096 notes.');
  const seen = new Set();
  const division=value.version===2?4:2;
  const notes = value.notes.map(n => {
    if (!n || !Object.hasOwn(DRUMS,n.drum) || !Number.isFinite(n.beat) || n.beat < 0 || n.beat >= value.bars * 4 || !Number.isInteger(n.beat * division)) throw new Error(`Notes need a known drum and a ${division===4?'sixteenth':'eighth'}-note beat within the chart.`);
    const key = `${n.beat}:${n.drum}`;
    if (seen.has(key)) throw new Error(`Duplicate note: ${key}.`);
    seen.add(key);
    return { beat: n.beat, drum: n.drum };
  }).sort((a,b)=>a.beat-b.beat);
  const result={version:value.version,title:value.title.trim(),bpm:value.bpm,beatsPerBar:4,bars:value.bars,notes};
  if(value.tempoMap!==undefined){
    if(value.version!==2||!Array.isArray(value.tempoMap)||!value.tempoMap.length||value.tempoMap.length>256)throw Error('Tempo maps need chart version 2 and 1 to 256 changes.');
    let previous=-1;
    result.tempoMap=value.tempoMap.map(change=>{
      if(!change||!Number.isFinite(change.beat)||!Number.isInteger(change.beat*4)||change.beat<=previous||change.beat<0||change.beat>=value.bars*4||!Number.isFinite(change.bpm)||change.bpm<35||change.bpm>200)throw Error('Tempo changes need increasing sixteenth-note beats and BPM from 35 to 200.');
      previous=change.beat;return {beat:change.beat,bpm:change.bpm};
    });
    if(result.tempoMap[0].beat!==0||result.tempoMap[0].bpm!==value.bpm)throw Error('The tempo map must begin at beat 0 with the chart BPM.');
  }
  return result;
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
  const start = offset + beatSeconds(chart,region.start);
  const end = offset + beatSeconds(chart,region.start+region.length);
  if (!Number.isFinite(offset) || offset < 0 || end > duration || start >= duration) throw new Error('This loop extends beyond the song; reduce the offset or loop length.');
  return {start,end};
}
export const gridDivision=chart=>chart.version===2?4:2;
export const tempoChanges=chart=>chart.tempoMap||[{beat:0,bpm:chart.bpm}];
export function tempoAt(chart,beat){let bpm=chart.bpm;for(const change of tempoChanges(chart)){if(change.beat>beat)break;bpm=change.bpm;}return bpm;}
export function beatSeconds(chart,beat){
  let seconds=0,from=0,bpm=chart.bpm;
  for(const change of tempoChanges(chart)){
    if(change.beat>beat)break;seconds+=(change.beat-from)*60/bpm;from=change.beat;bpm=change.bpm;
  }
  return seconds+(beat-from)*60/bpm;
}
export function secondsBeat(chart,seconds){
  let from=0,spent=0,bpm=chart.bpm;
  for(const change of tempoChanges(chart)){
    const end=spent+(change.beat-from)*60/bpm;
    if(end>seconds)break;spent=end;from=change.beat;bpm=change.bpm;
  }
  return from+(seconds-spent)*bpm/60;
}
export function maxPracticeBpm(chart){return chart.bpm*Math.min(4,200/Math.max(...tempoChanges(chart).map(c=>c.bpm)));}
export function practiceTimeline(chart,region,bpm){
  const rate=bpm/chart.bpm,startSeconds=beatSeconds(chart,region.start),loopSeconds=(beatSeconds(chart,region.start+region.length)-startSeconds)/rate;
  const countSpb=60/(tempoAt(chart,region.start)*rate);
  return {rate,loopSeconds,countSpb,
    secondsAt(beat){if(beat<0)return beat*countSpb;const cycle=Math.floor(beat/region.length);return cycle*loopSeconds+(beatSeconds(chart,loopBeat(beat,region))-startSeconds)/rate;},
    beatAt(seconds){if(seconds<0)return seconds/countSpb;const cycle=Math.floor(seconds/loopSeconds),within=Math.max(0,Math.min(loopSeconds,seconds-cycle*loopSeconds));return cycle*region.length+secondsBeat(chart,startSeconds+within*rate)-region.start;}
  };
}
