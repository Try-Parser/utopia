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
  let renderArt=null,renderArtError='';
  try{renderArt=window.OfficeRenderArt?.create(T,renderer)||null;}catch(error){renderArtError=String(error?.message||error);}
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(18,1,1,12000),architecture=new T.Group(),people=new T.Group();
  const hemisphere=new T.HemisphereLight(0xc8dfff,0x8d7660,.95);scene.add(architecture,people,hemisphere);
  const sun=new T.DirectionalLight(0xffefd6,2.45);sun.position.set(600,1600,400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0003;sun.shadow.normalBias=1.5;scene.add(sun,sun.target);
  const fill=new T.DirectionalLight(0xa6c9e3,.75);fill.position.set(-800,900,-600);scene.add(fill);
  function roundedGeometry(){const g=new T.BoxGeometry(1,1,1,4,4,4),p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),cx=Math.max(-.42,Math.min(.42,x)),cy=Math.max(-.42,Math.min(.42,y)),cz=Math.max(-.42,Math.min(.42,z)),dx=x-cx,dy=y-cy,dz=z-cz,length=Math.hypot(dx,dy,dz);p.setXYZ(i,cx+dx/length*.08,cy+dy/length*.08,cz+dz/length*.08);n.setXYZ(i,dx/length,dy/length,dz/length);}g.computeBoundingSphere();return g;}
  function wedgeGeometry(){const g=roundedGeometry(),p=g.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)*(.65+.35*(p.getY(i)+.5)));g.computeVertexNormals();g.computeBoundingSphere();return g;}
  const jawWidth=(y,profile)=>profile===1?1+Math.max(0,1-Math.abs(y+.2)/.7)*.08-Math.max(0,-y-.2)*.28:1-Math.max(0,-y-.15)*(profile===2?.08:.17);
  function chibiHeadGeometry(profile){const g=new T.SphereGeometry(1,24,18),p=g.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)*jawWidth(p.getY(i),profile));g.computeVertexNormals();return g;}
  function chibiFaceGeometry(profile){const g=new T.PlaneGeometry(2,2,20,16),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)*.78,y=p.getY(i)*.62;p.setXYZ(i,x*jawWidth(y,profile),y,Math.sqrt(1-x*x-y*y)+.025);}g.computeVertexNormals();return g;}
  function chibiHairGeometry(){const g=new T.SphereGeometry(1,20,14,0,Math.PI*2,0,Math.PI*.7),p=g.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),front=Math.max(0,p.getZ(i));p.setY(i,y+front*.8*(1-y));}g.computeVertexNormals();return g;}
  const geometries={box:new T.BoxGeometry(1,1,1),rounded:roundedGeometry(),wedge:wedgeGeometry(),sphere:new T.SphereGeometry(1,12,8),chibiHair:chibiHairGeometry(),jacket:new T.CylinderGeometry(1,.82,1,12),ring:new T.TorusGeometry(1,.13,6,20),cylinder:new T.CylinderGeometry(1,1,1,12),plane:new T.PlaneGeometry(1,1)};
  for(let profile=0;profile<3;profile++){geometries[`head${profile}`]=chibiHeadGeometry(profile);geometries[`face${profile}`]=chibiFaceGeometry(profile);}
  const materials=new Map(),workers=new Map(),monitors=new Map(),walls=[],roomWalls=[],glazings=[],boards=[],rugs=[],hallways=[],wayfinding=[],floorFinishes=[],receptionCounters=[];
  let physicalKey='',layout=null,projection=null,active=false,dirty=true,lastRender=0,renderedFrames=0,lastSize='',contextLost=false,referenceInterior=null,referenceCast=null;
  const referenceKitErrors=[];
  const graphicsStyles=['illustrated','polished','pixel','low-poly'],graphicsOriginals=new WeakMap(),graphicsMaterials=new Map(),graphicsGeometries=new Map(),textureSampling=new WeakMap(),polishedTextures=new Map();
  const nearestFilter=1003; // NearestFilter in the checked-in Three.js bundle.
  let graphicsStyle='illustrated',graphicsDisposed=false;
  const resourceMaterialImage=new Image(),resourceTiles={plank:[0,0],wall:[1,0],'hall-tile':[2,0],fabric:[0,1],polymer:[1,1],leaf:[2,1]};
  let resourceMaterialState='loading';
  function paintResourceMaterial(kind,texture){
    if(resourceMaterialState!=='ready'||graphicsDisposed)return;
    const cell=resourceTiles[kind];if(!cell)return;const ctx=texture.image.getContext('2d'),w=resourceMaterialImage.naturalWidth/3,h=resourceMaterialImage.naturalHeight/2;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,512,512);ctx.drawImage(resourceMaterialImage,cell[0]*w+2,cell[1]*h+2,w-4,h-4,0,0,512,512);texture.needsUpdate=true;dirty=true;
  }
  resourceMaterialImage.onload=()=>{
    if(graphicsDisposed)return;
    const w=resourceMaterialImage.naturalWidth,h=resourceMaterialImage.naturalHeight;
    if(w!==1536||h!==1024){resourceMaterialState='fallback';return;}
    resourceMaterialState='ready';for(const [kind,texture]of polishedTextures)paintResourceMaterial(kind,texture);dirty=true;
  };
  resourceMaterialImage.onerror=()=>{if(!graphicsDisposed)resourceMaterialState='fallback';};
  resourceMaterialImage.src='/assets/reference-resources-v1/materials.png';
  function polishedTexture(kind){
    if(polishedTextures.has(kind))return polishedTextures.get(kind);
    const sheet=document.createElement('canvas');sheet.width=sheet.height=512;const ctx=sheet.getContext('2d');
    // B uses quiet pale oak and stone, rather than the saturated painted A/C atlas.
    if(kind==='plank'){
      ctx.fillStyle='#baa98d';ctx.fillRect(0,0,512,512);
      for(let row=0;row<10;row++)for(let col=-1;col<3;col++){
        const x=col*256+(row%2)*128,y=row*51.2;ctx.fillStyle=['#d7c7a9','#d1bfa0','#ddcdb0','#d5c3a5'][(row+col+4)%4];ctx.fillRect(x+.5,y+.5,255,50.2);
        ctx.strokeStyle='#a98e6814';ctx.lineWidth=.8;
        for(let line=0;line<4;line++){ctx.beginPath();ctx.moveTo(x+7,y+8+line*10);ctx.bezierCurveTo(x+65,y+4+line*10,x+158,y+15+line*10,x+248,y+8+line*10);ctx.stroke();}
        ctx.fillStyle='#fff7e41c';ctx.fillRect(x+1,y+1,254,1);
      }
    }else if(kind==='hall-tile'){
      ctx.fillStyle='#cabea7';ctx.fillRect(0,0,512,512);
      for(let row=0;row<4;row++)for(let col=0;col<4;col++){ctx.fillStyle=['#e7dcc7','#e0d4be','#e9dfcc'][(row+col)%3];ctx.fillRect(col*128+1,row*128+1,126,126);ctx.fillStyle='#fff9ed28';ctx.fillRect(col*128+2,row*128+2,124,1);}
    }else{ctx.fillStyle=({wall:'#f5ebd6',fabric:'#294461',polymer:'#f2f1e8',leaf:'#548943'})[kind]||'#f2ead9';ctx.fillRect(0,0,512,512);}
    const texture=new T.CanvasTexture(sheet);texture.colorSpace=T.SRGBColorSpace;polishedTextures.set(kind,texture);paintResourceMaterial(kind,texture);return texture;
  }
  // Presentation variants always point back to the original resources. Their
  // keys are shared source materials/geometries, never actors or animation frames.
  function graphicsMaterial(original){
    if(!original?.isMeshStandardMaterial||graphicsStyle==='illustrated'||graphicsStyle==='pixel')return original;
    let variants=graphicsMaterials.get(original);if(!variants){variants=new Map();graphicsMaterials.set(original,variants);}
    if(!variants.has(graphicsStyle)){
      const value=original.clone(),surface=original.userData.graphicsSurface;
      if(surface&&!['plank','hall-tile','window'].includes(surface.kind)){value.map=null;value.color.set(surface.color);}
      if(graphicsStyle==='polished'){value.color.lerp(original.color.clone().set('#fff3df'),.12);if(surface&&Object.hasOwn(resourceTiles,surface.kind)){value.map=polishedTexture(surface.kind);value.color.set('#ffffff');}value.roughness=original.transparent?.24:surface?.kind==='polymer'?.3:.68;value.metalness=original.transparent?.08:.015;}
      else{value.roughness=1;value.metalness=0;value.flatShading=true;}
      variants.set(graphicsStyle,value);
    }
    return variants.get(graphicsStyle);
  }
  function facetedGeometry(original){
    if(graphicsGeometries.has(original))return graphicsGeometries.get(original);
    const kind=Object.keys(geometries).find(key=>geometries[key]===original);let value;
    if(kind==='sphere')value=new T.SphereGeometry(1,8,5);
    else if(kind?.startsWith('head')){const profile=Number(kind.slice(4));value=new T.SphereGeometry(1,8,6);const p=value.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)*jawWidth(p.getY(i),profile));}
    else if(kind==='chibiHair'){value=new T.SphereGeometry(1,8,5,0,Math.PI*2,0,Math.PI*.7);const p=value.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);p.setY(i,y+Math.max(0,p.getZ(i))*.8*(1-y));}}
    else if(kind==='jacket')value=new T.CylinderGeometry(1,.82,1,6);
    else if(kind==='cylinder')value=new T.CylinderGeometry(1,1,1,6);
    else if(kind==='ring')value=new T.TorusGeometry(1,.13,4,8);
    else if(kind==='rounded')value=new T.BoxGeometry(1,1,1);
    else if(kind==='wedge'){value=new T.BoxGeometry(1,1,1);const p=value.attributes.position;for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)*(.65+.35*(p.getY(i)+.5)));}
    else return original;
    if(value.index){const indexed=value;value=indexed.toNonIndexed();indexed.dispose();}value.computeVertexNormals();value.computeBoundingSphere();graphicsGeometries.set(original,value);return value;
  }
  function sampleTexture(texture){
    if(!texture)return;
    let original=textureSampling.get(texture);if(!original){original={magFilter:texture.magFilter,minFilter:texture.minFilter,generateMipmaps:texture.generateMipmaps};textureSampling.set(texture,original);}
    const pixel=graphicsStyle==='pixel',mag=pixel?nearestFilter:original.magFilter,min=pixel?nearestFilter:original.minFilter,mipmaps=pixel?false:original.generateMipmaps;
    if(texture.magFilter!==mag||texture.minFilter!==min||texture.generateMipmaps!==mipmaps){texture.magFilter=mag;texture.minFilter=min;texture.generateMipmaps=mipmaps;texture.needsUpdate=true;}
  }
  function applyGraphicsObject(object){
    if(!object.isMesh)return;
    if(object.userData.graphicsInk)object.visible=graphicsStyle==='illustrated'||graphicsStyle==='pixel';
    let original=graphicsOriginals.get(object);if(!original){original={geometry:object.geometry,material:object.material};graphicsOriginals.set(object,original);}
    object.material=graphicsMaterial(original.material);
    object.geometry=graphicsStyle==='low-poly'?facetedGeometry(original.geometry):graphicsStyle==='polished'&&object.userData.graphicsRounded?geometries.rounded:original.geometry;
    // Canvas plaques, monitor content and face drawings retain their texture;
    // pixel mode's scene raster is separate from native UI and preview text.
    sampleTexture(original.material.map);
  }
  function applyGraphicsTree(group){group.traverse(applyGraphicsObject);}
  function applyWorkerGraphics(worker){
    applyGraphicsTree(worker.body);const illustrated=graphicsStyle==='illustrated'||graphicsStyle==='pixel';
    if(!illustrated||castAssets.get(worker.appearance.profile).state!=='ready'){worker.body.visible=true;if(worker.illustration)worker.illustration.visible=false;worker.visualKind='native';worker.direction=worker.frame=null;}
  }
  function setGraphicsStyle(id){
    const next=graphicsStyles.includes(id)?id:'illustrated';if(next===graphicsStyle)return graphicsStyle;graphicsStyle=next;
    if(contextLost||graphicsDisposed)return graphicsStyle;
    applyGraphicsTree(architecture);for(const worker of workers.values())applyWorkerGraphics(worker);for(const asset of castAssets.values())sampleTexture(asset.texture);referenceInterior?.setStyle(next);
    const soft=graphicsStyle==='polished',matte=graphicsStyle==='low-poly';hemisphere.intensity=soft?1.2:matte?1.05:.95;sun.intensity=soft?2:matte?2.4:2.45;fill.intensity=soft?.95:matte?.65:.75;renderer.toneMappingExposure=soft?1.02:1;
    canvas.style.imageRendering=graphicsStyle==='pixel'?'pixelated':'';lastSize='';renderer.shadowMap.needsUpdate=true;dirty=true;return graphicsStyle;
  }
  function disposeGraphicsMaterial(original){const variants=graphicsMaterials.get(original);if(variants){for(const value of variants.values())value.dispose();graphicsMaterials.delete(original);}}
  function disposeGraphics(){if(graphicsDisposed)return;graphicsDisposed=true;renderArt?.dispose();resourceMaterialImage.onload=resourceMaterialImage.onerror=null;resourceMaterialImage.removeAttribute('src');for(const original of graphicsMaterials.keys())disposeGraphicsMaterial(original);for(const geometry of graphicsGeometries.values())geometry.dispose();graphicsGeometries.clear();for(const texture of polishedTextures.values())texture.dispose();polishedTextures.clear();referenceInterior?.dispose();referenceCast?.dispose();for(const key of ['contact-shadow','wall-ao']){const value=materials.get(key);value?.map?.dispose();value?.dispose();materials.delete(key);}}
  const colors=['#91b49a','#b0a1c5','#93b4c3','#c8ae85','#91b7ad','#c2a0a2'];
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
  const castDirections=['front-right','front-left','back-left','back-right'],castPoses=['idle','blink','walk-a','walk-b','type-a','type-b'];
  const castAssets=new Map(cast.map(d=>[d.name,{state:'loading',frames:null,texture:null,material:null,cancel:null}]));
  let castManifestState='loading',castDisposed=false;
  function validCastProfile(profile,design){
    if(!profile||profile.kind!==design.kind||profile.image!==`assets/employee-${design.name}-v1.png`||!Number.isInteger(profile.width)||!Number.isInteger(profile.height)||profile.width<1||profile.height<1||profile.width>8192||profile.height>8192||!Array.isArray(profile.frames)||profile.frames.length!==24)return null;
    const frames=new Map();
    for(const frame of profile.frames){
      if(!frame||!castPoses.includes(frame.pose)||!castDirections.includes(frame.direction)||!Array.isArray(frame.rect)||frame.rect.length!==4||!frame.rect.every(Number.isInteger)||!Array.isArray(frame.anchor)||frame.anchor.length!==2||!frame.anchor.every(Number.isFinite))return null;
      const [x,y,width,height]=frame.rect,[ax,ay]=frame.anchor,key=`${frame.direction}:${frame.pose}`,seated=frame.pose.startsWith('type-');
      if(x<0||y<0||width<1||height<1||x+width>profile.width||y+height>profile.height||ax<0||ax>width||ay<0||ay>height||frame.height!==(seated?55:64)||frames.has(key))return null;
      frames.set(key,{...frame,rect:[...frame.rect],anchor:[...frame.anchor]});
    }
    return frames;
  }
  function loadCastImage(profile,asset,frames){
    if(castDisposed)return;asset.state='loading';
    const image=new Image();let finished=false;
    const finish=success=>{
      if(finished)return;finished=true;clearTimeout(timeout);image.onload=image.onerror=null;asset.cancel=null;
      if(success&&!castDisposed&&image.naturalWidth===profile.width&&image.naturalHeight===profile.height){
        asset.texture=new T.CanvasTexture(image);asset.texture.colorSpace=T.SRGBColorSpace;
        sampleTexture(asset.texture);
        asset.material=new T.MeshBasicMaterial({map:asset.texture,alphaTest:.45,transparent:false,depthTest:true,depthWrite:true,toneMapped:false});asset.frames=frames;asset.width=profile.width;asset.height=profile.height;asset.state='ready';
      }else asset.state='fallback';
      dirty=true;
    };
    // A slow local image may recover after the native presentation takes over.
    // Only settlement or disposal ends this one fixed request.
    const timeout=setTimeout(()=>{if(!finished&&!castDisposed){asset.state='fallback';dirty=true;}},10000);
    asset.cancel=()=>{finish(false);image.removeAttribute('src');};image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=`/${profile.image}`;
  }
  const castRequest=new AbortController(),castRequestTimeout=setTimeout(()=>{
    if(castDisposed||castManifestState!=='loading')return;
    castManifestState='fallback';for(const asset of castAssets.values())if(asset.state==='loading')asset.state='fallback';dirty=true;
  },10000);
  fetch('/assets/employee-cast-v1.json',{signal:castRequest.signal}).then(response=>{if(castDisposed)return null;if(!response.ok)throw new Error('Cast metadata unavailable');return response.json();}).then(manifest=>{
    if(castDisposed)return;
    if(manifest?.version!==1||!Array.isArray(manifest.profiles)||manifest.profiles.length!==cast.length)throw new Error('Invalid cast metadata');
    castManifestState='ready';
    for(const design of cast){const asset=castAssets.get(design.name),matches=manifest.profiles.filter(p=>p?.id===design.name),profile=matches.length===1?matches[0]:null,frames=validCastProfile(profile,design);if(frames)loadCastImage(profile,asset,frames);else asset.state='fallback';}
    dirty=true;
  }).catch(()=>{if(castDisposed)return;castManifestState='fallback';for(const asset of castAssets.values())if(asset.state==='loading')asset.state='fallback';dirty=true;}).finally(()=>clearTimeout(castRequestTimeout));
  function disposeCastAssets(){
    if(castDisposed)return;castDisposed=true;castRequest.abort();clearTimeout(castRequestTimeout);
    for(const asset of castAssets.values()){asset.cancel?.();asset.texture?.dispose();asset.material?.dispose();asset.texture=asset.material=null;asset.state='fallback';}
    for(const worker of workers.values()){worker.body.visible=true;if(worker.illustration)worker.illustration.visible=false;worker.visualKind='native';worker.frame=worker.direction=null;}
  }
  function updateIllustratedWorkers(now){
    for(const worker of workers.values()){
      const asset=castAssets.get(worker.appearance.profile);
      if(graphicsStyle==='polished'||graphicsStyle==='low-poly'){if(worker.visualKind!=='native'){worker.visualKind='native';worker.body.visible=true;if(worker.illustration)worker.illustration.visible=false;worker.frame=worker.direction=null;dirty=true;}continue;}
      if(asset.state!=='ready'){
        if(worker.visualKind!=='native'){worker.visualKind='native';worker.body.visible=true;if(worker.illustration)worker.illustration.visible=false;worker.frame=worker.direction=null;dirty=true;}
        continue;
      }
      if(!worker.illustration){const geometry=new T.PlaneGeometry(1,1),plane=new T.Mesh(geometry,asset.material);worker.root.add(plane);worker.illustration=plane;}
      const plane=worker.illustration,dx=camera.position.x-worker.root.position.x,dz=camera.position.z-worker.root.position.z,quarter=Math.PI/2;
      let slot=worker.viewSlot??0;
      if(Math.hypot(dx,dz)>.001){const relative=Math.atan2(dx,dz)-worker.root.rotation.y,wrapped=((relative%(Math.PI*2))+Math.PI*2)%(Math.PI*2),candidate=Math.round(wrapped/quarter)%4,distance=Math.abs(Math.atan2(Math.sin(wrapped-slot*quarter),Math.cos(wrapped-slot*quarter)));if(worker.viewSlot===undefined||distance>quarter/2+.06)slot=candidate;}
      worker.viewSlot=slot;const direction=castDirections[slot],seated=worker.pose==='seated',phase=now+worker.animationPhase;
      let pose=seated?'type-a':'idle';
      if(worker.motion){if(worker.pose==='walking')pose=Math.floor(phase/170)%2?'walk-b':'walk-a';else if(seated&&worker.workingPose)pose=Math.floor(phase/190)%2?'type-b':'type-a';else if(!seated&&phase%4600>4460)pose='blink';}
      const key=`${direction}:${pose}`,frame=asset.frames.get(key);
      if(worker.frame!==key){
        const [x,y,width,height]=frame.rect,[ax,ay]=frame.anchor,scale=frame.height/height,positions=plane.geometry.attributes.position,uv=plane.geometry.attributes.uv;
        for(let i=0;i<positions.count;i++){const right=i%2===1,bottom=i>=2,px=right?width:0,py=bottom?height:0;positions.setXYZ(i,(px-ax)*scale,(ay-py)*scale,0);uv.setXY(i,(x+px)/asset.width,1-(y+py)/asset.height);}
        positions.needsUpdate=uv.needsUpdate=true;plane.geometry.computeBoundingSphere();worker.frame=key;dirty=true;
      }
      // Keep world Y upright: camera pitch must not lean a seated drawing's
      // face backward into its physical chair. Only its viewing azimuth turns.
      const azimuth=Math.atan2(dx,dz);
      plane.rotation.set(0,azimuth-worker.root.rotation.y,0);
      plane.position.set(0,0,seated?6:0);
      const view=`${azimuth}:${worker.root.rotation.y}:${seated}`;
      if(worker.illustrationView!==view||worker.visualKind!=='illustrated'){worker.illustrationView=view;dirty=true;}
      worker.visualKind='illustrated';worker.direction=direction;worker.body.visible=false;plane.visible=true;
    }
  }
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
  // Original local artwork supplies material swatches; mesh geometry and all
  // monitor/worker coordinates still come from the authoritative office model.
  const illustratedImage=new Image(),paintedSurfaces=[];let surfaceState='loading';
  illustratedImage.onload=()=>{surfaceState='illustrated';for(const paint of paintedSurfaces)paint();dirty=true;};
  illustratedImage.onerror=()=>{surfaceState='fallback';};
  illustratedImage.src='/assets/office-surfaces-v2.png';
  // Procedural surfaces remain usable while artwork loads or is unavailable.
  function surface(kind,color){const key=`${kind}:${color}`;if(materials.has(key))return materials.get(key);
    const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.scale(4,4);
    if(kind==='polymer'||kind==='leaf'){ctx.fillStyle=kind==='polymer'?'#f2f1e8':'#548943';ctx.fillRect(0,0,128,128);}
    else if(kind==='fabric'){ctx.fillStyle='#eeeae1';ctx.fillRect(0,0,128,128);for(let y=0;y<128;y+=4)for(let x=0;x<128;x+=4){ctx.fillStyle=(x+y)%8?'#e7e3db':'#f3efe6';ctx.fillRect(x,y,3,1);ctx.fillStyle='#e3e0d8';ctx.fillRect(x+2,y+1,1,3);}}
    else if(kind==='wall'){ctx.fillStyle='#fff9eb';ctx.fillRect(0,0,128,128);for(let x=0;x<128;x+=8){ctx.fillStyle='#d8cdb527';ctx.fillRect(x,0,1,128);ctx.fillStyle='#ffffff55';ctx.fillRect(x+1,0,1,128);}for(let y=0;y<128;y+=4){ctx.fillStyle='#b8a48609';ctx.fillRect(0,y,128,1);}}
    else if(kind==='plank'){ctx.fillStyle='#a58b68';ctx.fillRect(0,0,128,128);for(let row=0;row<8;row++)for(let col=-1;col<3;col++){const x=col*64+(row%2)*32,y=row*16;ctx.fillStyle=['#f0d8aa','#e9d0a2','#f4dfb7'][(row+col+3)%3];ctx.fillRect(x+.5,y+.5,63,15);ctx.strokeStyle='#9a785133';for(let line=0;line<3;line++){ctx.beginPath();ctx.moveTo(x+4,y+4+line*3);ctx.quadraticCurveTo(x+25,y+line*3+2,x+59,y+5+line*3);ctx.stroke();}}}
    else if(kind==='hall-tile'){ctx.fillStyle='#bba68b';ctx.fillRect(0,0,128,128);for(let row=0;row<4;row++)for(let col=0;col<4;col++){const x=col*32,y=row*32;ctx.fillStyle=['#f1e1c6','#ead8b8','#f6e7cd'][(row+col)%3];ctx.fillRect(x+.7,y+.7,30.6,30.6);ctx.fillStyle='#fff6e24d';ctx.fillRect(x+1,y+1,30,1.3);ctx.fillStyle='#b49b751a';ctx.fillRect(x+30,y+1,1,30);}}
    else if(kind==='tile'){ctx.fillStyle='#9ba9aa';ctx.fillRect(0,0,128,128);for(let y=0;y<8;y++)for(let x=0;x<8;x++){ctx.fillStyle=(x+y)%3?'#e9eddf':'#d9e4db';ctx.fillRect(x*16+1,y*16+1,14.5,14.5);ctx.fillStyle='#ffffff40';ctx.fillRect(x*16+1,y*16+1,14.5,1);}}
    else{const sky=ctx.createLinearGradient(0,0,0,128);sky.addColorStop(0,'#739eaf');sky.addColorStop(.55,'#b0cdd1');sky.addColorStop(1,'#e5dfc8');ctx.fillStyle=sky;ctx.fillRect(0,0,128,128);ctx.fillStyle='#f8f4e241';ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(39,0);ctx.lineTo(100,128);ctx.lineTo(69,128);ctx.fill();}
    const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
    const value=new T.MeshStandardMaterial({color:kind==='plank'||kind==='hall-tile'?'#ffffff':color,map:texture,roughness:kind==='window'?.38:kind==='fabric'?.96:.9,metalness:kind==='window'?.06:0});value.userData.graphicsSurface={kind,color:kind==='window'?'#b7d5df':color};
    const tile={plank:[0,0],'hall-tile':[1,0],tile:[1,0],wall:[0,1],window:[1,1]}[kind];
    if(tile){const paint=()=>{if(surfaceState!=='illustrated')return;const w=illustratedImage.naturalWidth/2,h=illustratedImage.naturalHeight/2;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,512,512);ctx.drawImage(illustratedImage,tile[0]*w+2,tile[1]*h+2,w-4,h-4,0,0,512,512);
      // The reference-directed atlas is authored albedo, so retain its painted
      // grain and ivory/stone hues without another opaque whitening layer.
      value.color.set('#ffffff');texture.needsUpdate=true;dirty=true;};paintedSurfaces.push(paint);paint();}
    materials.set(key,value);return value;
  }
  function rug(color,x,z,width,depth,base=1){const edge=box('#c6bea8',x,z,width,depth,1,base);edge.castShadow=false;const fabric=box(color,x,z,width-5,depth-5,.6,base+1);fabric.material=surface('fabric',color);fabric.castShadow=false;}
  function mesh(kind,color,x,y,z,sx,sy,sz,parent=architecture){const m=new T.Mesh(geometries[kind],material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const box=(color,x,z,width,depth,height,base=0,parent=architecture)=>{const m=mesh('box',color,x,base+height/2,z,width,height,depth,parent);if(height<=2)m.castShadow=false;return m;};
  const softBox=(color,x,z,width,depth,height,base=0,parent=architecture)=>{const m=mesh('rounded',color,x,base+height/2,z,width,height,depth,parent);if(height<=2)m.castShadow=false;return m;};
  // Thin authored seams make the illustrated furniture read as a drawing.
  // They batch by material and disappear in the two volumetric styles.
  function inkEdge(x,z,width,depth,base,parent=architecture){
    for(const side of [-1,1])for(const horizontal of [true,false]){
      const edge=box('#6d5945',x+(horizontal?0:side*width/2),z+(horizontal?side*depth/2:0),horizontal?width:.65,horizontal?.65:depth,.35,base,parent);edge.userData.graphicsInk=true;
    }
  }
  function contactShadow(parent,width=38,depth=28,floorHeight=1.1){
    const key='contact-shadow';let value=materials.get(key);
    if(!value){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(32,32,1,32,32,32);gradient.addColorStop(0,'#3f2d2b55');gradient.addColorStop(.55,'#3f2d2b22');gradient.addColorStop(1,'#3f2d2b00');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;value=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});materials.set(key,value);}
    const shadow=new T.Mesh(geometries.plane,value);shadow.rotation.x=-Math.PI/2;shadow.scale.set(width,depth,1);shadow.position.y=floorHeight;shadow.userData.contactShadow=true;shadow.castShadow=false;parent.add(shadow);return shadow;
  }
  function wallShade(bounds){
    const key='wall-ao';let value=materials.get(key);
    if(!value){const c=document.createElement('canvas');c.width=16;c.height=64;const ctx=c.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,64);gradient.addColorStop(0,'#57433355');gradient.addColorStop(.28,'#57433325');gradient.addColorStop(1,'#57433300');ctx.fillStyle=gradient;ctx.fillRect(0,0,16,64);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;value=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});materials.set(key,value);}
    const [x,z,r,b]=bounds,horizontal=r-x>b-z,length=horizontal?r-x:b-z,thickness=horizontal?b-z:r-x,reach=28;
    for(const sign of [-1,1]){const shade=new T.Mesh(geometries.plane,value);shade.rotation.set(-Math.PI/2,0,horizontal?(sign>0?0:Math.PI):(sign>0?Math.PI/2:-Math.PI/2));shade.position.set((x+r)/2+(horizontal?0:sign*(thickness+reach)/2),2.12,(z+b)/2+(horizontal?sign*(thickness+reach)/2:0));shade.scale.set(length,reach,1);shade.castShadow=false;architecture.add(shade);}
  }
  function sconce(room){
    const group=new T.Group(),height=layout.ceilingHeight||176;group.position.set(room.x+20,height*.66,room.y+8);group.userData.dynamic=true;group.userData.side='north';group.userData.requiredHeight=height*.81;group.userData.sconce=true;architecture.add(group);
    softBox('#9b7d4d',0,0,13,5,19,-9.5,group);softBox('#f7dba0',0,4,17,9,13,-4,group);box('#bc9757',0,4,19,11,2,-5,group);const light=box('#fff1c1',0,8.6,12,.5,7,-1,group);if(!materials.has('sconce-light'))materials.set('sconce-light',new T.MeshBasicMaterial({color:'#fff1c1',toneMapped:false}));light.material=materials.get('sconce-light');boards.push(group);
  }
  function chair(point,target,parent=architecture,scale=1){if(referenceInterior)return referenceInterior.chair(point,target,parent,scale);const group=new T.Group();group.position.set(point.x,0,point.y);group.rotation.y=Math.atan2(target.x-point.x,target.y-point.y);group.scale.setScalar(scale);parent.add(group);
    softBox('#344b5b',0,0,23,23,5,10,group).material=surface('fabric','#526e77');softBox('#52768a',0,-10,24,5,22,13,group);softBox('#608394',0,-6.9,19,1,16,17,group).material=surface('fabric','#73929b');mesh('cylinder','#64747a',0,5,0,3,10,3,group);
    for(const x of [-13,13]){box('#354a56',x,0,2,3,10,13,group);box('#344b5b',x,2,4,15,3,23,group);}
    box('#354a56',0,0,29,3,3,0,group);box('#354a56',0,0,3,29,3,0,group);
    for(const x of [-13,13])for(const z of [-9,9])mesh('sphere','#293d48',x,2,z,3,3,3,group);
  }
  function plant(x,z,radius=12){if(referenceInterior)return referenceInterior.plant(x,z,radius);const group=new T.Group(),scale=layout.staffScale||1;group.position.set(x,0,z);group.scale.y=scale;architecture.add(group);contactShadow(group,radius*3.2,radius*2.8);
    mesh('cylinder','#ae8058',0,8,0,radius*.77,16,radius*.77,group);mesh('cylinder','#e5cbaa',0,15.5,0,radius,2.5,radius,group);mesh('cylinder','#574d3a',0,17,0,radius*.83,.6,radius*.83,group);
    // Physical collision is the declared ceramic pot. Its soft crown may
    // overhang above walking height, like the plants in the reference office.
    const crown=Math.max(25,Math.min(37,radius*2.6));group.userData.plant={potRadius:radius,height:67*scale,crownRadius:crown};
    for(let i=0;i<3;i++){const top=61+i*2,stem=mesh('cylinder','#617746',(i-1)*1.7,(top+17)/2,0,.48,top-17,.48,group);stem.rotation.z=(i-1)*.025;}
    for(let i=0;i<18;i++){const angle=i*2.39996,height=45+Math.floor(i/6)*7.6,reach=crown*(.43+(i%3)*.045),leaf=mesh('sphere',['#376f42','#5d914f','#83ad62'][i%3],Math.sin(angle)*reach,height,Math.cos(angle)*reach,crown*(.14+(i%2)*.025),.95,crown*(.46+(i%3)*.055),group);leaf.rotation.y=angle;leaf.rotation.x=.18+(i%3)*.085;}
  }
  function cup(x,z,base,color='#f2e4cb',parent=architecture,scale=1){const group=new T.Group();group.position.set(x,base,z);group.scale.setScalar(scale);parent.add(group);mesh('cylinder',color,0,2.3,0,2.8,4.6,2.8,group);mesh('cylinder','#755844',0,4.65,0,2.15,.2,2.15,group);const rim=mesh('ring','#fff5df',0,4.7,0,2.5,2.5,1,group);rim.rotation.x=Math.PI/2;mesh('ring',color,3,2.5,0,1.4,1.4,.8,group);}
  // All ornament stays on an existing collision footprint. Cutaway trim moves
  // with its wall rather than floating above the lowered camera-facing side.
  function finishedWall(bounds,height,color='#f0e7d3'){const [x,z,r,b]=bounds,cx=(x+r)/2,cz=(z+b)/2,width=r-x,depth=b-z,vertical=depth>width;
    const m=box(color,cx,cz,width,depth,height);m.material=color==='#f0e7d3'?surface('wall','#fff8e9'):material(color);
    box('#aa9272',cx,cz,width,depth,5);box('#d8c6a5',cx,cz,width,depth,1.3,5);
    const cap=box('#f7e7c9',cx,cz,width+4,depth+4,4,height-4),rail=box('#b99b6a',cx,cz,width+1,depth+1,2,29);
    box('#e4d2af',cx,cz,width+1,depth+1,18,6);
    box('#8a6c47',cx,cz,width+2,depth+2,1,7);
    for(const detail of [m,cap,rail]){detail.userData.dynamic=true;detail.castShadow=false;}
    return {mesh:m,cap,rail,vertical};
  }
  function sizeWall(wall,height){wall.mesh.scale.y=height;wall.mesh.position.y=height/2;wall.cap.position.y=height-1.5;wall.rail.visible=height>30;}
  function plaqueMaterial(label){const key=`plaque:${label}`;if(materials.has(key))return materials.get(key);const c=document.createElement('canvas');c.width=768;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#203b50';ctx.fillRect(0,0,768,128);ctx.strokeStyle='#ae9c72';ctx.lineWidth=7;ctx.strokeRect(5,5,758,118);ctx.fillStyle='#fff6dd';ctx.textAlign='center';ctx.textBaseline='middle';let size=58;ctx.font=`bold ${size}px sans-serif`;while(ctx.measureText(label).width>708&&size>25)ctx.font=`bold ${--size}px sans-serif`;ctx.fillText(label,384,65);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const m=new T.MeshBasicMaterial({map:texture,toneMapped:false});materials.set(key,m);return m;}
  function roomSign(room){const group=new T.Group(),width=Math.min(230,room.width*.7),height=width/5;group.position.set(room.x+room.width/2,(layout.ceilingHeight||85)-height/2-4,room.y+(room===layout.cafe||room===layout.breakout?31:23));group.userData.dynamic=true;group.userData.followCap=true;group.userData.authoredY=group.position.y;architecture.add(group);softBox('#b7a17d',0,0,width+5,4,height+4,-height/2-2,group);const face=mesh('plane','#ffffff',0,0,2.1,width,height,1,group);face.material=plaqueMaterial(room.name);boards.push(group);}
  function framedBoard(bounds,variant='planner'){
    const [x,z,r,b]=bounds,group=new T.Group(),vertical=b-z>r-x,width=Math.max(r-x,b-z),style=['planner','designer','builder','reviewer','qa','security'].includes(variant)?variant:'planner';group.position.set((x+r)/2,(layout.ceilingHeight||176)*.68,(z+b)/2);if(vertical)group.rotation.y=Math.PI/2;group.userData.dynamic=true;group.userData.vertical=vertical;architecture.add(group);
    box('#8e704d',0,0,width,4,55,-27.5,group);box('#e4d4ad',0,2.2,width-4,.6,51,-25.5,group);
    const key=`office-board:${style}`;let value=materials.get(key);
    if(!value){const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.lineCap='round';ctx.lineJoin='round';ctx.fillStyle=style==='designer'?'#e7e5d9':'#f5eedb';ctx.fillRect(0,0,512,256);
      const line=(x,y,w,color='#92a398')=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,3);},card=(x,y,w,h,color='#e8d6a6')=>{ctx.fillStyle='#65513b18';ctx.fillRect(x+3,y+4,w,h);ctx.fillStyle=color;ctx.fillRect(x,y,w,h);},path=points=>{ctx.strokeStyle='#7f9c9c';ctx.lineWidth=3;ctx.beginPath();for(const [i,p]of points.entries())i?ctx.lineTo(...p):ctx.moveTo(...p);ctx.stroke();};
      if(style==='planner'){
        for(const [x,y,color]of [[28,34,'#e8ce8b'],[142,31,'#bfd1bc'],[258,37,'#dbbaa0'],[84,143,'#bfd3cf'],[316,146,'#d6cca2']]){card(x,y,77,68,color);line(x+10,y+20,52);line(x+10,y+34,39);line(x+10,y+47,45);}
        path([[106,67],[141,67]]);path([[219,67],[257,67]]);path([[296,105],[296,125],[353,125],[353,145]]);
      }else if(style==='designer'){
        for(const [x,w]of [[28,135],[187,135],[346,137]]){card(x,28,w,149,'#f8f5e7');ctx.strokeStyle='#93aab0';ctx.lineWidth=3;ctx.strokeRect(x+10,44,w-20,26);ctx.strokeRect(x+10,81,w-20,58);line(x+11,150,w-36);line(x+11,161,w-53);}
        for(const [i,color]of ['#8faeaa','#b99d8d','#d9bd7f','#8b97ae','#b5bc99'].entries()){ctx.fillStyle=color;ctx.fillRect(49+i*89,199,68,25);}
      }else if(style==='builder'){
        const nodes=[[35,81,109,67],[205,26,111,62],[205,162,111,62],[374,83,105,67]];path([[144,115],[177,115],[177,57],[205,57]]);path([[177,115],[177,193],[205,193]]);path([[316,57],[344,57],[344,116],[374,116]]);path([[316,193],[344,193],[344,116]]);for(const [x,y,w,h]of nodes){card(x,y,w,h,'#c3d6d2');line(x+12,y+20,w-24,'#608b93');line(x+12,y+36,w-43);}
      }else if(style==='reviewer'){
        card(48,23,416,211,'#fffaf0');for(let row=0;row<5;row++){ctx.strokeStyle='#9caf9c';ctx.lineWidth=3;ctx.strokeRect(73,43+row*37,18,18);line(113,47+row*37,276);line(113,58+row*37,191,'#c5c8b2');}
      }else if(style==='qa'){
        path([[44,31],[44,216],[263,216]]);for(const [i,h]of [71,112,85,145].entries()){ctx.fillStyle=['#a4bcb0','#789fa9','#c7b77e','#97aaa5'][i];ctx.fillRect(67+i*47,211-h,28,h);}
        for(let row=0;row<4;row++)for(let col=0;col<4;col++){ctx.fillStyle=(row+col)%3?'#c0d2c7':'#d6cba4';ctx.fillRect(304+col*39,53+row*40,28,28);}
      }else{
        const nodes=[[256,122],[83,55],[80,191],[425,58],[430,196],[254,35],[253,215]];for(const p of nodes.slice(1))path([nodes[0],p]);for(const [i,[x,y]]of nodes.entries()){ctx.fillStyle=i?'#b6cdc4':'#729aa3';ctx.beginPath();ctx.arc(x,y,i?19:29,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f8f2df';ctx.lineWidth=3;ctx.stroke();}
      }
      const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;value=new T.MeshBasicMaterial({map:texture,toneMapped:false});materials.set(key,value);}
    const face=mesh('plane','#ffffff',0,0,2.6,width-8,47,1,group);face.material=value;boards.push(group);
  }
  function wallArt(bounds,label){const [x,z,r,b]=bounds,width=Math.max(r-x,b-z),group=new T.Group();group.position.set((x+r)/2,118,(z+b)/2);group.userData.dynamic=true;group.userData.vertical=b-z>r-x;if(group.userData.vertical)group.rotation.y=Math.PI/2;architecture.add(group);box('#ad946d',0,0,width,3,43,-21.5,group);let art=materials.get('office-landscape');if(!art){const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#dce5d6';ctx.fillRect(0,0,256,128);ctx.fillStyle='#eac984';ctx.beginPath();ctx.arc(190,34,20,0,Math.PI*2);ctx.fill();for(const [color,y,phase]of [['#9fbdb0',66,0],['#71958c',87,1],['#4e7475',111,2]]){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,128);ctx.lineTo(0,y);for(let n=0;n<=8;n++)ctx.lineTo(n*32,y+Math.sin(n*.9+phase)*18);ctx.lineTo(256,128);ctx.fill();}const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;art=new T.MeshBasicMaterial({map:texture,toneMapped:false});materials.set('office-landscape',art);}const picture=mesh('plane','#ffffff',0,0,1.6,width-5,38,1,group);picture.material=art;boards.push(group);}
  function glassPanel(bounds,door=false){const [x,z,r,b]=bounds,vertical=b-z>r-x,width=r-x,depth=b-z,cx=(x+r)/2,cz=(z+b)/2,group=new T.Group(),facade=!vertical&&z>layout.height-60;group.userData.dynamic=true;architecture.add(group);let glass=materials.get('architectural-glass');if(!glass){glass=new T.MeshStandardMaterial({color:'#97cfda',transparent:true,opacity:.25,roughness:.2,metalness:.1,depthWrite:false});materials.set('architectural-glass',glass);}const panel=box('#b3d5d9',cx,cz,width,depth,68,4,group);panel.material=glass;panel.castShadow=false;
    for(const end of [-.5,.5])box('#c4d1cc',cx+(vertical?0:end*(width-3)),cz+(vertical?end*(depth-3):0),vertical?width:3,vertical?3:depth,74,0,group);
    for(const base of [1,71])box('#d8ddca',cx,cz,width,depth,3,base,group);if(door){box('#859fa1',cx+(vertical?0:width*.3),cz+(vertical?depth*.3:0),vertical?width:2,vertical?2:depth,18,27,group);box('#e3e5d2',cx,cz,width,depth,2,48,group);}
    // Glazing shares the room-wall cutaway, including its metal frame.
    if(facade)for(let position=x+140;position<r-30;position+=140)box('#dce3da',position,cz,3,depth+2,74,0,group);
    glazings.push({group,vertical,facade,bounds:[...bounds]});
  }
  function bookshelf(bounds,height=82){
    const [x,z,r,b]=bounds,width=r-x,depth=b-z,group=new T.Group(),front=depth>width,span=front?depth:width,thickness=front?width:depth,role=layout.rooms.find(room=>x>=room.x&&r<=room.x+room.width&&z>=room.y&&b<=room.y+room.height)?.role,edition=Math.max(0,window.OfficeWorld.roles.indexOf(role))%3;group.position.set((x+r)/2,0,(z+b)/2);if(front)group.rotation.y=Math.PI/2;architecture.add(group);
    const shade=contactShadow(group,width+25,depth+24,2.15);shade.rotation.z=front?Math.PI/2:0;
    softBox('#28394e',0,-thickness/2+1.5,span,3,height,0,group);for(const sx of [-span/2+2,span/2-2,-span*.165,span*.17])softBox('#28394e',sx,0,4,thickness,height,0,group);
    for(const h of [2,height*.49,height-3])softBox('#d4b782',0,0,span,thickness,3,h,group).material=surface('plank','#dfc599');
    const doorX=span*.335,doorWidth=span*.32;softBox(['#eee5d0','#e5e8d9','#f2e6d6'][edition],doorX,thickness/2-1,doorWidth-4,2,height-10,5,group);box('#967b51',doorX-doorWidth*.27,thickness/2+.5,3,1,11,height*.48,group);
    if(edition===1){box('#d3c6aa',doorX,thickness/2+.4,doorWidth-8,.5,1,height*.5,group);box('#967b51',doorX-doorWidth*.27,thickness/2+.6,3,1,7,height*.22,group);}
    const palette=[['#5b8994','#c9a569','#a4776c','#7e8d76'],['#9c849f','#8faea1','#c6ab75','#6c899a'],['#708d9e','#b7a467','#859b7a','#ad8172']][edition];
    for(const bay of [-.33,0])for(let shelf=0;shelf<2;shelf++)for(let j=0;j<6;j++){const bx=span*bay-span*.135+7+j*(span*.27-14)/5,bookHeight=19+(j*3+shelf*5+edition)%9,base=shelf?height*.49+3:5;box(palette[(j+shelf)%palette.length],bx,thickness/2-7,5.5,11,bookHeight,base,group);box('#efe3bd',bx,thickness/2-.9,3.8,.4,1.2,base+bookHeight-4,group);}
  }
  function sofa(bounds,rotation=0){const [x,z,r,b]=bounds,width=r-x,depth=b-z,group=new T.Group();group.position.set((x+r)/2,0,(z+b)/2);group.rotation.y=rotation;group.scale.y=layout.staffScale||1;architecture.add(group);for(const sx of [-width/2+10,width/2-10])for(const sz of [-depth/2+9,depth/2-9])box('#82715c',sx,sz,5,5,8,0,group);softBox('#b5a58c',0,0,width,depth,11,8,group);softBox('#e4d8b9',0,depth/2-4,width,8,35,8,group);const cushion=(width-24)/3;for(let i=0;i<3;i++){const sx=-width/2+12+cushion*(i+.5);softBox('#e9dec1',sx,-3,cushion-2,depth-15,6,19,group).material=surface('fabric','#eee2bd');softBox('#e2d5b6',sx,depth/2-10,cushion-2,6,21,22,group).material=surface('fabric','#e8d9b4');}for(const sx of [-width/2+5,width/2-5])softBox('#e4d8b9',sx,0,10,depth,25,8,group);for(const [sx,color,tilt]of [[-width/2+25,'#90a798',.13],[width/2-25,'#c59b76',-.16]]){const pillow=softBox(color,sx,depth/2-17,22,10,18,26,group);pillow.material=surface('fabric',color);pillow.rotation.z=tilt;}}
  function verticalGroup(){const group=new T.Group();group.scale.y=layout.staffScale||1;architecture.add(group);return group;}
  function coffeeTable(bounds){const [x,z,r,b]=bounds,cx=(x+r)/2,cz=(z+b)/2,group=verticalGroup();for(const sx of [x+8,r-8])for(const sz of [z+8,b-8])box('#897355',sx,sz,4,4,15,0,group);softBox('#ac8d63',cx,cz,r-x,b-z,3,15,group);box('#efe2bd',cx-12,cz,20,14,1,18,group);box('#76938b',cx-12,cz,20,14,.6,19,group);cup(r-14,b-12,18,'#f2e4cb',group);}
  function cafeCounter(bounds){const [x,z,r,b]=bounds,width=r-x,depth=b-z,cx=(x+r)/2,cz=(z+b)/2,group=verticalGroup(),shade=contactShadow(group,width+30,depth+25);shade.position.x=cx;shade.position.z=cz;box('#a68761',cx,cz,width,depth,32,0,group);softBox('#edddbc',cx,cz,width,depth,3,32,group);const panels=Math.max(2,Math.floor(width/36));for(let i=0;i<panels;i++){const px=x+(i+.5)*width/panels;box('#bd9a68',px,z+.7,width/panels-3,1,25,3,group);box('#786f5d',px,z+.1,8,.8,1,24,group);}const mx=x+Math.min(32,width*.25),mz=z+Math.min(14,depth*.5);softBox('#42626a',mx,mz,26,14,20,35,group);box('#c5c9b9',mx,mz+7.3,20,1,11,41,group);box('#304c57',mx,mz+8,11,.5,6,45,group);box('#819892',mx,mz+12,23,6,1,35,group);cup(mx,mz+11,36,'#f2e4cb',group);for(let i=0;i<Math.min(4,Math.floor((width-50)/18));i++)cup(x+55+i*18,cz,35,['#dfcda5','#bfcfbd'][i%2],group);}
  function receptionDesk(bounds){
    const [x,z,r,b]=bounds,width=r-x,depth=b-z,cx=(x+r)/2,cz=(z+b)/2,group=verticalGroup(),top=70/(layout.staffScale||1),shade=contactShadow(group,width+34,depth+28);shade.position.x=cx;shade.position.z=cz;
    softBox('#947044',cx,cz,width,depth,top-4,1,group);softBox('#f0e3c8',cx,cz+1,width-5,depth-3,top-8,5,group).material=surface('polymer','#f0e3c8');softBox('#fff0d2',cx,cz,width,depth,3,top-3,group).material=surface('plank','#e8c99a');inkEdge(cx,cz,width-2,depth-2,top+.1,group);
    softBox('#263a52',cx-width*.035,b+.1,width*.78,1.2,top*.49,top*.27,group);
    for(let i=0;i<5;i++)box('#c3a372',r-width*.12+i*width*.022,b-.3,1,.6,top-9,5,group);
    const label=mesh('plane','#ffffff',cx-width*.035,top*.51,b+1,Math.min(110,width*.48),8,1,group);label.material=plaqueMaterial('Reception');
    box('#b18b5d',cx+width*.25,cz,30,20,.6,top,group);box('#f4ead2',cx+width*.25,cz,27,18,.5,top+.6,group);softBox('#3e5b67',cx-width*.25,cz-3,24,13,4,top,group);softBox('#2d4553',cx-width*.25,cz-2,20,4,3,top+4,group);cup(cx+width*.38,cz,top,'#d8b68d',group);
    receptionCounters.push({bounds:[...bounds],group,topHeight:70});
  }
  function renderProp(prop){const b=prop.bounds;if(!b)return;const [x,z,r,bottom]=b,cx=(x+r)/2,cz=(z+bottom)/2,width=r-x,depth=bottom-z;
    if(prop.kind==='plant')return plant(cx,cz,Math.min(width,depth)/2);
    if(prop.kind==='reception-desk')return receptionDesk(b);
    if(prop.kind==='wall-utility'){box('#d9d8c6',cx,cz,width,depth,37,69);box('#506b78',x-.5,cz,1,depth-6,29,73);for(let i=0;i<4;i++){box('#94b1b3',x-1.2,z+9+i*12,.7,8,3,81);mesh('sphere','#c2ddbc',x-1.7,91,z+9+i*12,1,1,1);}return;}
    if(prop.kind==='feature-wall'){
      roomWalls.push(finishedWall(b,layout.ceilingHeight,prop.color));
      if(prop.label?.includes('\n')){const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#213e58';ctx.fillRect(0,0,512,256);ctx.strokeStyle='#88a5b7';ctx.lineWidth=6;ctx.strokeRect(5,5,502,246);ctx.textAlign='center';ctx.fillStyle='#f4ead4';ctx.font='bold 41px sans-serif';for(const [i,line]of prop.label.split('\n').entries())ctx.fillText(line,256,110+i*54);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const group=new T.Group();group.position.set(cx,layout.ceilingHeight*.49,bottom+.6);group.userData.dynamic=true;group.userData.requiredHeight=group.position.y+50;architecture.add(group);const face=mesh('plane','#ffffff',0,0,0,200,100,1,group);face.material=new T.MeshBasicMaterial({map:texture,toneMapped:false});face.userData.texture=texture;boards.push(group);}
      return;
    }
    if(prop.kind==='bookcase')return bookshelf(b,prop.height||82);
    if(prop.kind==='sofa')return sofa(b,prop.rotation||0);
    if(prop.kind==='coffee-table')return coffeeTable(b);
    if(prop.kind==='cafe-counter')return cafeCounter(b);
    if(prop.kind==='glass-panel'||prop.kind==='glass-door')return glassPanel(b,prop.kind==='glass-door');
    if(prop.kind==='wall-art')return referenceInterior?undefined:wallArt(b,prop.label);
    if(prop.kind==='whiteboard')return framedBoard(b,true);
    if(prop.kind==='cafe-table'){const radius=Math.min(width,depth)/2,group=verticalGroup();mesh('cylinder','#82765d',cx,13,cz,3,26,3,group);mesh('cylinder','#7e7361',cx,1.5,cz,radius*.5,3,radius*.5,group);mesh('cylinder','#c0a06a',cx,28,cz,radius,3,radius,group);mesh('cylinder','#e0c68e',cx,29.8,cz,radius*.94,.6,radius*.94,group);cup(cx+radius*.3,cz,30,'#eee1bf',group);return;}
    if(prop.kind==='cafe-chair'){const group=new T.Group();group.position.set(cx,0,cz);group.rotation.y=prop.rotation||0;group.scale.set(1.2,layout.staffScale||1,1.2);architecture.add(group);for(const sx of [-8,8])for(const sz of [-8,8])box('#9c8257',sx,sz,3,3,16,0,group);mesh('cylinder','#d8bd80',0,17,0,12,3,12,group);for(const sx of [-9,9])box('#ad8e5a',sx,-8,2,2,16,17,group);softBox('#d7bd82',0,-9,22,3,10,24,group);return;}
    if(prop.kind==='server-rack'){const group=verticalGroup();box('#425967',cx,cz-.5,width,depth-1,74,0,group);box('#293c49',cx,bottom-.5,width-5,1,68,3,group);for(let i=0;i<7;i++){box('#6b8087',cx,bottom-.1,width-8,.2,5,8+i*8,group);box('#a5c8bd',x+6,bottom-.1,2,.2,1,10+i*8,group);}return;}
    if(prop.kind==='water-cooler'){const group=verticalGroup();softBox('#d8dfd1',cx,cz-1,width,depth-2,31,0,group);mesh('cylinder','#91c2cb',cx,44,cz,Math.min(width,depth)*.35,23,Math.min(width,depth)*.35,group);box('#547d86',cx,bottom-1,width*.65,2,11,12,group);box('#a7bdb9',cx,bottom-.25,6,.5,2,21,group);return;}
    if(prop.kind==='empty-desk'){const group=verticalGroup();for(const sx of [x+6,r-6])for(const sz of [z+6,bottom-6])box('#64767b',sx,sz,4,4,26,0,group);softBox('#d8bc8b',cx,cz,width,depth,2,26,group);return;}
  }
  function disposeArchitecture(){architecture.traverse(object=>{const original=graphicsOriginals.get(object)||object;if(object.isInstancedMesh)object.dispose();if(original.geometry&&!Object.values(geometries).includes(original.geometry))original.geometry.dispose();if(object.userData.texture){object.userData.texture.dispose();disposeGraphicsMaterial(original.material);original.material.dispose();}});architecture.clear();monitors.clear();walls.length=0;roomWalls.length=0;glazings.length=0;boards.length=0;rugs.length=0;hallways.length=0;wayfinding.length=0;floorFinishes.length=0;receptionCounters.length=0;}
  function batchFurniture(){
    architecture.updateMatrixWorld(true);const batches=new Map();architecture.traverse(m=>{if(!m.isMesh||!Object.values(geometries).includes(m.geometry)||m.userData.texture)return;for(let p=m;p&&p!==architecture;p=p.parent)if(p.userData.dynamic)return;m.userData.graphicsRounded=m.geometry===geometries.box&&Math.min(m.scale.x,m.scale.y,m.scale.z)/Math.max(m.scale.x,m.scale.y,m.scale.z)>.05;const key=`${m.geometry.uuid}:${m.material.uuid}:${m.castShadow}:${m.userData.graphicsRounded}:${!!m.userData.graphicsInk}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);});
    for(const members of batches.values()){if(members.length<3)continue;const first=members[0],batch=new T.InstancedMesh(first.geometry,first.material,members.length);batch.userData.graphicsRounded=first.userData.graphicsRounded;batch.userData.graphicsInk=first.userData.graphicsInk;batch.castShadow=first.castShadow;batch.receiveShadow=true;for(const [i,m]of members.entries()){batch.setMatrixAt(i,m.matrixWorld);m.removeFromParent();}batch.instanceMatrix.needsUpdate=true;architecture.add(batch);}
  }
  function woodTexture(){const c=document.createElement('canvas');c.width=1024;c.height=768;const ctx=c.getContext('2d'),palette=['#d7bd95','#d0b18a','#ddc49f','#d2b68f','#dbc19c'];ctx.fillStyle='#a98c68';ctx.fillRect(0,0,1024,768);for(let row=0;row<24;row++){const y=row*32;for(let col=-1;col<6;col++){const x=col*224+(row%3)*74;ctx.save();ctx.beginPath();ctx.rect(x+1,y+1,222,30);ctx.clip();ctx.fillStyle=palette[((row*7+col+10)%5+5)%5];ctx.fillRect(x,y,224,32);for(let grain=0;grain<12;grain++){ctx.strokeStyle=grain%3?'#8c69451b':'#faf0cf24';ctx.lineWidth=.65;ctx.beginPath();for(let n=0;n<=8;n++){const px=x+n*32,py=y+3+grain*2.3+Math.sin(n*.8+row+grain)*.9;if(n)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.stroke();}ctx.restore();}}const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;}
  function windowAssembly(group,width=160){
    box('#ffffff',0,0,width,1,60,-30,group).material=surface('window','#ffffff');
    for(const x of [-width/2-2,width/2+2])box('#eae2ce',x,0,4,5,66,-33,group);
    for(const y of [-33,33])box('#ece4d0',0,0,width+8,5,4,y-2,group);
    box('#b8a285',0,0,width+15,12,4,-37,group);
  }
  function windowPanel(side,start,g){const group=new T.Group(),horizontal=side==='north'||side==='south',scale=(g.ceilingHeight||136)/136;group.userData.dynamic=true;group.position.set(horizontal?start:(side==='west'?35:g.width-35),(g.ceilingHeight||136)*.48,horizontal?(side==='north'?35:g.height-35):start);group.scale.y=scale;if(!horizontal)group.rotation.y=Math.PI/2;architecture.add(group);windowAssembly(group);return group;}
  const entranceColors={planner:'#608879',designer:'#9783ad',builder:'#608ca0',reviewer:'#ae8d61',security:'#638d89',qa:'#80966b',shared:'#7b9191',devops:'#6d829b',conference:'#ba9761'};
  function floorSign(label,x,y,width,depth,kind,roomId,rotation=0){
    const face=new T.Mesh(geometries.plane,plaqueMaterial(label));face.rotation.set(-Math.PI/2,0,rotation);face.position.set(x,2.8,y);face.scale.set(width,depth,1);face.castShadow=false;face.userData.dynamic=true;architecture.add(face);wayfinding.push({kind,roomId,label,mesh:face});
  }
  function hallwayFinish(corridor){
    const {x,y,width,height}=corridor,cx=x+width/2,cy=y+height/2,horizontal=width>height;
    for(const offset of [-1,1]){box('#b09b77',cx+(horizontal?0:offset*(width/2-6)),cy+(horizontal?offset*(height/2-6):0),horizontal?width-12:2,horizontal?2:height-12,.15,2.3);box('#fff0ce',cx+(horizontal?0:offset*(width/2-11)),cy+(horizontal?offset*(height/2-11):0),horizontal?width-22:1.5,horizontal?1.5:height-22,.15,2.4);}
  }
  function roomConstruction(room){
    const door=layout.doorways.find(d=>d.roomId===(room.roomId||room.role)),window=new T.Group(),windowSide=door?.side==='west'?'east':'west';
    window.position.set(room.x+(windowSide==='east'?room.width-6:6),(layout.ceilingHeight||176)*.49,room.y+room.height*.58);window.rotation.y=Math.PI/2;window.userData.dynamic=true;window.userData.vertical=true;window.userData.side=windowSide;architecture.add(window);windowAssembly(window,Math.min(170,room.height*.32));boards.push(window);
    if(!door)return;
    const vertical=door.side==='west'||door.side==='east',accent=entranceColors[door.roomId]||'#b99a6b',height=layout.ceilingHeight||176,header=new T.Group();header.position.set(door.center.x,0,door.center.y);header.rotation.y=vertical?Math.PI/2:0;header.userData.dynamic=true;header.userData.doorFrame=true;header.userData.side=door.side;header.userData.doorRoomId=door.roomId;architecture.add(header);
    // The open portal is exactly the gap in the authoritative collision wall.
    for(const side of [-1,1]){box('#8e704e',side*(door.width/2+3),0,6,12,height,0,header);box('#e8d6b2',side*(door.width/2+6),0,3,15,height,0,header);}
    box('#b99b6e',0,0,door.width+16,14,10,height-10,header);boards.push(header);
    box('#d6bd8c',door.center.x,door.center.y,vertical?8:door.width,vertical?door.width:8,.3,2);
    const outward={north:[0,-27],south:[0,27],west:[-27,0],east:[27,0]}[door.side],matX=door.center.x+outward[0],matY=door.center.y+outward[1];
    box(accent,matX,matY,vertical?32:door.width-10,vertical?door.width-10:32,.3,2.4);
    floorSign(room.name,matX,matY,door.width-20,21,'department',door.roomId,vertical?Math.PI/2:0);
  }
  function rebuild(g){
    disposeArchitecture();referenceInterior?.reset();layout=g;
    box('#8e785e',g.width/2,g.height/2,g.width-50,g.height-50,18,-18);box('#b8a082',g.width/2,g.height/2,g.width-50,g.height-50,4,-4);
    const wood=woodTexture(),floor=box('#d8c6a8',g.width/2,g.height/2,g.width-50,g.height-50,2,-1);floor.material=new T.MeshStandardMaterial({map:wood,roughness:.9});floor.material.userData.graphicsSurface={kind:'plank',color:'#d8c6a8'};floor.userData.texture=wood;
    // The furnished room bands mirror the reference instead of radial pods.
    const finishes={planner:['plank','#e7c48d'],designer:['plank','#ead3a9'],builder:['plank','#d5bf98'],reviewer:['plank','#e6c692'],security:['plank','#d5c5a4'],qa:['plank','#e0cda9'],shared:['plank','#d9c8aa']};
    const floorRoom=(room,kind,color)=>{
      if(!room)return;
      const width=room.width-2,depth=room.height-2,m=box(color,room.x+room.width/2,room.y+room.height/2,width,depth,.8,1.1),span=kind==='hall-tile'?240:600;
      // Each floor owns its UVs. Shared albedo maps keep identity repeat so a
      // long corridor cannot stretch the same tiles used by another room.
      m.geometry=geometries.box.clone();const uv=m.geometry.attributes.uv,normal=m.geometry.attributes.normal;
      for(let i=0;i<uv.count;i++)if(normal.getY(i)>.5)uv.setXY(i,uv.getX(i)*width/span,uv.getY(i)*depth/span);
      uv.needsUpdate=true;m.material=surface(kind,color);const texture=m.material.map;
      if(texture&&texture.wrapS!==1000){texture.wrapS=texture.wrapT=1000;texture.needsUpdate=true;} // RepeatWrapping in the pinned Three.js release.
      m.castShadow=false;floorFinishes.push({id:room.roomId||room.role||room.id||room.name,kind,mesh:m});return m;
    };
    for(const room of g.rooms.filter(r=>!r.annex)){const [kind,color]=finishes[room.role]||['tile','#d1ddd3'];floorRoom(room,kind,color);roomSign(room);}
    for(const corridor of g.corridors){const mesh=floorRoom(corridor,'hall-tile','#f2e0bf');mesh.userData.dynamic=true;hallways.push({id:corridor.id,mesh});hallwayFinish(corridor);}
    const main=g.corridors.find(c=>c.id==='main'),cross=g.corridors.find(c=>c.id==='cross');
    if(main&&cross)floorSign('WORK / MEETINGS',main.x+main.width/2,cross.y+cross.height/2,210,25,'junction');
    if(g.reception)floorSign('RECEPTION',(g.reception.deskBounds[0]+g.reception.deskBounds[2])/2,g.reception.deskBounds[3]+65,190,27,'reception');
    for(const [room,kind,color]of [[g.devops,'plank','#d1b58b'],[g.cafe,'plank','#e8c78c'],[g.conference,'plank','#e4c694'],[g.breakout,'plank','#dbc299']]){if(!room||room.annex)continue;floorRoom(room,kind,color);if(room.name)roomSign(room);}
    rugs.push('meeting','breakout');
    for(const segment of g.wallSegments){roomWalls.push({...finishedWall(segment.bounds,g.ceilingHeight||85),side:segment.side,roomId:segment.roomId});wallShade(segment.bounds);}
    for(const room of g.enclosures){roomConstruction(room);sconce(room);}
    for(const [side,b]of [['north',[25,25,g.width-25,34]],['south',[25,g.height-34,g.width-25,g.height-25]],['west',[25,25,34,g.height-25]],['east',[g.width-34,25,g.width-25,g.height-25]]]){const wall=finishedWall(b,g.ceilingHeight||85),windows=[];for(let n=110;n<(side==='north'||side==='south'?g.width:g.height)-90;n+=190)windows.push(windowPanel(side,n,g));walls.push({...wall,side,windows});}
    if(referenceInterior){referenceInterior.decorate(g);referenceInterior.setStyle(graphicsStyle);}else for(const room of g.rooms.filter(r=>!r.annex))framedBoard([room.x+room.width-205,room.y+12,room.x+room.width-55,room.y+16],room.role);
    for(const decoration of g.decorations||[])if(['plant','bookcase'].includes(decoration.kind))renderProp(decoration);
    for(const partition of g.partitions||[])glassPanel(Array.isArray(partition)?partition:partition.bounds,partition.kind==='glass-door');
    for(const prop of g.props||[])renderProp(prop);
    for(const s of g.stations){const {x,y:z}=s.desk;
      const scale=g.stationScale||1,station=new T.Group();station.position.set(x,0,z);station.scale.setScalar(scale);architecture.add(station);
      if(!s.reception){if(referenceInterior)referenceInterior.desk(s,station);else{contactShadow(station,75,65);
      for(const dx of [-23,23])for(const dz of [-15,15])box('#667780',dx,dz,3,3,25,0,station);
      softBox('#f0e6d2',-20,-1,10,28,21,3,station);
      for(const y of [7,14,21]){box('#f7eddb',-20,13.2,8,.7,5,y-2,station);box('#71858a',-20,13.8,3,.5,.7,y+.5,station);}
      softBox('#3c5563',22,-5,7,16,18,3,station);box('#7797a1',22,3.2,5,.4,1,17,station);
      for(const x of [20.5,22,23.5])box('#243c4b',x,3.3,.5,.3,6,7,station);
      softBox('#ab8d65',0,0,56,40,2,24,station);softBox('#f1dfbc',0,0,56,40,2,26,station);softBox('#bdc9c6',0,0,30,15,.35,28,station);inkEdge(0,0,55,39,28.3,station);
      // Stationery and a ceramic mug add scale without claiming any task work.
      box('#c7ad80',23,-13,8,10,.5,28,station);box('#f2ead5',23,-13,7,9,.5,28.5,station);box('#b88a68',20,-13,.7,9,.6,29,station);box('#708a8b',26,-13,.7,8,.7,29,station);cup(-23,-12,28,s.index%2?'#e3d2ad':'#bed0be',station);
      mesh('cylinder','#647b80',-24,34,-3,1,12,1,station);const shade=mesh('sphere','#e3c580',-22,40,-1,5,2.5,4,station);shade.rotation.z=.25;
      box('#d4ad78',-12,-16,11,5,1.4,28,station);box('#a9beb1',-12,-16,9,4,.4,29.4,station);}
      }
      const desktop=s.reception?70/scale:28,screenHeight=desktop+11;
      const yaw=Math.atan2(s.point.x-x,s.point.y-z),screen=new T.Group();screen.position.set(0,screenHeight,0);screen.rotation.y=yaw;station.add(screen);
      box('#66838c',0,0,28,3,18,-9,screen);box('#5b727a',0,0,3,3,7,-11,screen);box('#5b727a',0,0,12,8,1,-11,screen);
      const display=document.createElement('canvas');display.width=512;display.height=288;const texture=new T.CanvasTexture(display);texture.colorSpace=T.SRGBColorSpace;
      const face=new T.Mesh(geometries.plane,new T.MeshBasicMaterial({map:texture,toneMapped:false}));face.scale.set(24,14,1);face.position.z=1.6;face.userData.texture=texture;screen.add(face);
      mesh('sphere','#90cdbc',11,-7.5,1.6,.65,.65,.3,screen);
      const rearMark=mesh('ring','#bdd9cc',0,0,-1.6,2.1,2.1,.5,screen);rearMark.rotation.y=Math.PI;
      const keyboard=box('#b7c5c8',Math.sin(yaw)*14,Math.cos(yaw)*14,17,7,1,desktop,station);keyboard.rotation.y=yaw;
      for(let row=0;row<3;row++)box('#536b75',0,12+row*1.7,14,.5,.25,-9.9,screen);
      mesh('sphere','#c8d3d1',14,-9.7,8,2,1.3,3,screen);
      const monitor={screen,texture,display,lastText:'',key:s.key,role:s.role,index:s.index,reception:!!s.reception,desktopHeight:desktop*scale};monitors.set(s.key,monitor);updateMonitor(s.key,{status:'Idle',activity:'No active session',title:`Computer ${s.index+1}`});
      chair({x:(s.point.x-x)/scale,y:(s.point.y-z)/scale},{x:0,y:0},station);
    }
    for(const bounds of g.furniture.slice(0,2))cafeCounter(bounds);
    const table=g.conference.tableBounds||g.furniture[2], [mx,mz,mr,mb]=table,tw=mr-mx,td=mb-mz,tcx=(mx+mr)/2,tcz=(mz+mb)/2,meeting=verticalGroup(),meetingShade=contactShadow(meeting,tw+45,td+45);meetingShade.position.x=tcx;meetingShade.position.z=tcz;
    for(const dx of [-1,1])softBox('#eee7d8',tcx+dx*tw*.29,tcz,tw*.17,td*.68,25,0,meeting).material=surface('polymer','#eee7d8');
    softBox('#b09267',tcx,tcz,tw,td,2,25,meeting);softBox('#e1c58e',tcx,tcz,tw,td,2,27,meeting).material=surface('plank','#e1c58e');
    mesh('cylinder','#eee7d8',tcx,32,tcz,6,6,6,meeting).material=surface('polymer','#eee7d8');for(let i=0;i<5;i++){const a=i*Math.PI*2/5,leaf=mesh('sphere','#51864c',tcx+Math.sin(a)*4,38+i%2*2,tcz+Math.cos(a)*4,3.5,1.4,5.5,meeting);leaf.rotation.y=a;leaf.material=surface('leaf','#51864c');}
    for(const dx of [-1,1]){const px=tcx+dx*tw*.3,pz=tcz+td*.22;box('#b19673',px,pz,25,17,.5,29,meeting);box('#f0e8d8',px+.5,pz,23,15,.5,29.5,meeting);box('#729c9c',px-6,pz,1,13,.5,30,meeting);cup(tcx+dx*tw*.3,tcz-td*.28,29,'#efe7d5',meeting);}
    for(const seat of g.conferenceSeats)chair(seat.point,seat.target||g.conference.target,architecture,g.staffScale||1);
    // Foliage is authored by model props; no untracked corner pots are added here.
    sofa(g.breakout.sofa);coffeeTable(g.breakout.table);
    if(g.entrance){const mat=mesh('plane','#ffffff',g.entrance.x+g.entrance.width/2,2.1,g.height-80,110,25,1);mat.rotation.x=-Math.PI/2;mat.material=plaqueMaterial('Welcome');}
    for(const wall of [...walls,...roomWalls]){wall.mesh.userData.dynamic=true;wall.mesh.castShadow=false;}
    for(const board of boards){board.userData.dynamic=true;board.traverse(m=>{m.castShadow=false;});}
    for(const wall of walls)for(const window of wall.windows)window.traverse(m=>{m.castShadow=false;});
    batchFurniture();applyGraphicsTree(architecture);const radius=Math.max(g.width,g.height)*.7;Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:1,far:Math.max(5000,radius*4)});sun.target.position.set(g.width/2,0,g.height/2);sun.position.set(g.width/2-450,1600,g.height/2+300);sun.shadow.camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;dirty=true;
  }
  function updateMonitor(key,data){const m=monitors.get(key);if(!m)return;const lines=[data.title||'',data.activity||'',...(data.changes||[]).slice(0,3).map(c=>c.path||''),...(data.events||[]).slice(-2).map(e=>e.text||''),data.result||''].filter(Boolean).map(s=>String(s).slice(0,95)).slice(0,6),signature=JSON.stringify([data.status,lines]);if(signature===m.lastText)return;m.lastText=signature;
    const ctx=m.display.getContext('2d'),blue=ctx.createLinearGradient(0,0,0,288);blue.addColorStop(0,'#5cc6ec');blue.addColorStop(1,'#207fba');ctx.fillStyle=blue;ctx.fillRect(0,0,512,288);ctx.fillStyle='#c4eff6';ctx.fillRect(10,10,492,35);ctx.fillStyle='#e6f8f4';for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(21+i*12,27,3,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#20556f';ctx.font='bold 16px monospace';ctx.fillText(`${m.role.toUpperCase()} / ${m.index+1}`,65,32);ctx.fillStyle='#124f75cc';ctx.fillRect(12,53,488,222);ctx.strokeStyle='#a0dfed';ctx.lineWidth=2;ctx.strokeRect(12,53,488,222);ctx.font='bold 16px monospace';ctx.fillStyle='#bff4df';ctx.fillText(String(data.status||'Idle').toUpperCase().slice(0,32),24,78);ctx.fillStyle='#f4fcf9';ctx.font='17px monospace';for(const [i,line]of lines.entries())ctx.fillText(line.slice(0,44),24,109+i*26);m.texture.needsUpdate=true;dirty=true;
  }
  const point=new T.Vector3();
  function project(x,y,z=0){point.set(x,z,y).project(camera);return {x:(point.x+1)*projection.width/2,y:(1-point.y)*projection.height/2};}
  function monitorQuad(s){const monitor=monitors.get(s.key);return [[-12,7,1.8],[12,7,1.8],[12,-7,1.8],[-12,-7,1.8]].map(v=>{const p=monitor.screen.localToWorld(new T.Vector3(...v));return project(p.x,p.z,p.y);});}
  function configure(g,base,angle,elevation){
    const key=`${g.width}:${g.height}:${g.stationScale||1}:${g.staffScale||1}:${g.ceilingHeight||85}:${g.stations.map(s=>s.key).join(',')}:${g.conferenceSeats.length}`;if(key!==physicalKey){physicalKey=key;rebuild(g);}
    projection={width:base.width,height:base.height};camera.clearViewOffset();camera.aspect=base.width/base.height;camera.far=Math.hypot(g.width,g.height)*20;
    const radians=angle*Math.PI/180,pitch=elevation*Math.PI/180,dx=(Math.cos(radians)+Math.sin(radians))/Math.sqrt(2),dz=(Math.cos(radians)-Math.sin(radians))/Math.sqrt(2),cx=g.width/2,cz=g.height/2;
    // A near plane proportional to the fitted distance keeps thin plaques,
    // monitor faces and trim distinct in the depth buffer on larger floors.
    const position=distance=>{camera.near=Math.max(1,distance*.05);camera.position.set(cx+dx*Math.cos(pitch)*distance,Math.sin(pitch)*distance,cz+dz*Math.cos(pitch)*distance);camera.lookAt(cx,0,cz);camera.updateProjectionMatrix();camera.updateMatrixWorld();};
    const bounds=()=>{const points=[];for(const x of [25,g.width-25])for(const y of [25,g.height-25])for(const z of [-20,g.ceilingHeight||85])points.push(new T.Vector3(x,z,y).project(camera));return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.max(...points.map(p=>p.y)),bottom:Math.min(...points.map(p=>p.y)),visible:points.every(p=>p.z>-1&&p.z<1)};};
    let low=Math.hypot(g.width,g.height)*.6,high=Math.hypot(g.width,g.height)*8;
    for(let i=0;i<18;i++){position((low+high)/2);const b=bounds();if(b.visible&&b.right-b.left<1.86&&b.top-b.bottom<1.65)high=(low+high)/2;else low=(low+high)/2;}position(high);
    const frame=bounds();camera.setViewOffset(base.width,base.height,(frame.left+frame.right)*base.width/4,-(frame.top+frame.bottom)*base.height/4,base.width,base.height);camera.updateMatrixWorld();
    const cut=depth=>.15+.85*Math.max(0,Math.min(1,depth+.5));
    const sideDepth=side=>({north:dz,south:-dz,west:dx,east:-dx})[side];
    for(const wall of roomWalls){const factor=cut(sideDepth(wall.side)??(wall.vertical?dx:dz));sizeWall(wall,(g.ceilingHeight||85)*factor);}
    for(const glazing of glazings)glazing.group.scale.y=(glazing.facade?.75:cut(glazing.vertical?dx:dz))*(g.ceilingHeight||85)/85;
    for(const board of boards){const factor=cut(sideDepth(board.userData.side)??(board.userData.vertical?dx:dz));if(board.userData.doorFrame){board.scale.y=factor;board.visible=true;continue;}board.visible=factor>.7&&(!board.userData.requiredHeight||factor*g.ceilingHeight>=board.userData.requiredHeight);if(board.userData.followCap)board.position.y=board.userData.authoredY-(g.ceilingHeight||85)*(1-factor);}
    for(const wall of walls){const factor=cut(({north:dz,south:-dz,west:dx,east:-dx})[wall.side]),height=(g.ceilingHeight||85)*factor;sizeWall(wall,height);for(const window of wall.windows)window.visible=height>(g.ceilingHeight||85)*.76;}
    scene.updateMatrixWorld(true);dirty=true;
    return {...base,backend:'webgl',project,stations:g.stations.map(s=>{const quad=monitorQuad(s),m=monitors.get(s.key),position=m.screen.getWorldPosition(new T.Vector3()),screen=project(position.x,position.z,position.y),normal=new T.Vector3(0,0,1).transformDirection(m.screen.matrixWorld),toward=camera.position.clone().sub(position);return {...s,screen,screenQuad:quad,frontFacing:normal.dot(toward)>0};})};
  }
  function humanHead(body,profile,edition,skin,trait){
    if(referenceCast)return referenceCast.humanHead(body,profile,edition,skin,trait);
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
    if(referenceCast)return referenceCast.robotHead(body,profile,edition,trait);
    const design=cast[profile],head=new T.Group();head.position.y=50;head.scale.x=edition===2?.9:1;body.add(head);
    const detail=new T.Group();detail.scale.x=edition===1?-1:1;head.add(detail);let faceZ,faceWidth,faceHeight;
    if(profile===3){
      mesh('sphere','#f2eee4',0,0,0,13.5,11.5,10,head);mesh('rounded',design.trim,0,0,10,24,19,2,head);mesh('rounded','#263b48',0,0,11.2,20.5,15,1,head);faceZ=11.8;faceWidth=19;faceHeight=14;
      for(let i=0;i<3;i++)mesh('rounded',design.trim,-13.7,-3+i*3,0,1,1.2,8,detail);
      mesh('cylinder',design.trim,-9,14.5,-2,1,6,1,detail);mesh('sphere',design.main,-9,18.1,-2,1.7,1.7,1.7,detail);mesh('rounded',design.main,12,-5,-2,3,7,10,detail);mesh('rounded',design.main,0,1,-9.3,8,5,1,detail);
    }else if(profile===4){
      mesh('sphere','#f4f0e5',0,0,-1,14.7,11.5,11.5,head);mesh('rounded',design.dark,0,.2,11.7,23,15,2,head);faceZ=12.8;faceWidth=21;faceHeight=13;
      for(const side of [-1,1]){const pod=mesh('cylinder',side===-1?design.trim:design.dark,side*14,0,-1,side===-1?3.7:2.6,4,side===-1?3.7:2.6,detail);pod.rotation.z=Math.PI/2;}
      mesh('rounded',design.trim,4,11,-3,2,4,2,detail);mesh('ring',design.trim,4,14.8,-3,3.1,3.1,.8,detail);
    }else{
      mesh('sphere','#eae7df',0,1,0,14.5,12.5,10,head);mesh('rounded',design.trim,0,2,10.2,22,12,1.6,head);mesh('rounded',design.dark,0,2,11.1,20.5,10.5,1,head);faceZ=11.7;faceWidth=19;faceHeight=9.5;
      const fin=mesh('rounded',design.trim,12,10,-2,3,12,5,detail);fin.rotation.z=-.25;mesh('rounded',design.dark,-12,-3,-1,4,6,9,detail);mesh('rounded',design.main,0,2,-9.3,10,4,1,detail);
    }
    if(edition===3){mesh('rounded',design.trim,-6,8,-9,6,4,3,detail);mesh('rounded',design.trim,0,-10,1,16,3,11,detail);}
    if(edition===4){if(profile===4)mesh('ring',design.trim,-5,13,-3,3.5,3.5,.8,detail);else for(const side of [-1,1])mesh('rounded',design.trim,side*13,-2,0,4,8,10,detail);}
    const face=mesh('plane','#ffffff',0,profile===5?2:0,faceZ,faceWidth,faceHeight,1,head);face.material=characterFace(profile,trait);return head;
  }
  function characterClothes(body,profile,edition){if(referenceCast)return referenceCast.clothes(body,profile,edition);const d=cast[profile],robot=d.kind==='robot';let torso;
    if(profile===0||profile===3||profile===5)torso=mesh(profile===5?'wedge':'rounded',robot?'#ede9dd':d.main,0,30,0,profile===5?19:17,17,11,body);
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
  function makeWorker(actor){const root=new T.Group(),body=new T.Group();root.add(body);people.add(root);contactShadow(root);
    // Independent salted traits keep a person's species, face and clothing
    // stable as their real session moves between jobs and departments.
    const id=String(actor.data.id),profile=identityHash(id,'cast')%cast.length,edition=identityHash(id,'edition')%5,trait=identityHash(id,'face')%5,design={...cast[profile],...(referenceCast?.palette?.(profile)||{})},robot=design.kind==='robot',skinTones=Array.isArray(design.skinTones)&&design.skinTones.length===4?design.skinTones:['#dfb08d','#b67f5c','#edc6a0','#8c5e45'],skin=skinTones[identityHash(id,'skin')%4];
    const pelvis=mesh('sphere',design.dark,0,22,0,7.5,4.5,5,body),{torso,roleAccents,sleeveColor}=characterClothes(body,profile,edition);
    mesh('cylinder',robot?design.trim:skin,0,39,0,3,5,3,body);const hair=robot?robotHead(body,profile,edition,trait):humanHead(body,profile,edition,skin,trait);
    const limbs=[];for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*9.5,38,0);body.add(arm);const sleeve=mesh(robot?'rounded':'sphere',sleeveColor,0,-4,0,robot?5.8:profile===1?3.8:3.2,robot?8:5,robot?6:3.5,arm);mesh('cylinder',design.trim,0,-8,0,3,1.5,3,arm);const forearm=new T.Group();forearm.position.y=-9;arm.add(forearm);mesh(robot?'rounded':'sphere',robot?design.main:skin,0,-3,0,robot?4.6:2.4,robot?6.5:3.8,robot?4.8:2.5,forearm);mesh('sphere',robot?design.trim:skin,0,-8,0,2.8,3,2.6,forearm);if(robot)mesh('sphere',design.dark,0,0,0,2.8,2.8,2.8,forearm);const leg=new T.Group();leg.position.set(side*4.4,21,0);body.add(leg);mesh('sphere',design.dark,0,-5,0,profile===2?3.7:3.2,5.6,3.6,leg);const knee=new T.Group();knee.position.y=-10;leg.add(knee);mesh(robot?'rounded':'sphere',robot?design.main:design.dark,0,-4.8,0,robot?5.6:3,robot?9:5.3,robot?6:3.4,knee);softBox(design.trim,0,2,profile===2?8.2:7.5,10,1.8,-10.6,knee);softBox(design.dark,0,1,profile===2?8:7,9,3.2,-9.2,knee);softBox(robot?design.trim:'#eadcc1',0,3,4,4,.6,-6,knee);limbs.push({arm,forearm,leg,knee,side});}
    const selection=new T.Mesh(new T.TorusGeometry(18,1.3,5,32),new T.MeshBasicMaterial({color:'#e4bb78'}));selection.rotation.x=Math.PI/2;selection.position.y=1;root.add(selection);root.scale.setScalar(layout.staffScale||1);
    root.traverse(m=>{m.castShadow=false;});const value={root,body,pelvis,torso,hair,limbs,roleAccents,selection,appearance:{profile:design.name,kind:design.kind,edition,face:trait},visualKind:'native',frame:null,direction:null,motion:false,workingPose:false,animationPhase:identityHash(id,'illustration-phase')%4600,gait:[.95,1.1,.85,.75,.9,1.05][profile],last:{x:actor.position.x,y:actor.position.y},pose:'standing'};workers.set(actor.data.id,value);applyWorkerGraphics(value);dirty=true;return value;
  }
  function syncActors(actors,selected,now,motion){if(!active||!layout||contextLost)return;const ids=new Set();let animating=false;
    for(const a of actors.values()){ids.add(a.data.id);const worker=workers.get(a.data.id)||makeWorker(a),dx=a.position.x-worker.last.x,dz=a.position.y-worker.last.y,moving=Math.hypot(dx,dz)>.01,seated=a.element.classList.contains('at-desk')||a.element.classList.contains('at-conference-seat');
      if(moving){worker.root.rotation.y=Math.atan2(dx,dz);dirty=true;}else if(seated){const target=a.data.conferenceSeat?(a.data.conferenceSeat.target||layout.conference.target):a.data.station.desk;worker.root.rotation.y=Math.atan2(target.x-a.position.x,target.y-a.position.y);}
      worker.root.position.set(a.position.x,0,a.position.y);worker.root.scale.setScalar(layout.staffScale||1);worker.last={...a.position};worker.pose=seated?'seated':moving?'walking':'standing';worker.selection.visible=a.data.id===selected;
      worker.body.position.y=seated?-9:0;
      worker.body.position.z=seated?6:0;
      const color=colors[window.OfficeWorld.roles.indexOf(a.data.role)]||'#7995a3';if(worker.roleColor!==color){worker.roleColor=color;for(const accent of worker.roleAccents){const original=graphicsOriginals.get(accent);original.material=material(color);accent.material=graphicsMaterial(original.material);}}
      const workingPose=a.data.working&&['coding','command','tool','reviewing','testing','designing','auditing'].includes(a.data.action);
      worker.motion=!!motion;worker.workingPose=!!workingPose;
      for(const {arm,forearm,leg,knee,side}of worker.limbs){const stride=moving&&motion?Math.sin(now*.009*worker.gait)*.55*side:0;arm.rotation.x=seated?-1.25+(motion&&workingPose?Math.sin(now*.012+side)*.07:0):-stride;forearm.rotation.x=seated?-.4:0;leg.rotation.x=seated?-Math.PI/2:stride;knee.rotation.x=seated?Math.PI/2:0;}
      const state=`${a.position.x}:${a.position.y}:${worker.root.rotation.y}:${worker.pose}:${selected===a.data.id}:${color}`;if(state!==worker.state){worker.state=state;dirty=true;}
      if(moving||seated&&motion&&workingPose)animating=true;
    }
    for(const [id,w]of workers)if(!ids.has(id)){people.remove(w.root);w.selection.geometry.dispose();w.selection.material.dispose();w.illustration?.geometry.dispose();workers.delete(id);dirty=true;}
    render(now,animating);
  }
  function resize(){const width=Math.max(1,Math.round(world.clientWidth)),height=Math.max(1,Math.round(world.clientHeight)),zoom=Number(world.style.getPropertyValue('--camera-scale'))||1,normalRatio=Math.min(3,Math.sqrt(8000000/(width*height)),Math.max(1,devicePixelRatio||1)*zoom),ratio=graphicsStyle==='pixel'?Math.min(normalRatio,1/(2*Math.max(1,zoom))):normalRatio,key=`${width}:${height}:${ratio}`;if(lastSize!==key){renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);lastSize=key;dirty=true;}}
  function render(now=performance.now(),animating=false){if(!active||contextLost||document.hidden||!projection)return;resize();updateIllustratedWorkers(now);if((dirty||animating)&&now-lastRender>40){if(renderArt){try{renderArt.render(scene,camera,graphicsStyle);}catch(error){renderArtError=String(error?.message||error);renderArt.dispose();renderArt=null;renderer.render(scene,camera);}}else renderer.render(scene,camera);dirty=false;lastRender=now;renderedFrames++;}}
  function setActive(value){active=!!value&&!contextLost;canvas.hidden=!active;world.classList.toggle('webgl-office',active);world.dataset.renderer=active?'webgl':'svg';dirty=true;}
  // These kits replace visible models; physical routes and monitor anchors stay
  // in the host. A missing module leaves a functional, explicitly reported fallback.
  try{referenceInterior=window.OfficeReferenceInterior?.create({T,architecture,geometries,materials,boards,box,softBox,mesh,surface,material,contactShadow,cup,getLayout:()=>layout})||null;}catch(error){referenceKitErrors.push(String(error?.message||error).slice(0,1024));}
  try{referenceCast=window.OfficeReferenceCast?.create({T,mesh,box,softBox,material,surface,characterFace,geometries,materials,cast})||null;}catch(error){referenceKitErrors.push(String(error?.message||error).slice(0,1024));}
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;disposeCastAssets();disposeGraphics();setActive(false);window.dispatchEvent(new Event('office3dfallback'));});
  window.addEventListener('pagehide',event=>{if(!event.persisted){disposeCastAssets();disposeGraphics();}});
  // A refresh recreates GPU resources after context loss; the observed office remains usable in SVG.
  new ResizeObserver(()=>{dirty=true;resize();}).observe(world);
  function graphicsDiagnostics(){
    const faceted=new Set(graphicsGeometries.values());let geometryVariantMeshes=0,softFurnitureMeshes=0,texturedSurfaceMeshes=0,matteSurfaceMeshes=0;
    architecture.traverse(object=>{if(!object.isMesh)return;const original=graphicsOriginals.get(object);if(faceted.has(object.geometry))geometryVariantMeshes++;if(original&&object.userData.graphicsRounded&&object.geometry===geometries.rounded&&original.geometry!==object.geometry)softFurnitureMeshes++;if(original?.material.userData.graphicsSurface){if(object.material.map)texturedSurfaceMeshes++;else matteSurfaceMeshes++;}});
    return {renderArt:renderArt?renderArt.diagnostics():{supported:false,active:false,reason:renderArtError||'helper-unavailable'},atlas:'assets/office-surfaces-v2.png',surfaceState,employees:graphicsStyle==='low-poly'?'faceted':graphicsStyle==='polished'?'volumetric':'illustrated',finish:graphicsStyle==='low-poly'?'matte':graphicsStyle==='polished'?'soft':graphicsStyle==='pixel'?'pixel':'painted',pixelated:graphicsStyle==='pixel',buffer:{width:canvas.width,height:canvas.height,pixelRatio:renderer.getPixelRatio()},materialVariants:[...graphicsMaterials.values()].reduce((n,v)=>n+v.size,0),polishedSurfaceMaps:polishedTextures.size,resourceMaterials:{atlas:'assets/reference-resources-v1/materials.png',state:resourceMaterialState,loaded:resourceMaterialState==='ready',maps:polishedTextures.size,kinds:[...polishedTextures.keys()]},geometryVariants:graphicsGeometries.size,geometryVariantMeshes,softFurnitureMeshes,texturedSurfaceMeshes,matteSurfaceMeshes,lighting:{hemisphere:hemisphere.intensity,sun:sun.intensity,fill:fill.intensity},interior:{floors:floorFinishes.map(({id,kind,mesh})=>({id,kind,textured:!!mesh.material.map,color:mesh.material.color.getHexString()})),reception:receptionCounters.map(({bounds})=>({bounds:[...bounds]})),frontage:glazings.filter(g=>g.facade).map(g=>({bounds:[...g.bounds]})),sconces:boards.filter(b=>b.userData.sconce).length},spriteFilters:Object.fromEntries([...castAssets].filter(([,a])=>a.texture).map(([id,a])=>[id,{mag:a.texture.magFilter,min:a.texture.minFilter}]))};
  }
  function workerDiagnostics(id,w){let nativeMeshCount=0,facetedMeshCount=0;const faceted=new Set(graphicsGeometries.values());w.body.traverse(object=>{if(object.isMesh){nativeMeshCount++;if(w.body.visible&&faceted.has(object.geometry))facetedMeshCount++;}});return {id,pose:w.pose,x:w.root.position.x,y:w.root.position.z,height:w.body.position.y,appearance:{...w.appearance},visualKind:w.visualKind,geometryStyle:w.body.visible?(graphicsStyle==='low-poly'?'faceted':'sculpted'):'illustrated',bodyVisible:w.body.visible,illustrationVisible:!!w.illustration?.visible,nativeMeshCount,facetedMeshCount,frame:w.frame,direction:w.direction,motion:w.motion,workingPose:w.workingPose};}
  function diagnostics(){
    const assets=[...castAssets.values()],ready=assets.filter(a=>a.state==='ready').length,loading=assets.some(a=>a.state==='loading'),sceneRender=renderArt?.diagnostics().sceneRender||renderer.info.render;
    return {available:true,active,backend:active?'webgl':'svg',contextLost,surfaces:surfaceState,graphicsStyle,graphicsTraits:{employees:graphicsStyle==='polished'||graphicsStyle==='low-poly'?'volumetric':'illustrated',finish:graphicsStyle==='low-poly'?'faceted':graphicsStyle==='polished'?'soft':graphicsStyle==='pixel'?'pixel':'painted'},graphics:graphicsDiagnostics(),castAssets:{state:loading?'loading':ready===cast.length?'illustrated':ready?'mixed':'fallback',manifest:castManifestState,textureCount:assets.filter(a=>a.texture).length,profiles:Object.fromEntries([...castAssets].map(([id,a])=>[id,{state:a.state,frameCount:a.frames?.size||0}]))},triangles:sceneRender.triangles,drawCalls:sceneRender.calls,renderedFrames,wallCount:roomWalls.length,circulation:{wayfinding:wayfinding.map(({kind,roomId,label,mesh})=>({kind,roomId,label,x:mesh.position.x,y:mesh.position.z,width:mesh.scale.x,depth:mesh.scale.y})),hallways:hallways.map(({id,mesh})=>({id,x:mesh.position.x,y:mesh.position.z,width:mesh.scale.x,height:mesh.scale.z})),doors:boards.filter(b=>b.userData.doorRoomId).map(b=>({roomId:b.userData.doorRoomId,side:b.userData.side,x:b.position.x,y:b.position.z})),walls:roomWalls.filter(w=>w.roomId).map(w=>({roomId:w.roomId,side:w.side,height:w.mesh.scale.y}))},perimeter:walls.map(w=>({side:w.side,height:w.mesh.scale.y})),rugs:[...rugs],stations:[...monitors.keys()],actors:[...workers].map(([id,w])=>workerDiagnostics(id,w)),camera:{type:camera.type,fov:camera.fov,x:camera.position.x,y:camera.position.y,z:camera.position.z},memory:{...renderer.info.memory}};
  }
  function getPortrait(id){const design=cast[identityHash(String(id),'cast')%cast.length],asset=castAssets.get(design.name),frame=asset?.frames?.get('front-right:idle');return asset?.state==='ready'&&frame?{profile:design.name,kind:design.kind,image:asset.texture.image,rect:[...frame.rect]}:null;}
  function referenceKitDiagnostics(){return {version:1,interior:referenceInterior?.diagnostics()||null,cast:referenceCast?.diagnostics()||null,errors:[...referenceKitErrors]};}
  return {available:true,configure,setActive,syncActors,updateMonitor,render,diagnostics,referenceKitDiagnostics,getPortrait,setGraphicsStyle,getGraphicsStyle:()=>graphicsStyle};
})();
