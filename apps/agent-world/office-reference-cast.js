/* Reference-directed native chibi models. Hosts own people, poses and identity. */
window.OfficeReferenceCast=(()=>{
  'use strict';
  function create(api){
    const {T,mesh,geometries}=api,faces=new Map(),ownedGeometries=new Map();
    const families=['mica','lilt','brim','quill','tavi','sable'];
    // Modeled from reference-resources-v1/characters.png: the glasses employee
    // and twin-antenna robot are Brim and Sable; the other families are variants.
    const hairColors=['#493b36','#3c3348','#272a3d'];
    const uniforms=['#c87936','#344464','#242e47'];
    const white='#f5f5f1',cobalt='#1765c1',cyan='#22dfff',joint='#172c4b';
    let disposed=false,headsBuilt=0,clothesBuilt=0;
    const variant=value=>Number.isInteger(value)&&value>=0&&value<5?value:0;
    function family(value,robot){return Number.isInteger(value)&&value>=(robot?3:0)&&value<(robot?6:3)?value:robot?3:0;}
    function part(kind,color,x,y,z,sx,sy,sz,parent,tilt=0){const value=mesh(kind,color,x,y,z,sx,sy,sz,parent);value.rotation.z=tilt;if(color===white&&typeof api.surface==='function')value.material=api.surface('polymer',white);return value;}
    function sphere(color,x,y,z,sx,sy,sz,parent,tilt=0){return part('sphere',color,x,y,z,sx,sy,sz,parent,tilt);}
    function rounded(color,x,y,z,sx,sy,sz,parent,tilt=0){return part('rounded',color,x,y,z,sx,sy,sz,parent,tilt);}
    function ring(color,x,y,z,sx,sy,sz,parent,tilt=0){return part('ring',color,x,y,z,sx,sy,sz,parent,tilt);}
    function pooled(name,build){
      if(disposed)throw new Error('Reference cast is disposed');
      const key=`reference-cast:${name}`;
      if(!ownedGeometries.has(key)){const geometry=build();geometry.computeVertexNormals();geometry.computeBoundingSphere();geometries[key]=geometry;ownedGeometries.set(key,geometry);}
      return key;
    }
    function hairCap(profile){return pooled(`cap:${profile}`,()=>{
      // One continuous shell has a high front hairline and a lower nape.
      // Unlike overlapping ellipsoids it has no round lobes at the crown.
      const geometry=new T.SphereGeometry(1,40,22,0,Math.PI*2,0,Math.PI/2),p=geometry.attributes.position;
      const radii=profile===1?[14.4,13.8,12.2]:profile===2?[14.7,13.5,12.1]:[15,13.6,12.3];
      for(let i=0;i<p.count;i++){
        const phi=Math.atan2(p.getZ(i),-p.getX(i)),front=Math.max(0,Math.sin(phi)),theta=Math.acos(Math.min(1,Math.max(-1,p.getY(i))))/(Math.PI/2)*(2.19-1.14*front+.07*front*Math.cos(phi)),s=Math.sin(theta);
        p.setXYZ(i,-radii[0]*Math.cos(phi)*s,.15+radii[1]*Math.cos(theta),radii[2]*Math.sin(phi)*s-.25);
      }
      return geometry;
    });}
    function sweptLock(name,points,width,depth){return pooled(name,()=>{
      const geometry=new T.SphereGeometry(1,28,20),p=geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        const t=(p.getY(i)+1)/2,u=1-t,c=[0,0,0],tangent=[0,0,0];
        for(let axis=0;axis<3;axis++){c[axis]=u*u*u*points[0][axis]+3*u*u*t*points[1][axis]+3*u*t*t*points[2][axis]+t*t*t*points[3][axis];tangent[axis]=3*u*u*(points[1][axis]-points[0][axis])+6*u*t*(points[2][axis]-points[1][axis])+3*t*t*(points[3][axis]-points[2][axis]);}
        const length=Math.hypot(tangent[0],tangent[1])||1,across=p.getX(i)*width;
        p.setXYZ(i,c[0]+tangent[1]/length*across,c[1]-tangent[0]/length*across,c[2]+p.getZ(i)*depth);
      }
      return geometry;
    });}
    function hairLocks(profile){
      const paths=[
        [[[-13,8.7,3.6],[-8,14.3,7.8],[3,10,12.8],[11,3.8,7.2]],[[-11,9.2,7],[-4,11.5,13.5],[.5,6,14],[4.5,5,10.8]]],
        [[[12,8.6,4],[8,14,8],[-4,10,12.8],[-11,4.5,6.8]],[[8,9.4,7],[2,11.5,13],[-5,7,13],[-7,5.2,10.5]]],
        [[[4,12.3,5],[1,12.7,11],[-6,8,14.3],[-12,3.4,8.7]],[[5,12.2,2],[10,12,7],[14,6,9],[13,2,3]]]
      ][profile];
      return [sweptLock(`sweep:${profile}`,paths[0],profile===2?3.6:2.8,profile===2?1.7:1.45),sweptLock(`fringe:${profile}`,paths[1],profile===2?3.1:1.65,profile===2?1.5:.95)];
    }
    function robotShell(profile){return pooled(`shell:${profile}`,()=>{
      const geometry=new T.SphereGeometry(1,36,24),p=geometry.attributes.position,power=profile===4?.96:profile===5?.84:.8;
      for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,Math.sign(x)*Math.pow(Math.abs(x),power),Math.sign(y)*Math.pow(Math.abs(y),profile===4?1:.86),Math.sign(z)*Math.pow(Math.abs(z),power));}
      return geometry;
    });}
    function glassesLoop(){return pooled('glasses-loop',()=>{
      const geometry=new T.TorusGeometry(1,.105,10,48),p=geometry.attributes.position;
      // A rounded rectangular loop has a real open lens, unlike a dark plate
      // or circular spectacle. Both eyes remain visible through the frame.
      for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),angle=Math.atan2(y,x),c=Math.cos(angle),s=Math.sin(angle),tube=Math.hypot(x,y)-1,radius=1/Math.pow(Math.pow(Math.abs(c),4.2)+Math.pow(Math.abs(s),4.2),1/4.2);p.setXYZ(i,c*(radius+tube),s*(radius+tube),p.getZ(i));}
      return geometry;
    });}
    function faceMaterial(profile,trait){
      const key=profile*5+trait;if(faces.has(key))return faces.get(key).material;
      if(disposed)throw new Error('Reference cast is disposed');
      // Only thirty authored combinations are admitted. No session text, tool
      // output, network image or per-frame artwork ever enters a face map.
      const canvas=document.createElement('canvas');canvas.width=canvas.height=384;
      const ctx=canvas.getContext('2d');ctx.scale(384/512,384/512);ctx.lineCap='round';ctx.lineJoin='round';
      if(profile<3){
        const iris=['#76452d','#725891','#4d3732'][profile];
        for(const side of [-1,1]){
          const x=256+side*(profile===2?116:104),y=229+(profile===1?side*4:0),w=profile===2?62:58,h=profile===2?74:75;
          ctx.fillStyle='#fff9ec';ctx.beginPath();ctx.ellipse(x,y,w,h,-side*.045,0,Math.PI*2);ctx.fill();
          ctx.save();ctx.beginPath();ctx.ellipse(x,y,w,h,-side*.045,0,Math.PI*2);ctx.clip();
          const gradient=ctx.createLinearGradient(0,y-h,0,y+h);gradient.addColorStop(0,'#251f2a');gradient.addColorStop(.5,iris);gradient.addColorStop(1,'#d2bb7a');
          ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(x+side*3,y+3,36,h,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#221f2c';ctx.beginPath();ctx.ellipse(x+side*3,y-1,18,47,0,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(x-14,y-30,13,19,-.3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x+17,y+28,7,0,Math.PI*2);ctx.fill();ctx.restore();
          ctx.strokeStyle='#352933';ctx.lineWidth=10;ctx.beginPath();ctx.ellipse(x,y,w,h,-side*.045,Math.PI,Math.PI*2);ctx.stroke();
          ctx.lineWidth=profile===1?11:13;ctx.beginPath();ctx.moveTo(x-45,y-h-27);ctx.quadraticCurveTo(x,y-h-42+(trait===2?12:0),x+42,y-h-27);ctx.stroke();
          if(profile===1){ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(x+side*w,y-20);ctx.lineTo(x+side*(w+12),y-36);ctx.stroke();}
          const blush=ctx.createRadialGradient(x+side*17,335,0,x+side*17,335,45);blush.addColorStop(0,'rgba(229,122,106,.36)');blush.addColorStop(1,'rgba(229,122,106,0)');ctx.fillStyle=blush;ctx.fillRect(x-65,287,130,96);
        }
        ctx.strokeStyle='#bc8267';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(253,305);ctx.quadraticCurveTo(245,322,263,322);ctx.stroke();
        // The smile sits below the physical nose and lower glasses frame.
        ctx.save();ctx.translate(0,64);
        if(profile!==2){ctx.fillStyle='#753e3e';ctx.beginPath();ctx.moveTo(227,359);ctx.quadraticCurveTo(256,371,285,357);ctx.quadraticCurveTo(257,402-(trait===3?13:0),227,359);ctx.fill();}
        ctx.strokeStyle='#603c37';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(226,358);ctx.quadraticCurveTo(256,371,286,357);ctx.stroke();
        ctx.restore();
        if(profile===0){ctx.fillStyle='#ae6c50';for(const side of [-1,1])for(const [x,y]of [[121,326],[144,334],[131,346]]){ctx.beginPath();ctx.arc(side<0?x:512-x,y,3.3,0,Math.PI*2);ctx.fill();}}
      }else{
        const glow=profile===5?'#22ddff':profile===4?'#70efdc':'#75ddff';
        ctx.shadowColor=glow;ctx.shadowBlur=10;ctx.fillStyle=glow;ctx.strokeStyle=glow;
        for(const side of [-1,1]){
          const x=256+side*105,closed=trait===2||(profile===4&&trait===4);
          ctx.beginPath();
          if(closed){ctx.lineWidth=23;ctx.moveTo(x-38,244);ctx.quadraticCurveTo(x,186,x+38,244);ctx.stroke();}
          else{const w=profile===5?67:64,h=profile===4?83:103;if(profile===5)ctx.ellipse(x,224+(side===1&&trait===3?10:0),w/2,h/2,0,0,Math.PI*2);else ctx.roundRect(x-w/2,169+(side===1&&trait===3?17:0),w,h,w*.45);ctx.fill();ctx.shadowBlur=0;if(profile!==5){ctx.fillStyle='#efffff';ctx.beginPath();ctx.ellipse(x-9,188,8,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=glow;}ctx.shadowBlur=10;}
        }
        ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(profile===5?230:220,337);ctx.quadraticCurveTo(256,trait===1?348:368,profile===5?282:292,337);ctx.stroke();
        ctx.shadowBlur=0;if(profile!==5){ctx.fillStyle='#426b91';for(const side of [-1,1]){ctx.beginPath();ctx.roundRect(256+side*172-15,309,30,11,5);ctx.fill();}}
      }
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
      const material=new T.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01,depthWrite:false,toneMapped:false});
      faces.set(key,{texture,material});return material;
    }
    function humanHead(body,profile,edition,skin,trait){
      if(disposed)throw new Error('Reference cast is disposed');
      profile=family(profile,false);edition=variant(edition);trait=variant(trait);headsBuilt++;
      const head=new T.Group();head.position.y=48.5;body.add(head);
      const shape=profile===1?[13.8,12.8,11.7]:profile===2?[14.5,12.6,11.8]:[14.5,12.4,11.8];
      part(`head${profile}`,skin,0,0,0,...shape,head);
      const face=part(`face${profile}`,'#ffffff',0,0,0,...shape,head);face.material=faceMaterial(profile,trait);
      for(const side of [-1,1]){sphere(skin,side*13.4,-.8,-.4,2.15,2.8,1.8,head);sphere('#d8977b',side*14.1,-.8,.4,.6,1.45,.8,head);}
      // The nose and broad cheek volume remain actual geometry at every view.
      sphere(skin,0,-2.1,11.25,1.25,1.55,1.4,head);
      const hair=new T.Group();head.add(hair);hair.scale.x=edition===1?-1:1;
      const color=hairColors[profile],highlight=profile===0?'#5a493f':profile===1?'#493c53':'#36394f',[sweep,fringe]=hairLocks(profile);
      part(hairCap(profile),color,0,0,0,1,1,1,hair);
      part(sweep,highlight,0,0,0,1,1,1,hair);part(fringe,color,0,0,0,1,1,1,hair);
      if(profile===1){
        const tail=sweptLock('ponytail',[[-10,2,-9],[-17,3,-15],[-15,-8,-13],[-10,-12,-8]],3.8,4);
        part(tail,color,0,0,0,1,1,1,hair);ring('#d9a35c',-10.5,1.5,-9.5,2.7,2.7,.6,hair,.3);
        // A continuous padded arch replaces the previous string of beads.
        const band=pooled('headphone-band',()=>new T.TorusGeometry(14.3,.75,8,40,Math.PI));part(band,'#273e61',0,0,-1,1,1,1,head);
        for(const side of [-1,1]){rounded('#273e61',side*14.8,.3,-.7,3.3,7.7,6.2,head);rounded('#db9e55',side*16.5,.3,-.7,.7,4.6,3.8,head);}
      }else if(profile===2){
        // Broad center fringe and a second layer recreate the sheet's side
        // part; the cap is still one continuous crown/nape underneath them.
        part(sweep,color,2,.1,1.1,.72,.94,.98,hair);
        const rear=part(fringe,highlight,0,-2,-1.1,.94,1,1,hair);rear.rotation.y=Math.PI;
        const loop=glassesLoop();
        for(const side of [-1,1]){part(loop,'#1c2a43',side*5.9,.65,11.6,5.1,3.8,3.5,head);rounded('#1c2a43',side*11.9,1.4,7.6,1.2,1.1,8,head);}
        rounded('#1c2a43',0,1.2,12.2,3,1.2,1.1,head);
      }
      if(edition===3||edition===4){rounded(edition===3?'#f0c466':'#6cc7d2',profile===1?10.8:-11.6,5.1,7.2,1.6,4.7,1.5,hair,profile===1?-.4:.35);}
      return head;
    }
    function robotHead(body,profile,edition,trait){
      if(disposed)throw new Error('Reference cast is disposed');
      profile=family(profile,true);edition=variant(edition);trait=variant(trait);headsBuilt++;
      const head=new T.Group();head.position.y=48.5;body.add(head);
      const detail=new T.Group();detail.scale.x=edition===1?-1:1;head.add(detail);
      let screenWidth=22,screenHeight=16,screenY=0,screenZ=12.1;
      if(profile===3){
        part(robotShell(profile),white,0,.6,-.8,14.3,11.8,10.8,head);
        rounded(cobalt,0,0,8.7,26.2,20,6,head);rounded(joint,0,0,11.2,23.5,17.6,1.5,head);
        for(const side of [-1,1]){rounded(cobalt,side*13.8,-.1,-.6,3.2,7.8,7.5,head);rounded(white,side*15.5,-.1,-.6,.7,4.9,4.9,head);}
        part('cylinder',joint,-6,12.2,-3,.6,3.7,.6,detail);sphere(cyan,-6,14,-3,1.6,1.3,1.6,detail);
        rounded(cobalt,0,-8.7,-6.8,10,3,4,detail);
      }else if(profile===4){
        part(robotShell(profile),white,0,0,-1.2,14.7,11.5,11.5,head);
        rounded('#cee6ec',0,-1.2,8.3,26,19,6.2,head);rounded(joint,0,.2,11.25,23.5,15.9,1.5,head);screenHeight=14.5;screenY=.2;
        for(const side of [-1,1]){rounded(cobalt,side*13.8,.4,-1.6,3.4,6.5,6.7,head);rounded(cyan,side*15.6,.4,-1.6,.6,3.5,3.7,head);}
        rounded(cobalt,3.5,11.2,-3.7,4.8,3.1,4.2,detail);sphere(cyan,3.5,13.1,-3.7,1.3,1.1,1.3,detail);
        const mic=rounded(joint,12.5,-5.6,5,1,1.1,7.3,detail);mic.rotation.y=-.3;sphere(cyan,11.2,-5.7,8.7,1.1,1.1,1.1,detail);
      }else{
        // The turnaround's broad ivory helmet surrounds a nearly black curved
        // display. Cobalt is confined to circular ear pods and joints.
        const shell=robotShell(profile);
        part(shell,white,0,.4,-.8,14.6,11.6,10.8,head);
        part(shell,'#0d192a',0,-.5,10.5,11.8,8.8,1.45,head);screenWidth=21;screenHeight=14.8;screenY=-.3;screenZ=11.95;
        for(const side of [-1,1]){
          const collar=part('cylinder',white,side*13.7,0,-.8,4.9,1.4,4.9,head);collar.rotation.z=Math.PI/2;
          const pod=part('cylinder',cobalt,side*15,0,-.8,4.3,2.5,4.3,head);pod.rotation.z=Math.PI/2;
          sphere(cobalt,side*16.2,0,-.8,.8,3.5,3.5,head);
          const light=ring(cyan,side*16.55,0,-.8,3.6,3.6,.45,head);light.rotation.y=Math.PI/2;
          part('cylinder',joint,side*8.2,12,-4.2,.48,4,.48,detail,-side*.08);
          rounded(white,side*8.35,14,-4.2,1.45,2.5,1.45,detail,-side*.08);
        }
      }
      // A face viewport is inset in an actual shell. The blue rim and curved
      // side pods keep their volume during free rotation.
      const face=part('plane','#ffffff',0,screenY,screenZ+.3,screenWidth,screenHeight,1,head);face.material=faceMaterial(profile,trait);
      rounded(cobalt,0,-9.2,-8.9,8,2,1.2,detail);
      if(edition===3||edition===4)rounded(edition===3?'#f1b35a':cyan,-7.7,-7.1,-8,3.3,2,1.4,detail);
      return head;
    }
    function clothes(body,profile,edition){
      if(disposed)throw new Error('Reference cast is disposed');
      profile=Number.isInteger(profile)&&profile>=0&&profile<6?profile:0;edition=variant(edition);clothesBuilt++;
      const robot=profile>=3,color=robot?white:uniforms[profile];
      const torso=profile===5?part(robotShell(profile),white,0,30,0,9.1,8.7,5.7,body):part(robot?'rounded':'jacket',color,0,30,0,robot?17.5:8.7,17,robot?11.5:5.8,body);
      if(!robot){
        // Jacket fronts and collars are separate rounded solids; the original
        // shoulder, elbow and seated typing anchors remain host-controlled.
        rounded('#fff2da',0,31.5,5.4,8.2,12.4,1.4,body);
        for(const side of [-1,1]){rounded(color,side*5.2,30,5.6,6,15.4,2.3,body);rounded(profile===0?'#f1b462':profile===2?'#fff9f0':'#647b9a',side*3.1,35.2,6.7,4.4,5.2,1.2,body,side*.45);}
        rounded(profile===0?'#9b572b':joint,0,23.2,5.8,15.5,2,1,body);
        if(profile===0){rounded('#75412b',-4.3,28.3,7.1,3.4,3.4,.8,body);rounded('#e9b45f',-4.3,28.6,7.6,2.4,.9,.5,body);}
        if(profile===1){rounded('#273e61',0,35.8,6.6,7.4,3.1,1.2,body);for(const side of [-1,1])part('cylinder','#f0d6a7',side*1.6,32.4,7.1,.35,4,.35,body);}
        if(profile===2){
          rounded('#eb7d30',0,32.4,7.3,2.1,6.8,.8,body);part('wedge','#eb7d30',0,28.3,7.3,2.8,3.1,.8,body,Math.PI);
          for(const side of [-1,1]){rounded('#1c2e47',side*5.5,24.6,6.5,4.2,2.3,.8,body);rounded('#ef812e',side*1.9,31.5,8.1,.65,9.5,.65,body,-side*.28);}
          rounded('#fff5e9',0,25.7,8.5,3.6,4.5,.8,body);rounded('#c2c6c7',-.35,26.2,9,1.7,2,.25,body);rounded('#64748a',0,24.2,9,2.3,.35,.25,body);
        }
      }else{
        if(profile===5){ring(cobalt,0,31.8,5.8,3.4,3.4,.65,body);sphere(cobalt,0,31.8,6.2,2.85,2.85,.8,body);sphere(cyan,0,31.8,7,1.9,1.9,.5,body);}
        else{rounded(cobalt,0,30.2,6.1,12,11.4,1.3,body);rounded('#c8e7ef',0,31.7,7,8.5,6.2,.8,body);ring(cobalt,0,31.8,7.6,2.3,2.3,.55,body);sphere(cyan,0,31.8,8,1.35,1.35,.45,body);}
        rounded(joint,0,23,0,15.9,2.3,10,body);rounded(cobalt,0,37.1,-.9,14.8,3,10.8,body);
        for(const side of [-1,1]){rounded(cobalt,side*6.3,25.3,5.9,3,4.2,1.4,body);sphere('#b8dfe8',side*6.3,26,6.9,.7,.7,.4,body);}
        if(profile===4)rounded(cobalt,0,29.1,-6.5,12,10.3,3.5,body);
        if(profile===5)rounded(white,0,32.3,-5.5,8,7,1.2,body);
      }
      const badge=rounded('#91b1b9',profile===1?-5:5,33,7.4,3.1,3.8,.85,body);
      rounded(robot?cobalt:joint,profile===1?-5:5,35.1,7.2,3.8,.6,.6,body);
      if(edition===4)rounded(robot?cyan:'#edbe72',-4.3,25.6,7,3.1,1.1,.6,body);
      return {torso,roleAccents:[badge],sleeveColor:robot?white:color};
    }
    function palette(profile){
      profile=Number.isInteger(profile)&&profile>=0&&profile<6?profile:0;
      return profile<3?{main:uniforms[profile],trim:profile===0?'#e6bc79':'#d6e2e8',dark:joint,skinTones:['#f2c59f','#d9a179','#b77d59','#915e43']}:{main:white,trim:cobalt,dark:joint};
    }
    function diagnostics(){return {version:1,families:[...families],humanFamilies:3,robotFamilies:3,headCenter:48.5,standingHeight:64,headsBuilt,clothesBuilt,faceMaps:faces.size,maxFaceMaps:30,faceMapSide:384,geometryMaps:ownedGeometries.size,maxGeometryMaps:15,modelingGuide:'reference-resources-v1/characters.png',primaryFamilies:['brim','sable'],disposed};}
    function dispose(){if(disposed)return;disposed=true;for(const value of faces.values()){value.texture.dispose();value.material.dispose();}faces.clear();for(const [key,geometry]of ownedGeometries){geometry.dispose();if(geometries[key]===geometry)delete geometries[key];}ownedGeometries.clear();}
    return {humanHead,robotHead,clothes,palette,diagnostics,dispose};
  }
  return {create};
})();
