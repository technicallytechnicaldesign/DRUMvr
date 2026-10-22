import { DRUMS, notesAt } from './core.mjs?v=2';
                                                                              
export function notation(chart, pageBar, cursorBeat, activeDrums = []) {
  const p = [];
  const line=(x,y,x2,y2,color='#444444',width=1)=>p.push({type:'line',x,y,x2,y2,color,width});
  const text=(x,y,value,size=13)=>p.push({type:'text',x,y,value:String(value),size,color:'#444444'});
  const start=pageBar*4, end=Math.min(start+8,chart.bars*4);
  const xFor = beat=>115+(beat-start)*99;
  for(let y=38;y<=94;y+=14) line(64,y,930,y,'#b8b8b8');
  line(72,55,72,78,'#111111',4);line(81,55,81,78,'#111111',4);
  text(91,49,'4',18);text(91,82,'4',18);
  const rest=(x,y,eighth)=>p.push({type:'rest',x,y,eighth,color:'#444444'});
  const voice=(beat,down)=>notesAt(chart,beat).filter(n=>down?n.drum==='kick':n.drum!=='kick');
  function head(n, x, stemEnd, down) {
    const y=DRUMS[n.drum].y;
    const color=activeDrums.includes(n.drum)&&Math.abs(n.beat-Math.floor(cursorBeat*2)/2)<.01?'#927400':'#111111';
    p.push({type:'head',x,y,cross:n.drum==='hihat'||n.drum==='crash',color});
    if(y<31)line(x-11,y,x+11,y,color);
    line(x+(down?-6:6),y,x+(down?-6:6),stemEnd,color,1.5);
  }
  for(let beat=start;beat<end;beat++) {
    if(beat%4===0){line(xFor(beat)-30,38,xFor(beat)-30,94);text(xFor(beat)-22,18,`BAR ${Math.floor(beat/4)+1}`,11)}
    for(const down of [false,true]) {
      const first=voice(beat,down),second=voice(beat+.5,down),y=down?118:66,stemEnd=down?119:8;
      const x=xFor(beat),x2=xFor(beat+.5),sign=down?-6:6;
      if(!second.length){if(first.length)first.forEach(n=>head(n,x,stemEnd,down));else rest(x,y,false)}
      else {
        if(first.length)first.forEach(n=>head(n,x,stemEnd,down));else rest(x,y,true);
        second.forEach(n=>head(n,x2,stemEnd,down));
        if(first.length)line(x+sign,stemEnd,x2+sign,stemEnd,'#111111',4);
        else line(x2+sign,stemEnd,x2+sign+(down?-12:12),stemEnd+(down?-12:12),'#111111',3);
      }
    }
    text(xFor(beat)-4,151,(beat%4)+1,14);text(xFor(beat+.5)-4,151,'&',12);
  }
  line(xFor(end)-30,38,xFor(end)-30,94);
  if(cursorBeat>=start&&cursorBeat<end)line(xFor(cursorBeat),0,xFor(cursorBeat),133,'#c29b00',2);
  return p;
}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function svgScore(primitives) {
  return primitives.map(p=>{
    if(p.type==='line')return `<line x1="${p.x}" y1="${p.y}" x2="${p.x2}" y2="${p.y2}" stroke="${p.color}" stroke-width="${p.width}"/>`;
    if(p.type==='text')return `<text x="${p.x}" y="${p.y}" font-size="${p.size}">${escape(p.value)}</text>`;
    if(p.type==='rest')return p.eighth?`<path d="M${p.x-4} ${p.y-6}q7 5 10 -3l-9 23" fill="none" stroke="${p.color}" stroke-width="2"/><circle cx="${p.x-4}" cy="${p.y-6}" r="3" fill="${p.color}"/>`:`<path d="M${p.x-3} ${p.y-12}l7 9l-7 6l7 6q-12 -3 -7 6" fill="none" stroke="${p.color}" stroke-width="2.5"/>`;
    return p.cross?`<path d="M${p.x-5} ${p.y-5}l10 10m0 -10l-10 10" fill="none" stroke="${p.color}" stroke-width="2"/>`:`<ellipse cx="${p.x}" cy="${p.y}" rx="7" ry="4.5" transform="rotate(-18 ${p.x} ${p.y})" fill="${p.color}"/>`;
  }).join('');
}
export function canvasScore(ctx, primitives, title, subtitle) {
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1024,300);
  ctx.fillStyle='#111111';ctx.font='21px monospace';ctx.fillText(title.slice(0,65),28,37);
  ctx.fillStyle='#444444';ctx.font='16px monospace';ctx.fillText(subtitle,28,65);
  ctx.save();ctx.translate(25,103);
  for(const p of primitives){
    ctx.strokeStyle=p.color;ctx.fillStyle=p.color;ctx.lineWidth=p.width||2;
    if(p.type==='line'){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x2,p.y2);ctx.stroke()}
    else if(p.type==='text'){ctx.font=`${p.size}px monospace`;ctx.fillText(p.value,p.x,p.y)}
    else if(p.type==='rest'){
      const x=p.x,y=p.y;ctx.beginPath();
      if(p.eighth){ctx.moveTo(x-4,y-6);ctx.quadraticCurveTo(x+3,y-1,x+6,y-9);ctx.lineTo(x-3,y+14);ctx.stroke();ctx.beginPath();ctx.arc(x-4,y-6,3,0,Math.PI*2);ctx.fill()}
      else{ctx.moveTo(x-3,y-12);ctx.lineTo(x+4,y-3);ctx.lineTo(x-3,y+3);ctx.lineTo(x+4,y+9);ctx.quadraticCurveTo(x-8,y+6,x-3,y+15);ctx.stroke()}
    }
    else if(p.cross){ctx.beginPath();ctx.moveTo(p.x-5,p.y-5);ctx.lineTo(p.x+5,p.y+5);ctx.moveTo(p.x+5,p.y-5);ctx.lineTo(p.x-5,p.y+5);ctx.stroke()}
    else{ctx.beginPath();ctx.ellipse(p.x,p.y,7,4.5,-.3,0,Math.PI*2);ctx.fill()}
  }
  ctx.restore();
}
