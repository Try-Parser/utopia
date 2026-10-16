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
  scene.add(architecture,people,new T.HemisphereLight(0xf4f6ed,0x8c7967,1.65));
  const sun=new T.DirectionalLight(0xffe6c2,2.15);sun.position.set(600,1600,400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0003;sun.shadow.normalBias=1.5;scene.add(sun,sun.target);
  const fill=new T.DirectionalLight(0xadc9e0,1.1);fill.position.set(-800,900,-600);scene.add(fill);
  function roundedGeometry(){const g=new T.BoxGeometry(1,1,1,4,4,4),p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),cx=Math.max(-.42,Math.min(.42,x)),cy=Math.max(-.42,Math.min(.42,y)),cz=Math.max(-.42,Math.min(.42,z)),dx=x-cx,dy=y-cy,dz=z-cz,length=Math.hypot(dx,dy,dz);p.setXYZ(i,cx+dx/length*.08,cy+dy/length*.08,cz+dz/length*.08);n.setXYZ(i,dx/length,dy/length,dz/length);}g.computeBoundingSphere();return g;}
  function wedgeGeometry(){const g=roundedGeometry(),p=g.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)*(.65+.35*(p.getY(i)+.5)));g.computeVertexNormals();g.computeBoundingSphere();return g;}
  const jawWidth=(y,profile)=>profile===1?1+Math.max(0,1-Math.abs(y+.2)/.7)*.08-Math.max(0,-y-.2)*.28:1-Math.max(0,-y-.15)*(profile===2?.08:.17);
  function chibiHeadGeometry(profile){const g=new T.SphereGeometry(1,24,18),p=g.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)*jawWidth(p.getY(i),profile));g.computeVertexNormals();return g;}
  function chibiFaceGeometry(profile){const g=new T.PlaneGeometry(2,2,20,16),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)*.78,y=p.getY(i)*.62;p.setXYZ(i,x*jawWidth(y,profile),y,Math.sqrt(1-x*x-y*y)+.025);}g.computeVertexNormals();return g;}
  function chibiHairGeometry(){const g=new T.SphereGeometry(1,20,14,0,Math.PI*2,0,Math.PI*.7),p=g.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),front=Math.max(0,p.getZ(i));p.setY(i,y+front*.8*(1-y));}g.computeVertexNormals();return g;}
  const geometries={box:new T.BoxGeometry(1,1,1),rounded:roundedGeometry(),wedge:wedgeGeometry(),sphere:new T.SphereGeometry(1,12,8),chibiHair:chibiHairGeometry(),jacket:new T.CylinderGeometry(1,.82,1,12),ring:new T.TorusGeometry(1,.13,6,20),cylinder:new T.CylinderGeometry(1,1,1,12),plane:new T.PlaneGeometry(1,1)};
  for(let profile=0;profile<3;profile++){geometries[`head${profile}`]=chibiHeadGeometry(profile);geometries[`face${profile}`]=chibiFaceGeometry(profile);}
  const materials=new Map(),workers=new Map(),monitors=new Map(),walls=[],roomWalls=[],boards=[],rugs=[];
  let physicalKey='',layout=null,projection=null,active=false,dirty=true,lastRender=0,renderedFrames=0,lastSize='',contextLost=false;
  const colors=['#6aab91','#ae96cf','#76b2ce','#ceaa73','#74b9b2','#ce99a4'];
  function material(color){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.78,metalness:.06}));return materials.get(color);}
  const irisColors=['#368eb1','#a7793f','#5b9a71','#8e78b6'];
  // Six authored face families, five editions each: at most thirty small local
  // textures. Names are design shorthand; actual employee/session labels stay intact.
  const cast=[
    {name:'mica',kind:'human',main:'#648671',trim:'#e9d5aa',dark:'#34495a',hair:'#593b37',head:[14.2,13.4,11.6]},
    {name:'lilt',kind:'human',main:'#9d6f9c',trim:'#efbe85',dark:'#43465e',hair:'#4a385f',head:[13.7,14.5,11.4]},
    {name:'brim',kind:'human',main:'#417f8e',trim:'#d9b466',dark:'#364b60',hair:'#543e32',head:[14.6,12.4,11.8]},
    {name:'quill',kind:'robot',main:'#cf7963',trim:'#efdfbd',dark:'#3b596b'},
    {name:'tavi',kind:'robot',main:'#e5dbc1',trim:'#75b2a1',dark:'#426b78'},
    {name:'sable',kind:'robot',main:'#455b72',trim:'#a1c9c3',dark:'#293d50'}
  ];
  function identityHash(id,salt){let hash=2166136261;for(const c of `${salt}:${id}`)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;return hash;}
  function characterFace(profile,trait){const key=`character-face:${profile}:${trait}`;if(materials.has(key))return materials.get(key);
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.scale(.5,.5);ctx.lineCap='round';ctx.lineJoin='round';
    if(profile<3){
      for(const side of [-1,1]){ctx.save();ctx.translate(256+side*(104+trait*3),208);ctx.scale(profile===2?.9:1,profile===1?1.05:profile===2?.77:1);
        const eye=()=>{ctx.beginPath();ctx.moveTo(-62,8);if(profile===0){ctx.bezierCurveTo(-66,-80,46,-85,61,-10);ctx.bezierCurveTo(65,76,-55,79,-62,8);}else if(profile===1){ctx.bezierCurveTo(-47,-86,43,-94,66,-20);ctx.bezierCurveTo(58,62,-34,87,-62,8);}else{ctx.bezierCurveTo(-58,-62,54,-69,63,4);ctx.bezierCurveTo(58,72,-54,72,-62,8);}ctx.closePath();};
        eye();ctx.fillStyle='#fff9ea';ctx.fill();ctx.save();ctx.clip();const iris=ctx.createLinearGradient(0,-65,0,72);iris.addColorStop(0,'#293344');iris.addColorStop(.5,irisColors[(profile+trait)%4]);iris.addColorStop(1,'#a8d8c8');ctx.fillStyle=iris;ctx.beginPath();ctx.ellipse(5,2,36,67,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#263344';ctx.beginPath();ctx.ellipse(5,-5,17,42,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fffdf4';ctx.beginPath();ctx.ellipse(-9,-35,13,19,-.3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(22,30,7,0,Math.PI*2);ctx.fill();ctx.restore();eye();ctx.strokeStyle='#393342';ctx.lineWidth=9;ctx.stroke();ctx.beginPath();ctx.moveTo(-52,-105+side*(profile===1?11:4));ctx.quadraticCurveTo(0,profile===2?-111:-129,48,-106);ctx.lineWidth=profile===2?15:10;ctx.stroke();ctx.restore();
      }
      ctx.strokeStyle='#825648';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(252,300);ctx.lineTo(261,310);ctx.stroke();ctx.strokeStyle='#493c43';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(225,352);ctx.quadraticCurveTo(256,profile===1?387:377,287,347);ctx.stroke();
      if(profile===0||trait===3){ctx.fillStyle='#a97860';for(const [x,y]of [[112,306],[133,316],[123,293]]){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}}
    }else{
      const glow=profile===3?'#a4ecd8':profile===4?'#f6d893':'#a7dcf1';ctx.fillStyle=glow;ctx.strokeStyle=glow;
      for(const side of [-1,1]){const x=256+side*108;ctx.beginPath();
        if(profile===3){const closed=trait===2||trait===0&&side===1||trait===4&&side===-1;if(closed){ctx.roundRect(x-43,trait===2?181:161,86,24,12);ctx.fill();}else{const width=[70,58,80,48,62][trait],height=[105,90,65,115,80][trait];ctx.roundRect(x-width/2,142+(side===1&&trait===1?12:0),width,height,width*.38);ctx.fill();ctx.fillStyle='#f4fff5';ctx.fillRect(x-width*.23,153,10,22);ctx.fillStyle=glow;}}
        else if(profile===4){if(trait===4||trait===1&&side===-1){ctx.arc(x,201,trait===4?39:45,0,Math.PI*2);ctx.lineWidth=18;ctx.stroke();}else{ctx.moveTo(x-42,226);ctx.quadraticCurveTo(x,trait===2?172:trait===3&&side===1?225:130,x+42,226);ctx.lineWidth=23;ctx.stroke();}}
        else if(trait===1||trait===3&&side===1){ctx.roundRect(x-45,trait===1?183:201,90,trait===1?35:20,8);ctx.fill();}
        else{const inset=trait===4&&side===-1?25:0;ctx.moveTo(x-49+inset,167);ctx.lineTo(x+44-inset,187);ctx.lineTo(x+36-inset,trait===2?216:236);ctx.lineTo(x-43+inset,222);ctx.closePath();ctx.fill();}
      }
      ctx.lineWidth=15;ctx.beginPath();ctx.moveTo(214,324);ctx.quadraticCurveTo(256,profile===5||trait===2?336:367,298,trait===3?307:324);ctx.stroke();if(trait%2){ctx.fillStyle=glow;ctx.beginPath();ctx.arc(393,305,9,0,Math.PI*2);ctx.fill();}
    }
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const value=new T.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01,depthWrite:false,toneMapped:false});materials.set(key,value);return value;
  }
  // Shared procedural surfaces stay local and are reused across layout rebuilds.
  function surface(kind,color){const key=`${kind}:${color}`;if(materials.has(key))return materials.get(key);
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    if(kind==='fabric'){ctx.fillStyle='#eeeae1';ctx.fillRect(0,0,128,128);for(let y=0;y<128;y+=4)for(let x=0;x<128;x+=4){ctx.fillStyle=(x+y)%8?'#e7e3db':'#f3efe6';ctx.fillRect(x,y,3,1);ctx.fillStyle='#e3e0d8';ctx.fillRect(x+2,y+1,1,3);}}
    else{const sky=ctx.createLinearGradient(0,0,0,128);sky.addColorStop(0,'#739eaf');sky.addColorStop(.55,'#b0cdd1');sky.addColorStop(1,'#e5dfc8');ctx.fillStyle=sky;ctx.fillRect(0,0,128,128);ctx.fillStyle='#f8f4e241';ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(39,0);ctx.lineTo(100,128);ctx.lineTo(69,128);ctx.fill();}
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const value=new T.MeshStandardMaterial({color,map:texture,roughness:kind==='fabric'?.96:.3,metalness:kind==='fabric'?0:.12});materials.set(key,value);return value;
  }
  function rug(color,x,z,width,depth,base=1){const edge=box('#c6bea8',x,z,width,depth,1,base);edge.castShadow=false;const fabric=box(color,x,z,width-5,depth-5,.6,base+1);fabric.material=surface('fabric',color);fabric.castShadow=false;}
  function mesh(kind,color,x,y,z,sx,sy,sz,parent=architecture){const m=new T.Mesh(geometries[kind],material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const box=(color,x,z,width,depth,height,base=0,parent=architecture)=>{const m=mesh('box',color,x,base+height/2,z,width,height,depth,parent);if(height<=2)m.castShadow=false;return m;};
  const softBox=(color,x,z,width,depth,height,base=0,parent=architecture)=>{const m=mesh('rounded',color,x,base+height/2,z,width,height,depth,parent);if(height<=2)m.castShadow=false;return m;};
  function chair(point,target,parent=architecture){const group=new T.Group();group.position.set(point.x,0,point.y);group.rotation.y=Math.atan2(target.x-point.x,target.y-point.y);parent.add(group);
    softBox('#344b5b',0,0,23,23,5,10,group);softBox('#52768a',0,-10,24,5,22,13,group);softBox('#608394',0,-6.9,19,1,16,17,group);mesh('cylinder','#64747a',0,5,0,3,10,3,group);
    for(const x of [-13,13]){box('#354a56',x,0,2,3,10,13,group);box('#344b5b',x,2,4,15,3,23,group);}
    box('#354a56',0,0,29,3,3,0,group);box('#354a56',0,0,3,29,3,0,group);
    for(const x of [-13,13])for(const z of [-9,9])mesh('sphere','#293d48',x,2,z,3,3,3,group);
  }
  function plant(x,z){mesh('cylinder','#c5ae8e',x,10,z,11,20,11);mesh('cylinder','#6e6350',x,20.2,z,9.2,.6,9.2);mesh('cylinder','#547c66',x,32,z,2,26,2);for(let i=0;i<7;i++){const angle=i*Math.PI*2/7,leaf=mesh('sphere',i%2?'#668e69':'#86a57b',x+Math.sin(angle)*9,41+i%3*4,z+Math.cos(angle)*9,6,16,7);leaf.rotation.z=-Math.sin(angle)*.55;leaf.rotation.x=Math.cos(angle)*.55;}}
  function disposeArchitecture(){architecture.traverse(object=>{if(object.isInstancedMesh)object.dispose();if(object.geometry&&!Object.values(geometries).includes(object.geometry))object.geometry.dispose();if(object.userData.texture){object.userData.texture.dispose();object.material.dispose();}});architecture.clear();monitors.clear();walls.length=0;roomWalls.length=0;boards.length=0;rugs.length=0;}
  function batchFurniture(){
    architecture.updateMatrixWorld(true);const batches=new Map();architecture.traverse(m=>{if(!m.isMesh||!Object.values(geometries).includes(m.geometry)||m.userData.texture)return;for(let p=m;p&&p!==architecture;p=p.parent)if(p.userData.dynamic)return;const key=`${m.geometry.uuid}:${m.material.uuid}:${m.castShadow}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);});
    for(const members of batches.values()){if(members.length<3)continue;const first=members[0],batch=new T.InstancedMesh(first.geometry,first.material,members.length);batch.castShadow=first.castShadow;batch.receiveShadow=true;for(const [i,m]of members.entries()){batch.setMatrixAt(i,m.matrixWorld);m.removeFromParent();}batch.instanceMatrix.needsUpdate=true;architecture.add(batch);}
  }
  function woodTexture(){const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d'),palette=['#d7bd95','#d0b18a','#ddc49f','#d2b68f','#dbc19c'];ctx.fillStyle='#a98c68';ctx.fillRect(0,0,1024,768);for(let row=0;row<24;row++){const y=row*32;for(let col=-1;col<6;col++){const x=col*224+(row%3)*74;ctx.save();ctx.beginPath();ctx.rect(x+1,y+1,222,30);ctx.clip();ctx.fillStyle=palette[((row*7+col+10)%5+5)%5];ctx.fillRect(x,y,224,32);for(let grain=0;grain<12;grain++){ctx.strokeStyle=grain%3?'#8c69451b':'#faf0cf24';ctx.lineWidth=.65;ctx.beginPath();for(let n=0;n<=8;n++){const px=x+n*32,py=y+3+grain*2.3+Math.sin(n*.8+row+grain)*.9;if(n)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.stroke();}ctx.restore();}}const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;}
  function windowPanel(side,start,g){const group=new T.Group(),horizontal=side==='north'||side==='south';group.userData.dynamic=true;group.position.set(horizontal?start:(side==='west'?35:g.width-35),52,horizontal?(side==='north'?35:g.height-35):start);if(!horizontal)group.rotation.y=Math.PI/2;architecture.add(group);box('#ffffff',0,0,112,1,28,-14,group).material=surface('window','#ffffff');for(const x of [-58,0,58])box('#f0e8d6',x,0,3,4,34,-17,group);for(const y of [-17,17])box('#f0e8d6',0,0,119,4,3,y-1.5,group);box('#bba483',0,0,123,10,3,-20,group);return group;}
  function rebuild(g){
    disposeArchitecture();layout=g;
    box('#8e785e',g.width/2,g.height/2,g.width-50,g.height-50,18,-18);box('#b8a082',g.width/2,g.height/2,g.width-50,g.height-50,4,-4);
    const wood=woodTexture(),floor=box('#d8c6a8',g.width/2,g.height/2,g.width-50,g.height-50,2,-1);floor.material=new T.MeshStandardMaterial({map:wood,roughness:.9});floor.userData.texture=wood;
    for(const [index,room]of g.rooms.entries()){
      const shared=room.role==='shared',start=room.y+(shared?0:42),color=shared?'#a3b7ac':colors[index];
      rug(color,room.x+room.width/2,(start+room.y+room.height)/2,room.width,room.y+room.height-start,.5);
      if(!shared){const centers=new Map(g.stations.filter(s=>s.role===room.role).map(s=>[s.center.y,s.center]));for(const center of centers.values()){
        const ring=new T.Mesh(new T.TorusGeometry(79,.8,4,48),material('#d0d9c4'));ring.rotation.x=Math.PI/2;ring.position.set(center.x,2,center.y);architecture.add(ring);
        mesh('cylinder',color,center.x,2,center.y,24,1,24);
      }}
    }
    const c=g.conference;box('#a9ada4',c.x+c.width/2,c.y+c.height/2,c.width,c.height,1.5,.5);
    for(const [name,b]of [['meeting',[1180,125,1490,490]],['breakout',[g.breakout.x,g.breakout.y,g.breakout.x+g.breakout.width,g.breakout.y+g.breakout.height]]]){rug('#77958b',(b[0]+b[2])/2,(b[1]+b[3])/2,b[2]-b[0],b[3]-b[1],2);rugs.push(name);}
    for(const bounds of g.walls){const [x,z,r,b]=bounds,vertical=b-z>r-x,m=box('#e6dfcd',(x+r)/2,(z+b)/2,r-x,b-z,65);roomWalls.push({mesh:m,vertical});box('#a78d69',(x+r)/2,(z+b)/2,r-x+1,b-z+1,5,0);}
    for(const [side,b]of [['north',[25,25,g.width-25,34]],['south',[25,g.height-34,g.width-25,g.height-25]],['west',[25,25,34,g.height-25]],['east',[g.width-34,25,g.width-25,g.height-25]]]){const [x,z,r,bottom]=b,m=box('#e6dfcd',(x+r)/2,(z+bottom)/2,r-x,bottom-z,85),windows=[];for(let n=110;n<(side==='north'||side==='south'?g.width:g.height)-90;n+=190)windows.push(windowPanel(side,n,g));walls.push({side,mesh:m,windows});}
    for(const room of g.rooms.filter(r=>r.role!=='shared')){const group=new T.Group();group.position.set(room.x+62,45,room.y+21);architecture.add(group);box('#b49c77',0,0,105,3,35,-17.5,group);box('#edf0de',0,2,99,1,29,-14.5,group);for(let i=0;i<3;i++){box(colors[window.OfficeWorld.roles.indexOf(room.role)],-31+i*31,3,23,.5,12,-3,group);box('#849b91',-31+i*31,3,22,.5,1,12,group);}boards.push(group);}
    for(const decoration of g.decorations||[]){const [x,z,r,b]=decoration.bounds;if(decoration.kind==='plant'){plant((x+r)/2,(z+b)/2);continue;}if(decoration.kind!=='bookcase')continue;box('#937754',(x+r)/2,(z+b)/2,r-x,b-z,57);for(const height of [8,27,46]){box('#d4bb91',(x+r)/2,(z+b)/2,r-x+1,b-z+1,2,height);for(let j=0;j<6;j++)box(['#537f82','#d3ac67','#9c6e76','#667895'][j%4],r+1,z+6+j*9,3,6,13,height+2);}}
    for(const s of g.stations){const {x,y:z}=s.desk;
      for(const dx of [-23,23])for(const dz of [-15,15])box('#607078',x+dx,z+dz,4,4,25);
      softBox('#ab8d65',x,z,60,40,2,24);softBox('#eddfca',x,z,60,40,2,26);softBox('#7b9291',x,z,44,27,.35,28);
      const yaw=Math.atan2(s.point.x-x,s.point.y-z),screen=new T.Group();screen.position.set(x,39,z);screen.rotation.y=yaw;architecture.add(screen);
      box('#304754',0,0,28,3,18,-9,screen);box('#5b727a',0,0,3,3,7,-11,screen);box('#5b727a',0,0,12,8,1,-11,screen);
      const display=document.createElement('canvas');display.width=512;display.height=288;const texture=new T.CanvasTexture(display);texture.colorSpace=T.SRGBColorSpace;
      const face=new T.Mesh(geometries.plane,new T.MeshBasicMaterial({map:texture}));face.scale.set(24,14,1);face.position.z=1.6;face.userData.texture=texture;screen.add(face);
      const keyboard=box('#b7c5c8',x+Math.sin(yaw)*14,z+Math.cos(yaw)*14,17,7,1,28);keyboard.rotation.y=yaw;
      for(let row=0;row<3;row++)box('#536b75',0,12+row*1.7,14,.5,.25,-9.9,screen);
      mesh('sphere','#c8d3d1',14,-9.7,8,2,1.3,3,screen);
      const monitor={screen,texture,display,lastText:'',key:s.key,role:s.role,index:s.index};monitors.set(s.key,monitor);updateMonitor(s.key,{status:'Idle',activity:'No active session',title:`Computer ${s.index+1}`});
      chair(s.point,s.desk);
    }
    for(const [index,b]of g.furniture.entries()){const [x,z,r,bottom]=b;
      if(index<3){
        if(index===2){for(const [dx,dz]of [[-60,-60],[60,-60],[-60,60],[60,60]])box('#52666b',(x+r)/2+dx,(z+bottom)/2+dz,8,8,25);softBox('#ac8b63',(x+r)/2,(z+bottom)/2,r-x,bottom-z,2,25);softBox('#d6b582',(x+r)/2,(z+bottom)/2,r-x,bottom-z,2,27);box('#294e5b',1340,288,35,22,3,29);for(const p of [[1290,315],[1390,330]])box('#f0e8d8',...p,25,17,.5,29);}
        else{box('#b99d78',(x+r)/2,(z+bottom)/2,r-x,bottom-z,31);box('#eee1cc',(x+r)/2,(z+bottom)/2,r-x+1,bottom-z+1,2,31);for(const dx of [12,39]){box('#a88c66',x+dx,z+1,22,1,25,3);box('#64747a',x+dx,z,9,1,1,23);}box('#375964',x+23,z+12,25,12,18,33);box('#9eafb0',x+23,z+19,18,1,10,38);mesh('cylinder','#eee1cc',x+(index===0?45:51),35,z+12,3,5,3);}
      }else{const seat=g.conferenceSeats[index-3];chair(seat.point,{x:1340,y:295});}
    }
    for(const [x,z]of [[38,70],[g.width-38,70],[38,g.height-70],[g.width-38,g.height-70]])plant(x,z);
    // A real sofa and side table give departing workers a recognizable breakout area.
    const [sx,sy,sr,sb]=g.breakout.sofa,sz=(sy+sb)/2,sc=(sx+sr)/2;
    for(const x of [sx+10,sr-10])for(const z of [sy+9,sb-9])box('#53666a',x,z,5,5,8);
    softBox('#567a7b',sc,sz,sr-sx,sb-sy,11,8);softBox('#6b9290',sc,sb-4,sr-sx,8,35,8);
    for(let i=0;i<3;i++){const width=(sr-sx-24)/3,x=sx+12+width*(i+.5);softBox('#84a29a',x,sz-3,width-2,sb-sy-15,6,19);softBox('#7a9b94',x,sb-10,width-2,6,21,22);}
    for(const x of [sx+5,sr-5])softBox('#6b9290',x,sz,10,sb-sy,25,8);
    const [tx,ty,tr,tb]=g.breakout.table;for(const x of [tx+8,tr-8])for(const z of [ty+8,tb-8])box('#64747a',x,z,4,4,13);box('#d4b58a',(tx+tr)/2,(ty+tb)/2,tr-tx,tb-ty,3,13);box('#eee1cc',(tx+tr)/2-12,(ty+tb)/2,20,14,.8,16);box('#6e8b87',(tx+tr)/2-12,(ty+tb)/2,20,14,.5,16.8);
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
  function humanHead(body,profile,edition,skin,trait){
    const design=cast[profile],shape=design.head.map((n,i)=>n*(edition===2?(i===0?.96:i===1?1.03:1):1));
    mesh(`head${profile}`,skin,0,48.5,0,...shape,body);const face=mesh(`face${profile}`,'#ffffff',0,48.5,0,...shape,body);face.material=characterFace(profile,trait);
    for(const side of [-1,1])mesh('sphere',skin,side*(shape[0]-.6),47.5,0,2.1,2.8,2.1,body);
    const hair=new T.Group();hair.position.y=48.5;hair.scale.set(edition===1?-1:edition===3?.94:1,edition===3?1.03:1,edition===4?1.07:1);body.add(hair);
    const mass=(x,y,z,sx,sy,sz,tilt=0)=>{const m=mesh('sphere',design.hair,x,y-48.5,z,sx,sy,sz,hair);m.rotation.z=tilt;return m;};
    mesh('chibiHair',design.hair,0,0,-.7,shape[0]+.5,shape[1]+.7,shape[2]+.6,hair);
    if(profile===0){
      mass(-4,59,6.5,10,4.5,5,.2);mass(7,58,5,7,5,6,-.3);mass(0,51,-6,14.5,11,7);
      for(const [x,y,height]of [[-12,49,9],[12,45,15]])mesh('rounded',design.hair,x,y-48.5,-1,6,height,13,hair);
      const clip=mesh('rounded',design.trim,-12,6,6,1.5,5,2,hair);clip.rotation.z=-.15;
    }else if(profile===1){
      mass(-6,60,-1,8,8.1,8,-.55);mass(5,57,8,8.5,4.3,3.9,.5);mass(12,47,-1,3.3,8.5,6,-.13);mass(-12,51,-1,2.8,5.5,6,.2);mass(0,48,-9,9,8,5);
      if(edition===4)mass(6,53,-10,5,5,5,.3);
    }else{
      mass(0,59,-1,14.5,4.8,10.5);
      for(let i=0;i<7;i++){const angle=i*Math.PI*2/7;mass(Math.sin(angle)*10.5,59.5+(i%2),Math.cos(angle)*6.5,5.4,5.3,5.8);}
    }
    return hair;
  }
  function robotHead(body,profile,edition,trait){
    const design=cast[profile],head=new T.Group();head.position.y=50;head.scale.x=edition===2?.9:1;body.add(head);
    const detail=new T.Group();detail.scale.x=edition===1?-1:1;head.add(detail);let faceZ,faceWidth,faceHeight;
    if(profile===3){
      mesh('rounded',design.dark,0,0,0,27,23,20,head);mesh('rounded',design.trim,0,0,10,24,19,2,head);mesh('rounded','#263b48',0,0,11.2,20.5,15,1,head);faceZ=11.8;faceWidth=19;faceHeight=14;
      for(let i=0;i<3;i++)mesh('rounded',design.trim,-13.7,-3+i*3,0,1,1.2,8,detail);
      mesh('cylinder',design.trim,-9,14.5,-2,1,6,1,detail);mesh('sphere',design.main,-9,18.1,-2,1.7,1.7,1.7,detail);mesh('rounded',design.main,12,-5,-2,3,7,10,detail);
    }else if(profile===4){
      mesh('sphere',design.main,0,0,-1,14.7,11.5,11.5,head);mesh('rounded',design.dark,0,.2,11.7,23,15,2,head);faceZ=12.8;faceWidth=21;faceHeight=13;
      for(const side of [-1,1]){const pod=mesh('cylinder',side===-1?design.trim:design.dark,side*14,0,-1,side===-1?3.7:2.6,4,side===-1?3.7:2.6,detail);pod.rotation.z=Math.PI/2;}
      mesh('rounded',design.trim,4,11,-3,2,4,2,detail);mesh('ring',design.trim,4,14.8,-3,3.1,3.1,.8,detail);
    }else{
      mesh('wedge',design.main,0,1,0,29,25,20,head);mesh('rounded',design.trim,0,2,10.2,22,12,1.6,head);mesh('rounded',design.dark,0,2,11.1,20.5,10.5,1,head);faceZ=11.7;faceWidth=19;faceHeight=9.5;
      const fin=mesh('rounded',design.trim,12,10,-2,3,12,5,detail);fin.rotation.z=-.25;mesh('rounded',design.dark,-12,-3,-1,4,6,9,detail);
    }
    if(edition===3){mesh('rounded',design.trim,-6,8,-9,6,4,3,detail);mesh('rounded',design.trim,0,-10,1,16,3,11,detail);}
    if(edition===4){if(profile===4)mesh('ring',design.trim,-5,13,-3,3.5,3.5,.8,detail);else for(const side of [-1,1])mesh('rounded',design.trim,side*13,-2,0,4,8,10,detail);}
    const face=mesh('plane','#ffffff',0,profile===5?2:0,faceZ,faceWidth,faceHeight,1,head);face.material=characterFace(profile,trait);return head;
  }
  function characterClothes(body,profile,edition){const d=cast[profile],robot=d.kind==='robot';let torso;
    if(profile===0||profile===3||profile===5)torso=mesh(profile===5?'wedge':'rounded',d.main,0,30,0,profile===5?19:17,17,11,body);
    else torso=mesh('jacket',d.main,0,30,0,profile===4?8.6:9,18,5.8,body);
    if(profile===0){for(const side of [-1,1])softBox(side<0?'#799983':d.main,side*4,5.8,7,1.2,14,23,body);const seam=softBox(d.trim,0,6.5,1.5,.7,16,23,body);seam.rotation.z=-.4;softBox('#f4e5ca',0,0,8,8,3,37,body);}
    if(profile===1){for(const side of [-1,1]){const collar=softBox(d.trim,side*3.8,5.9,5,2,10,30,body);collar.rotation.z=side*.4;}softBox('#ead8c1',edition%2?-3.5:3.5,7,4,1,2,29,body);}
    if(profile===2){softBox('#eddfbc',0,0,15,9,17,23,body);softBox(d.main,0,5.7,11,1.5,12,23,body);for(const side of [-1,1]){softBox(d.main,side*5,5.7,2,1.5,13,27,body);mesh('sphere',d.trim,side*5,34,6.6,1,1,.4,body);}softBox(d.dark,edition%2?-3:3,6.7,6,.6,4,24,body);}
    if(profile===3){for(const side of [-1,1])softBox(side<0?d.trim:d.dark,side*4,5.8,6.5,1.4,13,23,body);softBox(d.trim,-2,-6,8,3,10,25,body);}
    if(profile===4){softBox(d.main,0,0,16,12,4,23,body);softBox(d.trim,0,0,17,11,4,34,body);softBox(d.trim,0,5.6,14,1.5,8,24,body);softBox(d.dark,0,6.5,8,.8,3,29,body);mesh('cylinder',d.dark,0,39,0,4,3,4,body);}
    if(profile===5){for(const side of [-1,1]){const yoke=softBox(d.trim,side*6,2,6,8,5,34,body);yoke.rotation.z=side*.2;}softBox(d.dark,0,5.7,9,1,11,24,body);softBox(d.trim,0,6.3,2,.5,8,26,body);}
    if(edition===4)softBox(d.trim,-5,6.5,4,1,4,24,body);
    const badge=softBox('#7995a3',profile===1?-5:5,7,3,1,3,32,body);return {torso,roleAccents:[badge],sleeveColor:robot?d.dark:profile===0||profile===2?'#efdfbe':d.main};
  }
  function makeWorker(actor){const root=new T.Group(),body=new T.Group();root.add(body);people.add(root);
    // Independent salted traits keep a person's species, face and clothing
    // stable as their real session moves between jobs and departments.
    const id=String(actor.data.id),profile=identityHash(id,'cast')%cast.length,edition=identityHash(id,'edition')%5,trait=identityHash(id,'face')%5,design=cast[profile],robot=design.kind==='robot',skin=['#dfb08d','#b67f5c','#edc6a0','#8c5e45'][identityHash(id,'skin')%4];
    const pelvis=mesh('sphere',design.dark,0,22,0,7.5,4.5,5,body),{torso,roleAccents,sleeveColor}=characterClothes(body,profile,edition);
    mesh('cylinder',robot?design.trim:skin,0,39,0,3,5,3,body);const hair=robot?robotHead(body,profile,edition,trait):humanHead(body,profile,edition,skin,trait);
    const limbs=[];for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*9.5,38,0);body.add(arm);const sleeve=mesh(robot?'rounded':'sphere',sleeveColor,0,-4,0,robot?5.8:profile===1?3.8:3.2,robot?8:5,robot?6:3.5,arm);mesh('cylinder',design.trim,0,-8,0,3,1.5,3,arm);const forearm=new T.Group();forearm.position.y=-9;arm.add(forearm);mesh(robot?'rounded':'sphere',robot?design.main:skin,0,-3,0,robot?4.6:2.4,robot?6.5:3.8,robot?4.8:2.5,forearm);mesh('sphere',robot?design.trim:skin,0,-8,0,2.8,3,2.6,forearm);if(robot)mesh('sphere',design.dark,0,0,0,2.8,2.8,2.8,forearm);const leg=new T.Group();leg.position.set(side*4.4,21,0);body.add(leg);mesh('sphere',design.dark,0,-5,0,profile===2?3.7:3.2,5.6,3.6,leg);const knee=new T.Group();knee.position.y=-10;leg.add(knee);mesh(robot?'rounded':'sphere',robot?design.main:design.dark,0,-4.8,0,robot?5.6:3,robot?9:5.3,robot?6:3.4,knee);softBox(design.trim,0,2,profile===2?8.2:7.5,10,1.8,-10.6,knee);softBox(design.dark,0,1,profile===2?8:7,9,3.2,-9.2,knee);softBox(robot?design.trim:'#eadcc1',0,3,4,4,.6,-6,knee);limbs.push({arm,forearm,leg,knee,side});}
    const selection=new T.Mesh(new T.TorusGeometry(18,1.3,5,32),new T.MeshBasicMaterial({color:'#e4bb78'}));selection.rotation.x=Math.PI/2;selection.position.y=1;root.add(selection);
    root.traverse(m=>{m.castShadow=false;});const value={root,body,pelvis,torso,hair,limbs,roleAccents,selection,appearance:{profile:design.name,kind:design.kind,edition,face:trait},gait:[.95,1.1,.85,.75,.9,1.05][profile],last:{x:actor.position.x,y:actor.position.y},pose:'standing'};workers.set(actor.data.id,value);dirty=true;return value;
  }
  function syncActors(actors,selected,now,motion){const ids=new Set();let animating=false;
    for(const a of actors.values()){ids.add(a.data.id);const worker=workers.get(a.data.id)||makeWorker(a),dx=a.position.x-worker.last.x,dz=a.position.y-worker.last.y,moving=Math.hypot(dx,dz)>.01,seated=a.element.classList.contains('at-desk')||a.element.classList.contains('at-conference-seat');
      if(moving){worker.root.rotation.y=Math.atan2(dx,dz);dirty=true;}else if(seated){const target=a.data.conferenceSeat?{x:1340,y:295}:a.data.station.desk;worker.root.rotation.y=Math.atan2(target.x-a.position.x,target.y-a.position.y);}
      worker.root.position.set(a.position.x,0,a.position.y);worker.last={...a.position};worker.pose=seated?'seated':moving?'walking':'standing';worker.selection.visible=a.data.id===selected;
      worker.body.position.y=seated?-9:0;
      worker.body.position.z=seated?6:0;
      const color=colors[window.OfficeWorld.roles.indexOf(a.data.role)]||'#7995a3';for(const accent of worker.roleAccents)accent.material=material(color);
      const workingPose=a.data.working&&['coding','command','tool','reviewing','testing','designing','auditing'].includes(a.data.action);
      for(const {arm,forearm,leg,knee,side}of worker.limbs){const stride=moving&&motion?Math.sin(now*.009*worker.gait)*.55*side:0;arm.rotation.x=seated?-1.25+(motion&&workingPose?Math.sin(now*.012+side)*.07:0):-stride;forearm.rotation.x=seated?-.4:0;leg.rotation.x=seated?-Math.PI/2:stride;knee.rotation.x=seated?Math.PI/2:0;}
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
  function diagnostics(){return {available:true,active,backend:active?'webgl':'svg',contextLost,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,renderedFrames,wallCount:roomWalls.length,perimeter:walls.map(w=>({side:w.side,height:w.mesh.scale.y})),rugs:[...rugs],stations:[...monitors.keys()],actors:[...workers].map(([id,w])=>({id,pose:w.pose,x:w.root.position.x,y:w.root.position.z,height:w.body.position.y,appearance:{...w.appearance}})),camera:{type:camera.type,x:camera.position.x,y:camera.position.y,z:camera.position.z},memory:{...renderer.info.memory}};}
  return {available:true,configure,setActive,syncActors,updateMonitor,render,diagnostics};
})();
