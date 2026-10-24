import * as THREE from './vendor/three.module.js';
import { DRUMS } from './core.mjs?v=5';
import { canvasScore } from './notation.mjs?v=5';
import { KIT_LAYOUT, STICK_TIP, StrikeTracker, deadAxis, normalizeRotation, stationYaw, controlAction, ROTATION_STEP } from './controller-math.mjs?v=5';

export function createKit(container, onPad, onToggle, onAdjust = ()=>{}, onRotate = ()=>{}) {
  const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');scene.fog=new THREE.Fog('#ffffff',5,16);
  const camera=new THREE.PerspectiveCamera(45,1,.05,35);
  function desktopCamera(){camera.position.set(0,1.65,1.05);camera.rotation.set(0,0,0);camera.lookAt(0,.8,-.65);}
  desktopCamera();
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.xr.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0xb8b8b8,2));
  const key=new THREE.DirectionalLight(0xffffff,2.4);key.position.set(-2,4,2);scene.add(key);
  const white=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
  const roomFloor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),white);roomFloor.rotation.x=-Math.PI/2;roomFloor.position.y=-.01;scene.add(roomFloor);
  const back=new THREE.Mesh(new THREE.BoxGeometry(12,6,.1),white);back.position.set(0,3,-6);scene.add(back);
  for(const x of [-6,6]){const wall=new THREE.Mesh(new THREE.BoxGeometry(.1,6,12),white);wall.position.set(x,3,0);scene.add(wall);}
  scene.add(new THREE.GridHelper(12,48,0xd0d0d0,0xe9e9e9));
  const station=new THREE.Group(),kit=new THREE.Group();scene.add(station);station.add(kit);
  const targets={},pickables=[],hands=[],raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),rotation=new THREE.Matrix4();
  let kitHeight=0,kitDistance=0,mirror=false,recenterPending=false,keepRotationOnRecenter=false,kitRotation=0,facingYaw=0;
  const localTip=new THREE.Vector3(...STICK_TIP),worldTip=new THREE.Vector3(),kitTip=new THREE.Vector3(),inverseKit=new THREE.Matrix4();
  function resetStrokes(){for(const hand of hands)hand.tracker.reset();}
  function rotateTo(degrees){kitRotation=normalizeRotation(degrees);station.rotation.y=stationYaw(facingYaw,kitRotation);resetStrokes();onRotate(kitRotation);}
  function requestRecenter(){recenterPending=true;keepRotationOnRecenter=false;}
  function label(text){
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=72;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,320,72);ctx.strokeStyle='#bdbdbd';ctx.strokeRect(1,1,318,70);ctx.fillStyle='#111111';ctx.font='27px monospace';ctx.textAlign='center';ctx.fillText(text,160,45);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(.40,.09,1);return sprite;
  }
  for(const [id,[x,y,z,r]] of Object.entries(KIT_LAYOUT)){
    const group=new THREE.Group();group.position.set(x,y,z);kit.add(group);
    const cymbal=id==='hihat'||id==='crash'||id==='ride',kick=id==='kick';if(kick)group.rotation.x=Math.PI/2;
    const shell=new THREE.Mesh(new THREE.CylinderGeometry(r,r,cymbal?.022:.18,48),new THREE.MeshStandardMaterial({color:0x080808,metalness:.2,roughness:.55}));
    shell.position.y=cymbal?-.016:-.10;group.add(shell);
    const material=new THREE.MeshStandardMaterial({color:0x080808,roughness:.65,metalness:.1,emissive:0xffcc00,emissiveIntensity:0});
    const top=new THREE.Mesh(new THREE.CylinderGeometry(r*.96,r*.96,.012,48),material);top.userData.drum=id;group.add(top);pickables.push(top);
    const rimMaterial=new THREE.MeshStandardMaterial({color:0x353535,metalness:.6,roughness:.35});
    const rim=new THREE.Mesh(new THREE.TorusGeometry(r,.008,8,48),rimMaterial);rim.rotation.x=Math.PI/2;rim.position.y=.014;group.add(rim);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(r*1.08,.008,8,48),new THREE.MeshBasicMaterial({color:0xc6a000,transparent:true,opacity:0}));
    ring.rotation.x=Math.PI/2;ring.position.y=.025;group.add(ring);
    if(!kick){const stand=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,y-.14,8),new THREE.MeshStandardMaterial({color:0x222222,metalness:.6,roughness:.35}));stand.position.set(x,(y-.14)/2,z);kit.add(stand);}
    const tag=label(DRUMS[id].label.toUpperCase()+(kick?' / TRIGGER':' ['+DRUMS[id].key+']'));tag.position.set(x,y+(kick?-.24:.1),z+.13);kit.add(tag);
    targets[id]={material,ring,rimMaterial};
  }
  const pedalMaterial=new THREE.MeshStandardMaterial({color:0x222222});
  const pedal=new THREE.Mesh(new THREE.BoxGeometry(.10,.025,.22),pedalMaterial);pedal.position.set(.12,.025,-.38);kit.add(pedal);
  const boardCanvas=document.createElement('canvas');boardCanvas.width=1024;boardCanvas.height=300;
  const boardCtx=boardCanvas.getContext('2d'),boardTexture=new THREE.CanvasTexture(boardCanvas);boardTexture.colorSpace=THREE.SRGBColorSpace;
  const board=new THREE.Mesh(new THREE.PlaneGeometry(1.75,.513),new THREE.MeshBasicMaterial({map:boardTexture}));board.position.set(0,1.65,-1.65);station.add(board);board.visible=false;
  const controlCanvas=document.createElement('canvas');controlCanvas.width=1024;controlCanvas.height=120;
  const controlCtx=controlCanvas.getContext('2d'),controlTexture=new THREE.CanvasTexture(controlCanvas);controlTexture.colorSpace=THREE.SRGBColorSpace;
  const control=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.147),new THREE.MeshBasicMaterial({map:controlTexture}));control.position.set(0,1.30,-1.64);station.add(control);control.visible=false;
  const turnCanvas=document.createElement('canvas');turnCanvas.width=1024;turnCanvas.height=120;
  const turnCtx=turnCanvas.getContext('2d'),turnTexture=new THREE.CanvasTexture(turnCanvas);turnTexture.colorSpace=THREE.SRGBColorSpace;
  const turnControl=new THREE.Mesh(new THREE.PlaneGeometry(1.60,.1875),new THREE.MeshBasicMaterial({map:turnTexture,depthTest:false,transparent:true}));
  turnControl.position.set(0,2.05,-1.64);turnControl.renderOrder=1000;station.add(turnControl);turnControl.visible=false;
  function pulse(hand){
    const actuator=hand.source?.gamepad?.hapticActuators?.[0];
    if(actuator?.pulse)try{Promise.resolve(actuator.pulse(.35,28)).catch(()=>{});}catch{}
  }
  function strike(hand,hit){
    onPad(hit.drum,{volume:hit.volume,hand:hand.source?.handedness||'controller',speed:hit.speed});pulse(hand);
    hand.tip.material.color.setHex(0xffcc00);hand.flashUntil=performance.now()+100;
  }
  for(let i=0;i<2;i++){
    const controller=renderer.xr.getController(i),grip=renderer.xr.getControllerGrip(i);scene.add(controller,grip);
    const stick=new THREE.Group();grip.add(stick);
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.006,.009,.36,10),new THREE.MeshStandardMaterial({color:0x222222,roughness:.45}));
    shaft.rotation.x=Math.PI/2;shaft.position.z=-.195;stick.add(shaft);
    const tip=new THREE.Mesh(new THREE.SphereGeometry(.012,12,8),new THREE.MeshStandardMaterial({color:0xc6a000,emissive:0xffcc00,emissiveIntensity:.15}));tip.position.copy(localTip);stick.add(tip);
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.035,.05,.09),new THREE.MeshStandardMaterial({color:0x303030}));stick.add(handle);
    const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-2)]);
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x595959,transparent:true,opacity:.6}));controller.add(line);
    const hand={controller,grip,tip,line,source:null,tracker:new StrikeTracker(),buttons:[],flashUntil:0};hands.push(hand);grip.visible=false;
    controller.addEventListener('connected',e=>{hand.source=e.data;hand.tracker.reset();hand.buttons=[];});
    controller.addEventListener('disconnected',()=>{hand.source=null;hand.tracker.reset();grip.visible=false;});
    controller.addEventListener('selectstart',()=>{
      if(!renderer.xr.isPresenting)return;
      station.updateMatrixWorld(true);controller.updateWorldMatrix(true,false);rotation.extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);raycaster.ray.direction.set(0,0,-1).applyMatrix4(rotation);
      const panelHit=raycaster.intersectObjects([turnControl,control])[0];
      if(panelHit){
        const action=controlAction(panelHit.uv.x,panelHit.uv.y,panelHit.object===turnControl);
        if(action==='toggle')onToggle();
        else if(action==='left')rotateTo(kitRotation+ROTATION_STEP);
        else if(action==='right')rotateTo(kitRotation-ROTATION_STEP);
        else if(action==='reset')rotateTo(0);
        return;
      }
      strike(hand,{drum:'kick',volume:.9,speed:0});
    });
  }
  function recenter(){
    const eye=renderer.xr.getCamera(camera),pos=new THREE.Vector3(),direction=new THREE.Vector3();
    eye.getWorldPosition(pos);eye.getWorldDirection(direction);direction.y=0;
    if(direction.lengthSq()<.01)direction.set(0,0,-1);direction.normalize();
    station.position.set(pos.x,Math.max(-.5,Math.min(.6,pos.y-1.2)),pos.z);
    facingYaw=Math.atan2(-direction.x,-direction.z);rotateTo(keepRotationOnRecenter?kitRotation:0);recenterPending=false;
  }
  let lastFrame=null;
  function controllers(time,frame){
    if(!renderer.xr.isPresenting||!frame){resetStrokes();lastFrame=null;return;}
    const dt=lastFrame===null?0:Math.min(.05,(time-lastFrame)/1000);lastFrame=time;
    if(recenterPending)recenter();
    let adjusting=false;
    for(const hand of hands){
      const gp=hand.source?.gamepad;
      if(gp?.mapping==='xr-standard'){
        for(const index of [4,5]){const pressed=Boolean(gp.buttons[index]?.pressed);if(pressed&&!hand.buttons[index]){if(index===4)onToggle();else requestRecenter();}hand.buttons[index]=pressed;}
        const axes=gp.axes,axis=axes?.length>=4?deadAxis(axes[3]):0;
        if(axis&&dt){adjusting=true;if(hand.source.handedness==='left')kitDistance=Math.max(-.25,Math.min(.6,kitDistance-axis*dt*.28));else kitHeight=Math.max(-.3,Math.min(.3,kitHeight-axis*dt*.22));}
      }
    }
    if(adjusting){kit.position.set(0,kitHeight,-kitDistance);resetStrokes();onAdjust(kitHeight,kitDistance);}
    station.updateMatrixWorld(true);inverseKit.copy(kit.matrixWorld).invert();
    const reference=renderer.xr.getReferenceSpace();
    for(const hand of hands){
      const source=hand.source,pose=source?.gripSpace&&reference?frame.getPose(source.gripSpace,reference):null;
      hand.grip.visible=Boolean(pose&&!pose.emulatedPosition);hand.line.visible=Boolean(pose);
      if(!pose||pose.emulatedPosition||adjusting||recenterPending){hand.tracker.reset();continue;}
      hand.grip.updateWorldMatrix(true,false);worldTip.copy(localTip).applyMatrix4(hand.grip.matrixWorld);kitTip.copy(worldTip).applyMatrix4(inverseKit);
      const hit=hand.tracker.sample(kitTip,time);if(hit)strike(hand,hit);
      if(performance.now()>hand.flashUntil)hand.tip.material.color.setHex(0xc6a000);

      hand.controller.updateWorldMatrix(true,false);rotation.extractRotation(hand.controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(hand.controller.matrixWorld);raycaster.ray.direction.set(0,0,-1).applyMatrix4(rotation);
      hand.line.visible=raycaster.intersectObjects([turnControl,control]).length>0;
    }
  }
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(renderer.xr.isPresenting)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(pickables)[0];if(hit)onPad(hit.object.userData.drum);
  });
  const observer=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();if(!renderer.xr.isPresenting)renderer.setSize(w,h);});observer.observe(container);
  renderer.xr.addEventListener('sessionstart',()=>{board.visible=true;control.visible=true;turnControl.visible=true;recenterPending=true;keepRotationOnRecenter=true;resetStrokes();});
  renderer.xr.addEventListener('sessionend',()=>{board.visible=false;control.visible=false;turnControl.visible=false;station.position.set(0,0,0);facingYaw=0;station.rotation.set(0,stationYaw(facingYaw,kitRotation),0);resetStrokes();desktopCamera();renderer.setSize(container.clientWidth,container.clientHeight);});
  return {
    renderer,
    recenter:requestRecenter,
    rotate:rotateTo,
    adjust(left,height,distance){mirror=left;kitHeight=height;kitDistance=distance;kit.scale.x=mirror?-1:1;kit.position.set(0,height,-distance);resetStrokes();},
    update(expected,next,progress,contacts=[]){
      for(const[id,target]of Object.entries(targets)){
        const contact=contacts.includes(id),due=expected.includes(id);
        target.material.color.setHex(contact?0xffd000:0x080808);target.material.emissiveIntensity=contact?.45:0;
        target.rimMaterial.color.setHex(contact?0xffd000:due?0xb49800:0x353535);
        target.ring.material.opacity=contact?1:due?.85:next.includes(id)?.2+.55*progress:0;
        target.ring.scale.setScalar(contact?1:1.5-.5*progress);
      }
      pedalMaterial.color.setHex(contacts.includes('kick')?0xffd000:0x222222);
    },
    score(primitives,title,subtitle,running){
      canvasScore(boardCtx,primitives,title,subtitle);boardTexture.needsUpdate=true;
      controlCtx.fillStyle='#ffffff';controlCtx.fillRect(0,0,1024,120);controlCtx.strokeStyle='#111111';controlCtx.lineWidth=3;controlCtx.strokeRect(2,2,1020,116);
      controlCtx.fillStyle='#111111';controlCtx.font='29px monospace';controlCtx.textAlign='center';controlCtx.fillText(running?'STOP PRACTICE  /  A OR X':'START PRACTICE  /  A OR X',512,44);
      controlCtx.font='21px monospace';controlCtx.fillText('TRIGGER: KICK   |   B / Y: RECENTER',512,84);
      controlTexture.needsUpdate=true;
      turnCtx.fillStyle='#ffffff';turnCtx.fillRect(0,0,1024,120);turnCtx.strokeStyle='#111111';turnCtx.lineWidth=3;turnCtx.strokeRect(2,2,1020,116);
      turnCtx.beginPath();for(const x of[341,683]){turnCtx.moveTo(x,2);turnCtx.lineTo(x,118);}turnCtx.stroke();
      turnCtx.fillStyle='#111111';turnCtx.textAlign='center';turnCtx.font='28px monospace';turnCtx.fillText('LEFT 15°',170,70);turnCtx.fillText('RESET / '+kitRotation+'°',512,70);turnCtx.fillText('RIGHT 15°',854,70);turnTexture.needsUpdate=true;
    },
    animate(fn){renderer.setAnimationLoop((time,frame)=>{controllers(time,frame);fn();renderer.render(scene,camera);});}
  };
}
