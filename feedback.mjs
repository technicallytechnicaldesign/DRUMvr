export const INPUTS=['controller','keyboard','midi','pad'];
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
export function calibrationResult(samples){
  if(samples.length<8||!samples.every(Number.isFinite))throw Error('At least eight steady taps are needed. Try calibration again.');
  const offsetMs=median(samples),spreadMs=median(samples.map(v=>Math.abs(v-offsetMs)));
  if(Math.abs(offsetMs)>250||spreadMs>35)throw Error('Taps were too spread out. Listen to the click and try again.');
  return {offsetMs:Math.round(offsetMs),spreadMs:Math.round(spreadMs),method:'tap',savedAt:new Date().toISOString()};
}
export function readProfiles(text){
  try{const value=JSON.parse(text),profiles={};for(const input of INPUTS){const p=value?.[input];if(p&&Number.isFinite(p.offsetMs)&&Math.abs(p.offsetMs)<=250&&['tap','manual'].includes(p.method))profiles[input]=p;}return profiles;}catch{return {};}
}
export class TapCalibration {
  constructor(start,input){this.start=start;this.input=input;this.spb=60/90;this.samples=new Map();this.next=0;}
  tap(input,time){
    if(input!==this.input)return 'Use the selected input for these taps.';
    const beat=Math.round((time-this.start)/this.spb),error=(time-this.start-beat*this.spb)*1000;
    if(beat<4)return 'Count in first, then tap with the click.';
    if(beat>=16||Math.abs(error)>250)return 'Tap closer to each click.';
    if(this.samples.has(beat))return 'One tap per click.';
    this.samples.set(beat,error);return `${this.samples.size} / 12 taps captured.`;
  }
  result(){return calibrationResult([...this.samples.values()]);}
}
export class HitFeedback {
  constructor(chart,region,timeline){
    this.duration=timeline.loopSeconds;this.events=chart.notes.filter(n=>n.beat>=region.start&&n.beat<region.start+region.length).map((n,index)=>({...n,index,time:timeline.secondsAt(n.beat-region.start)}));
    this.byDrum=new Map();
    for(const event of this.events){if(!this.byDrum.has(event.drum))this.byDrum.set(event.drum,[]);this.byDrum.get(event.drum).push(event);}
    for(const same of this.byDrum.values())for(let i=0;i<same.length;i++){
      const event=same[i],previous=same[(i+same.length-1)%same.length],next=same[(i+1)%same.length];
      const before=event.time-previous.time+(i===0?this.duration:0),after=next.time-event.time+(i===same.length-1?this.duration:0);
      event.window=Math.min(.14,Math.min(before,after)*.45);
    }
    this.judged=new Set();this.cursor=0;this.last=null;this.stats={onTime:0,early:0,late:0,missed:0,extra:0};
  }
  event(index){const count=this.events.length,event=this.events[index%count];return {...event,time:Math.floor(index/count)*this.duration+event.time,index};}
  advance(time){
    if(!this.events.length||time<0)return null;
    let result=null;
    while(this.event(this.cursor).time+.14<time){
      const event=this.event(this.cursor);
      if(!this.judged.has(this.cursor)){this.stats.missed++;result={kind:'missed',drum:event.drum};this.last=result;}
      this.judged.delete(this.cursor++);
    }
    return result;
  }
  hit(drum,time){
    if(!Number.isFinite(time)||time<0)return null;
    this.advance(time);let best=null;
    const cycle=Math.floor(time/this.duration),count=this.events.length;
    const entries=this.byDrum.get(drum)||[];
    for(let c=Math.max(0,cycle-1);c<=cycle+1;c++){
      const local=time-c*this.duration;let low=0,high=entries.length;
      while(low<high){const mid=(low+high)>>1;if(entries[mid].time<local)low=mid+1;else high=mid;}
      for(const i of [low-1,low])if(i>=0&&i<entries.length){
        const event=this.event(c*count+entries[i].index),distance=Math.abs(time-event.time);
        if(event.index>=this.cursor&&!this.judged.has(event.index)&&distance<=event.window&&(!best||distance<Math.abs(time-best.time)))best=event;
      }
    }
    if(!best){this.stats.extra++;return this.last={kind:'extra',drum};}
    this.judged.add(best.index);const errorMs=(time-best.time)*1000;
    const kind=Math.abs(errorMs)<=Math.min(35,best.window*500)?'onTime':errorMs<0?'early':'late';
    this.stats[kind]++;return this.last={kind,drum,errorMs:Math.round(errorMs)};
  }
}
