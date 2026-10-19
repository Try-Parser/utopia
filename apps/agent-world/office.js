/* Autonomous office renderer; observing never starts a task or another provider. */
window.OfficeWorldView=(()=>{
  'use strict';
  const O=window.OfficeWorld,M=window.OfficeGameModel,$=id=>document.getElementById(id);
  const actors=new Map(),packets=new Map(),seen=new Set(),routeQueue=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const viewportBubbles=typeof HTMLElement.prototype.showPopover==='function'&&typeof HTMLElement.prototype.hidePopover==='function';
  let view='isometric',angle=0,cameraElevation=Math.asin(1/Math.sqrt(3))*180/Math.PI,mode='',selected=null,selectedPinned=false,last=performance.now(),lastStage=null,sequence=0,paused=false,transcriptGeneration=0;
  let graphicsStyle='illustrated';
  let motionOverride=null,workstations=[],geometry=O.layout(),geometryKey='',physicalGeometryKey='',sceneGeometry=O.sceneLayout(geometry),sceneWithOccupants=null;
  const svg=document.querySelector('svg.office'),original=document.createElementNS('http://www.w3.org/2000/svg','g');
  for(const child of [...svg.children])if(child.tagName.toLowerCase()!=='defs')original.append(child);
  svg.append(original);
  const scene=document.createElementNS('http://www.w3.org/2000/svg','g');svg.append(scene);
  const links=document.createElementNS('http://www.w3.org/2000/svg','svg');links.id='office-links';links.setAttribute('aria-hidden','true');$('world').append(links);
  const helpLinks=new Map();
  window.addEventListener('office3dfallback',()=>{geometryKey='';});
  function shape(tag,attributes,parent=scene,text) {const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attributes))n.setAttribute(key,String(value));if(text!==undefined)n.textContent=text;parent.append(n);return n;}
  const amenities=g=>[['devops','D'],['cafe','C'],['breakout','L'],['conference','M'],['entrance','E']].filter(([key])=>g[key]&&!g[key].annex).map(([key,number])=>({...g[key],name:g[key].name||({breakout:'Lounge',conference:'Conference'})[key],role:key,number}));
  const doorVertical=d=>d.side==='west'||d.side==='east';
  const doorLanding=(d,distance=27)=>({x:d.center.x+(d.side==='west'?-distance:d.side==='east'?distance:0),y:d.center.y+(d.side==='north'?-distance:d.side==='south'?distance:0)});
  const doorBounds=(d,thickness=8)=>doorVertical(d)?[d.center.x-thickness/2,d.center.y-d.width/2,d.center.x+thickness/2,d.center.y+d.width/2]:[d.center.x-d.width/2,d.center.y-thickness/2,d.center.x+d.width/2,d.center.y+thickness/2];
  function paint3DLabels(){
    scene.replaceChildren();const g=geometry,P=sceneGeometry.project,unit=Math.min(sceneGeometry.width/1440,sceneGeometry.height/1050);
    for(const room of [...g.rooms.filter(r=>r.role!=='shared'),...amenities(g)]){
      const points=[[room.x+room.width/2,room.y+20],[room.x+room.width/2,room.y+room.height-20],[room.x+20,room.y+room.height/2],[room.x+room.width-20,room.y+room.height/2]].map(([x,y])=>P(x,y,(g.ceilingHeight||85)-30)).sort((a,b)=>a.y-b.y),p=points[0],group=shape('g',{'data-room-sign':room.name});
      group.setAttribute('transform',`translate(${p.x} ${p.y}) scale(${unit})`);
      const number=room.number||String(O.roles.indexOf(room.role)+1).padStart(2,'0'),width=Math.max(112,room.name.length*6.7+44),left=-width/2,accent=room.color||'#b6c8b4';
      // Native 3D room signs provide the artwork; retain accessible/protected
      // anchors for the DOM overlay without drawing a duplicate floating sign.
      group.setAttribute('opacity','0');shape('title',{},group,room.name);
      shape('rect',{x:left,y:-23,width,height:25,rx:7,fill:'#233c47',stroke:'#abc1b4','stroke-width':.8},group);
      shape('rect',{x:left+4,y:-19,width:22,height:17,rx:4,fill:accent},group);
      shape('text',{x:left+15,y:-7,'text-anchor':'middle',fill:'#29424b','font-size':8,'font-weight':800},group,number);
      shape('text',{x:left+33,y:-6,fill:'#f5f1e6','font-size':11,'font-weight':650},group,room.name);
      if(room.role==='conference')group.id='elastic-conference-room';
    }
    for(const s of sceneGeometry.stations){const group=shape('g',{'data-workstation':s.key});shape('title',{},group,`COMPUTER ${s.index+1}`);
      shape('polygon',{points:s.screenQuad.map(p=>`${p.x},${p.y}`).join(' '),fill:'none',class:'monitor-interior'},group);
      const p=P(s.desk.x,s.desk.y+22,29);shape('text',{x:p.x,y:p.y,'font-size':7*unit,fill:'#405a65','text-anchor':'middle',class:'station-number'},group,`#${s.index+1}`);
    }
    for(const [name,room]of [['meeting',g.conference],['breakout',g.breakout]]){const p=P(room.x+room.width/2,room.y+room.height-20,4);shape('text',{x:p.x,y:p.y,'text-anchor':'middle','font-size':14*unit,fill:'none','data-conference-rug':name},scene,name.toUpperCase());}
    const shared=g.rooms.find(r=>r.role==='shared'),p=P(shared.x+shared.width/2,shared.y+shared.height/2,3),group=shape('g',{'data-department':'shared'});shape('text',{x:p.x,y:p.y,'text-anchor':'middle','font-size':10*unit,fill:'none','data-shared-label':'true'},group,'SHARED WORKSPACE · ROLE PENDING');
  }
  function paintOffice() {
    if(sceneGeometry.backend==='webgl'){paint3DLabels();return;}
    scene.replaceChildren();const g=geometry,v=sceneGeometry,h=g.height,w=g.width;
    const P=(x,y,z=0)=>v.project(x,y,z),polygon=(points,attrs,parent=scene)=>shape('polygon',{points:points.map(p=>`${p.x},${p.y}`).join(' '),...attrs},parent);
    const floor=(bounds,attrs,parent=scene)=>{const [x,y,r,b]=bounds;return polygon([P(x,y),P(r,y),P(r,b),P(x,b)],attrs,parent);};
    const line=(a,b,attrs,parent=scene)=>shape('path',{d:`M${a.x} ${a.y}L${b.x} ${b.y}`,...attrs},parent);
    const box=(bounds,z,colors,parent=scene,base=0)=>{const [x,y,r,b]=bounds,top=[P(x,y,z),P(r,y,z),P(r,b,z),P(x,b,z)],bottom=[P(x,y,base),P(r,y,base),P(r,b,base),P(x,b,base)],centerX=top.reduce((sum,p)=>sum+p.x,0)/4;
      const edges={north:[0,1],east:[1,2],south:[2,3],west:[3,0]};
      for(const side of v.visibleFaces(bounds)){const [a,c]=edges[side],shade=(top[a].x+top[c].x)/2<centerX?colors[1]:colors[2];polygon([top[a],top[c],bottom[c],bottom[a]],{fill:shade},parent);}
      polygon(top,{fill:colors[0],stroke:colors[3]||colors[0],'stroke-width':.8},parent);
    };
    shape('rect',{width:v.width,height:v.height,fill:'#263744'});
    const platform=[25,25,w-25,h-25];floor([35,48,w-8,h-5],{fill:'#101f29',opacity:.5});
    box(platform,0,['#c9b89e','#8d7d66','#a69780'],scene,-16);
    floor(platform,{fill:'#d8c6aa'});
    // Individual parquet strips establish a physical interior rather than diagram cards.
    for(let y=25;y<h-25;y+=38){for(let x=25+(Math.floor(y/38)%2)*76;x<w-25;x+=152){
      const r=Math.min(x+151,w-25),b=Math.min(y+37,h-25);if(r>x)floor([x,y,r,b],{fill:((Math.floor(x/152)+Math.floor(y/38))%3===0)?'#d1bda0':'#dfccb0',stroke:'#c5b092','stroke-width':.7});
    }}
    floor(platform,{fill:'none',stroke:'#f0dfc3','stroke-width':2,'data-platform-edge':'true'});
    const carpets=['#e7c48d','#ead3a9','#d5bf98','#e6c692','#e0cda9','#d5c5a4'];
    const accents=['#335b4d','#66517e','#3e607b','#735b3b','#306760','#7b4951'];
    for(const corridor of g.corridors){const {x,y,width,height}=corridor;floor([x,y,x+width,y+height],{fill:'#ead8b9',stroke:'#c4ac87','stroke-width':1,'data-corridor':corridor.id});floor([x+2,y+2,x+width-2,y+height-2],{fill:'#cbb491'});floor([x+6,y+6,x+width-6,y+height-6],{fill:'#f2e0bf'});const horizontal=width>height;for(const offset of [16,(horizontal?height:width)-16])line(P(x+(horizontal?16:offset),y+(horizontal?offset:16)),P(x+(horizontal?width-16:offset),y+(horizontal?offset:height-16)),{stroke:'#f4ebd7','stroke-width':1.5});}
    for(const room of amenities(g).filter(r=>r.role!=='entrance'))floor([room.x,room.y,room.x+room.width,room.y+room.height],{fill:room.role==='cafe'?'#d6b47c':room.role==='breakout'?'#c9c5b2':'#aab7b1',stroke:'#a28f73','stroke-width':1,'data-amenity':room.role});
    for(const room of g.rooms.filter(r=>!r.annex)){const shared=room.role==='shared',group=shape('g',{'data-department':room.role});shape('title',{},group,shared?'Shared workspace / role not yet verified':`${room.name} department / aligned computer workspaces`);
      floor([room.x,room.y+(shared?0:42),room.x+room.width,room.y+room.height],{fill:shared?'#d9c8aa':carpets[O.roles.indexOf(room.role)],stroke:'#6c7e83','stroke-width':1},group);
      for(let y=room.y+(shared?8:53);y<room.y+room.height;y+=17)line(P(room.x+8,y),P(room.x+room.width-8,y),{stroke:'#ffffff',opacity:.055,'stroke-width':2},group);
    }
    // Flush workstation mats distinguish the aligned desks without ring diagrams.
    for(const room of g.rooms.filter(r=>r.role!=='shared')){const accent=accents[O.roles.indexOf(room.role)];
      const group=shape('g',{'data-room-inlays':room.role,'aria-hidden':'true'});
      for(const station of g.stations.filter(s=>s.role===room.role)){const {x,y}=station.desk;floor([x-36,y-25,x+36,y+76],{fill:accent,opacity:.08},group);}
    }
    for(const door of g.doorways)floor(doorBounds(door),{fill:'#c4a777','data-room-door':door.roomId,'data-door-side':door.side});
    const c=g.conference;floor([c.x,c.y,c.x+c.width,c.y+c.height],{fill:'#b0ada3',stroke:'#788c92','stroke-width':1,id:'elastic-conference-room','aria-label':`Conference room with ${g.conferenceSeats.length} seats`});
    floor([c.x+15,c.y+40,c.x+c.width-15,c.y+c.height-15],{fill:'#7c9290',stroke:'#d6c6a5','stroke-width':3,'data-conference-rug':'meeting'});
    if(!g.breakout.annex){floor([g.breakout.x,g.breakout.y,g.breakout.x+g.breakout.width,g.breakout.y+g.breakout.height],{fill:'#d9c49f',stroke:'#c9bda5','stroke-width':2,'data-conference-rug':'breakout'});}
    const exit=g.entrance?.point||{x:w/2,y:h-32},exitMark=P(exit.x,exit.y,0);shape('text',{x:exitMark.x,y:exitMark.y,fill:'#314f59','font-size':16,'font-weight':800,'text-anchor':'middle','data-office-exit':'true'},scene,'WELCOME');
    const entranceColors={planner:'#608879',designer:'#9783ad',builder:'#608ca0',reviewer:'#ae8d61',security:'#638d89',qa:'#80966b',shared:'#7b9191',devops:'#6d829b',conference:'#ba9761'};
    const floorLabel=(label,x,y,width,depth,kind,roomId,vertical=false)=>{floor(vertical?[x-depth/2,y-width/2,x+depth/2,y+width/2]:[x-width/2,y-depth/2,x+width/2,y+depth/2],{fill:'#203b50',stroke:'#ae9c72','stroke-width':.8});const p=P(x,y,.1),u=P(x+(vertical?0:1),y+(vertical?1:0),.1),v=P(x+(vertical?-1:0),y+(vertical?0:1),.1);shape('text',{transform:`matrix(${u.x-p.x} ${u.y-p.y} ${v.x-p.x} ${v.y-p.y} ${p.x} ${p.y})`,x:0,y:0,'text-anchor':'middle','dominant-baseline':'central','font-size':Math.min(12,width/(label.length*.66)),'font-weight':700,fill:'#fff6dd','data-wayfinding':kind,'data-wayfinding-room':roomId||''},scene,label);};
    for(const door of g.doorways){const room=g.enclosures.find(r=>r.roomId===door.roomId),p=doorLanding(door),vertical=doorVertical(door);floor(vertical?[p.x-16,p.y-door.width/2+5,p.x+16,p.y+door.width/2-5]:[p.x-door.width/2+5,p.y-16,p.x+door.width/2-5,p.y+16],{fill:entranceColors[door.roomId],'data-entrance-mat':door.roomId});floorLabel(room.name,p.x,p.y,door.width-20,21,'department',door.roomId,vertical);}
    const main=g.corridors.find(c=>c.id==='main'),cross=g.corridors.find(c=>c.id==='cross');if(main&&cross)floorLabel('WORK / MEETINGS',main.x+main.width/2,cross.y+cross.height/2,210,25,'junction');if(g.reception)floorLabel('RECEPTION',(g.reception.deskBounds[0]+g.reception.deskBounds[2])/2,g.reception.deskBounds[3]+65,190,27,'reception');
    const objects=[];const object=(bounds,draw)=>objects.push({depth:P((bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2).y,draw});
    // Keep every physical wall present. Near walls lower into a cutaway instead of vanishing mid-orbit.
    const backNorth=P(w/2,25).y<=P(w/2,h-25).y,radians=angle*Math.PI/180,northDepth=Math.cos(radians)-Math.sin(radians),westDepth=Math.cos(radians)+Math.sin(radians);
    const cutaway=(depth,low,high)=>low+(high-low)*Math.max(0,Math.min(1,depth+.5));
    for(const segment of g.wallSegments){const bounds=segment.bounds,depth=({north:northDepth,south:-northDepth,west:westDepth,east:-westDepth})[segment.side],height=cutaway(depth,10,32);object(bounds,()=>{const wall=shape('g',{'data-room-wall':segment.side,'data-wall-room':segment.roomId,'data-wall-height':height.toFixed(1)});box(bounds,height,['#e4e8df','#a7b9b7','#bcc9c4'],wall);});}
    for(const door of g.doorways){const x=door.center.x,y=door.center.y,half=door.width/2,vertical=doorVertical(door),height=cutaway(({north:northDepth,south:-northDepth,west:westDepth,east:-westDepth})[door.side],10,32),accent=entranceColors[door.roomId];object(doorBounds(door,10),()=>{const frame=shape('g',{'data-entrance-frame':door.roomId});for(const side of [-1,1])box(vertical?[x-5,y+side*(half+3)-3,x+5,y+side*(half+3)+3]:[x+side*(half+3)-3,y-5,x+side*(half+3)+3,y+5],height,[accent,accent,accent],frame);if(view!=='top-down')box(doorBounds(door,10),height,[accent,accent,accent],frame,Math.max(0,height-3));});}
    const outerWalls=[
      {side:'north',bounds:[25,25,w-25,34],depth:northDepth,inside:34},
      {side:'south',bounds:[25,h-34,w-25,h-25],depth:-northDepth,inside:h-34},
      {side:'west',bounds:[25,25,34,h-25],depth:westDepth,inside:34},
      {side:'east',bounds:[w-34,25,w-25,h-25],depth:-westDepth,inside:w-34}
    ];
    for(const {side,bounds,depth,inside} of outerWalls){const height=cutaway(depth,9,58),horizontal=side==='north'||side==='south';object(bounds,()=>{const wall=shape('g',{'data-outer-wall':side,'data-wall-height':height.toFixed(1)});box(bounds,height,['#e5e9df','#bbc9c6','#97abae'],wall);
      if(view==='top-down'||height<35)return;
      const top=Math.min(45,height-8),bottom=Math.max(10,top-25),face={north:'south',south:'north',west:'east',east:'west'}[side];
      if(horizontal)for(let x=100;x<w-100;x+=180){polygon([P(x,inside,top),P(x+100,inside,top),P(x+100,inside,bottom),P(x,inside,bottom)],{fill:'#93c3d0',stroke:'#648e9c','stroke-width':2,'data-window-face':face},wall);line(P(x+50,inside,top),P(x+50,inside,bottom),{stroke:'#d5eced','stroke-width':2},wall);}
      else for(let y=110;y<h-100;y+=180){polygon([P(inside,y,top),P(inside,y+100,top),P(inside,y+100,bottom),P(inside,y,bottom)],{fill:'#93c3d0',stroke:'#648e9c','stroke-width':2,'data-window-face':face},wall);line(P(inside,y+50,top),P(inside,y+50,bottom),{stroke:'#d5eced','stroke-width':2},wall);}
    });}
    for(const station of g.stations){const {x,y}=station.desk,p=station.point,bounds=[x-28,y-20,x+28,y+20],k=g.stationScale||1,lift=station.reception?70/k-29:0,anchor=P(x,y),scaledAt=point=>`translate(${point.x*(1-k)} ${point.y*(1-k)}) scale(${k})`;
      object(station.deskBounds,()=>{const group=shape('g',{'data-workstation':station.key,transform:scaledAt(anchor)});shape('title',{},group,`${station.role==='shared'?'SHARED ':''}COMPUTER ${station.index+1}`);
        if(!station.reception){floor([x-25,y-15,x+36,y+29],{fill:'#33464c',opacity:.2},group);
        for(const [lx,ly]of [[x-24,y-15],[x+20,y-15],[x-24,y+12],[x+20,y+12]])box([lx,ly,lx+4,ly+4],25,['#677780','#3b4c56','#52616b'],group);
        box(bounds,29,['#f1e1c9','#bb9d7b','#d1b48f'],group,25);}
        const screen=P(x,y,45+lift),stand=P(x,y+4,29+lift);
        shape('rect',{x:stand.x-7,y:stand.y-3,width:14,height:4,rx:2,fill:'#50646e'},group);
        shape('path',{d:`M${stand.x} ${stand.y}L${screen.x} ${screen.y+8}`,stroke:'#445865','stroke-width':4},group);
        shape('rect',{x:screen.x-21,y:screen.y-14,width:42,height:28,rx:4,fill:'#253b49',stroke:'#142934','stroke-width':1.5},group);
        shape('rect',{x:screen.x-17,y:screen.y-9,width:34,height:18,rx:1,fill:'#77b3c0',class:'monitor-interior'},group);
        line({x:screen.x-13,y:screen.y-5},{x:screen.x+8,y:screen.y-5},{stroke:'#a3d6dc','stroke-width':1.5},group);
        const keyboard=P(x,y+12,30+lift);shape('rect',{x:keyboard.x-12,y:keyboard.y-3,width:24,height:6,rx:2,fill:'#d6dce0',stroke:'#80959e','stroke-width':.6},group);
        for(let k=-8;k<10;k+=4)line({x:keyboard.x+k,y:keyboard.y-1},{x:keyboard.x+k,y:keyboard.y+1},{stroke:'#8397a0','stroke-width':1},group);
        const mug=P(x+21,y+12,32+lift);shape('ellipse',{cx:mug.x,cy:mug.y,rx:3,ry:4,fill:'#f5f1e7',stroke:'#9d8c78','stroke-width':1},group);
        const badge=P(x+24,y+17,30+lift);shape('text',{x:badge.x,y:badge.y,'font-size':8,'text-anchor':'end',fill:'#405a65',class:'station-number'},group,`#${station.index+1}`);
      });
      const chair=[p.x-12,p.y-12,p.x+12,p.y+7];object(chair,()=>{const group=shape('g',{transform:scaledAt(P(p.x,p.y))});box(chair,9,['#47637c','#2c4257','#374e64'],group);const back=P(p.x,p.y-12,24);shape('rect',{x:back.x-12,y:back.y-5,width:24,height:13,rx:5,fill:'#537692',stroke:'#2e4d64','stroke-width':1.5},group);});
    }
    for(const [index,bounds]of g.furniture.entries())object(bounds,()=>{
      if(index===2){box(bounds,27,['#d1ad7c','#987a55','#b18d60']);const target=g.conference.target||{x:(bounds[0]+bounds[2])/2,y:(bounds[1]+bounds[3])/2},device=P(target.x,target.y,30);shape('rect',{x:device.x-18,y:device.y-9,width:36,height:18,rx:3,fill:'#304d60'});for(const offset of [-45,45]){const paper=P(target.x+offset,target.y+24,29);shape('rect',{x:paper.x-13,y:paper.y-7,width:26,height:14,rx:2,fill:'#efece0',stroke:'#9d8c76','stroke-width':1});}}
      else if(index<2){box(bounds,31,['#d8c19f','#9e8264','#bda080']);const p=P(bounds[0]+24,bounds[1]+12,44);
        shape('rect',{x:p.x-11,y:p.y-10,width:22,height:18,rx:3,fill:index===0?'#395c70':'#405159'});shape('rect',{x:p.x-8,y:p.y-7,width:16,height:9,rx:1,fill:index===0?'#9ec1cc':'#bba07f'});
      }else{box(bounds,12,['#57748b','#334d65','#425f79']);const p=P((bounds[0]+bounds[2])/2,bounds[1],25);shape('rect',{x:p.x-13,y:p.y-7,width:26,height:17,rx:5,fill:'#607f96',stroke:'#36546c','stroke-width':1.5});}
    });
    // Static wall boards distinguish office functions; they never display synthetic task activity.
    for(const room of view==='top-down'||!backNorth?[]:g.rooms.filter(r=>r.role!=='shared')){const index=O.roles.indexOf(room.role),accent=accents[index],x=room.x+16,y=room.y+20;
      object([x,y,x+108,y+2],()=>{const group=shape('g',{'data-department-board':room.role});shape('title',{},group,`${room.name} decorative wall board / not live task data`);
        polygon([P(x,y,51),P(x+108,y,51),P(x+108,y,8),P(x,y,8)],{fill:'#f1f0e8',stroke:'#6f8284','stroke-width':2},group);
        const segment=(a,b)=>line(P(x+a[0],y,a[1]),P(x+b[0],y,b[1]),{stroke:accent,'stroke-width':2,'stroke-linecap':'round'},group);
        const panel=(left,top,width,height)=>polygon([P(x+left,y,top),P(x+left+width,y,top),P(x+left+width,y,top-height),P(x+left,y,top-height)],{fill:'none',stroke:accent,'stroke-width':1.4},group);
        if(room.role==='planner'){for(const offset of [12,43,74]){panel(offset,41,22,23);segment([offset+3,35],[offset+18,35]);}}
        else if(room.role==='designer'){panel(12,41,32,24);panel(56,41,38,10);panel(56,26,17,9);panel(78,26,16,9);}
        else if(room.role==='builder'){panel(12,34,22,14);panel(74,43,22,12);panel(74,24,22,12);segment([34,27],[54,27]);segment([54,27],[54,37]);segment([54,37],[74,37]);segment([54,27],[54,18]);segment([54,18],[74,18]);}
        else if(room.role==='reviewer'){for(const offset of [13,61]){panel(offset,41,33,24);for(const z of [35,29,23])segment([offset+5,z],[offset+27,z]);}}
        else if(room.role==='qa'){for(const left of [15,42,69])for(const top of [40,26])panel(left,top,20,10);}
        else{polygon([[35,43],[73,43],[73,28],[54,15],[35,28]].map(a=>P(x+a[0],y,a[1])),{fill:'none',stroke:accent,'stroke-width':2.4},group);segment([54,34],[54,25]);segment([50,34],[58,34]);}
      });
    }
    for(const decoration of g.decorations||[]){const [x,y,r,b]=decoration.bounds;object(decoration.bounds,()=>{if(decoration.kind==='bookcase'){box([x,y,r,b],82,['#bc9e73','#785f43','#937754']);for(const z of [18,42,66])line(P(x+4,b+1,z),P(r-4,b+1,z),{stroke:'#dfc594','stroke-width':3});}else if(decoration.kind==='plant'){box([x,y,r,b],20,['#b99877','#84694f','#9e8060']);const p=P((x+r)/2,(y+b)/2,42);shape('ellipse',{cx:p.x,cy:p.y,rx:14,ry:18,fill:'#709980'});}else if(decoration.kind==='sofa'){box([x,y,r,b],22,['#6b9290','#3e6265','#567a7b']);box([x,b-8,r,b],43,['#6b9290','#3e6265','#567a7b']);}else box([x,y,r,b],15,['#d5bd95','#9e8264','#bda080']);});}
    for(const prop of g.props||[]){const [x,y,r,b]=prop.bounds;object(prop.bounds,()=>{
      const group=shape('g',{'data-office-prop':prop.kind});shape('title',{},group,prop.label||prop.kind.replaceAll('-',' '));
      if(prop.kind==='cafe-table'){
        box([(x+r)/2-3,(y+b)/2-3,(x+r)/2+3,(y+b)/2+3],27,['#aa8055','#6b5039','#8e6845'],group);
        polygon(Array.from({length:36},(_,i)=>P((x+r)/2+Math.cos(i*Math.PI/18)*(r-x)/2,(y+b)/2+Math.sin(i*Math.PI/18)*(b-y)/2,29)),{fill:'#e1bb72',stroke:'#a9814a','stroke-width':1.2},group);
      }else if(prop.kind==='plant'){
        box(prop.bounds,32,['#e5d8b8','#b0a07d','#c9b593'],group);const cx=(x+r)/2,cy=(y+b)/2;line(P(cx,cy,30),P(cx,cy,121),{stroke:'#42663d','stroke-width':3},group);for(let i=0;i<12;i++){const a=i*Math.PI*.76,z=65+i*5,p=P(cx+Math.cos(a)*22,cy+Math.sin(a)*22,z);shape('ellipse',{cx:p.x,cy:p.y,rx:13,ry:22,fill:i%2?'#6b994b':'#42743e',transform:`rotate(${i%2?25:-25} ${p.x} ${p.y})`},group);}
      }else if(prop.kind.startsWith('glass-'))box(prop.bounds,65,['#bad4d4','#759caa','#93b7c0'],group);
      else if(prop.kind==='sofa'){box(prop.bounds,22,['#e4d6b5','#b4a487','#cbbb9e'],group);const rear=prop.rotation?[x,y,r,y+8]:[x,b-8,r,b];box(rear,43,['#e9dec4','#b4a487','#d5c6a8'],group);}
      else if(prop.kind==='server-rack'){box(prop.bounds,75,['#51636e','#263944','#354d59'],group);for(const z of [15,28,41,54,67])line(P(x+3,b,z),P(r-3,b,z),{stroke:'#9abbbc','stroke-width':1.5},group);}
      else{const tall=prop.kind==='feature-wall'?g.ceilingHeight:prop.kind==='bookcase'?57:prop.kind==='water-cooler'?58:prop.kind==='wall-art'||prop.kind==='whiteboard'?65:prop.kind==='reception-desk'?70:prop.kind==='cafe-counter'?31:prop.kind==='cafe-chair'?20:15;box(prop.bounds,tall,['#e0c49a','#9d8262','#bfa078'],group);}
    });}
    // Planters are on the outside ledge, beyond traversable bounds.
    for(const [x,y]of [[18,75],[w-18,75],[18,h-75],[w-18,h-75]])object([x-9,y-9,x+9,y+9],()=>{box([x-9,y-9,x+9,y+9],18,['#b99877','#84694f','#9e8060']);const p=P(x,y,32);for(const [dx,dy,r]of [[-7,-2,10],[5,-6,11],[0,6,10]])shape('ellipse',{cx:p.x+dx,cy:p.y+dy,rx:r,ry:r*.8,fill:dx<0?'#567e67':'#709980',stroke:'#456a56','stroke-width':1});});
    objects.sort((a,b)=>a.depth-b.depth);for(const item of objects)item.draw();
    // Room names sit on their back walls, readable at the game overview scale.
    const roomSign=(point,title,number,accent,width=190)=>{const group=shape('g',{'data-room-sign':title});shape('rect',{x:point.x,y:point.y-28,width,height:38,rx:5,fill:'#203744',stroke:'#d8e4de','stroke-width':1},group);shape('rect',{x:point.x+4,y:point.y-24,width:27,height:30,rx:3,fill:accent},group);shape('text',{x:point.x+17.5,y:point.y-3,'text-anchor':'middle',fill:'#ffffff','font-size':12,'font-weight':750},group,number);shape('text',{x:point.x+39,y:point.y-3,fill:'#f7f6eb','font-size':18,'font-weight':700,'letter-spacing':0},group,title);};
    const signPoint=(room,z,width)=>{const x=room.x,y=room.y,r=x+room.width,b=y+room.height;const edge=[[x+room.width/2,y+20],[x+room.width/2,b-20],[x+20,y+room.height/2],[r-20,y+room.height/2]].map(([px,py])=>P(px,py,z)).sort((a,b)=>a.y-b.y)[0];return {x:edge.x-width/2,y:edge.y};};
    for(const room of g.rooms.filter(r=>r.role!=='shared')){const index=O.roles.indexOf(room.role);roomSign(signPoint(room,41,190),room.name,String(index+1).padStart(2,'0'),accents[index]);}
    const sharedRoom=g.rooms.find(r=>r.role==='shared'),sharedLabel=P(sharedRoom.x+sharedRoom.width/2,sharedRoom.y+30,3);shape('text',{x:sharedLabel.x,y:sharedLabel.y,fill:sharedRoom.annex?'none':'#203b43','font-size':13,'font-weight':800,'text-anchor':'middle','data-shared-label':'true'},scene,'SHARED WORKSPACE · ROLE PENDING');
    roomSign(signPoint(g.conference,44,198),'Conference','M','#546674',198);
    for(const room of amenities(g).filter(r=>r.role!=='conference'))roomSign(signPoint(room,44,198),room.name,room.number,'#546674',198);

  }
  function setGeometry(next) {
    const live=mode==='office',three=live&&view!=='top-down'&&window.Office3D?.available&&!window.Office3D.diagnostics().contextLost,viewport=$('world').parentElement,viewportWidth=Math.max(1,viewport.clientWidth),viewportHeight=Math.max(1,viewport.clientHeight);
    const physicalKey=`${mode}:${next.width}:${next.height}:${next.conferenceSeats.length}:${next.stations.map(s=>s.key).join(',')}`,key=`${graphicsStyle}:${view}:${angle}:${cameraElevation}:${three?`${viewportWidth}:${viewportHeight}`:'svg'}:${physicalKey}`;geometry=next;if(key===geometryKey)return false;const physicsChanged=physicalKey!==physicalGeometryKey;geometryKey=key;physicalGeometryKey=physicalKey;
    original.style.display=live?'none':'';scene.style.display=live?'':'none';if(physicsChanged)M.configure(live?next:null);
    sceneGeometry=live?O.sceneLayout(next,view,angle,cameraElevation):{width:1280,height:610,stations:O.workstations};
    window.Office3D?.setActive?.(three);
    if(three)sceneGeometry=window.Office3D.configure(next,{width:viewportWidth,height:viewportHeight,elevation:cameraElevation},angle,cameraElevation);
    const width=sceneGeometry.width,height=sceneGeometry.height;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);$('world').style.setProperty('--floor-width',String(width));$('world').style.setProperty('--floor-height',String(height));$('world').style.setProperty('--floor-ratio',String(width/height));$('world').classList.toggle('expanded',live&&next.height>850);$('world').classList.toggle('isometric',live);$('world').dataset.view=view;$('world').dataset.elevation=String(Math.round(sceneGeometry.elevation??cameraElevation));
    links.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',`${view==='top-down'?'Top-down':sceneGeometry.backend==='webgl'?'3D':'Isometric'} office, yaw ${Math.round(angle)} degrees, elevation ${Math.round(sceneGeometry.elevation??cameraElevation)} degrees, with department rooms, real AI coworkers, ${live?next.stations.length:12} computers and collaboration lounge`);
    if(live)paintOffice();if(physicsChanged)for(const [id]of packets){dropPacket(id);seen.delete(id);}return physicsChanged;
  }
  const motionEnabled=()=>motionOverride===null?!reduced.matches:motionOverride;
  const atHomeComputer=actor=>Boolean(actor.station)&&!actor.conferenceSeat&&!actor.handoff&&(actor.working||actor.state==='running'||actor.state==='adapter-idle'&&!O.canRoam(actor)||actor.state==='event-waiting'&&actor.recentEvents?.length);
  function motionLabel() {const playing=motionEnabled();$('motion-toggle').textContent=playing?'Pause movement':'Play movement';$('motion-toggle').setAttribute('aria-pressed',String(!playing));$('world').dataset.motion=playing?'playing':'paused';$('world').dataset.motionExplicit=String(motionOverride===true&&reduced.matches);if(!playing)for(const a of actors.values()){a.element.classList.remove('office-walking');routeQueue.delete(a.data.id);a.position={...(a.departure?.target||O.destination(a.data,a.index,mode==='office'?geometry:null))};a.route=[];place(a);}}
  $('motion-toggle').addEventListener('click',()=>{motionOverride=!motionEnabled();motionLabel();});
  reduced.addEventListener('change',()=>{motionOverride=null;motionLabel();});
  motionLabel();
  const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
  function updateBubbleDensity(){
    const active=[...actors.values()].filter(a=>a.data.working||a.data.handoff).sort((a,b)=>Date.parse(b.data.updatedAt||0)-Date.parse(a.data.updatedAt||0));
    const detailed=new Set(active.slice(0,matchMedia('(max-width:560px)').matches?1:2).map(a=>a.data.id));
    if(active.some(a=>a.data.id===selected))detailed.add(selected);
    for(const a of actors.values())a.element.classList.toggle('bubble-detailed',detailed.has(a.data.id));
  }
  window.addEventListener('resize',updateBubbleDensity);
  function employeePortrait(actor){
    const fallback=node('span','employee-portrait-fallback',(actor.provider||'?').slice(0,2)),portrait=window.Office3D?.getPortrait?.(actor.id);fallback.setAttribute('aria-hidden','true');
    if(!portrait)return fallback;
    const canvas=node('canvas','employee-portrait');canvas.width=176;canvas.height=208;canvas.setAttribute('aria-hidden','true');const context=canvas.getContext('2d');if(!context)return fallback;
    const [x,y,width,height]=portrait.rect,scale=Math.min(160/width,192/height),w=width*scale,h=height*scale;
    context.drawImage(portrait.image,x,y,width,height,(176-w)/2,(208-h)/2,w,h);canvas.dataset.castProfile=portrait.profile;return canvas;
  }
  function employeeProfile(actor,role,view,heading){
    const header=node('header','employee-profile'),identity=node('div','employee-identity');identity.append(node('p','employee-provider',actor.provider||'Unknown provider'),heading,node('span','employee-state',view.word));header.append(employeePortrait(actor),identity);
    const facts=node('dl','employee-facts'),department=geometry.rooms.find(room=>room.role===actor.role)?.name||'Shared workspace';
    for(const [key,label,value]of [['department','Department',department],['role','Specialist',role?.role||'Not reported'],['provider','Provider',actor.provider||'Not reported'],['reference',actor.id.startsWith('session-')?'Session reference':'Run reference',actor.sourceId||actor.id]]){const term=node('dt','',label),valueNode=node('dd','',value);valueNode.dataset.profileField=key;facts.append(term,valueNode);}
    const activity=node('section','employee-current');activity.setAttribute('aria-label','Current reported activity');activity.append(node('h4','','Current activity'),node('p','task-title',view.title),node('p','employee-action',view.detail||'No activity details have been reported yet.'),node('p','employee-destination',`Going to: ${view.destination}`));
    if(actor.awaitingHuman&&actor.taskLabel)activity.append(node('p','employee-reported-task',actor.taskLabel));
    if(actor.awaitingHuman&&actor.sourceId){const question=node('p','employee-question'),button=node('button','employee-question-open','View question and reply');button.type='button';button.dataset.conferenceSession=actor.sourceId;activity.append(question,button);window.ConferenceInbox.attachProfile(actor.sourceId,question);}
    const at=Date.parse(actor.updatedAt),updated=node('time','employee-updated',Number.isFinite(at)?`Updated ${new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'No update time reported');if(Number.isFinite(at))updated.dateTime=new Date(at).toISOString();activity.append(updated);
    return [header,activity,facts,node('p','detail-note',`${actor.note||''}${actor.taskRef?` · Work item ${actor.taskRef.slice(0,8)}`:''}`)];
  }
  function inspect(actor,manual=false) {
    const focusedChild=document.activeElement?.dataset?.relatedAgent;
    const focusedHeading=selected===actor.id&&document.activeElement===$('agent-detail').querySelector('h3');
    const previousBody=selected===actor.id?$('agent-detail').querySelector('.session-output pre'):null;
    const previousOutput=previousBody?.textContent,previousScroll=previousBody?.scrollTop||0;
    const generation=++transcriptGeneration;
    selected=actor.id;
    if(manual)selectedPinned=true;
    const role=window.AgentWorld.ROLES.find(r=>r.id===actor.role);
    const view=O.presentation(actor);
    const heading=node('h3','',actor.label);heading.tabIndex=-1;
    $('agent-detail').dataset.profileId=actor.id;$('agent-detail').replaceChildren(...employeeProfile(actor,role,view,heading));
    const current=actors.get(actor.id);if(current)showCoordinates(current);
    if(actor.activeChildCount){const children=[...actors.values()].map(a=>a.data).filter(a=>a.parentId===actor.sourceId&&a.working);const related=node('div','related-agents');related.append(node('strong','',`Connected agents working (${children.length})`));for(const child of children){const button=node('button','related-agent',`${child.label} · ${O.presentation(child).word}`);button.type='button';button.dataset.relatedAgent=child.id;button.addEventListener('click',()=>{const current=actors.get(child.id);if(current)inspect(current.data,true);});related.append(button);}$('agent-detail').append(related);}
    const sources=[actor,...[...actors.values()].map(a=>a.data).filter(a=>a.parentId===actor.sourceId&&a.working)];
    const recent=sources.flatMap(source=>(source.recentEvents||[]).map(event=>({...event,source:source===actor?'':source.label}))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,12);
    const timeline=node('section','agent-activity'),timelineTitle=node('h4','',recent.length?`Live activity · ${recent.length} recent event${recent.length===1?'':'s'}`:'Live activity'),timelineList=node('ol');timeline.append(timelineTitle,timelineList);for(const event of recent){const item=node('li');item.append(node('time','',new Date(event.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})),node('span','',`${event.source?event.source+' · ':''}${event.label}`));timelineList.append(item);}if(!recent.length)timeline.append(node('p','employee-empty','No activity events reported yet.'));$('agent-detail').append(timeline);
    if(actor.id.startsWith('session-')){
      const output=previousBody?.parentElement||node('section','session-output'),title=output.querySelector('h4')||node('h4','',`Session output · ${actor.provider}`),body=previousBody||node('pre','',previousOutput||'Reading local session output…');
      output.append(title,body);$('agent-detail').append(output);body.scrollTop=previousScroll;
      window.LocalSessions.transcript(actor.sourceId).then(value=>{
        if(!output.isConnected||selected!==actor.id||generation!==transcriptGeneration)return;
        title.textContent=value.available?`Session output · ${value.live?'Live':'Last recorded'}`:`Session output · Unavailable`;
        const next=value.available?(value.entries.map(e=>`[${new Date(e.at).toLocaleTimeString()}] ${e.speaker}\n${e.text}`).join('\n\n')||'No text has been recorded for this session yet.'):value.reason;
        if(body.textContent!==next){const scroll=body.scrollTop,follow=body.clientHeight>0&&body.scrollHeight-body.clientHeight-scroll<30;body.textContent=next;body.scrollTop=follow?body.scrollHeight:scroll;}
      });
    }
    if(manual){$('team-panel').scrollTop=0;heading.focus({preventScroll:true});}
    else if(focusedChild){const replacement=[...$('agent-detail').querySelectorAll('[data-related-agent]')].find(button=>button.dataset.relatedAgent===focusedChild);(replacement||heading).focus({preventScroll:true});}
    else if(focusedHeading)heading.focus({preventScroll:true});
    if(actor.state==='running'&&!actor.action&&!actor.taskLabel&&!actor.activeChildCount)$('agent-detail').append(node('p','connection-hint','No current task or tool event is visible for this open session. It may be idle; process presence alone cannot reveal work.'));
    if(O.canRoam(actor))$('agent-detail').append(node('p','detail-note','Walking through shared areas is a visual waiting routine. It does not indicate a provider task, help visit or meeting.'));
    for(const a of actors.values()) {a.element.classList.toggle('selected',a.data.id===selected);a.element.setAttribute('aria-pressed',String(a.data.id===selected));}
    updateBubbleDensity();
    layoutBubbles();
    for(const row of $('office-roster').querySelectorAll('[data-office-row]'))row.setAttribute('aria-pressed',String(row.dataset.officeRow===selected));
  }
  function packet(event) {
    if(seen.has(event.id))return;seen.add(event.id);
    if(seen.size>200)seen.delete(seen.values().next().value);
    const p=node('span','work-packet',`▤ ${event.taskLabel||'Task'} → ${O.roleNames[event.toRole]}`);p.setAttribute('aria-hidden','true');
    p.title=`${event.fromRole} → ${event.toRole} · ${mode==='office'?'Reported handoff':'Simulated handoff'}`;
    $('office-packets').append(p);
    const source=actors.get(`session-${event.sourceId}`),recipient=event.targetRef?actors.get(`${event.targetKind||'session'}-${event.targetRef}`):null;
    const from=mode==='office'?(source?.position||geometry.stations.find(s=>s.role===event.fromRole).point):O.desks[event.fromRole],to=mode==='office'?(recipient?.data.role===event.toRole?(recipient.data.conferenceSeat||recipient.data.station).point:event.toRole==='planner'?geometry.conferenceSeats[0].point:geometry.stations.find(s=>s.role===event.toRole).point):O.desks[event.toRole];
    const entity={element:p,position:{...(motionEnabled()?from:to)},target:to,route:[],age:0,lifetime:12,pending:motionEnabled(),geometry:physicalGeometryKey};
    packets.set(event.id,entity);
    if(entity.pending)routeQueue.set(`packet-${event.id}`,{actor:entity,target:to,packetId:event.id,assignment:physicalGeometryKey});
  }
  function dropPacket(id){packets.get(id)?.element.remove();packets.delete(id);routeQueue.delete(`packet-${id}`);}
  function move(entity,dt,speed) {
    const next=M.advanceRoute(entity.position,entity.route,speed*dt),direction=next.heading;
    if(direction)entity.element.dataset.facing=Math.abs(direction.x)>Math.abs(direction.y)?direction.x>0?'right':'left':direction.y>0?'down':'up';
    entity.position=next.position;entity.route=next.route;return next.moved;
  }
  function elevation(entity){const seat=entity.data?.conferenceSeat;return seat&&Math.hypot(entity.position.x-seat.point.x,entity.position.y-seat.point.y)<2?9*(geometry.staffScale||1):0;}
  function showCoordinates(entity){$('world-coordinates').textContent=`${entity.data.label} · X ${Math.round(entity.position.x)} · Y ${Math.round(entity.position.y)} · Z ${elevation(entity)}`;}
  function place(entity) {const p=mode==='office'?sceneGeometry.project(entity.position.x,entity.position.y,elevation(entity)):entity.position;entity.element.style.left=`${p.x/(sceneGeometry.width/100)}%`;entity.element.style.top=`${p.y/(sceneGeometry.height/100)}%`;
    if(entity.data){const bubble=entity.element.querySelector('.character-bubble'),name=entity.element.querySelector('.character-name');if(sceneGeometry.backend==='webgl'){
      const k=geometry.staffScale||1,head=sceneGeometry.project(entity.position.x,entity.position.y,64*k),side=sceneGeometry.project(entity.position.x+20*k,entity.position.y,0),scale=Math.max(.08,Math.min(1.2,Math.max(Math.abs(head.y-p.y)/50,Math.abs(side.x-p.x)/40))),zoom=Number($('world').style.getPropertyValue('--camera-scale'))||1;
      entity.element.style.setProperty('--actor-scale',String(scale));bubble.style.transform=bubble.hasAttribute('popover')?'none':`scale(${.85/(scale*zoom)})`;name.style.transform=`scale(${.85/(scale*zoom)})`;
    }else{entity.element.style.removeProperty('--actor-scale');bubble.style.transform=bubble.hasAttribute('popover')?'none':'';name.style.transform='';}}
    if(entity.data?.id===selected)showCoordinates(entity);}
  function showViewportBubble(bubble,visible){
    if(!bubble?.hasAttribute('popover'))return;
    try{const open=bubble.matches(':popover-open');if(visible&&!open&&bubble.isConnected)bubble.showPopover();else if(!visible&&open)bubble.hidePopover();}
    catch(_){
      // A disconnected/inactive document must never break the office RAF.
      bubble.removeAttribute('popover');for(const property of ['left','top','transform','translate'])bubble.style.removeProperty(property);
    }
  }
  function bubbleDrawer(){const inspector=document.querySelector('.team-panel:not([hidden])'),feed=$('office-sidebar');return inspector||(feed&&(feed.classList.contains('open')||getComputedStyle(feed).visibility==='visible')?feed:null);}
  function bubblesBlocked(){return document.hidden||Boolean(document.querySelector('dialog[open]'))||(matchMedia('(max-width:800px)').matches&&Boolean(bubbleDrawer()));}
  const bubbleVisibility=new MutationObserver(()=>{if(bubblesBlocked()){for(const a of actors.values())showViewportBubble(a.element.querySelector('.character-bubble'),false);}else layoutBubbles();});
  if(viewportBubbles){
    for(const panel of document.querySelectorAll('dialog,#office-sidebar,#team-panel'))bubbleVisibility.observe(panel,{attributes:true,attributeFilter:['open','hidden','class']});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const a of actors.values())showViewportBubble(a.element.querySelector('.character-bubble'),false);}else layoutBubbles();});
  }
  let lastBubbleLayout=0;
  function layoutBubbles(){
    if(mode!=='office')return;
    const world=$('world').getBoundingClientRect(),viewport=$('world').parentElement.getBoundingClientRect(),safe={left:Math.max(world.left,viewport.left),right:Math.min(world.right,viewport.right),top:Math.max(world.top,viewport.top),bottom:Math.min(world.bottom,viewport.bottom)},people=[...actors.values()].filter(a=>a.owned&&a.element.isConnected);
    // Reserve the fixed drawer's destination throughout its slide, including closing.
    const drawer=bubbleDrawer()?.getBoundingClientRect(),drawerLeft=drawer?Math.min(drawer.left,innerWidth-drawer.width):0;
    if(drawer?.width&&drawerLeft>safe.left+120)safe.right=Math.min(safe.right,drawerLeft);
    for(const line of links.querySelectorAll('.bubble-leader'))line.remove();
    const labels=people.map(a=>a.element.querySelector('.character-name')?.getBoundingClientRect()).filter(Boolean),bodies=people.map(a=>a.element.getBoundingClientRect()),monitors=[...document.querySelectorAll('.desk-screen')].map(e=>e.getBoundingClientRect());
    const signs=[...document.querySelectorAll('[data-room-sign]')].map(e=>e.getBoundingClientRect());
    const controls=[...document.querySelectorAll('.heading>*,.toolbar,.world-panel>.panel-heading,.world-footer')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect()),placed=[];
    // Popovers live above the header. Reserve its edge, and the bottom camera
    // controls, before considering candidates in the zoomed/panned world.
    for(const rect of controls.filter(r=>r.width&&r.height)){
      if(rect.top<innerHeight*.25)safe.top=Math.max(safe.top,rect.bottom+8);
      else if(rect.bottom>innerHeight*.75)safe.bottom=Math.min(safe.bottom,rect.top-8);
    }
    const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    people.sort((a,b)=>Number(b.data.id===selected)-Number(a.data.id===selected)||Number(b.data.working)-Number(a.data.working));
    const blocked=bubblesBlocked(),items=people.map(a=>({a,bubble:a.element.querySelector('.character-bubble'),actorRect:a.element.getBoundingClientRect()}));
    for(const item of items){const {a,bubble,actorRect}=item;item.onscreen=actorRect.width>0&&actorRect.height>0&&actorRect.right>=safe.left&&actorRect.left<=safe.right&&actorRect.bottom>=safe.top&&actorRect.top<=safe.bottom;bubble.style.translate='none';showViewportBubble(bubble,item.onscreen&&!blocked&&!bubble.hidden&&!a.departure);}
    const anchors=items.filter(item=>item.onscreen).map(item=>{
      const {bubble,actorRect}=item,rect=bubble.getBoundingClientRect();
      if(bubble.hasAttribute('popover')){const left=Math.round((actorRect.left+actorRect.right-rect.width)/2),top=Math.round(actorRect.top-rect.height-8);return {...item,base:{left,right:left+rect.width,top,bottom:top+rect.height,width:rect.width,height:rect.height}};}
      return {...item,base:rect};
    }).filter(item=>item.base.width&&item.base.height);
    const crowded=anchors.length>2;
    for(const [index,{a,bubble,actorRect,base}] of anchors.entries()){
      let best={score:Infinity,dx:0,dy:0,rect:base};
      for(const dy of crowded?[0,-38,-76,38,76,-114,114,-152,152]:[0,-38,38,-76,76])for(const dx of [0,-70,70,-140,140]){
        const left=Math.max(safe.left+4,Math.min(safe.right-base.width-4,base.left+dx)),top=Math.max(safe.top+4,Math.min(safe.bottom-base.height-4,base.top+dy));
        const rect={left,right:left+base.width,top,bottom:top+base.height};
        const overflow=Math.max(0,safe.left+4-rect.left)+Math.max(0,rect.right-safe.right+4)+Math.max(0,safe.top+4-rect.top)+Math.max(0,rect.bottom-safe.bottom+4);
        const collision=placed.reduce((sum,p)=>sum+overlap(rect,p),0)+labels.reduce((sum,p)=>sum+overlap(rect,p),0)+bodies.reduce((sum,p)=>sum+overlap(rect,p),0)+monitors.reduce((sum,p)=>sum+overlap(rect,p)*1.4,0)+signs.reduce((sum,p)=>sum+overlap(rect,p)*4,0)+controls.reduce((sum,p)=>sum+overlap(rect,p)*4,0)+anchors.slice(index+1).reduce((sum,p)=>sum+overlap(rect,p.base)*.8,0);
        const actualDx=left-base.left,actualDy=top-base.top,score=collision+overflow*500+Math.abs(actualDx)*(crowded?.2:8)+Math.abs(actualDy)*(crowded?.3:5);
        if(score<best.score)best={score,dx:actualDx,dy:actualDy,rect};
      }
      if(bubble.hasAttribute('popover')){
        const left=Math.round(Math.max(safe.left+4,Math.min(safe.right-base.width-4,best.rect.left))),top=Math.round(Math.max(safe.top+4,Math.min(safe.bottom-base.height-4,best.rect.top)));
        best={...best,dx:left-base.left,dy:top-base.top,rect:{left,right:left+base.width,top,bottom:top+base.height}};bubble.style.left=`${left}px`;bubble.style.top=`${top}px`;
      }else{const scale=actorRect.width/a.element.offsetWidth||1;bubble.style.translate=`${best.dx/scale}px ${best.dy/scale}px`;}
      placed.push(best.rect);
      if(best.dx||best.dy){const line=document.createElementNS('http://www.w3.org/2000/svg','line'),x=point=>(point-world.left)/world.width*sceneGeometry.width,y=point=>(point-world.top)/world.height*sceneGeometry.height;line.setAttribute('class','bubble-leader');line.setAttribute('x1',x((best.rect.left+best.rect.right)/2));line.setAttribute('y1',y(best.rect.bottom));line.setAttribute('x2',x(actorRect.left+actorRect.width/2));line.setAttribute('y2',y(actorRect.top+actorRect.height*.4));links.append(line);}
    }
  }
  function clear() {for(const a of actors.values()){clearTimeout(a.bubbleTimer);showViewportBubble(a.element.querySelector('.character-bubble'),false);a.element.classList.remove('office-walking','at-desk','at-conference-seat');if(a.owned)a.element.remove();}actors.clear();routeQueue.clear();workstations=[];for(const p of packets.values())p.element.remove();packets.clear();seen.clear();helpLinks.clear();links.replaceChildren();lastStage=null;}
  function queueRoute(actor,target){actor.route=[];routeQueue.set(actor.data.id,{actor,target,assignment:actor.assignment});}
  function removeActor(id,a){clearTimeout(a.bubbleTimer);showViewportBubble(a.element.querySelector('.character-bubble'),false);if(a.owned)a.element.remove();actors.delete(id);routeQueue.delete(id);}
  function beginDeparture(a,kind){
    const target=O.departureTarget(geometry,kind);
    a.departure={kind,target,started:performance.now(),arrived:null};
    a.data={...a.data,state:'departing',working:false,awaitingHuman:false,conferenceSeat:null,station:null,handoff:null,taskLabel:''};
    a.ambient=false;a.assignment=`departure:${kind}`;a.route=[];
    a.element.classList.remove('working','at-desk','at-conference-seat','at-help');a.element.classList.add('departing');
    a.element.dataset.action='departing';a.element.title=kind==='breakout'?'Session finished / heading to breakout':'Session closed / heading to exit';
    a.element.querySelector('.character-bubble').hidden=true;showViewportBubble(a.element.querySelector('.character-bubble'),false);a.element.dataset.bubble='none';
    clearTimeout(a.bubbleTimer);a.bubbleExpiry=null;
    a.bubbleGeneration++;
    if(motionEnabled())queueRoute(a,target);else a.position={...target};
  }
  function syncHelpLinks(data){
    helpLinks.clear();links.replaceChildren();
    for(const a of data)if(a.working&&a.action==='helping'&&a.colleague){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.dataset.helper=a.id;line.setAttribute('class','help-link');links.append(line);helpLinks.set(a.id,{line,target:a.colleague.id});}
  }
  function showBubble(a){
    const actor=a.data,view=O.presentation(actor),bubble=a.element.querySelector('.character-bubble');
    const reported=Boolean(actor.taskLabel||actor.handoff?.taskLabel);
    const detail=actor.colleague?`${view.word}: ${actor.colleague.label} · ${view.title}`:actor.handoff?`To ${view.destination}: ${view.title}`:actor.id.startsWith('job-')?actor.activity:actor.taskLabel;
    const output=a.bubbleValue,activity=O.activityBubble(actor),visible=Boolean(output||reported||activity);
    const expiry=activity&&!actor.working&&!output&&!reported?Date.parse(activity.at)+120000:null;
    if(a.bubbleExpiry!==expiry){clearTimeout(a.bubbleTimer);a.bubbleExpiry=expiry;if(expiry)a.bubbleTimer=setTimeout(()=>{a.bubbleTimer=null;a.bubbleExpiry=null;if(actors.get(actor.id)===a){showBubble(a);layoutBubbles();}},Math.max(0,expiry-Date.now()+20));}
    bubble.hidden=!visible;
    if(!visible)showViewportBubble(bubble,false);
    a.element.dataset.bubble=output?'transcript':visible?'reported':'none';
    a.element.dataset.taskKnown=String(visible);
    a.element.querySelector('.worker-action').textContent=output?.speaker||(reported?view.word:activity?.speaker)||view.word;
    a.element.querySelector('.worker-task').textContent=output?.text||detail||activity?.text||view.title;
    const eventTime=a.element.querySelector('.worker-event-time'),at=output?.at||activity?.at||actor.updatedAt;
    eventTime.hidden=!visible;
    if(!eventTime.hidden&&at){eventTime.dateTime=at;eventTime.textContent=`Updated ${new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;}
  }
  function refreshBubble(a){
    if(!a.data.id.startsWith('session-'))return;
    const version=`${a.data.transcriptRevision||a.data.updatedAt}:${a.data.transcriptLive}`;
    if(a.bubbleVersion===version)return;
    a.bubbleVersion=version;
    const generation=++a.bubbleGeneration,sourceId=a.data.sourceId;
    window.LocalSessions.transcript(sourceId).then(value=>{
      if(actors.get(a.data.id)!==a||generation!==a.bubbleGeneration)return;
      a.bubbleValue=O.transcriptBubble(value);
      showBubble(a);updateBubbleDensity();layoutBubbles();
    });
  }
  function renderFlow(data,sessions){
    const list=$('task-flow-list'),focus=document.activeElement?.dataset?.flowAgent;list.replaceChildren();
    const known=data.filter(a=>a.taskLabel||a.action||a.handoff);
    const knownIds=new Set(known.map(a=>a.id));
    const observed=data.filter(a=>!knownIds.has(a.id)&&(a.awaitingHuman||a.activeChildCount||a.working||a.recentEvents?.length));
    const pending=data.length-known.length-observed.length;
    for(const actor of known.slice(0,24)){const view=O.presentation(actor),li=node('li'),button=node('button','flow-task');button.type='button';button.dataset.flowAgent=actor.id;button.append(node('strong','',view.title),node('span','',`${actor.provider} ${actor.sourceId.slice(0,4)} / ${view.word} / ${view.destination}`));button.addEventListener('click',()=>{button.focus({preventScroll:true});actors.get(actor.id)?.element.click();});li.append(button);list.append(li);}
    for(const actor of observed.slice(0,Math.max(0,24-known.length))){const view=O.presentation(actor),li=node('li'),button=node('button','flow-task');button.type='button';button.dataset.flowAgent=actor.id;button.append(node('strong','',actor.activeChildCount?view.title:actor.recentEvents?.at(-1)?.label||view.word),node('span','',`${actor.provider} ${actor.sourceId.slice(0,4)} / ${O.workerLabel(actor)} / ${view.destination}`));button.addEventListener('click',()=>{button.focus({preventScroll:true});actors.get(actor.id)?.element.click();});li.append(button);list.append(li);}
    if(known.length>24)list.append(node('li','flow-unconnected',`Showing 24 of ${known.length} task-linked workers here. All workers remain available in the office and inspector.`));
    for(const e of (sessions.handoffs||[]).slice(-8).reverse()){const li=node('li','flow-transfer');li.append(node('strong','',e.taskLabel||'Reported task transfer'),node('span','',`${O.roleNames[e.fromRole]} → ${O.roleNames[e.toRole]} / Reported handoff / ${new Date(e.at).toLocaleTimeString()}`));list.append(li);}
    if(pending)list.append(node('li','flow-unconnected',`${pending} open session${pending===1?' has':'s have'} no task or tool event yet.`));
    if(!list.children.length)list.append(node('li','flow-unconnected','Waiting for task and action events. Start an agent or connect its activity adapter.'));
    $('task-flow-count').textContent=`${known.length} task-linked / ${observed.length} activity observed / ${(sessions.handoffs||[]).length} reported transfers`;
    if(focus)for(const b of list.querySelectorAll('button'))if(b.dataset.flowAgent===focus)b.focus({preventScroll:true});
  }
  function sync(nextMode,sessions,live,state) {
    paused=false;
    if(nextMode!==mode){clear();mode='office';}
    const currentTime=performance.now();
    for(const [id,actor] of actors)if(actor.departure&&currentTime-actor.departure.started>60000)removeActor(id,actor);
    $('office-packets').hidden=false;$('task-flow').hidden=false;links.hidden=false;
    const projected=O.project(sessions,live);let data=projected.actors,events=projected.events;
    if(mode==='office'){
      workstations=O.assignWorkstations(data,live.jobs,workstations);
      const changed=setGeometry(O.layout(data,workstations,geometry.conferenceSeats));
      const occupants=new Map(workstations.map(s=>[s.key,s.occupant]));sceneWithOccupants={...sceneGeometry,stations:sceneGeometry.stations.map(s=>({...s,occupant:occupants.get(s.key)||null}))};
      if(changed){routeQueue.clear();for(const a of actors.values()){a.assignment=null;if(!M.free(a.position.x,a.position.y))a.position=geometry.lobby(a.index);a.route=[];if(a.departure){a.departure.target=O.departureTarget(geometry,a.departure.kind);a.assignment=`departure:${a.departure.kind}`;if(motionEnabled())queueRoute(a,a.departure.target);else a.position={...a.departure.target};}}}
      let waiting=0;data=O.sceneActors(data,workstations,M.free,geometry,Array.from(actors.values(),a=>a.data)).map(actor=>({...actor,arrivalIndex:actor.role?0:waiting++}));
      syncHelpLinks(data);renderFlow(data,sessions);
    }
    const visible=data,ids=new Set(visible.map(a=>a.id));
    for(const [id,a] of actors)if(!ids.has(id)) {
      if(!a.owned||!sessions.scannedAt){removeActor(id,a);continue;}
      if(!a.departure){const source=sessions.entries.find(e=>`session-${e.id}`===id),job=live.jobs.find(j=>`job-${j.id}`===id);beginDeparture(a,job&&['failed','cancelled','timed-out','interrupted'].includes(job.status)||!source&&!job?'exit':'breakout');}
    }
    for(const [index,actor] of visible.entries()) {
      let a=actors.get(actor.id);
      if(!a) {
        const owned=mode==='office',el=owned?node('button','character office-character'):document.getElementById(`character-${actor.id}`);
        if(owned) {el.type='button';el.dataset.office=actor.id;const bubble=node('span','character-bubble');if(viewportBubbles)bubble.setAttribute('popover','manual');bubble.append(node('strong','worker-action'),node('span','worker-task'),node('time','worker-event-time'));el.append(bubble,node('span','person'),node('span','action-prop'),node('span','character-name'));$('office-characters').append(el);el.addEventListener('click',()=>{const current=actors.get(actor.id);if(current)inspect(current.data,true);});}
        a={element:el,owned,position:mode==='office'?geometry.lobby(actor.arrivalIndex):O.lobby(index),route:[],goal:null,assignment:null,data:actor,roamStep:0,rest:0,index:mode==='office'?actor.arrivalIndex:index,bubbleValue:null,bubbleVersion:null,bubbleGeneration:0,bubbleTimer:null,bubbleExpiry:null};actors.set(actor.id,a);
      }
      if(a.departure){a.departure=null;a.element.classList.remove('departing');}
      a.data=actor;
      if(mode==='office')a.index=actor.arrivalIndex;
      const goal=O.destination(actor,a.index,mode==='office'?geometry:null),key=`${goal.x},${goal.y}`;
      const assignment=`${key}:${actor.role}:${actor.state}:${actor.working}:${actor.handoff?.id||''}`;
      a.ambient=O.canRoam(actor);a.element.classList.toggle('ambient',a.ambient);
      if(assignment!==a.assignment) {
        a.assignment=assignment;a.goal=key;a.route=[];a.rest=0;a.roamStep=0;
        if(motionEnabled())queueRoute(a,a.ambient?O.idleStops(actor,a.index,mode==='office'?geometry:null)[a.roamStep++]:goal);
        else {routeQueue.delete(a.data.id);a.position={...goal};}
      }
      a.element.classList.toggle('at-desk',atHomeComputer(actor)&&Math.hypot(a.position.x-actor.station.point.x,a.position.y-actor.station.point.y)<2);
      a.element.classList.toggle('at-conference-seat',Boolean(actor.conferenceSeat)&&Math.hypot(a.position.x-actor.conferenceSeat.point.x,a.position.y-actor.conferenceSeat.point.y)<2);
      if(a.owned) {
        const r=window.AgentWorld.ROLES.find(r=>r.id===actor.role);a.element.style.setProperty('--agent',r?.color||'#8999aa');
        const view=O.presentation(actor);a.element.dataset.action=view.action;a.element.title=`${view.word} / ${view.title} / ${view.detail} / Going to ${view.destination}`;
        a.element.querySelector('.character-name').textContent=`${O.workerLabel(actor,r?.role)} / ${actor.provider.slice(0,2)} ${actor.sourceId.slice(0,4)}`;
        showBubble(a);refreshBubble(a);
        a.element.querySelector('.action-prop').textContent=view.icon;
        a.element.setAttribute('aria-label',`Inspect ${actor.label}`);a.element.classList.toggle('working',actor.working);a.element.classList.toggle('handing-off',Boolean(actor.handoff));
      }
      place(a);
    }
    if(mode==='office') {const fresh=new Set(events.map(e=>e.id));for(const [id] of packets)if(!fresh.has(id))dropPacket(id);}
    for(const event of events) packet(event);
    if(mode==='office') {
      const roster=$('office-roster'),focus=document.activeElement?.dataset?.officeRow;roster.replaceChildren();
      for(const actor of data) {const view=O.presentation(actor),row=node('button','roster-row');row.type='button';row.dataset.officeRow=actor.id;row.setAttribute('aria-label',`Inspect ${actor.label}`);row.setAttribute('aria-pressed',String(actor.id===selected));const r=window.AgentWorld.ROLES.find(r=>r.id===actor.role);row.style.setProperty('--agent',r?.color||'#8999aa');const info=node('span','person-info');info.append(node('strong','',view.title),node('span','',`${O.workerLabel(actor,r?.role)} / ${actor.provider} ${actor.sourceId.slice(0,4)}`));row.append(node('span','portrait',actor.provider.slice(0,2)),info,node('span','role-state',view.word));row.addEventListener('click',()=>inspect(actor,true));roster.append(row);}
      if(focus)roster.querySelector(`[data-office-row="${focus}"]`)?.focus({preventScroll:true});
      if(!data.length){delete $('agent-detail').dataset.profileId;$('agent-detail').replaceChildren(node('h3','','The office is quiet'),node('p','','Start your local agents. Process sightings appear in Local sessions; identified sessions, task roles and handoffs appear here when their events are connected.'));}
      else {if(selectedPinned&&!data.some(a=>a.id===selected))selectedPinned=false;inspect(O.focusActor(data,selected,selectedPinned));}
      updateBubbleDensity();
      const processOnly=sessions.entries.filter(e=>e.kind==='process'&&e.status==='running').length;
      $('office-summary').textContent=`${data.length} identified workers / ${data.filter(a=>a.working).length} working / ${processOnly} process-only connection${processOnly===1?'':'s'} / ${workstations.length} computers`;
    }
  }
  function frame(now) {
    const dt=Math.min((now-last)/1000,.5);last=now;
    if(!document.hidden&&!paused) {
      // Share one route plan per frame across workers and handoff packets.
      if(motionEnabled()&&routeQueue.size){const [id,job]=routeQueue.entries().next().value;routeQueue.delete(id);const current=job.packetId?packets.get(job.packetId)===job.actor&&job.assignment===physicalGeometryKey:actors.get(id)===job.actor&&job.actor.assignment===job.assignment;if(current){job.actor.route=M.path(job.actor.position,job.target);if(job.packetId){job.actor.lifetime=O.packetLifetime([job.actor.position,...job.actor.route],mode==='office'?geometry:null);job.actor.pending=false;}}}
      for(const a of actors.values()) {
        if(motionEnabled()&&a.ambient&&!a.route.length&&!routeQueue.has(a.data.id)){a.rest-=dt;if(a.rest<=0){const stops=O.idleStops(a.data,a.index,mode==='office'?geometry:null);queueRoute(a,stops[a.roamStep++%stops.length]);a.rest=1.5+(a.index%3)*.4;}}
        const moving=motionEnabled()&&move(a,dt,O.motionSpeed(mode==='office'?geometry:null,a.ambient?'idle':'worker'));a.element.classList.toggle('office-walking',Boolean(moving));place(a);
        if(a.departure){const departure=a.departure,arrived=Math.hypot(a.position.x-departure.target.x,a.position.y-departure.target.y)<2;
          if(arrived&&!a.route.length&&!routeQueue.has(a.data.id))departure.arrived??=now;
          if(departure.arrived&&now-departure.arrived>(departure.kind==='breakout'?4000:1200)||now-departure.started>60000){removeActor(a.data.id,a);continue;}
        }
        if(mode==='office')a.element.classList.toggle('at-conference-seat',Boolean(a.data.conferenceSeat)&&Math.hypot(a.position.x-a.data.conferenceSeat.point.x,a.position.y-a.data.conferenceSeat.point.y)<2);
        if(mode==='office')a.element.classList.toggle('at-desk',atHomeComputer(a.data)&&Math.hypot(a.position.x-a.data.station.point.x,a.position.y-a.data.station.point.y)<2);
        if(mode==='office'){const peer=actors.get(a.data.colleague?.id);a.element.classList.toggle('at-help',a.data.action==='helping'&&Boolean(peer)&&Math.hypot(a.position.x-peer.position.x,a.position.y-peer.position.y)<60);}
      }
      for(const [id,link]of helpLinks){const a=actors.get(id),b=actors.get(link.target);if(a&&b){const ap=sceneGeometry.project(a.position.x,a.position.y,15),bp=sceneGeometry.project(b.position.x,b.position.y,15);link.line.setAttribute('x1',ap.x);link.line.setAttribute('y1',ap.y);link.line.setAttribute('x2',bp.x);link.line.setAttribute('y2',bp.y);}}
      for(const [id,p] of packets) {if(!motionEnabled()){routeQueue.delete(`packet-${id}`);p.pending=false;p.position={...p.target};p.route=[];}if(!p.pending){p.age+=dt;if(motionEnabled())move(p,dt,O.motionSpeed(mode==='office'?geometry:null,'packet'));}place(p);if(p.age>p.lifetime||!p.pending&&!p.route.length&&p.age>3)dropPacket(id);}
      window.Office3D?.syncActors?.(actors,selected,now,motionEnabled());
      const bubbleInterval=actors.size<=16?0:actors.size<=40?100:250;if(now-lastBubbleLayout>bubbleInterval){lastBubbleLayout=now;layoutBubbles();}
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {sync,setGraphicsStyle:next=>{const valid=['illustrated','polished','pixel','low-poly'].includes(next)?next:'illustrated';if(valid!==graphicsStyle){graphicsStyle=valid;geometryKey='';}window.Office3D?.setGraphicsStyle?.(valid);return valid;},setView:next=>{if(['isometric','top-down'].includes(next))view=next;},setAngle:next=>{if(Number.isFinite(next))angle=((next%360)+360)%360;},setElevation:next=>{if(Number.isFinite(next))cameraElevation=Math.max(15,Math.min(70,next));},getWorkstations:()=>workstations,getSceneLayout:()=>mode==='office'?(sceneWithOccupants||sceneGeometry):sceneGeometry,getLayout:()=>mode==='office'?geometry:{width:1280,height:610,stations:O.workstations},getState:()=>Array.from(actors.values()).map(a=>({id:a.data.id,role:a.data.role,station:a.data.station?.key||null,conferenceSeat:a.data.conferenceSeat?.key||null,action:a.data.action,taskLabel:a.data.taskLabel,colleague:a.data.colleague?.id||null,handoffTo:a.data.handoff?.toRole||null,state:a.data.state,working:a.data.working,awaitingHuman:!!a.data.awaitingHuman,departure:a.departure?.kind||null,ambient:a.ambient,motionEnabled:motionEnabled(),x:a.position.x,y:a.position.y,z:elevation(a),goal:a.goal}))};
})();
