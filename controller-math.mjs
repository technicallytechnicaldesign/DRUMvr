export const KIT_LAYOUT = {
  kick: [.12,.35,-.88,.25], snare: [-.20,.73,-.47,.19],
  hihat: [-.61,.97,-.67,.22], tom: [-.04,1,-.96,.17],
  floor: [.55,.73,-.53,.22], crash: [.56,1.23,-1.03,.27]
};
export const STICK_TIP = [0,0,-.40];
export function deadAxis(value){return Math.abs(value||0)>.25?value:0;}
                                                                                         
export function sweptDrumHit(previous,current,dt,layout=KIT_LAYOUT){
  if(!previous||!current||!Number.isFinite(dt)||dt<=0||dt>.1)return null;
  const distance=Math.hypot(current.x-previous.x,current.y-previous.y,current.z-previous.z);
  if(distance>.6||distance/dt>15)return null;                                                
  const speed=(previous.y-current.y)/dt;if(speed<.08)return null;
  let best=null;
  for(const[drum,[x,y,z,r]]of Object.entries(layout)){
    if(drum==='kick')continue;
    const plane=y+.012,above=previous.y-plane,below=current.y-plane;
    if(above<=0||below>0)continue;
    const t=above/(above-below),hitX=previous.x+(current.x-previous.x)*t,hitZ=previous.z+(current.z-previous.z)*t;
    if(Math.hypot(hitX-x,hitZ-z)>r*.96+.012)continue;
    if(!best||t<best.fraction)best={drum,fraction:t,speed,volume:Math.min(1.2,Math.max(.35,speed*.45))};
  }
  return best;
}
export class StrikeTracker{
  constructor(){this.reset();}
  reset(){this.previous=null;this.time=null;this.lastHit=new Map();}
  sample(position,time){
    const dt=this.time===null?0:(time-this.time)/1000;
    const hit=sweptDrumHit(this.previous,position,dt);
    this.previous={...position};this.time=time;
    if(!hit||time-(this.lastHit.get(hit.drum)??-Infinity)<65)return null;
    this.lastHit.set(hit.drum,time);return hit;
  }
}
