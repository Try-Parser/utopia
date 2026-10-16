/* Local WebGL presentation. World coordinates, ownership and activity remain authoritative. */
window.Office3D=(()=>{
  'use strict';
  const T=window.OfficeThree,world=document.getElementById('world');
  if(!T)return {available:false};
  const canvas=document.createElement('canvas');canvas.className='office-3d';canvas.setAttribute('aria-hidden','true');
  let renderer;
  try{const context=canvas.getContext('webgl2',{antialias:true,alpha:true});if(!context)return {available:false};renderer=new T.WebGLRenderer({canvas,context,antialias:true,alpha:true});}
  catch(_){return {available:false};}
  world.prepend(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0x263744,0);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,1,12000),architecture=new T.Group(),people=new T.Group();
  scene.add(architecture,people,new T.HemisphereLight(0xe9f4ff,0x9b8365,1.5));
  const sun=new T.DirectionalLight(0xffedd5,2);sun.position.set(600,1600,400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0003;sun.shadow.normalBias=1.5;scene.add(sun,sun.target);
  const fill=new T.DirectionalLight(0xadc9e0,1.1);fill.position.set(-800,900,-600);scene.add(fill);
  const geometries={box:new T.BoxGeometry(1,1,1),sphere:new T.SphereGeometry(1,12,8),cylinder:new T.CylinderGeometry(1,1,1,12),plane:new T.PlaneGeometry(1,1)};
  const materials=new Map(),workers=new Map(),monitors=new Map(),walls=[],roomWalls=[],boards=[],rugs=[];
  let physicalKey='',layout=null,projection=null,active=false,dirty=true,lastRender=0,renderedFrames=0,lastSize='',contextLost=false;
  const colors=['#5c8f7b','#9480af','#628ca6','#aa8c64','#5a9690','#a5727e'];
  function material(color){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.78,metalness:.06}));return materials.get(color);}
  function mesh(kind,color,x,y,z,sx,sy,sz,parent=architecture){const m=new T.Mesh(geometries[kind],material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const box=(color,x,z,width,depth,height,base=0,parent=architecture)=>{const m=mesh('box',color,x,base+height/2,z,width,height,depth,parent);if(height<=2)m.castShadow=false;return m;};
  function chair(point,target,parent=architecture){const group=new T.Group();group.position.set(point.x,0,point.y);group.rotation.y=Math.atan2(target.x-point.x,target.y-point.y);parent.add(group);
    box('#344b5b',0,0,23,23,5,10,group);box('#52768a',0,-10,24,5,22,13,group);mesh('cylinder','#64747a',0,5,0,3,10,3,group);
    box('#354a56',0,0,29,3,3,0,group);box('#354a56',0,0,3,29,3,0,group);
    for(const x of [-13,13])for(const z of [-9,9])mesh('sphere','#293d48',x,2,z,3,3,3,group);
  }
  function plant(x,z){box('#b99b7c',x,z,20,20,20);mesh('cylinder','#547c66',x,33,z,13,25,13);for(const [dx,dz]of [[-9,0],[8,7],[2,-9]])mesh('sphere','#759879',x+dx,43,z+dz,12,16,12);}
  function disposeArchitecture(){architecture.traverse(object=>{if(object.isInstancedMesh)object.dispose();if(object.geometry&&!Object.values(geometries).includes(object.geometry))object.geometry.dispose();if(object.userData.texture){object.userData.texture.dispose();object.material.dispose();}});architecture.clear();monitors.clear();walls.length=0;roomWalls.length=0;boards.length=0;rugs.length=0;}
  function batchFurniture(){
    architecture.updateMatrixWorld(true);const batches=new Map();architecture.traverse(m=>{if(!m.isMesh||!Object.values(geometries).includes(m.geometry)||m.userData.texture)return;for(let p=m;p&&p!==architecture;p=p.parent)if(p.userData.dynamic)return;const key=`${m.geometry.uuid}:${m.material.uuid}:${m.castShadow}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);});
    for(const members of batches.values()){if(members.length<3)continue;const first=members[0],batch=new T.InstancedMesh(first.geometry,first.material,members.length);batch.castShadow=first.castShadow;batch.receiveShadow=true;for(const [i,m]of members.entries()){batch.setMatrixAt(i,m.matrixWorld);m.removeFromParent();}batch.instanceMatrix.needsUpdate=true;architecture.add(batch);}
  }
  function woodTexture(){const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d'),palette=['#c9ab82','#c1a078','#d2b48e','#c4a57e'];for(let y=0;y<768;y+=48)for(let x=-128*(y/48%2);x<1024;x+=256){ctx.fillStyle=palette[(x/128+y/48+12)%4];ctx.fillRect(x,y,255,47);ctx.fillStyle='#775c3433';for(let i=0;i<9;i++)ctx.fillRect(x+10+i*23,y+6+(i*7%35),50+(i*19%100),.6);}const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;}
  function windowPanel(side,start,g){const group=new T.Group(),horizontal=side==='north'||side==='south';group.userData.dynamic=true;group.position.set(horizontal?start:(side==='west'?35:g.width-35),52,horizontal?(side==='north'?35:g.height-35):start);if(!horizontal)group.rotation.y=Math.PI/2;architecture.add(group);box('#86b8c0',0,0,112,1,28,-14,group);for(const x of [-58,0,58])box('#f0e8d6',x,0,3,4,34,-17,group);for(const y of [-17,17])box('#f0e8d6',0,0,119,4,3,y-1.5,group);return group;}
  function rebuild(g){
    disposeArchitecture();layout=g;
    box('#b5a083',g.width/2,g.height/2,g.width-50,g.height-50,18,-18);
    const wood=woodTexture(),floor=box('#d8c6a8',g.width/2,g.height/2,g.width-50,g.height-50,2,-1);floor.material=new T.MeshStandardMaterial({map:wood,roughness:.9});floor.userData.texture=wood;
    for(const [index,room]of g.rooms.entries()){
      const shared=room.role==='shared',start=room.y+(shared?0:42),color=shared?'#a3b7ac':colors[index];
      box(color,room.x+room.width/2,(start+room.y+room.height)/2,room.width,room.y+room.height-start,1.5,.5);
      if(!shared){const centers=new Map(g.stations.filter(s=>s.role===room.role).map(s=>[s.center.y,s.center]));for(const center of centers.values()){
        const ring=new T.Mesh(new T.TorusGeometry(79,.8,4,48),material('#d0d9c4'));ring.rotation.x=Math.PI/2;ring.position.set(center.x,2,center.y);architecture.add(ring);
        mesh('cylinder',color,center.x,2,center.y,24,1,24);
      }}
    }
    const c=g.conference;box('#a9ada4',c.x+c.width/2,c.y+c.height/2,c.width,c.height,1.5,.5);
    for(const [name,b]of [['meeting',[1180,125,1490,490]],['breakout',[g.breakout.x,g.breakout.y,g.breakout.x+g.breakout.width,g.breakout.y+g.breakout.height]]]){box('#77958b',(b[0]+b[2])/2,(b[1]+b[3])/2,b[2]-b[0],b[3]-b[1],1,2);rugs.push(name);}
    for(const bounds of g.walls){const [x,z,r,b]=bounds,vertical=b-z>r-x,m=box('#e6dfcd',(x+r)/2,(z+b)/2,r-x,b-z,65);roomWalls.push({mesh:m,vertical});box('#a78d69',(x+r)/2,(z+b)/2,r-x+1,b-z+1,5,0);}
    for(const [side,b]of [['north',[25,25,g.width-25,34]],['south',[25,g.height-34,g.width-25,g.height-25]],['west',[25,25,34,g.height-25]],['east',[g.width-34,25,g.width-25,g.height-25]]]){const [x,z,r,bottom]=b,m=box('#e6dfcd',(x+r)/2,(z+bottom)/2,r-x,bottom-z,85),windows=[];for(let n=110;n<(side==='north'||side==='south'?g.width:g.height)-90;n+=190)windows.push(windowPanel(side,n,g));walls.push({side,mesh:m,windows});}
    for(const room of g.rooms.filter(r=>r.role!=='shared')){const group=new T.Group();group.position.set(room.x+62,45,room.y+21);architecture.add(group);box('#b49c77',0,0,105,3,35,-17.5,group);box('#edf0de',0,2,99,1,29,-14.5,group);for(let i=0;i<3;i++){box(colors[window.OfficeWorld.roles.indexOf(room.role)],-31+i*31,3,23,.5,12,-3,group);box('#849b91',-31+i*31,3,22,.5,1,12,group);}boards.push(group);}
    for(const decoration of g.decorations||[]){const [x,z,r,b]=decoration.bounds;if(decoration.kind==='plant'){plant((x+r)/2,(z+b)/2);continue;}if(decoration.kind!=='bookcase')continue;box('#937754',(x+r)/2,(z+b)/2,r-x,b-z,57);for(const height of [8,27,46]){box('#d4bb91',(x+r)/2,(z+b)/2,r-x+1,b-z+1,2,height);for(let j=0;j<6;j++)box(['#537f82','#d3ac67','#9c6e76','#667895'][j%4],r+1,z+6+j*9,3,6,13,height+2);}}
    for(const s of g.stations){const {x,y:z}=s.desk;
      for(const dx of [-23,23])for(const dz of [-15,15])box('#607078',x+dx,z+dz,4,4,25);
      box('#eddfca',x,z,60,40,3,25);
      const yaw=Math.atan2(s.point.x-x,s.point.y-z),screen=new T.Group();screen.position.set(x,39,z);screen.rotation.y=yaw;architecture.add(screen);
      box('#304754',0,0,28,3,18,-9,screen);box('#5b727a',0,0,3,3,7,-11,screen);box('#5b727a',0,0,12,8,1,-11,screen);
      const display=document.createElement('canvas');display.width=512;display.height=288;const texture=new T.CanvasTexture(display);texture.colorSpace=T.SRGBColorSpace;
      const face=new T.Mesh(geometries.plane,new T.MeshBasicMaterial({map:texture}));face.scale.set(24,14,1);face.position.z=1.6;face.userData.texture=texture;screen.add(face);
      const keyboard=box('#b7c5c8',x+Math.sin(yaw)*14,z+Math.cos(yaw)*14,17,7,1,28);keyboard.rotation.y=yaw;
      const monitor={screen,texture,display,lastText:'',key:s.key,role:s.role,index:s.index};monitors.set(s.key,monitor);updateMonitor(s.key,{status:'Idle',activity:'No active session',title:`Computer ${s.index+1}`});
      chair(s.point,s.desk);
    }
    for(const [index,b]of g.furniture.entries()){const [x,z,r,bottom]=b;
      if(index<3){box(index===2?'#c6a375':'#c3ac8d',(x+r)/2,(z+bottom)/2,r-x,bottom-z,index===2?28:33);
        if(index===2){for(const [dx,dz]of [[-60,-60],[60,-60],[-60,60],[60,60]])box('#6b6d68',(x+r)/2+dx,(z+bottom)/2+dz,8,8,27);box('#294e5b',1340,288,35,22,3,29);for(const p of [[1290,315],[1390,330]])box('#f0e8d8',...p,25,17,.5,29);}
        else box('#375964',x+23,z+12,25,12,18,33);
      }else{const seat=g.conferenceSeats[index-3];chair(seat.point,{x:1340,y:295});}
    }
    for(const [x,z]of [[38,70],[g.width-38,70],[38,g.height-70],[g.width-38,g.height-70]])plant(x,z);
    // A real sofa and side table give departing workers a recognizable breakout area.
    const [sx,sy,sr,sb]=g.breakout.sofa,sz=(sy+sb)/2,sc=(sx+sr)/2;
    box('#567a7b',sc,sz,sr-sx,sb-sy,14,8);box('#6b9290',sc,sb-4,sr-sx,8,35,8);
    for(const x of [sx+5,sr-5])box('#6b9290',x,sz,10,sb-sy,25,8);
    const [tx,ty,tr,tb]=g.breakout.table;box('#c5ac87',(tx+tr)/2,(ty+tb)/2,tr-tx,tb-ty,15);
    for(const wall of [...walls,...roomWalls]){wall.mesh.userData.dynamic=true;wall.mesh.castShadow=false;}
    for(const board of boards){board.userData.dynamic=true;board.traverse(m=>{m.castShadow=false;});}
    for(const wall of walls)for(const window of wall.windows)window.traverse(m=>{m.castShadow=false;});
    batchFurniture();const radius=Math.max(g.width,g.height)*.7;Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:1,far:Math.max(5000,radius*4)});sun.target.position.set(g.width/2,0,g.height/2);sun.position.set(g.width/2-450,1600,g.height/2+300);sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;dirty=true;
  }
  function updateMonitor(key,data){const m=monitors.get(key);if(!m)return;const lines=[data.title||'',data.activity||'',...(data.changes||[]).slice(0,3).map(c=>c.path||''),...(data.events||[]).slice(-2).map(e=>e.text||''),data.result||''].filter(Boolean).map(s=>String(s).slice(0,95)).slice(0,6),signature=JSON.stringify([data.status,lines]);if(signature===m.lastText)return;m.lastText=signature;
    const ctx=m.display.getContext('2d');ctx.fillStyle='#142b35';ctx.fillRect(0,0,512,288);ctx.fillStyle='#294753';ctx.fillRect(0,0,512,43);ctx.fillStyle='#b6d5cf';ctx.font='bold 19px monospace';ctx.fillText(`${m.role.toUpperCase()}  /  ${m.index+1}`,18,28);ctx.font='15px monospace';ctx.fillStyle='#84c5b2';ctx.fillText(String(data.status||'Idle').toUpperCase().slice(0,32),18,68);ctx.fillStyle='#d6e3df';ctx.font='17px monospace';for(const [i,line]of lines.entries())ctx.fillText(line.slice(0,46),18,101+i*27);m.texture.needsUpdate=true;dirty=true;
  }
  const point=new T.Vector3();
  function project(x,y,z=0){point.set(x,z,y).project(camera);return {x:(point.x+1)*projection.width/2,y:(1-point.y)*projection.height/2};}
  function monitorQuad(s){const monitor=monitors.get(s.key);return [[-12,7,1.8],[12,7,1.8],[12,-7,1.8],[-12,-7,1.8]].map(v=>{const p=monitor.screen.localToWorld(new T.Vector3(...v));return project(p.x,p.z,p.y);});}
  function configure(g,base,angle,elevation){
    const key=`${g.width}:${g.height}:${g.stations.map(s=>s.key).join(',')}:${g.conferenceSeats.length}`;if(key!==physicalKey){physicalKey=key;rebuild(g);}
    projection={width:base.width,height:base.height};camera.clearViewOffset();camera.aspect=base.width/base.height;camera.far=Math.hypot(g.width,g.height)*20;
    const radians=angle*Math.PI/180,pitch=elevation*Math.PI/180,dx=(Math.cos(radians)+Math.sin(radians))/Math.sqrt(2),dz=(Math.cos(radians)-Math.sin(radians))/Math.sqrt(2),cx=g.width/2,cz=g.height/2;
    const position=distance=>{camera.position.set(cx+dx*Math.cos(pitch)*distance,Math.sin(pitch)*distance,cz+dz*Math.cos(pitch)*distance);camera.lookAt(cx,0,cz);camera.updateProjectionMatrix();camera.updateMatrixWorld();};
    const bounds=()=>{const points=[];for(const x of [25,g.width-25])for(const y of [25,g.height-25])for(const z of [-20,85])points.push(new T.Vector3(x,z,y).project(camera));return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.max(...points.map(p=>p.y)),bottom:Math.min(...points.map(p=>p.y)),visible:points.every(p=>p.z>-1&&p.z<1)};};
    let low=Math.hypot(g.width,g.height)*.6,high=Math.hypot(g.width,g.height)*8;
    for(let i=0;i<18;i++){position((low+high)/2);const b=bounds();if(b.visible&&b.right-b.left<1.86&&b.top-b.bottom<1.65)high=(low+high)/2;else low=(low+high)/2;}position(high);
    const frame=bounds();camera.setViewOffset(base.width,base.height,(frame.left+frame.right)*base.width/4,-(frame.top+frame.bottom)*base.height/4,base.width,base.height);camera.updateMatrixWorld();
    const cut=depth=>.15+.85*Math.max(0,Math.min(1,depth+.5));
    for(const wall of roomWalls){const factor=cut(wall.vertical?dx:dz),height=65*factor;wall.mesh.scale.y=height;wall.mesh.position.y=height/2;}
    for(const board of boards)board.visible=cut(dz)>.7;
    for(const wall of walls){const factor=cut(({north:dz,south:-dz,west:dx,east:-dx})[wall.side]),height=85*factor;wall.mesh.scale.y=height;wall.mesh.position.y=height/2;for(const window of wall.windows)window.visible=height>70;}
    scene.updateMatrixWorld(true);dirty=true;
    return {...base,backend:'webgl',project,stations:g.stations.map(s=>{const quad=monitorQuad(s),screen=project(s.desk.x,s.desk.y,39),m=monitors.get(s.key),normal=new T.Vector3(0,0,1).applyQuaternion(m.screen.quaternion),toward=camera.position.clone().sub(m.screen.position);return {...s,screen,screenQuad:quad,frontFacing:normal.dot(toward)>0};})};
  }
  function makeWorker(actor){const root=new T.Group(),body=new T.Group();root.add(body);people.add(root);const color=colors[window.OfficeWorld.roles.indexOf(actor.data.role)]||'#7995a3';
    const pelvis=box('#34485b',0,0,15,10,8,17,body),torso=box(color,0,0,20,12,19,25,body);mesh('sphere','#dfb08d',0,53,0,10,10,10,body);const hair=mesh('sphere','#3e4247',0,57,-1,10.3,6.5,10.3,body);
    for(const x of [-3.2,3.2])mesh('sphere','#293b44',x,54,9.4,1,1,1,body);mesh('sphere','#d5a17f',0,51,10,1.5,1.5,1.5,body);
    const limbs=[];for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*12,40,0);body.add(arm);const sleeve=box(color,0,0,6,6,18,-18,arm);mesh('sphere','#dfb08d',0,-20,0,3.1,3.1,3.1,arm);const leg=new T.Group();leg.position.set(side*5,21,0);body.add(leg);box('#354b60',0,0,6,7,10,-10,leg);const knee=new T.Group();knee.position.y=-10;leg.add(knee);box('#354b60',0,0,6,7,10,-10,knee);box('#243947',0,2,7,11,4,-12,knee);limbs.push({arm,leg,knee,sleeve,side});}
    const selection=new T.Mesh(new T.TorusGeometry(18,1.3,5,32),new T.MeshBasicMaterial({color:'#e4bb78'}));selection.rotation.x=Math.PI/2;selection.position.y=1;root.add(selection);
    root.traverse(m=>{m.castShadow=false;});const value={root,body,pelvis,torso,hair,limbs,selection,last:{x:actor.position.x,y:actor.position.y},pose:'standing'};workers.set(actor.data.id,value);dirty=true;return value;
  }
  function syncActors(actors,selected,now,motion){const ids=new Set();let animating=false;
    for(const a of actors.values()){ids.add(a.data.id);const worker=workers.get(a.data.id)||makeWorker(a),dx=a.position.x-worker.last.x,dz=a.position.y-worker.last.y,moving=Math.hypot(dx,dz)>.01,seated=a.element.classList.contains('at-desk')||a.element.classList.contains('at-conference-seat');
      if(moving){worker.root.rotation.y=Math.atan2(dx,dz);dirty=true;}else if(seated){const target=a.data.conferenceSeat?{x:1340,y:295}:a.data.station.desk;worker.root.rotation.y=Math.atan2(target.x-a.position.x,target.y-a.position.y);}
      worker.root.position.set(a.position.x,0,a.position.y);worker.last={...a.position};worker.pose=seated?'seated':moving?'walking':'standing';worker.selection.visible=a.data.id===selected;
      worker.body.position.y=seated?-9:0;
      worker.body.position.z=seated?6:0;
      const color=colors[window.OfficeWorld.roles.indexOf(a.data.role)]||'#7995a3';worker.torso.material=material(color);
      const workingPose=a.data.working&&['coding','command','tool','reviewing','testing','designing','auditing'].includes(a.data.action);
      for(const {arm,leg,knee,sleeve,side}of worker.limbs){const stride=moving&&motion?Math.sin(now*.009)*.55*side:0;sleeve.material=material(color);arm.rotation.x=seated?-.9+(motion&&workingPose?Math.sin(now*.012+side)*.07:0):-stride;leg.rotation.x=seated?-Math.PI/2:stride;knee.rotation.x=seated?Math.PI/2:0;}
      const state=`${a.position.x}:${a.position.y}:${worker.root.rotation.y}:${worker.pose}:${selected===a.data.id}:${color}`;if(state!==worker.state){worker.state=state;dirty=true;}
      if(moving||seated&&motion&&workingPose)animating=true;
    }
    for(const [id,w]of workers)if(!ids.has(id)){people.remove(w.root);w.selection.geometry.dispose();w.selection.material.dispose();workers.delete(id);dirty=true;}
    render(now,animating);
  }
  function resize(){const width=Math.max(1,Math.round(world.clientWidth)),height=Math.max(1,Math.round(world.clientHeight)),zoom=Number(world.style.getPropertyValue('--camera-scale'))||1,ratio=Math.min(3,Math.sqrt(8000000/(width*height)),Math.max(1,devicePixelRatio||1)*zoom),key=`${width}:${height}:${ratio}`;if(lastSize!==key){renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);lastSize=key;dirty=true;}}
  function render(now=performance.now(),animating=false){if(!active||contextLost||document.hidden||!projection)return;resize();if((dirty||animating)&&now-lastRender>40){renderer.render(scene,camera);dirty=false;lastRender=now;renderedFrames++;}}
  function setActive(value){active=!!value&&!contextLost;canvas.hidden=!active;world.classList.toggle('webgl-office',active);world.dataset.renderer=active?'webgl':'svg';dirty=true;}
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;setActive(false);window.dispatchEvent(new Event('office3dfallback'));});
  // A refresh recreates GPU resources after context loss; the observed office remains usable in SVG.
  new ResizeObserver(()=>{dirty=true;resize();}).observe(world);
  function diagnostics(){return {available:true,active,backend:active?'webgl':'svg',contextLost,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,renderedFrames,wallCount:roomWalls.length,perimeter:walls.map(w=>({side:w.side,height:w.mesh.scale.y})),rugs:[...rugs],stations:[...monitors.keys()],actors:[...workers].map(([id,w])=>({id,pose:w.pose,x:w.root.position.x,y:w.root.position.z,height:w.body.position.y})),camera:{type:camera.type,x:camera.position.x,y:camera.position.y,z:camera.position.z},memory:{...renderer.info.memory}};}
  return {available:true,configure,setActive,syncActors,updateMonitor,render,diagnostics};
})();
