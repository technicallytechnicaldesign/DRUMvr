import { DRUMS, notesAt, gridDivision, tempoChanges } from './core.mjs?v=6';

export function notation(chart, pageBar, cursorBeat, activeDrums = []) {
  const p = [];
  const line=(x,y,x2,y2,color='#444444',width=1)=>p.push({type:'line',x,y,x2,y2,color,width});
  const text=(x,y,value,size=13)=>p.push({type:'text',x,y,value:String(value),size,color:'#444444'});
  const start=pageBar*4, end=Math.min(start+8,chart.bars*4);
  const xFor = beat=>115+(beat-start)*99;
  for(let y=38;y<=94;y+=14) line(64,y,930,y,'#b8b8b8');
  line(72,55,72,78,'#111111',4);line(81,55,81,78,'#111111',4);
  text(91,49,'4',18);text(91,82,'4',18);
  const rest=(x,y,flags)=>p.push({type:'rest',x,y,eighth:flags>0,flags,color:'#444444'});
  const voice=(beat,down)=>notesAt(chart,beat).filter(n=>down?n.drum==='kick':n.drum!=='kick');
  function head(n, x, stemEnd, down) {
    const y=DRUMS[n.drum].y;
    const division=gridDivision(chart),color=activeDrums.includes(n.drum)&&Math.abs(n.beat-Math.floor(cursorBeat*division)/division)<.01?'#927400':'#111111';
    p.push({type:'head',x,y,cross:n.drum==='hihat'||n.drum==='crash'||n.drum==='ride',color});
    if(y<31)line(x-11,y,x+11,y,color);
    line(x+(down?-6:6),y,x+(down?-6:6),stemEnd,color,1.5);
  }
  for(let beat=start;beat<end;beat++) {
    if(beat%4===0){line(xFor(beat)-30,38,xFor(beat)-30,94);text(xFor(beat)-30,-13,`BAR ${Math.floor(beat/4)+1}`,11)}
    for(const down of [false,true]) {
      const sixteenth=voice(beat+.25,down).length||voice(beat+.75,down).length;
      const divisions=sixteenth?4:voice(beat+.5,down).length?2:1,y=down?118:66,stemEnd=down?119:sixteenth?-4:8,sign=down?-6:6,flags=divisions===4?2:divisions===2?1:0;
      for(let slot=0;slot<divisions;slot++){
        const at=beat+slot/divisions,x=xFor(at),notes=voice(at,down);
        if(!notes.length){rest(x,y,flags);continue;}
        notes.forEach(n=>head(n,x,stemEnd,down));
        const next=slot+1<divisions&&voice(at+1/divisions,down).length,previous=slot>0&&voice(at-1/divisions,down).length;
        for(let level=0;level<flags;level++){
          const beamY=stemEnd+(down?-1:1)*level*7;
          if(next)line(x+sign,beamY,xFor(at+1/divisions)+sign,beamY,'#111111',3);
          else if(!previous)line(x+sign,beamY,x+sign+(down?-12:12),beamY+(down?-12:12),'#111111',3);
        }
      }
    }
    const labels=gridDivision(chart)===4?[(beat%4)+1,'e','&','a']:[(beat%4)+1,'&'];
    labels.forEach((label,i)=>text(xFor(beat+i/labels.length)-4,151,label,labels.length===4?10:14));
  }
  for(const change of tempoChanges(chart))if(chart.tempoMap&&change.beat>=start&&change.beat<end)text(xFor(change.beat)+40,-13,`${change.bpm} BPM`,11);
  line(xFor(end)-30,38,xFor(end)-30,94);
  if(cursorBeat>=start&&cursorBeat<end)line(xFor(cursorBeat),0,xFor(cursorBeat),133,'#c29b00',2);
  return p;
}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function svgScore(primitives) {
  return primitives.map(p=>{
    if(p.type==='line')return `<line x1="${p.x}" y1="${p.y}" x2="${p.x2}" y2="${p.y2}" stroke="${p.color}" stroke-width="${p.width}"/>`;
    if(p.type==='text')return `<text x="${p.x}" y="${p.y}" font-size="${p.size}">${escape(p.value)}</text>`;
    if(p.type==='rest')return p.eighth?`<path d="M${p.x-4} ${p.y-6}q7 5 10 -3l-9 23" fill="none" stroke="${p.color}" stroke-width="2"/><circle cx="${p.x-4}" cy="${p.y-6}" r="3" fill="${p.color}"/>${p.flags===2?`<path d="M${p.x-6} ${p.y+2}q7 5 10 -3" fill="none" stroke="${p.color}" stroke-width="2"/><circle cx="${p.x-6}" cy="${p.y+2}" r="3" fill="${p.color}"/>`:''}`:`<path d="M${p.x-3} ${p.y-12}l7 9l-7 6l7 6q-12 -3 -7 6" fill="none" stroke="${p.color}" stroke-width="2.5"/>`;
    return p.cross?`<path d="M${p.x-5} ${p.y-5}l10 10m0 -10l-10 10" fill="none" stroke="${p.color}" stroke-width="2"/>`:`<ellipse cx="${p.x}" cy="${p.y}" rx="7" ry="4.5" transform="rotate(-18 ${p.x} ${p.y})" fill="${p.color}"/>`;
  }).join('');
}
export function canvasScore(ctx, primitives, title, subtitle, feedback='') {
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1024,300);
  ctx.fillStyle='#111111';ctx.font='21px monospace';ctx.fillText(title.slice(0,65),28,37);
  ctx.fillStyle='#444444';ctx.font='16px monospace';ctx.fillText(subtitle,28,65);
  ctx.fillStyle='#111111';ctx.font='16px monospace';ctx.fillText(feedback.slice(0,97),28,88);
  ctx.save();ctx.translate(25,125);
  for(const p of primitives){
    ctx.strokeStyle=p.color;ctx.fillStyle=p.color;ctx.lineWidth=p.width||2;
    if(p.type==='line'){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x2,p.y2);ctx.stroke()}
    else if(p.type==='text'){ctx.font=`${p.size}px monospace`;ctx.fillText(p.value,p.x,p.y)}
    else if(p.type==='rest'){
      const x=p.x,y=p.y;ctx.beginPath();
      if(p.eighth){ctx.moveTo(x-4,y-6);ctx.quadraticCurveTo(x+3,y-1,x+6,y-9);ctx.lineTo(x-3,y+14);ctx.stroke();ctx.beginPath();ctx.arc(x-4,y-6,3,0,Math.PI*2);ctx.fill();if(p.flags===2){ctx.beginPath();ctx.moveTo(x-6,y+2);ctx.quadraticCurveTo(x+1,y+7,x+4,y-1);ctx.stroke();ctx.beginPath();ctx.arc(x-6,y+2,3,0,Math.PI*2);ctx.fill();}}
      else{ctx.moveTo(x-3,y-12);ctx.lineTo(x+4,y-3);ctx.lineTo(x-3,y+3);ctx.lineTo(x+4,y+9);ctx.quadraticCurveTo(x-8,y+6,x-3,y+15);ctx.stroke()}
    }
    else if(p.cross){ctx.beginPath();ctx.moveTo(p.x-5,p.y-5);ctx.lineTo(p.x+5,p.y+5);ctx.moveTo(p.x+5,p.y-5);ctx.lineTo(p.x-5,p.y+5);ctx.stroke()}
    else{ctx.beginPath();ctx.ellipse(p.x,p.y,7,4.5,-.3,0,Math.PI*2);ctx.fill()}
  }
  ctx.restore();
}
