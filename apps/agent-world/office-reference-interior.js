/* Reference-directed furnishings. Physical geometry and live work stay in the host. */
window.OfficeReferenceInterior=(()=>{
  'use strict';
  const roles=['planner','designer','builder','reviewer','qa','security'];
  const palette={planner:'#b79a5c',designer:'#ad839d',builder:'#6b9ba1',reviewer:'#a4aa75',qa:'#8c9cbd',security:'#779784',shared:'#91a597'};
  const lightStyles={illustrated:{gain:1,color:'#ffd59a'},polished:{gain:1.08,color:'#ffe1af'},pixel:{gain:.82,color:'#ffd59a'},'low-poly':{gain:0,color:'#fff2d1'}};
  function create(api){
    const {T,architecture,geometries,boards,box,softBox,mesh,surface,contactShadow,cup,getLayout,roleColor=role=>palette[role]||palette.shared}=api;
    const galleryArt=new Map(),galleryGeometry=new Map(),desks=[],chairs=[],plants=[],galleries=[],lights=[],frontage=[],occupiedRooms=new Set();
    const rodUp=new T.Vector3(0,1,0),rodDirection=new T.Vector3();
    let style='illustrated',disposed=false,decorated=false,frontPlanters=0,cabinetDressings=0,wallPanels=0,wallDisplays=0,clocks=0,displayShelves=0;
    function group(parent=architecture){const value=new T.Group();parent.add(value);return value;}
    function rod(parent,color,start,end,radius){
      rodDirection.set(end[0]-start[0],end[1]-start[1],end[2]-start[2]);const length=rodDirection.length();
      const value=mesh('cylinder',color,(start[0]+end[0])/2,(start[1]+end[1])/2,(start[2]+end[2])/2,radius,length,radius,parent);value.quaternion.setFromUnitVectors(rodUp,rodDirection.divideScalar(length));return value;
    }
    function desktopPlant(parent,x,z){
      mesh('cylinder','#eee7d6',x,30,z,2.5,4,2.5,parent).material=surface('polymer','#eee7d6');mesh('cylinder','#65523a',x,32.2,z,2.1,.35,2.1,parent);
      rod(parent,'#66854e',[x,32,z],[x+.3,37,z],.18);
      for(let i=0;i<3;i++){const a=i*2.3,leaf=mesh('sphere','#658d47',x+Math.sin(a)*1.7,34.5+i,z+Math.cos(a)*1.7,1.9,.3,2.8,parent);leaf.rotation.set(.55,a,0);leaf.material=surface('leaf','#658d47');}
    }
    function desk(s,parent){
      if(disposed)return;const role=Object.hasOwn(palette,s.role)?s.role:'shared',accent=roleColor(role),index=Number.isInteger(s.index)?s.index:0,slot=index%(role==='shared'?5:4),outer=slot===1||slot===3?1:-1,front=s.seatOffset>0?1:-1;
      contactShadow(parent,56,40,1.1);
      // The host places touching modules into a real workbench. A continuous
      // honeywood edge and inset supports keep every part inside its own cell.
      const pedestal=group(parent);pedestal.position.x=outer*20;pedestal.rotation.y=front<0?Math.PI:0;
      softBox('#eee7d6',0,0,13.5,30,22,2,pedestal).material=surface('polymer','#eee7d6');softBox('#293c5a',0,0,12.5,29,1.4,1.4,pedestal);
      softBox('#293c5a',0,15.1,11.8,.7,20,3,pedestal);
      for(let i=0;i<2;i++){softBox('#eee7d6',0,15.6,11.4,.8,9.3,3.6+i*10.2,pedestal).material=surface('polymer','#eee7d6');softBox('#b18d55',0,16.2,4.3,.7,.8,9+i*10.2,pedestal);}
      const inner=-outer*23.5;
      softBox('#eee7d6',inner,0,2.6,28,22,2,parent).material=surface('polymer','#eee7d6');
      softBox('#516976',inner,0,3,28,1.5,.8,parent);softBox('#c9c9b5',0,0,49,4,3,21.5,parent);
      softBox('#a17c4c',0,0,56,40,1.2,24.8,parent);
      const top=softBox('#e4c492',0,0,56,40,2,26,parent);top.material=surface('plank','#e8cca1');
      const mat=softBox(accent,0,front*8,36,20,.18,28.08,parent);mat.material=surface('fabric',accent);mat.userData.referenceDeskMat=true;
      if(role!=='shared'&&slot<2){
        const divider=softBox(accent,0,-front*19.4,55,.9,7,28,parent);divider.material=surface('fabric',accent);divider.userData.referenceDeskDivider=true;
        softBox('#eee7d6',0,-front*19.4,55,.9,.35,35,parent).material=surface('polymer','#eee7d6');
      }
      // Sparse accessories distinguish a bench without repeating a tiny lamp,
      // golden trim and stationery around every screen.
      const notebook=softBox(accent,outer*21,-front*11,8,11,.7,28.15,parent);notebook.rotation.y=outer*.09;
      softBox('#f7efd8',outer*21,-front*11,7.3,10.2,.45,28.85,parent);
      if(slot===0){
        const fileX=-outer*22,fileZ=-front*11;
        softBox('#293c5a',fileX,fileZ,6.4,9,.6,28,parent);
        for(const side of [-1,1])softBox('#293c5a',fileX+side*2.85,fileZ,.7,9,7,28.6,parent);
        for(let i=0;i<3;i++)softBox(['#f3e9d0','#d5c8ad','#eee7d6'][i],fileX+(i-1)*1.5,fileZ,1.1,7,7+i*.6,28.6,parent);
      }else if(slot===1||slot===3)cup(-outer*21,front*11,28,'#d9d1b8',parent,.72);
      if(role==='designer'&&slot===0)desktopPlant(parent,outer*22,front*11);
      if(role==='designer'&&slot===1)for(let i=0;i<3;i++)softBox(['#b38582','#81a6a1','#d1ad66'][i],-7+i*5,-front*16,4,4,.18,28.2,parent);
      parent.userData.referenceDesk={role,width:56,depth:40,desktopHeight:28,monitorAnchor:[0,39,0]};desks.push({role,key:s.key});return parent;
    }
    function chair(point,target,parent=architecture,scale=1){
      if(disposed)return;const upholstery='#587487',value=group(parent);value.position.set(point.x,0,point.y);value.rotation.y=Math.atan2(target.x-point.x,target.y-point.y);value.scale.setScalar(scale);
      contactShadow(value,36,34,.8);
      mesh('cylinder','#384653',0,5.4,0,1.8,10.8,1.8,value);
      for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5;rod(value,'#3f5665',[0,3,0],[Math.sin(a)*12,2.4,Math.cos(a)*12],.9);
        const wheel=mesh('cylinder','#263b4c',Math.sin(a)*12,2,Math.cos(a)*12,1.8,2.2,1.8,value);wheel.rotation.z=Math.PI/2;
      }
      mesh('sphere','#405568',0,10.4,0,12,3.2,12,value);
      const seat=mesh('sphere',upholstery,0,12.5,.2,11.9,2.5,11.8,value);seat.material=surface('fabric',upholstery);seat.userData.referenceChairSeat=true;
      // A shallow rectangular upholstered back and thin arm pads read as an
      // office chair even when empty, rather than a head-and-shoulders shape.
      const back=softBox(upholstery,0,-9.5,24,5,20,15,value);back.rotation.x=-.05;back.material=surface('fabric',upholstery);
      const cushion=softBox(upholstery,0,-6.4,19,1.4,14,18,value);cushion.material=surface('fabric',upholstery);
      for(const x of [-10.8,10.8]){
        for(const z of [-6,2])softBox('#465b69',x,z,1.4,1.4,10,13,value);
        softBox(upholstery,x,-1.2,3.5,14,3.3,22.8,value).material=surface('fabric',upholstery);
      }
      value.userData.referenceChair={seatTop:15,seatBase:10,scale};chairs.push(value);return value;
    }
    function plant(x,z,radius=12){
      if(disposed)return;const value=group(),scale=getLayout()?.staffScale||1,foliageSpread=Math.max(1,Math.min(1.85,scale*.74)),crown=Math.max(24,Math.min(35,radius*2.5))*foliageSpread;value.position.set(x,0,z);value.scale.y=scale;
      contactShadow(value,radius*3.3,radius*3.1,1.05);
      const species=((Math.round(x/10)+Math.round(z/10))%3+3)%3;
      const pot=group(value);pot.userData.referencePlantPot=true;
      mesh('cylinder','#a17c54',0,1.5,0,radius*.71,3,radius*.71,pot);
      mesh('cylinder','#eee7d6',0,9.3,0,radius*.91,16.5,radius*.91,pot).material=surface('polymer','#eee7d6');
      mesh('cylinder','#faf1dc',0,17.2,0,radius*.95,1.6,radius*.95,pot);mesh('cylinder','#6c5941',0,18.2,0,radius*.80,.4,radius*.80,pot);
      // Height follows the employees, but only foliage broadens in the floor
      // plane: scaling the whole plant would enlarge its colliding pot.
      const foliage=group(value);foliage.scale.set(foliageSpread,1,foliageSpread);foliage.userData.referencePlantFoliage=true;
      const layout=getLayout(),clearance=Math.min(48,26*foliageSpread),room=[...(layout?.rooms||[]).filter(r=>!r.annex),layout?.conference,layout?.cafe].find(r=>r&&x>=r.x&&x<=r.x+r.width&&z>=r.y&&z<=r.y+r.height);
      let leanX=0,leanZ=0;
      const lean=(distance,direction)=>direction*Math.max(0,Math.min(21,clearance-distance));
      if(room){
        leanX=x-room.x<clearance?lean(x-room.x,1):room.x+room.width-x<clearance?lean(room.x+room.width-x,-1):0;
        leanZ=z-room.y<clearance?lean(z-room.y,1):room.y+room.height-z<clearance?lean(room.y+room.height-z,-1):0;
      }else for(const wall of layout?.wallSegments||[]){
        const [wx,wz,wr,wb]=wall.bounds,vertical=wall.side==='east'||wall.side==='west',center=vertical?(wx+wr)/2:(wz+wb)/2,delta=vertical?x-center:z-center;
        if(Math.abs(delta)>=clearance||(vertical?(z<wz||z>wb):(x<wx||x>wr)))continue;
        const offset=lean(Math.abs(delta),Math.sign(delta));if(vertical&&Math.abs(offset)>Math.abs(leanX))leanX=offset;else if(!vertical&&Math.abs(offset)>Math.abs(leanZ))leanZ=offset;
      }
      // Bend the upper stems and blades into the room; roots remain at the
      // unchanged pot center and the horizontal bias stays at most21 units.
      const bent=([px,py,pz])=>{const amount=Math.max(0,Math.min(1,(py-18)/12))/foliageSpread;return [px+leanX*amount,py,pz+leanZ*amount];};
      const branch=(color,start,end,r)=>rod(foliage,color,bent(start),bent(end),r);
      foliage.userData.wallLean={x:leanX,z:leanZ};
      // Unequal stems and overlapping, individually tilted leaves make a
      // bushy indoor plant while keeping the authored crown and pot bounds.
      branch('#647947',[0,18,0],[-3,58,1],.60);branch('#6b8050',[2,18,0],[5,52,3],.52);branch('#6b8050',[-2,18,0],[-1,45,-5],.48);
      const blades=[[-10,31,3,-1.1,-.42,11,7],[9,35,5,.9,.48,12,7.5],[-4,40,-10,2.6,.50,12,7],[-11,43,-4,-2.0,-.48,11,7],[11,47,-1,1.4,.54,12,7.5],[-9,51,4,-1.1,.57,11,7.4],[4,51,10,.3,-.48,11,7],[5,42,-10,2.7,.42,11,7],[-3,57,-4,2.6,.52,11,7],[1,60,3,.2,.52,11,7],[-10,38,9,-.7,.4,10,7],[10,42,-8,2.2,-.4,11,7],[0,47,12,.2,.5,10,7],[-8,55,-7,-2.4,.45,10,7]];
      for(let i=0;i<blades.length;i++){
        const [bx,by,bz,yaw,tilt,bladeLength,bladeWidth]=blades[i],spread=species===1?1.18:species===2?.83:1,lean=species===2?tilt*1.2:tilt,length=bladeLength*1.04,width=bladeWidth*1.15;
        const px=bx*spread,pz=bz*spread,py=Math.min(by,66.8-Math.abs(Math.sin(lean))*length-.7);
        branch('#6a7e4c',[px*.22,Math.max(23,py-8),pz*.22],[px,py-.4,pz],.28);
        const [leafX,leafY,leafZ]=bent([px,py,pz]),color=['#658d47','#537c43','#789b53'][i%3],leaf=mesh('sphere',color,leafX,leafY,leafZ,width,.85,length,foliage);leaf.rotation.set(lean,yaw+species*.32,0);leaf.material=surface('leaf',color);
      }
      value.userData.plant={potRadius:radius,height:67*scale,crownRadius:crown+Math.max(Math.abs(leanX),Math.abs(leanZ))};value.userData.referencePlant=true;plants.push(value);return value;
    }
    function artFor(role){
      if(galleryArt.has(role))return galleryArt.get(role).material;
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;const ctx=canvas.getContext('2d'),index=roles.indexOf(role),accent=palette[role];
      const paper=(x,y,w,h,color='#fbf4de')=>{ctx.fillStyle='#4b423622';ctx.fillRect(x+3,y+4,w,h);ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
      const line=(x,y,w,color='#869d9c')=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,3);};
      const path=(points,color='#658b92')=>{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();for(const [i,p]of points.entries())i?ctx.lineTo(...p):ctx.moveTo(...p);ctx.stroke();};
      ctx.fillStyle=['#d1b284','#e9e6d6','#edf0e3','#e6dcc5','#e9e7d4','#36576b'][index];ctx.fillRect(0,0,768,256);ctx.lineCap='round';ctx.lineJoin='round';
      if(index===0){
        for(let n=0;n<160;n++){ctx.fillStyle=n%2?'#896c4520':'#fff1c825';ctx.fillRect((n*83)%768,(n*47)%256,3,2);}
        const notes=[[27,30,111,78,'#f0d382'],[156,61,77,98,'#baccad'],[278,25,88,78,'#edce77'],[397,38,96,80,'#dfbaa0'],[305,151,113,72,'#d8d5ae'],[452,153,86,71,'#bad1c1'],[585,27,145,182,'#f8ecd0']];
        for(const [x,y,w,h,c]of notes){paper(x,y,w,h,c);line(x+12,y+22,w-25);line(x+12,y+35,w-39);ctx.fillStyle='#9e6d4d';ctx.beginPath();ctx.arc(x+w/2,y+7,3,0,Math.PI*2);ctx.fill();}
        path([[236,108],[258,108],[258,66],[277,66]]);path([[368,68],[397,68]]);path([[447,119],[447,135],[363,135],[363,150]]);line(602,153,102,'#b5c9b4');line(602,174,82,'#cfb778');
      }else if(index===1){
        paper(22,21,196,213,'#f6f0df');for(let n=0;n<5;n++){ctx.fillStyle=['#668e9b','#c18c7d','#d1b26e','#8b9d83','#9c88a4'][n];ctx.fillRect(39+n%2*82,39+Math.floor(n/2)*55,68,39);}
        paper(254,18,264,219);ctx.strokeStyle='#7e9ea3';ctx.lineWidth=4;ctx.strokeRect(274,40,224,29);ctx.strokeRect(274,85,93,101);ctx.strokeRect(383,85,115,47);line(384,147,104);line(384,163,88);line(275,203,186);
        paper(551,30,190,187,'#e9cfaa');ctx.fillStyle='#8fa8a0';ctx.beginPath();ctx.arc(620,97,42,0,Math.PI*2);ctx.fill();ctx.fillStyle='#be877e';ctx.fillRect(625,107,77,65);ctx.fillStyle='#eadbad';ctx.beginPath();ctx.arc(677,84,23,0,Math.PI*2);ctx.fill();
      }else if(index===2){
        const nodes=[[35,62,155,107],[270,23,97,73],[413,25,100,72],[319,154,144,73],[574,68,150,104]];
        for(const points of [[[190,114],[232,114],[232,58],[269,58]],[[367,59],[413,59]],[[462,98],[462,126],[390,126],[390,153]],[[512,60],[543,60],[543,119],[573,119]]])path(points);
        for(const [x,y,w,h]of nodes){paper(x,y,w,h,'#d6e1d3');ctx.strokeStyle='#7a9b9b';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);line(x+12,y+18,w-24,'#587e8c');line(x+12,y+32,w-34);line(x+12,y+46,w-43);}
      }else if(index===3){
        paper(26,27,195,200,'#f8edda');for(let n=0;n<5;n++){ctx.fillStyle=['#b6c5a8','#d6b885','#bccdcb'][n%3];ctx.fillRect(42,45+n*33,26,20);line(80,51+n*33,113);}
        paper(265,19,238,220);for(let row=0;row<6;row++){const y=41+row*30;ctx.strokeStyle='#9dad91';ctx.lineWidth=2;ctx.strokeRect(280,y,13,13);line(306,y+2,168);line(306,y+10,117,'#c3b18c');}
        paper(548,35,183,182,'#e8e6cf');ctx.strokeStyle='#6e8d68';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(639,199);ctx.quadraticCurveTo(620,113,648,57);ctx.stroke();for(let n=0;n<5;n++){ctx.fillStyle=n%2?'#91a373':'#638464';ctx.beginPath();ctx.ellipse(638+(n%2?19:-18),80+n*22,23,10,n%2?-.5:.5,0,Math.PI*2);ctx.fill();}
      }else if(index===4){
        paper(26,26,194,203);path([[45,43],[45,205],[204,205]]);for(let n=0;n<4;n++){ctx.fillStyle=['#88a9a3','#b2ba89','#c6ae78','#7896a8'][n];ctx.fillRect(61+n*34,190-n*29,22,15+n*29);}
        paper(265,20,239,218,'#f9f4e4');for(let row=0;row<4;row++)for(let col=0;col<4;col++){ctx.fillStyle=['#94aaa5','#c3c8a3','#d8bd83','#9aaaba'][(row+col)%4];ctx.beginPath();ctx.roundRect(282+col*52,40+row*44,39,31,4);ctx.fill();}
        paper(552,37,178,177);for(let row=0;row<5;row++){line(569,62+row*27,142,row%2?'#9db6ae':'#b7aa80');ctx.fillStyle='#cfb474';ctx.fillRect(570,51+row*27,18,5);}
      }else{
        ctx.strokeStyle='#a2c8c13b';ctx.lineWidth=1;for(let x=14;x<768;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,256);ctx.stroke();}for(let y=12;y<256;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(768,y);ctx.stroke();}
        ctx.strokeStyle='#b4d1bb';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(384,39);ctx.lineTo(446,66);ctx.lineTo(439,132);ctx.quadraticCurveTo(421,177,384,196);ctx.quadraticCurveTo(346,177,329,132);ctx.lineTo(322,66);ctx.closePath();ctx.stroke();
        for(const [x,y]of [[105,58],[154,178],[253,121],[536,61],[612,165],[699,100]]){path([[x,y],[x<384?298:473,y],[x<384?298:473,119]],'#8eb4b7');ctx.fillStyle='#d6c38e';ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();}
        ctx.strokeStyle='#8eb4b7';ctx.lineWidth=4;ctx.beginPath();ctx.arc(384,108,19,Math.PI,0);ctx.stroke();ctx.fillStyle='#b9d1bf';ctx.fillRect(365,106,38,33);line(331,222,106,'#b6c4aa');
      }
      ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.strokeRect(7,7,754,242);
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const value=new T.MeshBasicMaterial({map:texture,toneMapped:false});galleryArt.set(role,{texture,material:value});return value;
    }
    function northGalleryGeometry(width){
      const family=width<85?'70x76':width<145?'100x76':'240x80',key=`reference-interior:crop:${family}`;
      if(galleryGeometry.has(key))return galleryGeometry.get(key);
      if(Object.hasOwn(geometries,key))throw new Error('Interior gallery geometry key is already owned');
      const [cropWidth,cropHeight]=family.split('x').map(Number),fraction=cropWidth/(cropHeight*3),value=geometries.plane.clone(),uv=value.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setX(i,.5+(uv.getX(i)-.5)*fraction);
      uv.needsUpdate=true;geometries[key]=value;galleryGeometry.set(key,value);return value;
    }
    function galleryPanel(room,side,width,height,x,z,base){
      const value=group();value.position.set(x,base,z);if(side==='east')value.rotation.y=-Math.PI/2;
      value.userData.dynamic=true;value.userData.side=side;value.userData.vertical=side==='east';value.userData.requiredHeight=base+height/2+5;value.userData.referenceGallery=room.role;
      softBox('#9d7549',0,0,width+6,4,height+6,-height/2-3,value);softBox('#e4c993',0,2.2,width+2,1,height+2,-height/2-1,value);
      const face=mesh('plane','#ffffff',0,0,2.9,width,height,1,value);face.material=artFor(room.role);
      if(side==='north')face.geometry=northGalleryGeometry(width);
      boards.push(value);return value;
    }
    function wallMounted(side,x,z,height,requiredHeight){
      const value=group();value.position.set(x,height,z);value.rotation.y={north:0,east:-Math.PI/2,south:Math.PI,west:Math.PI/2}[side]||0;
      value.userData.dynamic=true;value.userData.side=side;value.userData.vertical=side==='east'||side==='west';value.userData.requiredHeight=requiredHeight;boards.push(value);return value;
    }
    function wallPaneling(g){
      const top=Math.min(55,g.ceilingHeight*.27);
      for(const segment of g.wallSegments||[]){
        const [x,z,r,b]=segment.bounds,vertical=segment.side==='east'||segment.side==='west',length=(vertical?b-z:r-x)-12;
        if(length<18)continue;
        const inset={north:[0,6],east:[-6,0],south:[0,-6],west:[6,0]}[segment.side],value=wallMounted(segment.side,(x+r)/2+inset[0],(z+b)/2+inset[1],0,top+3);
        softBox('#d8bc8b',0,0,length,1.6,top-7,5,value).material=surface('plank','#d8bc8b');
        softBox('#ae8b59',0,1.1,length,2,3,top-1,value);softBox('#b79765',0,1,length,2,5,1,value);
        const bays=Math.max(1,Math.min(8,Math.round(length/95)));
        for(let i=1;i<bays;i++)softBox('#b79a6d',-length/2+i*length/bays,1,2,1.5,top-9,6,value);
        value.userData.referenceWallPanel=segment.roomId;wallPanels++;
      }
    }
    function wallClock(room,height){
      const base=height*.84,value=wallMounted('north',room.x+room.width-101,room.y+9,base,base+17);
      const rim=mesh('cylinder','#a78955',0,0,1.7,16.5,3.4,16.5,value);rim.rotation.x=Math.PI/2;
      const face=mesh('cylinder','#f5ecd6',0,0,3.6,14.5,.7,14.5,value);face.rotation.x=Math.PI/2;
      for(let n=0;n<12;n++){const a=n*Math.PI/6,mark=softBox('#697576',Math.sin(a)*11.5,4.1,n%3===0?1.8:1,1,n%3===0?3.2:1.7,Math.cos(a)*11.5-1,value);mark.rotation.z=-a;}
      rod(value,'#294254',[0,0,4.8],[-5,6,4.8],.8);rod(value,'#294254',[0,0,4.9],[8,2,4.9],.65);mesh('sphere','#a78955',0,0,5.1,1.6,1.6,.6,value);
      value.userData.referenceWallClock=true;clocks++;
    }
    function displayShelf(room,side,x,z,width,base){
      const value=wallMounted(side,x,z,base,base+26),depth=8;
      softBox('#d5b47b',0,depth/2,width,depth,3,0,value).material=surface('plank','#d5b47b');
      for(const sx of [-width*.36,width*.36]){softBox('#a58c68',sx,1,2,2,13,-12,value);rod(value,'#a58c68',[sx,-10,1],[sx,0,7],.6);}
      const bookColors=['#375168','#a67d66','#d4c298','#80948a','#6f849b'];
      for(let i=0;i<5;i++){
        const h=15+i%3*3,book=softBox(bookColors[i],-width*.35+i*5.1,4,4.1,5,h,3,value);book.rotation.z=i===4?-.12:0;
        softBox('#eee2c2',-width*.35+i*5.1,6.65,2.8,.35,1.1,7,value);
      }
      const vaseX=width*.28;mesh('sphere','#ede4cf',vaseX,9,4,6,6,3.4,value).material=surface('polymer','#ede4cf');
      rod(value,'#728653',[vaseX,13,4],[vaseX+1,23,4],.3);
      for(const sign of [-1,1]){const leaf=mesh('sphere','#63894b',vaseX+sign*4,19+sign*2,4,4,.6,5,value);leaf.rotation.set(.7,sign*.9,0);leaf.material=surface('leaf','#63894b');}
      value.userData.referenceDisplayShelf=true;displayShelves++;
    }
    function roomDressing(room,g){
      const height=g.ceilingHeight||176,boardTop=height-65,boardHeight=Math.min(82,height*.4),width=Math.max(170,Math.min(310,room.width-200));
      const north=galleryPanel(room,'north',width,boardHeight,room.x+28+width/2,room.y+8,boardTop-boardHeight/2);
      // Main artwork is a complete department board, away from the cabinet.
      // The east corner is a compact display, leaving the existing window free.
      const eastWidth=Math.min(96,room.height*.24),east=galleryPanel(room,'east',eastWidth,54,room.x+room.width-8,room.y+108,Math.min(boardTop-30,height*.54));
      displayShelf(room,'east',room.x+room.width-8,room.y+108,eastWidth+8,Math.min(boardTop-65,height*.34));
      const gap=room.width-178-(28+width);
      if(gap>=78){
        const frameWidth=gap>=155?100:70,frame=galleryPanel(room,'north',frameWidth,55,room.x+28+width+gap/2,room.y+9,Math.min(boardTop-28,height*.53));
        frame.userData.referenceDisplayFrame=true;wallDisplays++;
      }
      if(room.role==='designer'){
        const frame=galleryPanel(room,'east',70,45,room.x+room.width-8,room.y+108,height*.84);frame.userData.referenceDisplayFrame=true;wallDisplays++;
      }else wallClock(room,height);
      galleries.push({role:room.role,north,east});wallDisplays+=2;localLight(room,room.role);
    }
    function localLight(room,id){
      const height=getLayout()?.ceilingHeight||176,value=new T.PointLight('#ffd59a',11000,Math.min(720,Math.max(400,room.width*.8,room.height*.95)),2);
      value.position.set(room.x+room.width-65,height*.78,room.y+28);value.castShadow=false;value.userData.referenceRoom=id;value.userData.referenceBaseIntensity=11000;architecture.add(value);lights.push(value);
      const fixture=group();fixture.position.set(value.position.x,height*.82,room.y+7);fixture.userData.dynamic=true;fixture.userData.side='north';fixture.userData.requiredHeight=height*.91;fixture.userData.referenceSconce=true;
      softBox('#947340',0,0,8,4,17,-9,fixture);const bulb=mesh('sphere','#ffe7ac',0,-3,5.5,6,5,4,fixture),key=`reference-bulb:${id}`;
      if(!api.materials.has(key))api.materials.set(key,new T.MeshBasicMaterial({color:'#424b59',toneMapped:false}));bulb.material=api.materials.get(key);value.userData.referenceBulb=bulb;
      mesh('sphere','#b68d4f',0,2,4,8,2.3,6,fixture);boards.push(fixture);
    }
    function frontGreenery(bounds){
      const [x,z,r,b]=bounds,span=r-x,count=Math.max(1,Math.floor((span-36)/135));frontage.push([...bounds]);
      for(let i=0;i<count;i++){
        const cx=x+(i+.5)*span/count,cz=(z+b)/2,width=Math.min(108,span/count-22),depth=Math.max(.5,b-z-.6),value=group();value.position.set(cx,0,cz);
        softBox('#b09267',0,0,width,depth,16,2,value);box('#e2c796',0,0,width+2,depth,.8,18,value);box('#625743',0,0,width-6,Math.max(.3,depth-.6),.6,18.5,value);
        for(let n=0;n<4;n++){
          const stemX=(n-1.5)*width*.23,top=36+n%2*6;rod(value,'#617b47',[stemX,19,0],[stemX+2,top,0],.35);
          for(const side of [-1,1]){const leaf=mesh('sphere','#658d47',stemX+side*5.5,top-3,side*1.5,5.6,.75,8.6,value);leaf.rotation.set(side*.55,side*.9+n*.2,0);leaf.material=surface('leaf','#658d47');}
        }
        value.userData.referenceFrontPlanter=true;frontPlanters++;
      }
    }
    function cabinetDressing(g){
      for(const cabinet of (g.decorations||[]).filter(p=>p.kind==='bookcase'&&p.bounds)){
        const [x,z,r,b]=cabinet.bounds,width=r-x,depth=b-z,base=cabinet.height||82,value=group();value.position.set((x+r)/2,base,(z+b)/2);
        const bookX=width*.22,vaseX=-width*.23;
        softBox('#3f536d',bookX,0,24,Math.min(15,depth-4),2.4,0,value);softBox('#e4d7b2',bookX+.8,0,22.4,Math.min(14,depth-5),1.6,2.4,value);
        softBox('#ba9871',bookX-1,1,22,Math.min(13,depth-6),1.2,4,value);
        mesh('cylinder','#eee7d6',vaseX,6,0,5.5,12,5.5,value).material=surface('polymer','#eee7d6');mesh('cylinder','#eadbbb',vaseX,13.5,0,3.4,4,3.4,value);
        rod(value,'#7d8b62',[vaseX,15,0],[vaseX-3,28,1],.3);rod(value,'#7d8b62',[vaseX,15,0],[vaseX+4,25,-2],.25);
        for(const side of [-1,1]){const leaf=mesh('sphere','#658d47',vaseX+side*3.5,24+(side<0?2:0),side,3.1,.45,5.4,value);leaf.rotation.set(side*.45,side,0);leaf.material=surface('leaf','#658d47');}
        value.userData.referenceCabinetDressing=true;cabinetDressings++;
      }
    }
    function decorate(g){
      if(disposed||decorated)return;decorated=true;
      wallPaneling(g);
      for(const room of g.rooms.filter(r=>roles.includes(r.role)&&!r.annex))roomDressing(room,g);
      if(g.conference){const room=g.conference,height=g.ceilingHeight||176;wallClock(room,height);displayShelf(room,'north',room.x+room.width-185,room.y+9,145,height*.48);}
      if(g.cafe){const room=g.cafe,height=g.ceilingHeight||176;wallClock(room,height);displayShelf(room,'north',room.x+room.width*.57,room.y+32,150,height*.57);}
      for(const [id,room]of [['conference',g.conference],['cafe',g.cafe]])if(room)localLight(room,id);
      cabinetDressing(g);
      const strips=[...(g.partitions||[]).map(p=>Array.isArray(p)?p:p.bounds),...(g.props||[]).filter(p=>p.kind==='glass-panel').map(p=>p.bounds)].filter(b=>b&&b[1]>g.height-60&&b[2]>b[0]);
      for(const bounds of strips){if(frontage.some(b=>b.every((n,i)=>n===bounds[i])))continue;frontGreenery(bounds);}
      setStyle(style);
    }
    function applyRoomLights(){
      const config=lightStyles[style];for(const light of lights){const lit=occupiedRooms.has(light.userData.referenceRoom);light.intensity=lit?light.userData.referenceBaseIntensity*config.gain:0;light.color.set(config.color);light.userData.referenceBulb.material.color.set(lit?config.color:'#424b59');}
    }
    function setRoomOccupancy(rooms){occupiedRooms.clear();for(const room of rooms)if(room.lit)occupiedRooms.add(room.id);applyRoomLights();}
    function setStyle(id){style=Object.hasOwn(lightStyles,id)?id:'illustrated';applyRoomLights();return style;}
    function reset(){occupiedRooms.clear();desks.length=0;chairs.length=0;plants.length=0;galleries.length=0;for(const light of lights)light.dispose?.();lights.length=0;frontage.length=0;frontPlanters=0;cabinetDressings=0;wallPanels=0;wallDisplays=0;clocks=0;displayShelves=0;decorated=false;}
    function dispose(){if(disposed)return;disposed=true;reset();for(const art of galleryArt.values()){art.texture.dispose();art.material.dispose();}galleryArt.clear();for(const [key,value]of galleryGeometry){value.dispose();if(geometries[key]===value)delete geometries[key];}galleryGeometry.clear();}
    function diagnostics(){return {kit:'reference-interior-v1',resourceGuide:'reference-resources-v1/furniture.png',disposed,style,desks:desks.length,chairs:chairs.length,plants:plants.length,plantStyle:'rounded-broadleaf',models:{desk:'paired-bench',chair:'bucket-shell',plant:'branching-broadleaf'},galleryFamilies:galleryArt.size,galleryRoles:[...galleryArt.keys()],galleryClusters:galleries.length,galleryPanels:galleries.length*2,wallPanels,wallDisplays,clocks,displayShelves,localLights:lights.length,shadowedLocalLights:lights.filter(l=>l.castShadow).length,lightIntensity:lights.map(l=>l.intensity),roomLights:lights.map(l=>({id:l.userData.referenceRoom,intensity:l.intensity,bulbColor:l.userData.referenceBulb.material.color.getHexString()})),frontPlanterStrips:frontage.map(b=>[...b]),frontPlanters,cabinetDressings,ownedArtTextures:galleryArt.size,ownedArtMaterials:galleryArt.size,ownedGalleryGeometries:galleryGeometry.size};}
    return {desk,chair,plant,decorate,setStyle,setRoomOccupancy,reset,dispose,diagnostics};
  }
  return {create};
})();
