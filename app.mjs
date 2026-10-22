import { DRUMS, PRESETS, makePreset, validateChart, loopRegion, loopBeat, notesAt, midiDrum } from './core.mjs?v=2';
import { notation, svgScore } from './notation.mjs?v=2';
import { PracticeAudio } from './audio.mjs?v=2';
const $=id=>document.getElementById(id),audio=new PracticeAudio();
let chart=makePreset(),kit=null,region=loopRegion(chart,1,2),running=false,starting=false,lastPaint=0,midi=null,session=null,manualHits={};
const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error)};
const locked=['exercise','tempo','first-bar','last-bar','song-file','offset','chart-file','clear-song'];
function stop(message='Stopped. Start again for a four-beat count-in.'){
  running=false;audio.stop();$('play').textContent='Start practice';locked.forEach(id=>$(id).disabled=false);$('clear-song').disabled=!audio.song;status(message);paint(true);
}
async function toggle(){
  if(starting)return;
  if(running){stop();return}
  starting=true;$('play').disabled=true;
  try{
    region=loopRegion(chart,Number($('first-bar').value),Number($('last-bar').value));
    audio.guide=$('guide').checked;audio.click=$('click').checked;
    await audio.start(chart,Number($('tempo').value),region,Number($('offset').value));running=true;locked.forEach(id=>$(id).disabled=true);
    $('play').textContent='Stop practice';paint(true);status(audio.song?`Four beats in, then song + chart at ${Math.round(Number($('tempo').value)/chart.bpm*100)}% speed, starting at ${(Number($('offset').value)+region.start*60/chart.bpm).toFixed(2)}s.`:'Four beats in, then follow the score and the lit drums.');
  }catch(e){audio.stop();status(e.message,true)}finally{starting=false;$('play').disabled=false}
}
function hit(drum,options={}){
  const play=()=>{audio.voice(drum,audio.ctx.currentTime,options.volume??1);manualHits[drum]=performance.now()+150;status(`${DRUMS[drum].label} contact${options.hand?' / '+options.hand:''}.`)};
  if(audio.ctx?.state==='running'){play();return}
  audio.ready().then(play).catch(e=>status(`Audio could not start: ${e.message}`,true));
}
function setChart(next){
  stop('Chart ready. Set your tempo, then start practice.');chart=next;
  $('tempo').value=chart.bpm;$('tempo-value').textContent=chart.bpm;
  for(const id of ['first-bar','last-bar'])$(id).max=chart.bars;
  $('first-bar').value=1;$('last-bar').value=Math.min(2,chart.bars);region=loopRegion(chart,1,Math.min(2,chart.bars));paint(true);
}
function paint(force=false){
  const now=performance.now();if(!force&&now-lastPaint<45)return;lastPaint=now;
  const elapsed=running?audio.elapsed():0,counting=running&&elapsed<0,beat=running&&!counting?loopBeat(elapsed,region):region.start;
  const step=Math.floor(beat*2)/2,fraction=(beat-step)*2;
  const active=running&&!counting&&fraction<Math.min(.7,.14/(audio.spb/2))?notesAt(chart,step).map(n=>n.drum):[];
  const contacts=Object.entries(manualHits).filter(([,expiry])=>expiry>now).map(([drum])=>drum);
  const next=notesAt(chart,running&&!counting?loopBeat(Math.floor(elapsed*2)/2+.5,region):region.start).map(n=>n.drum);
  kit?.update(active,next,fraction,contacts);
  const pageBar=Math.floor(beat/8)*2,primitives=notation(chart,pageBar,beat,active);
  $('score').innerHTML=svgScore(primitives);$('chart-title').textContent=chart.title;
  $('score-page').textContent=`4/4 · bars ${pageBar+1} to ${Math.min(pageBar+2,chart.bars)} · chart ${chart.bpm} BPM`;
  const bar=Math.floor(beat/4)+1,pulse=Math.floor(beat%4)+1;
  $('count').textContent=counting?Math.max(1,Math.min(4,Math.floor(elapsed+4)+1)):String(pulse);
  $('position').textContent=counting?'COUNT IN / FOUR BEATS':`BAR ${bar} / BEAT ${pulse}${beat%1>=.5?' &':''}`;
  $('cue').textContent=counting?'Count in. Get ready.':running?(notesAt(chart,step).map(n=>DRUMS[n.drum].label).join(' + ')||'Rest'):'Ready when you are.';
  for(const d of Object.keys(DRUMS))$(`pad-${d}`).classList.toggle('lit',contacts.includes(d));
  kit?.score(primitives,chart.title,counting?`COUNT IN  ${$('count').textContent} / 4`:`BAR ${bar} / BEAT ${pulse}   |   ${$('tempo').value} BPM`,running);
}
for(const [id,drum]of Object.entries(DRUMS)){
  const button=document.createElement('button');button.id=`pad-${id}`;button.innerHTML=`${drum.label}<kbd>${drum.key}</kbd>`;button.title=`Play ${drum.label}`;button.onclick=()=>hit(id);$('pads').append(button);
}
$('play').onclick=toggle;
$('exercise').onchange=()=>{setChart(makePreset($('exercise').value));$('lesson').textContent=PRESETS[$('exercise').value].description};
$('lesson').textContent=PRESETS.backbeat.description;
$('tempo').oninput=()=>{$('tempo-value').textContent=$('tempo').value;paint(true)};
for(const id of ['first-bar','last-bar'])$(id).onchange=()=>{try{region=loopRegion(chart,Number($('first-bar').value),Number($('last-bar').value));paint(true);status('Loop range updated.')}catch(e){status(e.message,true)}};
function adjust(){kit?.adjust($('mirror').checked,Number($('height').value)/100,Number($('distance').value)/100);$('height-value').textContent=`${$('height').value} cm`;$('distance-value').textContent=`${$('distance').value} cm`}
for(const id of ['mirror','height','distance'])$(id).oninput=adjust;
$('guide').onchange=()=>audio.guide=$('guide').checked;$('click').onchange=()=>audio.click=$('click').checked;
$('song-file').onchange=async()=>{
  const file=$('song-file').files[0];if(!file)return;
  $('play').disabled=true;status('Decoding your local audio file...');
  try{const duration=await audio.load(file);$('song-status').textContent=`${file.name} / ${duration.toFixed(1)} seconds`;$('clear-song').disabled=false;status('Song loaded. Set its first downbeat offset and import a matching chart.')}catch(e){status(`Cannot read this audio: ${e.message}`,true)}finally{$('play').disabled=false}
};
$('clear-song').onclick=()=>{audio.song=null;$('song-file').value='';$('song-status').textContent='Optional. Choose audio from this device.';$('clear-song').disabled=true;status('Song removed.')};
$('chart-file').onchange=async()=>{
  const file=$('chart-file').files[0];if(!file)return;
  try{const value=validateChart(JSON.parse(await file.text()));setChart(value);$('lesson').textContent='Imported chart. Align the song downbeat and choose a loop.';$('exercise').selectedIndex=-1}catch(e){status(`Chart rejected: ${e.message}`,true)}
};
$('export-chart').onclick=()=>{const blob=new Blob([JSON.stringify(chart,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='air-drum-chart.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Exported the chart with its original BPM.')};
function connectInputs(){
  for(const input of midi.inputs.values())input.onmidimessage=e=>{const drum=midiDrum(e.data);if(drum)hit(drum)};
  const names=[...midi.inputs.values()].filter(i=>i.state==='connected').map(i=>i.name||'MIDI device');$('midi-status').textContent=names.length?`Connected: ${names.join(', ')}. General MIDI drum mapping.`:'MIDI access ready; no MIDI inputs detected. Connect your device to this computer.';
}
$('connect-midi').onclick=async()=>{
  if(!navigator.requestMIDIAccess){$('midi-status').textContent='This browser does not expose Web MIDI. Keyboard and pad buttons still work.';return}
  try{await audio.ready();midi=await navigator.requestMIDIAccess({sysex:false});midi.onstatechange=connectInputs;connectInputs()}catch(e){$('midi-status').textContent=`MIDI connection unavailable: ${e.message}`}
};
document.addEventListener('keydown',e=>{
  if(e.repeat||['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;
  const drum=Object.keys(DRUMS).find(d=>DRUMS[d].key===e.key.toUpperCase());if(drum){e.preventDefault();hit(drum)}
  if(e.code==='Space'){e.preventDefault();toggle()}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!session)stop('Practice stopped while the tab was hidden. Start again when ready.')});
$('vr').onclick=async()=>{
  try{
    if(session){await session.end();return}
    await audio.ready();
                                                                                    
    const xr=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor']});session=xr;
    xr.addEventListener('end',()=>{session=null;$('vr').textContent='Enter VR';$('mode-label').textContent='DESKTOP PREVIEW';stop('VR session ended.')},{once:true});
    await kit.renderer.xr.setSession(xr);$('vr').textContent='Exit VR';$('mode-label').textContent='QUEST CONTROLLER STICKS';status('Swing to hit. Trigger: kick. A/X: practice. B/Y: recenter. Thumbsticks: reach and height.');
  }catch(e){if(session){try{await session.end()}catch{}session=null}status(`Cannot enter VR: ${e.message}`,true)}
};
try{
  const {createKit}=await import('./scene.mjs?v=2');kit=createKit(document.querySelector('.scene'),hit,toggle,(height,distance)=>{$('height').value=Math.round(height*100);$('distance').value=Math.round(distance*100);$('height-value').textContent=`${Math.round(height*100)} cm`;$('distance-value').textContent=`${Math.round(distance*100)} cm`});$('loading').remove();kit.animate(()=>paint());$('play').disabled=false;status('Ready. Free play with the pads, or start a guided practice.');paint(true);
  if(navigator.xr&&window.isSecureContext&&await navigator.xr.isSessionSupported('immersive-vr')){$('vr').disabled=false;$('vr').textContent='Enter VR'}else $('vr').textContent='VR headset needed';
}catch(e){$('loading').textContent='The 3D kit could not load. See the setup notes.';$('play').disabled=false;status(`3D unavailable: ${e.message}. The score and audio still work.`,true);const frame=()=>{paint();requestAnimationFrame(frame)};frame();$('vr').textContent='VR unavailable'}
