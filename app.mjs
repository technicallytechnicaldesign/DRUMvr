import { DRUMS, PRESETS, makePreset, validateChart, loopRegion, loopBeat, notesAt, midiDrum, gridDivision, tempoAt, maxPracticeBpm, audioRegion } from './core.mjs?v=6';
import { notation, svgScore } from './notation.mjs?v=6';
import { PracticeAudio } from './audio.mjs?v=6';
import { normalizeRotation, ROTATION_STEP } from './controller-math.mjs?v=6';
import { HitFeedback, TapCalibration, readProfiles } from './feedback.mjs?v=6';
const $=id=>document.getElementById(id),audio=new PracticeAudio();
let chart=makePreset(),kit=null,region=loopRegion(chart,1,2),running=false,starting=false,lastPaint=0,midi=null,session=null,manualHits={};
let grader=null,calibration=null,calStarting=false,calTimer=null,profiles={};
const profileKey='drumvr-timing-profiles-v1';
try{profiles=readProfiles(localStorage.getItem(profileKey));}catch{}
const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error)};
const rotationKey='drumvr-kit-yaw-v1';let kitRotation=0;
try{kitRotation=normalizeRotation(localStorage.getItem(rotationKey));}catch{}
function showRotation(){const angle=normalizeRotation(kitRotation);$('rotation-value').textContent=angle===0?'0°':angle<=180?`${angle}° left`:`${360-angle}° right`;}
function rotationChanged(value){kitRotation=normalizeRotation(value);showRotation();try{localStorage.setItem(rotationKey,String(kitRotation));$('rotation-hint').textContent='Angle remembered on this device. B/Y recenter faces you and clears it.';}catch{$('rotation-hint').textContent='Angle works now, but this browser cannot remember it.';}}
function rotateKit(value){const angle=normalizeRotation(value);if(kit)kit.rotate(angle);else rotationChanged(angle);}
$('rotate-left').onclick=()=>rotateKit(kitRotation+ROTATION_STEP);
$('rotate-right').onclick=()=>rotateKit(kitRotation-ROTATION_STEP);
$('rotate-reset').onclick=()=>rotateKit(0);
showRotation();
const locked=['exercise','tempo','song-speed','first-bar','last-bar','song-file','offset','chart-file','clear-song','feedback-enabled','input-profile','timing-offset','apply-offset','forget-offset'];
function showSpeed(){const rate=Number($('tempo').value)/chart.bpm;$('speed-value').textContent=`${Number((rate*100).toFixed(1))}%`;$('song-speed').value=[.5,.75,1].includes(rate)?String(rate):'';}
function tempoLimits(){$('tempo').min=chart.bpm*.5;$('tempo').max=maxPracticeBpm(chart);$('tempo').step='any';}
function showProfile(){
  const profile=profiles[$('input-profile').value];$('timing-offset').value=profile?.offsetMs??0;
  $('calibration-status').textContent=profile?`${profile.method==='tap'?'Tap calibration':'Manual correction'}: ${profile.offsetMs} ms${profile.method==='tap'?`, spread ${profile.spreadMs} ms`:''}. Recalibrate after changing audio output.`:'No saved calibration for this input. Calibrate before enabling timing feedback.';
  if(!profile)$('feedback-enabled').checked=false;
}
function saveProfile(profile){
  profiles[$('input-profile').value]=profile;showProfile();$('feedback-enabled').checked=true;
  try{localStorage.setItem(profileKey,JSON.stringify(profiles));}catch{$('calibration-status').textContent+=' Works now; browser storage is unavailable.';}
}
function feedbackText(result){return !result?'Ready for your hits.':result.kind==='missed'?`Missed: ${DRUMS[result.drum].label}`:result.kind==='extra'?`Extra hit: ${DRUMS[result.drum].label}`:`${result.kind==='onTime'?'On time':result.kind==='early'?'Early':'Late'}: ${DRUMS[result.drum].label} (${result.errorMs>0?'+':''}${result.errorMs} ms)`;}
function showFeedback(){
  if(!grader)return;
  const s=grader.stats;$('hit-feedback').textContent=feedbackText(grader.last);$('hit-stats').textContent=`On time ${s.onTime} · Early ${s.early} · Late ${s.late} · Missed ${s.missed} · Extra ${s.extra}`;
}
function endCalibration(message){clearInterval(calTimer);calibration=null;calStarting=false;$('calibrate').textContent='Calibrate with the click';$('play').textContent='Start practice';locked.forEach(id=>$(id).disabled=false);$('clear-song').disabled=!audio.song;$('hit-feedback').textContent=message;$('hit-stats').textContent='';status(message);}
function stop(message='Stopped. Start again for a four-beat count-in.'){
  if(calibration||calStarting)endCalibration('Calibration cancelled.');
  running=false;audio.stop();$('play').textContent='Start practice';locked.forEach(id=>$(id).disabled=false);$('clear-song').disabled=!audio.song;status(message);paint(true);
}
async function toggle(){
  if(calibration||calStarting){stop('Calibration cancelled.');return;}
  if(starting){stop('Song preparation cancelled.');return}
  if(running){stop();return}
  starting=true;locked.forEach(id=>$(id).disabled=true);$('play').textContent='Cancel preparation';status(audio.song?'Preparing song at the chosen speed...':'Preparing practice...');
  try{
    region=loopRegion(chart,Number($('first-bar').value),Number($('last-bar').value));
    audio.guide=$('guide').checked;audio.click=$('click').checked;
    grader=null;await audio.start(chart,Number($('tempo').value),region,Number($('offset').value));running=true;locked.forEach(id=>$(id).disabled=true);
    if($('feedback-enabled').checked&&profiles[$('input-profile').value]){grader=new HitFeedback(chart,region,audio.timeline);showFeedback();}else{$('hit-feedback').textContent='Timing feedback is off.';$('hit-stats').textContent='';}
    $('play').textContent='Stop practice';paint(true);status(audio.song?`Four beats in, then song + chart at ${Number((Number($('tempo').value)/chart.bpm*100).toFixed(1))}% speed, pitch preserved, starting at ${audioRegion(chart,region,Number($('offset').value),audio.song.duration).start.toFixed(2)}s.`:'Four beats in, then follow the score and the lit drums.');
  }catch(e){stop(e.name==='AbortError'?'Song preparation cancelled.':e.message);if(e.name!=='AbortError')status(e.message,true)}finally{starting=false;$('play').disabled=false}
}
function hit(drum,options={}){
  const input=options.input||(options.hand?'controller':'pad');
  const play=()=>{
    const age=Number.isFinite(options.timeStamp)?Math.max(0,Math.min(.2,(performance.now()-options.timeStamp)/1000)):0,time=audio.ctx.currentTime-age;
    manualHits[drum]=performance.now()+150;
    if(calibration){$('calibration-status').textContent=calibration.tap(input,time);return;}
    audio.voice(drum,audio.ctx.currentTime,options.volume??1);
    if(running&&grader&&input===$('input-profile').value){grader.hit(drum,time-audio.startAt-profiles[input].offsetMs/1000);showFeedback();}
    status(running&&grader&&input!==$('input-profile').value?`${DRUMS[drum].label} contact only: timing feedback uses the selected ${$('input-profile').selectedOptions[0].textContent} profile.`:`${DRUMS[drum].label} contact${options.hand?' / '+options.hand:''}.`);
  };
  if(audio.ctx?.state==='running'){play();return}
  audio.ready().then(play).catch(e=>status(`Audio could not start: ${e.message}`,true));
}
async function beginCalibration(input){
  if(starting){stop('Preparation cancelled. Press calibrate again when ready.');return;}
  if(calibration||calStarting){stop('Calibration cancelled.');return;}
  stop();grader=null;if(input)$('input-profile').value=input;showProfile();calStarting=true;
  const generation=audio.generation;locked.forEach(id=>$(id).disabled=true);$('calibrate').textContent='Cancel calibration';$('play').textContent='Cancel calibration';
  try{
    await audio.ready();if(audio.generation!==generation)return;
    calibration=new TapCalibration(audio.ctx.currentTime+.2,$('input-profile').value);calStarting=false;
    status('Four clicks to settle in, then strike any drum once per click for twelve clicks.');
    const tick=()=>{
      if(!calibration)return;
      while(calibration.next<16&&calibration.start+calibration.next*calibration.spb<audio.ctx.currentTime+.12){const n=calibration.next++;audio.voice(n%4===0?'tick-high':'tick',calibration.start+n*calibration.spb,.6);}
      if(audio.ctx.currentTime>calibration.start+15*calibration.spb+.3){
        try{const result=calibration.result();endCalibration('Calibration saved. Timing feedback is ready.');saveProfile(result);}catch(e){endCalibration(e.message);$('calibration-status').textContent=e.message;}
      }
    };tick();calTimer=setInterval(tick,25);
  }catch(e){endCalibration(`Calibration unavailable: ${e.message}`);}
}
$('calibrate').onclick=()=>beginCalibration();
$('input-profile').onchange=showProfile;
$('feedback-enabled').onchange=()=>{if($('feedback-enabled').checked&&!profiles[$('input-profile').value]){$('feedback-enabled').checked=false;status('Calibrate this input or apply a manual correction first.',true);}};
$('apply-offset').onclick=()=>{const offsetMs=Number($('timing-offset').value);if(!Number.isFinite(offsetMs)||Math.abs(offsetMs)>250){status('Correction must be between -250 and 250 ms.',true);return;}saveProfile({offsetMs,method:'manual',savedAt:new Date().toISOString()});status('Manual timing correction saved.');};
$('forget-offset').onclick=()=>{delete profiles[$('input-profile').value];try{localStorage.setItem(profileKey,JSON.stringify(profiles));}catch{}showProfile();status('Timing correction cleared for this input.');};
showProfile();
function setChart(next){
  stop('Chart ready. Set your tempo, then start practice.');chart=next;
  grader=null;$('hit-feedback').textContent=$('feedback-enabled').checked?'Timing feedback ready for the selected input.':'Timing feedback is off.';$('hit-stats').textContent='';
  tempoLimits();$('tempo').value=chart.bpm;$('tempo-value').textContent=Number(chart.bpm.toFixed(2));showSpeed();
  for(const id of ['first-bar','last-bar'])$(id).max=chart.bars;
  $('first-bar').value=1;$('last-bar').value=Math.min(2,chart.bars);region=loopRegion(chart,1,Math.min(2,chart.bars));paint(true);
}
function paint(force=false){
  const now=performance.now();if(!force&&now-lastPaint<45)return;lastPaint=now;
  const elapsed=running?audio.elapsed():0,counting=running&&elapsed<0,beat=running&&!counting?loopBeat(elapsed,region):region.start;
  const division=gridDivision(chart),step=Math.floor(beat*division)/division,fraction=(beat-step)*division;
  const active=running&&!counting&&fraction<Math.min(.7,.14/(audio.spb/division))?notesAt(chart,step).map(n=>n.drum):[];
  const contacts=Object.entries(manualHits).filter(([,expiry])=>expiry>now).map(([drum])=>drum);
  const next=notesAt(chart,running&&!counting?loopBeat(Math.floor(elapsed*division)/division+1/division,region):region.start).map(n=>n.drum);
  kit?.update(active,next,fraction,contacts);
  const pageBar=Math.floor(beat/8)*2,primitives=notation(chart,pageBar,beat,active);
  $('score').innerHTML=svgScore(primitives);$('chart-title').textContent=chart.title;
  const currentBpm=tempoAt(chart,beat)*Number($('tempo').value)/chart.bpm;
  $('score-page').textContent=`4/4 · bars ${pageBar+1} to ${Math.min(pageBar+2,chart.bars)} · ${Number(currentBpm.toFixed(2))} BPM${chart.tempoMap?' / tempo map':''}`;
  const bar=Math.floor(beat/4)+1,pulse=Math.floor(beat%4)+1;
  $('count').textContent=counting?Math.max(1,Math.min(4,Math.floor(elapsed+4)+1)):String(pulse);
  const syllable=division===4?['',' e',' &',' a'][Math.floor((beat%1)*4)]:beat%1>=.5?' &':'';
  $('position').textContent=counting?'COUNT IN / FOUR BEATS':`BAR ${bar} / BEAT ${pulse}${syllable}`;
  $('cue').textContent=counting?'Count in. Get ready.':running?(notesAt(chart,step).map(n=>DRUMS[n.drum].label).join(' + ')||'Rest'):'Ready when you are.';
  for(const d of Object.keys(DRUMS))$(`pad-${d}`).classList.toggle('lit',contacts.includes(d));
  if(running&&grader){grader.advance(audio.ctx.currentTime-audio.startAt-profiles[$('input-profile').value].offsetMs/1000);showFeedback();}
  let feedback=$('hit-feedback').textContent;
  if(calibration){const beat=Math.floor((audio.ctx.currentTime-calibration.start)/calibration.spb);feedback=beat<4?`CALIBRATION: COUNT IN ${Math.max(1,beat+1)} / 4`:`CALIBRATION: STRIKE WITH THE CLICK, ${calibration.samples.size} / 12 TAPS`;$('hit-feedback').textContent=feedback;}
  kit?.score(primitives,chart.title,counting?`COUNT IN  ${$('count').textContent} / 4`:`BAR ${bar} / BEAT ${pulse}${syllable}   |   ${Number(currentBpm.toFixed(2))} BPM`,running,feedback,Boolean(calibration||calStarting));
}
for(const [id,drum]of Object.entries(DRUMS)){
  const button=document.createElement('button');button.id=`pad-${id}`;button.innerHTML=`${drum.label}<kbd>${drum.key}</kbd>`;button.title=`Play ${drum.label}`;button.onpointerdown=e=>hit(id,{input:'pad',timeStamp:e.timeStamp});button.onclick=e=>{if(e.detail===0)hit(id,{input:'pad',timeStamp:e.timeStamp});};$('pads').append(button);
}
$('play').onclick=toggle;
document.querySelector('a[href="#controls-help"]').onclick=()=>$('controls-help').open=true;
$('exercise').onchange=()=>{setChart(makePreset($('exercise').value));$('lesson').textContent=PRESETS[$('exercise').value].description};
$('lesson').textContent=PRESETS.backbeat.description;
$('tempo').oninput=()=>{$('tempo-value').textContent=Number(Number($('tempo').value).toFixed(2));showSpeed();paint(true)};
$('song-speed').onchange=()=>{if(!$('song-speed').value)return;$('tempo').value=chart.bpm*Number($('song-speed').value);$('tempo').oninput();};
tempoLimits();showSpeed();
for(const id of ['first-bar','last-bar'])$(id).onchange=()=>{try{region=loopRegion(chart,Number($('first-bar').value),Number($('last-bar').value));paint(true);status('Loop range updated.')}catch(e){status(e.message,true)}};
function adjust(){kit?.adjust($('mirror').checked,Number($('height').value)/100,Number($('distance').value)/100);$('height-value').textContent=`${$('height').value} cm`;$('distance-value').textContent=`${$('distance').value} cm`}
for(const id of ['mirror','height','distance'])$(id).oninput=adjust;
$('guide').onchange=()=>audio.guide=$('guide').checked;$('click').onchange=()=>audio.click=$('click').checked;
$('song-file').onchange=async()=>{
  const file=$('song-file').files[0];if(!file)return;
  $('play').disabled=true;status('Decoding your local audio file...');
  try{const duration=await audio.load(file);$('song-status').textContent=`${file.name} / ${duration.toFixed(1)} seconds`;$('clear-song').disabled=false;status('Song loaded. Set its first downbeat offset and import a matching chart.')}catch(e){status(`Cannot read this audio: ${e.message}`,true)}finally{$('play').disabled=false}
};
$('clear-song').onclick=()=>{audio.song=null;audio.cache=null;$('song-file').value='';$('song-status').textContent='Optional. Choose audio from this device.';$('clear-song').disabled=true;status('Song removed.')};
$('chart-file').onchange=async()=>{
  const file=$('chart-file').files[0];if(!file)return;
  try{const value=validateChart(JSON.parse(await file.text()));setChart(value);$('lesson').textContent='Imported chart. Align the song downbeat and choose a loop.';$('exercise').selectedIndex=-1}catch(e){status(`Chart rejected: ${e.message}`,true)}
};
$('export-chart').onclick=()=>{const blob=new Blob([JSON.stringify(chart,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='air-drum-chart.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Exported the chart with its original BPM.')};
function connectInputs(){
  for(const input of midi.inputs.values())input.onmidimessage=e=>{const drum=midiDrum(e.data);if(drum)hit(drum,{input:'midi',timeStamp:e.timeStamp})};
  const names=[...midi.inputs.values()].filter(i=>i.state==='connected').map(i=>i.name||'MIDI device');$('midi-status').textContent=names.length?`Connected: ${names.join(', ')}. General MIDI drum mapping.`:'MIDI access ready; no MIDI inputs detected. Connect your device to this computer.';
}
$('connect-midi').onclick=async()=>{
  if(!navigator.requestMIDIAccess){$('midi-status').textContent='This browser does not expose Web MIDI. Keyboard and pad buttons still work.';return}
  try{await audio.ready();midi=await navigator.requestMIDIAccess({sysex:false});midi.onstatechange=connectInputs;connectInputs()}catch(e){$('midi-status').textContent=`MIDI connection unavailable: ${e.message}`}
};
document.addEventListener('keydown',e=>{
  if(e.repeat||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;
  const drum=Object.keys(DRUMS).find(d=>DRUMS[d].key===e.key.toUpperCase());if(drum){e.preventDefault();hit(drum,{input:'keyboard',timeStamp:e.timeStamp})}
  if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();toggle()}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(running||starting||calibration||calStarting)&&!session)stop('Practice stopped while the tab was hidden. Start again when ready.')});
$('vr').onclick=async()=>{
  try{
    if(session){await session.end();return}
    if(running||starting||calibration||calStarting)stop('Practice stopped before switching to Quest controllers.');
    await audio.ready();

    const xr=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['local-floor']});session=xr;
    xr.addEventListener('end',()=>{session=null;$('vr').textContent='Enter VR';$('mode-label').textContent='DESKTOP PREVIEW';stop('VR session ended.')},{once:true});
    await kit.renderer.xr.setSession(xr);$('input-profile').value='controller';showProfile();$('vr').textContent='Exit VR';$('mode-label').textContent='QUEST CONTROLLER STICKS';status('Swing to hit. Trigger: kick. A/X: practice. B/Y: recenter. Click a thumbstick to calibrate timing. Thumbstick movement: reach and height.');
  }catch(e){if(session){try{await session.end()}catch{}session=null}status(`Cannot enter VR: ${e.message}`,true)}
};
try{
  const {createKit}=await import('./scene.mjs?v=6');kit=createKit(document.querySelector('.scene'),hit,toggle,(height,distance)=>{$('height').value=Math.round(height*100);$('distance').value=Math.round(distance*100);$('height-value').textContent=`${Math.round(height*100)} cm`;$('distance-value').textContent=`${Math.round(distance*100)} cm`},rotationChanged,()=>beginCalibration('controller'));kit.rotate(kitRotation);$('loading').remove();kit.animate(()=>paint());$('play').disabled=false;status('Ready. Free play with the pads, or start a guided practice.');paint(true);
  if(navigator.xr&&window.isSecureContext&&await navigator.xr.isSessionSupported('immersive-vr')){$('vr').disabled=false;$('vr').textContent='Enter VR'}else $('vr').textContent='VR headset needed';
}catch(e){$('loading').textContent='The 3D kit could not load. See the setup notes.';$('play').disabled=false;status(`3D unavailable: ${e.message}. The score and audio still work.`,true);const frame=()=>{paint();requestAnimationFrame(frame)};frame();$('vr').textContent='VR unavailable'}
