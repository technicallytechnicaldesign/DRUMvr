import { notesAt, loopBeat, audioRegion } from './core.mjs?v=2';
export class PracticeAudio {
  constructor(){this.ctx=null;this.running=false;this.nodes=new Set();this.song=null;this.guide=true;this.click=true;}
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
    const noise=['snare','hihat','crash'].includes(kind);
    const src=noise?ctx.createBufferSource():ctx.createOscillator();
    let duration=.15;
    if(noise){
      src.buffer=this.noise;const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=kind==='snare'?900:6500;
      src.connect(filter);filter.connect(gain);duration=kind==='crash'?.7:kind==='snare'?.17:.065;
    }else{
      src.type='sine';const f=kind==='kick'?145:kind==='tom'?220:kind==='floor'?130:kind==='tick-high'?1200:850;
      src.frequency.setValueAtTime(f,t);src.frequency.exponentialRampToValueAtTime(kind==='kick'?42:f*.75,t+.12);src.connect(gain);
      if(kind.startsWith('tick'))duration=.035;
    }
    gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(volume*(noise?.55:.85),t+.002);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    this.nodes.add(src);src.onended=()=>{this.nodes.delete(src);src.disconnect();gain.disconnect()};src.start(t);src.stop(t+duration+.01);
  }
  async load(file){await this.ready();const buffer=await this.ctx.decodeAudioData(await file.arrayBuffer());this.song=buffer;return buffer.duration;}
  async start(chart,bpm,region,offset){
    this.stop();await this.ready();
    const songRegion=this.song?audioRegion(chart,region,offset,this.song.duration):null;
    this.chart=chart;this.region=region;this.spb=60/bpm;this.nextStep=-8;this.startAt=this.ctx.currentTime+.1+4*this.spb;
    if(songRegion){
      const src=this.ctx.createBufferSource();src.buffer=this.song;src.loop=true;src.loopStart=songRegion.start;src.loopEnd=songRegion.end;src.playbackRate.value=bpm/chart.bpm;
      const gain=this.ctx.createGain();gain.gain.value=1.5;gain.connect(this.master);src.connect(gain);
      this.nodes.add(src);src.onended=()=>{this.nodes.delete(src);src.disconnect();gain.disconnect()};src.start(this.startAt,songRegion.start);
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
  stop(){this.running=false;clearInterval(this.timer);for(const src of [...this.nodes]){try{src.stop()}catch{}}this.nodes.clear();}
}
