import { notesAt, loopBeat, audioRegion } from './core.mjs?v=5';
export class PracticeAudio {
  constructor(){this.ctx=null;this.running=false;this.nodes=new Set();this.song=null;this.guide=true;this.click=true;this.generation=0;this.cache=null;}
  async ready(){
    if(!this.ctx){
      this.ctx=new AudioContext({latencyHint:'interactive'});
      this.master=this.ctx.createGain();this.master.gain.value=.28;this.master.connect(this.ctx.destination);
      this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate);
      const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
    }
    await this.ctx.resume();
  }
  voice(kind,when=this.ctx.currentTime,volume=1){
    const ctx=this.ctx,t=Math.max(when,ctx.currentTime),gain=ctx.createGain();gain.connect(this.master);
    const noise=['snare','hihat','crash','ride'].includes(kind);
    const src=noise?ctx.createBufferSource():ctx.createOscillator();
    let duration=.15;
    if(noise){
      src.buffer=this.noise;const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=kind==='snare'?900:kind==='ride'?4200:6500;
      src.connect(filter);filter.connect(gain);duration=kind==='ride'?.85:kind==='crash'?.7:kind==='snare'?.17:.065;
    }else{
      src.type='sine';const f=kind==='kick'?145:kind==='tom'?220:kind==='midtom'?175:kind==='floor'?130:kind==='tick-high'?1200:850;
      src.frequency.setValueAtTime(f,t);src.frequency.exponentialRampToValueAtTime(kind==='kick'?42:f*.75,t+.12);src.connect(gain);
      if(kind.startsWith('tick'))duration=.035;
    }
    gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(volume*(noise?.55:.85),t+.002);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    this.nodes.add(src);src.onended=()=>{this.nodes.delete(src);src.disconnect();gain.disconnect()};src.start(t);src.stop(t+duration+.01);
    if(kind==='ride')for(const frequency of [580,1090,1780,2520,3490]){
      const partial=ctx.createOscillator(),level=ctx.createGain();partial.type='sine';partial.frequency.value=frequency;
      level.gain.setValueAtTime(.0001,t);level.gain.exponentialRampToValueAtTime(.045*volume,t+.003);level.gain.exponentialRampToValueAtTime(.0001,t+.75);
      partial.connect(level);level.connect(this.master);this.nodes.add(partial);partial.onended=()=>{this.nodes.delete(partial);partial.disconnect();level.disconnect()};partial.start(t);partial.stop(t+.77);
    }
  }
  async load(file){await this.ready();const buffer=await this.ctx.decodeAudioData(await file.arrayBuffer());this.song=buffer;this.cache=null;return buffer.duration;}
  async prepareSong(song,region,rate){
    const key=[region.start,region.end,rate].join(':');
    if(this.cache?.song===song&&this.cache.key===key)return this.cache.buffer;
    const first=Math.round(region.start*song.sampleRate),last=Math.min(song.length,Math.round(region.end*song.sampleRate));
    const frames=last-first,outputFrames=Math.round(frames/rate);
    if(frames*song.numberOfChannels*4+outputFrames*(song.numberOfChannels*8+4)>128*1024*1024)throw Error('This song loop is too long at this speed. Choose fewer bars.');
    this.cache=null;
    const channels=Array.from({length:song.numberOfChannels},(_,c)=>song.getChannelData(c).slice(first,last));
    let samples=channels;
    if(rate!==1)samples=await new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./stretch-worker.mjs?v=5',import.meta.url),{type:'module'});
      const finish=()=>{worker.terminate();this.cancelPreparation=null;};
      this.cancelPreparation=()=>{finish();reject(new DOMException('Preparation cancelled.','AbortError'));};
      worker.onmessage=({data})=>{finish();data.error?reject(Error(data.error)):resolve(data.channels);};
      worker.onerror=()=>{finish();reject(Error('Song slowdown could not prepare. Try a shorter loop or reload the page.'));};
      worker.postMessage({channels,sampleRate:song.sampleRate,rate},channels.map(c=>c.buffer));
    });
    const buffer=this.ctx.createBuffer(samples.length,samples[0].length,song.sampleRate);
    samples.forEach((c,i)=>buffer.copyToChannel(c,i));this.cache={song,key,buffer};return buffer;
  }
  async start(chart,bpm,region,offset){
    this.stop();const generation=this.generation;await this.ready();
    if(generation!==this.generation)throw new DOMException('Preparation cancelled.','AbortError');
    const rate=bpm/chart.bpm;
    if(!Number.isFinite(bpm)||bpm<1||bpm>200)throw Error('Practice BPM must be between 1 and 200.');
    if(this.song&&(rate<.5||rate>4))throw Error('Choose a song speed between 50% and 400%.');
    const songRegion=this.song?audioRegion(chart,region,offset,this.song.duration):null;
    const buffer=songRegion?await this.prepareSong(this.song,songRegion,rate):null;
    if(generation!==this.generation)throw new DOMException('Preparation cancelled.','AbortError');
    this.chart=chart;this.region=region;this.spb=60/bpm;this.nextStep=-8;this.startAt=this.ctx.currentTime+.1+4*this.spb;
    if(songRegion){
      const src=this.ctx.createBufferSource();src.buffer=buffer;src.loop=true;src.loopStart=0;src.loopEnd=buffer.duration;src.playbackRate.value=buffer.duration/(region.length*this.spb);
      const gain=this.ctx.createGain();gain.gain.value=1.5;gain.connect(this.master);src.connect(gain);
      this.nodes.add(src);src.onended=()=>{this.nodes.delete(src);src.disconnect();gain.disconnect()};src.start(this.startAt);
    }
    this.running=true;this.tick();this.timer=setInterval(()=>this.tick(),25);
  }
  tick(){
    if(!this.running)return;
    const horizon=this.elapsed()+.12/this.spb;
    while(this.nextStep/2<=horizon){
      const beat=this.nextStep/2,t=this.startAt+beat*this.spb;

      if(t>=this.ctx.currentTime-.035){
        if(this.nextStep%2===0&&(beat<0||this.click))this.voice(this.nextStep%8===0?'tick-high':'tick',t,.5);
        if(beat>=0&&this.guide)for(const n of notesAt(this.chart,loopBeat(beat,this.region)))this.voice(n.drum,t);
      }
      this.nextStep++;
      if(this.nextStep/2<horizon-4)this.nextStep=Math.ceil((horizon-4)*2);
    }
  }
  elapsed(){return this.ctx?(this.ctx.currentTime-this.startAt)/this.spb:0;}
  stop(){this.generation++;this.cancelPreparation?.();this.running=false;clearInterval(this.timer);for(const src of [...this.nodes]){try{src.stop()}catch{}}this.nodes.clear();}
}
