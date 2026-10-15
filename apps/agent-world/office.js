/* Autonomous office renderer; observing never starts a task or another provider. */
window.OfficeWorldView=(()=>{
  'use strict';
  const O=window.OfficeWorld,M=window.OfficeGameModel,$=id=>document.getElementById(id);
  const actors=new Map(),packets=new Map(),seen=new Set(),routeQueue=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let view='isometric',angle=0,mode='',selected=null,selectedPinned=false,last=performance.now(),lastStage=null,sequence=0,paused=false,transcriptGeneration=0;
  let motionOverride=null,workstations=[],geometry=O.layout(),geometryKey='',physicalGeometryKey='',sceneGeometry=O.sceneLayout(geometry),sceneWithOccupants=null;
  const svg=document.querySelector('svg.office'),original=document.createElementNS('http://www.w3.org/2000/svg','g');
  for(const child of [...svg.children])if(child.tagName.toLowerCase()!=='defs')original.append(child);
  svg.append(original);
  const scene=document.createElementNS('http://www.w3.org/2000/svg','g');svg.append(scene);
  const links=document.createElementNS('http://www.w3.org/2000/svg','svg');links.id='office-links';links.setAttribute('aria-hidden','true');$('world').append(links);
  const helpLinks=new Map();
  function shape(tag,attributes,parent=scene,text) {const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attributes))n.setAttribute(key,String(value));if(text!==undefined)n.textContent=text;parent.append(n);return n;}
  function paintOffice() {
    scene.replaceChildren();const g=geometry,v=sceneGeometry,h=g.height,w=g.width;
    const P=(x,y,z=0)=>v.project(x,y,z),polygon=(points,attrs,parent=scene)=>shape('polygon',{points:points.map(p=>`${p.x},${p.y}`).join(' '),...attrs},parent);
    const floor=(bounds,attrs,parent=scene)=>{const [x,y,r,b]=bounds;return polygon([P(x,y),P(r,y),P(r,b),P(x,b)],attrs,parent);};
    const line=(a,b,attrs,parent=scene)=>shape('path',{d:`M${a.x} ${a.y}L${b.x} ${b.y}`,...attrs},parent);
    const box=(bounds,z,colors,parent=scene,base=0)=>{const [x,y,r,b]=bounds,A=P(x,y,z),B=P(r,y,z),C=P(r,b,z),D=P(x,b,z);
      polygon([D,C,P(r,b,base),P(x,b,base)],{fill:colors[1]},parent);
      polygon([B,C,P(r,b,base),P(r,y,base)],{fill:colors[2]},parent);
      polygon([A,B,C,D],{fill:colors[0],stroke:colors[3]||colors[0],'stroke-width':.8},parent);
    };
    shape('rect',{width:v.width,height:v.height,fill:'#263744'});
    const platform=[25,25,w-25,h-25];floor([35,48,w-8,h-5],{fill:'#101f29',opacity:.5});
    box(platform,0,['#c9b89e','#8d7d66','#a69780'],scene,-16);
    floor(platform,{fill:'#d8c6aa'});
    // Individual parquet strips establish a physical interior rather than diagram cards.
    for(let y=25;y<h-25;y+=38){for(let x=25+(Math.floor(y/38)%2)*76;x<w-25;x+=152){
      const r=Math.min(x+151,w-25),b=Math.min(y+37,h-25);if(r>x)floor([x,y,r,b],{fill:((Math.floor(x/152)+Math.floor(y/38))%3===0)?'#d1bda0':'#dfccb0',stroke:'#c5b092','stroke-width':.7});
    }}
    const carpets=['#87a89b','#aaa1bc','#8aa4b6','#b2a38d','#8bada9','#b69698'];
    const accents=['#335b4d','#66517e','#3e607b','#735b3b','#306760','#7b4951'];
    for(const room of g.rooms){const group=shape('g',{'data-department':room.role});shape('title',{},group,`${room.name} department / circular computer workspaces`);
      floor([room.x,room.y+42,room.x+room.width,room.y+room.height],{fill:carpets[O.roles.indexOf(room.role)],stroke:'#6c7e83','stroke-width':1},group);
      for(let y=room.y+53;y<room.y+room.height;y+=17)line(P(room.x+8,y),P(room.x+room.width-8,y),{stroke:'#ffffff',opacity:.055,'stroke-width':2},group);
    }
    // Carpet inlays organize each five-computer pod; these are unobstructed floor markings.
    for(const room of g.rooms){const accent=accents[O.roles.indexOf(room.role)],pods=new Map(g.stations.filter(s=>s.role===room.role).map(s=>[s.center.y,s.center]));
      const group=shape('g',{'data-room-inlays':room.role,'aria-hidden':'true'});
      for(const center of pods.values()){
        polygon(Array.from({length:60},(_,i)=>{const angle=i*Math.PI/30;return P(center.x+Math.cos(angle)*79,center.y+Math.sin(angle)*79);}),{fill:'none',stroke:accent,'stroke-width':1.6,opacity:.45},group);
        polygon(Array.from({length:32},(_,i)=>{const angle=i*Math.PI/16;return P(center.x+Math.cos(angle)*23,center.y+Math.sin(angle)*23);}),{fill:accent,opacity:.75},group);
        const mark=P(center.x,center.y+5);shape('text',{x:mark.x,y:mark.y,fill:'#ffffff','font-size':15,'font-weight':750,'text-anchor':'middle'},group,String(O.roles.indexOf(room.role)+1).padStart(2,'0'));
      }
      // A flush threshold marks the existing doorway, preserving its full walkable gap.
      floor([room.x+130,room.y+14,room.x+190,room.y+28],{fill:accent,opacity:.8},group);
    }
    const c=g.conference;floor([c.x,c.y,c.x+c.width,c.y+c.height],{fill:'#b0ada3',stroke:'#788c92','stroke-width':1,id:'elastic-conference-room','aria-label':`Conference room with ${g.conferenceSeats.length} seats`});
    floor([1180,125,1490,490],{fill:'#7c9290',stroke:'#d6c6a5','stroke-width':3,'data-conference-rug':'meeting'});
    floor([1160,535,1510,c.y+c.height-25],{fill:'#879b92',stroke:'#c9bda5','stroke-width':2,'data-conference-rug':'breakout'});
    const meetingMark=P(1335,555,0);shape('text',{x:meetingMark.x,y:meetingMark.y,fill:'#e8e1d1','font-size':17,'text-anchor':'middle','data-conference-label':'true'},scene,'BREAKOUT');
    const exitMark=P(w/2,h-32,0);shape('text',{x:exitMark.x,y:exitMark.y,fill:'#314f59','font-size':16,'font-weight':800,'text-anchor':'middle','data-office-exit':'true'},scene,'EXIT');
    const objects=[];const object=(bounds,draw)=>objects.push({depth:P((bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2).y,draw});
    // A rotating cutaway shows only walls behind the rooms. Physical collision walls do not change.
    const backNorth=P(w/2,25).y<=P(w/2,h-25).y,backWest=P(25,h/2).y<=P(w-25,h/2).y;
    for(const bounds of g.walls){const vertical=bounds[3]-bounds[1]>bounds[2]-bounds[0];if((vertical&&backWest)||(!vertical&&backNorth))object(bounds,()=>box(bounds,32,['#e4e8df','#a7b9b7','#bcc9c4']));}
    const outerY=backNorth?25:h-34,horizontal=[25,outerY,w-25,outerY+9];
    object(horizontal,()=>{const wall=shape('g',{'data-outer-wall':backNorth?'north':'south'});box(horizontal,58,['#e5e9df','#bbc9c6','#97abae'],wall);for(let x=100;x<w-100;x+=180){polygon([P(x,outerY,45),P(x+100,outerY,45),P(x+100,outerY,20),P(x,outerY,20)],{fill:'#93c3d0',stroke:'#648e9c','stroke-width':2},wall);line(P(x+50,outerY,45),P(x+50,outerY,20),{stroke:'#d5eced','stroke-width':2},wall);}});
    const outerX=backWest?25:w-34,vertical=[outerX,25,outerX+9,h-25];
    object(vertical,()=>{const wall=shape('g',{'data-outer-wall':backWest?'west':'east'});box(vertical,58,['#e5e9df','#a7b9b7','#c1ccc7'],wall);for(let y=110;y<h-100;y+=180){polygon([P(outerX,y,45),P(outerX,y+100,45),P(outerX,y+100,20),P(outerX,y,20)],{fill:'#93c3d0',stroke:'#648e9c','stroke-width':2},wall);line(P(outerX,y+50,45),P(outerX,y+50,20),{stroke:'#d5eced','stroke-width':2},wall);}});
    for(const station of g.stations){const {x,y}=station.desk,p=station.point,bounds=[x-28,y-20,x+28,y+20];
      object(bounds,()=>{const group=shape('g',{'data-workstation':station.key});shape('title',{},group,`COMPUTER ${station.index+1}`);
        floor([x-25,y-15,x+36,y+29],{fill:'#33464c',opacity:.2},group);
        for(const [lx,ly]of [[x-24,y-15],[x+20,y-15],[x-24,y+12],[x+20,y+12]])box([lx,ly,lx+4,ly+4],25,['#677780','#3b4c56','#52616b'],group);
        box(bounds,29,['#f1e1c9','#bb9d7b','#d1b48f'],group,25);
        const screen=P(x,y,45),stand=P(x,y+4,29);
        shape('rect',{x:stand.x-7,y:stand.y-3,width:14,height:4,rx:2,fill:'#50646e'},group);
        shape('path',{d:`M${stand.x} ${stand.y}L${screen.x} ${screen.y+8}`,stroke:'#445865','stroke-width':4},group);
        shape('rect',{x:screen.x-21,y:screen.y-14,width:42,height:28,rx:4,fill:'#253b49',stroke:'#142934','stroke-width':1.5},group);
        shape('rect',{x:screen.x-17,y:screen.y-9,width:34,height:18,rx:1,fill:'#77b3c0',class:'monitor-interior'},group);
        line({x:screen.x-13,y:screen.y-5},{x:screen.x+8,y:screen.y-5},{stroke:'#a3d6dc','stroke-width':1.5},group);
        const keyboard=P(x,y+12,30);shape('rect',{x:keyboard.x-12,y:keyboard.y-3,width:24,height:6,rx:2,fill:'#d6dce0',stroke:'#80959e','stroke-width':.6},group);
        for(let k=-8;k<10;k+=4)line({x:keyboard.x+k,y:keyboard.y-1},{x:keyboard.x+k,y:keyboard.y+1},{stroke:'#8397a0','stroke-width':1},group);
        const mug=P(x+21,y+12,32);shape('ellipse',{cx:mug.x,cy:mug.y,rx:3,ry:4,fill:'#f5f1e7',stroke:'#9d8c78','stroke-width':1},group);
        const badge=P(x+24,y+17,30);shape('text',{x:badge.x,y:badge.y,'font-size':8,'text-anchor':'end',fill:'#405a65',class:'station-number'},group,`#${station.index+1}`);
      });
      const chair=[p.x-12,p.y-12,p.x+12,p.y+7];object(chair,()=>{box(chair,9,['#47637c','#2c4257','#374e64']);const back=P(p.x,p.y-12,24);shape('rect',{x:back.x-12,y:back.y-5,width:24,height:13,rx:5,fill:'#537692',stroke:'#2e4d64','stroke-width':1.5});});
    }
    for(const [index,bounds]of g.furniture.entries())object(bounds,()=>{
      if(index===2){box(bounds,27,['#d1ad7c','#987a55','#b18d60']);const device=P(1340,288,30);shape('rect',{x:device.x-18,y:device.y-9,width:36,height:18,rx:3,fill:'#304d60'});const paper=P(1292,315,29);shape('rect',{x:paper.x-13,y:paper.y-7,width:26,height:14,rx:2,fill:'#efece0',stroke:'#9d8c76','stroke-width':1});const paper2=P(1390,330,29);shape('rect',{x:paper2.x-13,y:paper2.y-7,width:26,height:14,rx:2,fill:'#efece0',stroke:'#9d8c76','stroke-width':1});}
      else if(index<2){box(bounds,31,['#d8c19f','#9e8264','#bda080']);const p=P(bounds[0]+24,bounds[1]+12,44);
        shape('rect',{x:p.x-11,y:p.y-10,width:22,height:18,rx:3,fill:index===0?'#395c70':'#405159'});shape('rect',{x:p.x-8,y:p.y-7,width:16,height:9,rx:1,fill:index===0?'#9ec1cc':'#bba07f'});
      }else{box(bounds,12,['#57748b','#334d65','#425f79']);const p=P((bounds[0]+bounds[2])/2,bounds[1],25);shape('rect',{x:p.x-13,y:p.y-7,width:26,height:17,rx:5,fill:'#607f96',stroke:'#36546c','stroke-width':1.5});}
    });
    // Static wall boards distinguish office functions; they never display synthetic task activity.
    for(const room of view==='top-down'||!backNorth?[]:g.rooms){const index=O.roles.indexOf(room.role),accent=accents[index],x=room.x+16,y=room.y+20;
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
    // Planters are on the outside ledge, beyond traversable bounds.
    for(const [x,y]of [[18,75],[w-18,75],[18,h-75],[w-18,h-75]])object([x-9,y-9,x+9,y+9],()=>{box([x-9,y-9,x+9,y+9],18,['#b99877','#84694f','#9e8060']);const p=P(x,y,32);for(const [dx,dy,r]of [[-7,-2,10],[5,-6,11],[0,6,10]])shape('ellipse',{cx:p.x+dx,cy:p.y+dy,rx:r,ry:r*.8,fill:dx<0?'#567e67':'#709980',stroke:'#456a56','stroke-width':1});});
    objects.sort((a,b)=>a.depth-b.depth);for(const item of objects)item.draw();
    // Room names sit on their back walls, readable at the game overview scale.
    const roomSign=(point,title,number,accent,width=190)=>{const group=shape('g',{'data-room-sign':title});shape('rect',{x:point.x,y:point.y-28,width,height:38,rx:5,fill:'#203744',stroke:'#d8e4de','stroke-width':1},group);shape('rect',{x:point.x+4,y:point.y-24,width:27,height:30,rx:3,fill:accent},group);shape('text',{x:point.x+17.5,y:point.y-3,'text-anchor':'middle',fill:'#ffffff','font-size':12,'font-weight':750},group,number);shape('text',{x:point.x+39,y:point.y-3,fill:'#f7f6eb','font-size':18,'font-weight':700,'letter-spacing':0},group,title);};
    const signPoint=(room,z,width)=>{const x=room.x,y=room.y,r=x+room.width,b=y+room.height;const edge=[[x+room.width/2,y+20],[x+room.width/2,b-20],[x+20,y+room.height/2],[r-20,y+room.height/2]].map(([px,py])=>P(px,py,z)).sort((a,b)=>a.y-b.y)[0];return {x:edge.x-width/2,y:edge.y};};
    for(const room of g.rooms){const index=O.roles.indexOf(room.role);roomSign(signPoint(room,41,190),room.name,String(index+1).padStart(2,'0'),accents[index]);}
    roomSign(signPoint(g.conference,44,198),'Conference','M','#546674',198);
    const reception=P(72,385+g.topExtra,54),coffee=P(1025,385+g.topExtra,54);
    for(const [point,title]of [[reception,'RECEPTION'],[coffee,'COFFEE']]){shape('rect',{x:point.x-4,y:point.y-18,width:title==='RECEPTION'?105:76,height:25,rx:4,fill:'#203744'},scene);shape('text',{x:point.x+4,y:point.y,fill:'#f7f6eb','font-size':12,'font-weight':700},scene,title);}

  }
  function setGeometry(next) {
    const physicalKey=`${mode}:${next.width}:${next.height}:${next.conferenceSeats.length}:${next.stations.map(s=>s.key).join(',')}`,key=`${view}:${angle}:${physicalKey}`;geometry=next;if(key===geometryKey)return false;const physicsChanged=physicalKey!==physicalGeometryKey;geometryKey=key;physicalGeometryKey=physicalKey;
    const live=mode==='office';original.style.display=live?'none':'';scene.style.display=live?'':'none';if(physicsChanged)M.configure(live?next:null);
    sceneGeometry=live?O.sceneLayout(next,view,angle):{width:1280,height:610,stations:O.workstations};
    const width=sceneGeometry.width,height=sceneGeometry.height;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);$('world').style.setProperty('--floor-width',String(width));$('world').style.setProperty('--floor-height',String(height));$('world').style.setProperty('--floor-ratio',String(width/height));$('world').classList.toggle('expanded',live&&next.height>850);$('world').classList.toggle('isometric',live);$('world').dataset.view=view;
    links.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',`${view==='top-down'?'Top-down':'Isometric'} office rotated ${angle} degrees with department rooms, real AI coworkers, ${live?next.stations.length:12} computers and collaboration lounge`);
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
    const detailed=new Set(active.slice(0,2).map(a=>a.data.id));
    if(active.some(a=>a.data.id===selected))detailed.add(selected);
    for(const a of actors.values())a.element.classList.toggle('bubble-detailed',detailed.has(a.data.id));
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
    $('agent-detail').replaceChildren(heading,node('p','task-title',view.title),node('p','',`${role?.role||'Role unknown'} / ${view.word}`),node('p','',view.detail),node('p','',`Going to: ${view.destination}`),node('p','detail-note',`${actor.note}${actor.taskRef?` · Work item ${actor.taskRef.slice(0,8)}`:''}`));
    const current=actors.get(actor.id);if(current)showCoordinates(current);
    if(actor.activeChildCount){const children=[...actors.values()].map(a=>a.data).filter(a=>a.parentId===actor.sourceId&&a.working);const related=node('div','related-agents');related.append(node('strong','',`Connected agents working (${children.length})`));for(const child of children){const button=node('button','related-agent',`${child.label} · ${O.presentation(child).word}`);button.type='button';button.dataset.relatedAgent=child.id;button.addEventListener('click',()=>{const current=actors.get(child.id);if(current)inspect(current.data,true);});related.append(button);}$('agent-detail').append(related);}
    const sources=[actor,...[...actors.values()].map(a=>a.data).filter(a=>a.parentId===actor.sourceId&&a.working)];
    const recent=sources.flatMap(source=>(source.recentEvents||[]).map(event=>({...event,source:source===actor?'':source.label}))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,12);
    if(recent.length){const timeline=node('section','agent-activity'),title=node('h4','',`Live activity · ${recent.length} recent event${recent.length===1?'':'s'}`),list=node('ol');timeline.append(title,list);for(const event of recent){const item=node('li');item.append(node('time','',new Date(event.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})),node('span','',`${event.source?event.source+' · ':''}${event.label}`));list.append(item);}$('agent-detail').append(timeline);}
    if(actor.id.startsWith('session-')){
      const output=node('section','session-output'),title=node('h4','',`Session output · ${actor.provider}`),body=node('pre','',previousOutput||'Reading local session output…');
      output.append(title,body);$('agent-detail').append(output);body.scrollTop=previousScroll;
      window.LocalSessions.transcript(actor.sourceId).then(value=>{
        if(!output.isConnected||selected!==actor.id||generation!==transcriptGeneration)return;
        title.textContent=value.available?`Session output · ${value.live?'Live':'Last recorded'}`:`Session output · Unavailable`;
        const next=value.available?(value.entries.map(e=>`[${new Date(e.at).toLocaleTimeString()}] ${e.speaker}\n${e.text}`).join('\n\n')||'No text has been recorded for this session yet.'):value.reason;
        if(body.textContent!==next){const scroll=body.scrollTop,follow=body.scrollHeight-body.clientHeight-scroll<30;body.textContent=next;body.scrollTop=follow?body.scrollHeight:scroll;}
      });
    }
    if(focusedChild){const replacement=[...$('agent-detail').querySelectorAll('[data-related-agent]')].find(button=>button.dataset.relatedAgent===focusedChild);(replacement||heading).focus({preventScroll:true});}
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
    const entity={element:p,position:{...(motionEnabled()?from:to)},target:to,route:[],age:0,pending:motionEnabled(),geometry:physicalGeometryKey};
    packets.set(event.id,entity);
    if(entity.pending)routeQueue.set(`packet-${event.id}`,{actor:entity,target:to,packetId:event.id,assignment:physicalGeometryKey});
  }
  function dropPacket(id){packets.get(id)?.element.remove();packets.delete(id);routeQueue.delete(`packet-${id}`);}
  function move(entity,dt,speed) {
    while(entity.route.length&&Math.hypot(entity.route[0].x-entity.position.x,entity.route[0].y-entity.position.y)<1)entity.route.shift();
    const target=entity.route[0];if(!target)return false;
    const d=Math.hypot(target.x-entity.position.x,target.y-entity.position.y);
    const step=Math.min(d,speed*dt),next=M.move(entity.position,(target.x-entity.position.x)/d*step,(target.y-entity.position.y)/d*step);
    entity.element.dataset.facing=Math.abs(target.x-entity.position.x)>Math.abs(target.y-entity.position.y)?target.x>entity.position.x?'right':'left':target.y>entity.position.y?'down':'up';
    entity.position=next;return true;
  }
  function elevation(entity){const seat=entity.data?.conferenceSeat;return seat&&Math.hypot(entity.position.x-seat.point.x,entity.position.y-seat.point.y)<2?9:0;}
  function showCoordinates(entity){$('world-coordinates').textContent=`${entity.data.label} · X ${Math.round(entity.position.x)} · Y ${Math.round(entity.position.y)} · Z ${elevation(entity)}`;}
  function place(entity) {const p=mode==='office'?sceneGeometry.project(entity.position.x,entity.position.y,elevation(entity)):entity.position;entity.element.style.left=`${p.x/(sceneGeometry.width/100)}%`;entity.element.style.top=`${p.y/(sceneGeometry.height/100)}%`;if(entity.data?.id===selected)showCoordinates(entity);}
  let lastBubbleLayout=0;
  function layoutBubbles(){
    if(mode!=='office')return;
    const world=$('world').getBoundingClientRect(),viewport=$('world').parentElement.getBoundingClientRect(),safe={left:Math.max(world.left,viewport.left),right:Math.min(world.right,viewport.right),top:Math.max(world.top,viewport.top),bottom:Math.min(world.bottom,viewport.bottom)},people=[...actors.values()].filter(a=>a.owned&&a.element.isConnected);
    for(const line of links.querySelectorAll('.bubble-leader'))line.remove();
    const labels=people.map(a=>a.element.querySelector('.character-name')?.getBoundingClientRect()).filter(Boolean),bodies=people.map(a=>a.element.getBoundingClientRect()),monitors=[...document.querySelectorAll('.desk-screen')].map(e=>e.getBoundingClientRect()),placed=[];
    const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    people.sort((a,b)=>Number(b.data.id===selected)-Number(a.data.id===selected)||Number(b.data.working)-Number(a.data.working));
    const anchors=people.map(a=>{const bubble=a.element.querySelector('.character-bubble');bubble.style.translate='none';return {a,bubble,actorRect:a.element.getBoundingClientRect()};}).filter(({actorRect})=>actorRect.right>=safe.left&&actorRect.left<=safe.right&&actorRect.bottom>=safe.top&&actorRect.top<=safe.bottom).map(item=>({...item,base:item.bubble.getBoundingClientRect()})).filter(item=>item.base.width&&item.base.height);
    for(const [index,{a,bubble,actorRect,base}] of anchors.entries()){
      let best={score:Infinity,dx:0,dy:0,rect:base};
      for(const dy of [0,-38,-76,38,76,-114,114,-152,152])for(const dx of [0,-70,70,-140,140]){
        const rect={left:base.left+dx,right:base.right+dx,top:base.top+dy,bottom:base.bottom+dy};
        const overflow=Math.max(0,safe.left+4-rect.left)+Math.max(0,rect.right-safe.right+4)+Math.max(0,safe.top+4-rect.top)+Math.max(0,rect.bottom-safe.bottom+4);
        const collision=placed.reduce((sum,p)=>sum+overlap(rect,p),0)+labels.reduce((sum,p)=>sum+overlap(rect,p),0)+bodies.reduce((sum,p)=>sum+overlap(rect,p),0)+monitors.reduce((sum,p)=>sum+overlap(rect,p)*1.4,0)+anchors.slice(index+1).reduce((sum,p)=>sum+overlap(rect,p.base)*.8,0);
        const score=collision+overflow*500+Math.abs(dx)*.2+Math.abs(dy)*.3;
        if(score<best.score)best={score,dx,dy,rect};
      }
      const scale=actorRect.width/a.element.offsetWidth||1;bubble.style.translate=`${best.dx/scale}px ${best.dy/scale}px`;placed.push(best.rect);
      if(best.dx||best.dy){const line=document.createElementNS('http://www.w3.org/2000/svg','line'),x=point=>(point-world.left)/world.width*sceneGeometry.width,y=point=>(point-world.top)/world.height*sceneGeometry.height;line.setAttribute('class','bubble-leader');line.setAttribute('x1',x((best.rect.left+best.rect.right)/2));line.setAttribute('y1',y(best.rect.bottom));line.setAttribute('x2',x(actorRect.left+actorRect.width/2));line.setAttribute('y2',y(actorRect.top+actorRect.height*.4));links.append(line);}
    }
  }
  function clear() {for(const a of actors.values()){a.element.classList.remove('office-walking','at-desk','at-conference-seat');if(a.owned)a.element.remove();}actors.clear();routeQueue.clear();workstations=[];for(const p of packets.values())p.element.remove();packets.clear();seen.clear();helpLinks.clear();links.replaceChildren();lastStage=null;}
  function queueRoute(actor,target){actor.route=[];routeQueue.set(actor.data.id,{actor,target,assignment:actor.assignment});}
  function removeActor(id,a){if(a.owned)a.element.remove();actors.delete(id);routeQueue.delete(id);}
  function beginDeparture(a,kind){
    const target=O.departureTarget(geometry,kind);
    a.departure={kind,target,started:performance.now(),arrived:null};
    a.data={...a.data,state:'departing',working:false,awaitingHuman:false,conferenceSeat:null,station:null,handoff:null,taskLabel:''};
    a.ambient=false;a.assignment=`departure:${kind}`;a.route=[];
    a.element.classList.remove('working','at-desk','at-conference-seat','at-help');a.element.classList.add('departing');
    a.element.dataset.action='departing';a.element.title=kind==='breakout'?'Session finished / heading to breakout':'Session closed / heading to exit';
    a.element.querySelector('.character-bubble').hidden=true;a.element.dataset.bubble='none';
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
    const output=a.bubbleValue;
    bubble.hidden=!output&&!reported;
    a.element.dataset.bubble=output?'transcript':reported?'reported':'none';
    a.element.dataset.taskKnown=String(Boolean(output||reported));
    a.element.querySelector('.worker-action').textContent=output?.speaker||view.word;
    a.element.querySelector('.worker-task').textContent=output?.text||detail||view.title;
    const eventTime=a.element.querySelector('.worker-event-time'),at=output?.at||actor.updatedAt;
    eventTime.hidden=!output&&!reported;
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
        if(owned) {el.type='button';el.dataset.office=actor.id;const bubble=node('span','character-bubble');bubble.append(node('strong','worker-action'),node('span','worker-task'),node('time','worker-event-time'));el.append(bubble,node('span','person'),node('span','action-prop'),node('span','character-name'));$('office-characters').append(el);el.addEventListener('click',()=>{const current=actors.get(actor.id);if(current)inspect(current.data,true);});}
        a={element:el,owned,position:mode==='office'?geometry.lobby(actor.arrivalIndex):O.lobby(index),route:[],goal:null,assignment:null,data:actor,roamStep:0,rest:0,index:mode==='office'?actor.arrivalIndex:index,bubbleValue:null,bubbleVersion:null,bubbleGeneration:0};actors.set(actor.id,a);
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
      if(!data.length)$('agent-detail').replaceChildren(node('h3','','The office is quiet'),node('p','','Start your local agents. Process sightings appear in Local sessions; identified sessions, task roles and handoffs appear here when their events are connected.'));
      else {if(selectedPinned&&!data.some(a=>a.id===selected))selectedPinned=false;inspect(O.focusActor(data,selected,selectedPinned));}
      updateBubbleDensity();
      const processOnly=sessions.entries.filter(e=>e.kind==='process'&&e.status==='running').length;
      $('office-summary').textContent=`${data.length} identified workers / ${data.filter(a=>a.working).length} working / ${processOnly} process-only connection${processOnly===1?'':'s'} / ${workstations.length} computers`;
    }
  }
  function frame(now) {
    const dt=Math.min((now-last)/1000,.1);last=now;
    if(!document.hidden&&!paused) {
      // Share one route plan per frame across workers and handoff packets.
      if(motionEnabled()&&routeQueue.size){const [id,job]=routeQueue.entries().next().value;routeQueue.delete(id);const current=job.packetId?packets.get(job.packetId)===job.actor&&job.assignment===physicalGeometryKey:actors.get(id)===job.actor&&job.actor.assignment===job.assignment;if(current){job.actor.route=M.path(job.actor.position,job.target);if(job.packetId)job.actor.pending=false;}}
      for(const a of actors.values()) {
        if(motionEnabled()&&a.ambient&&!a.route.length&&!routeQueue.has(a.data.id)){a.rest-=dt;if(a.rest<=0){const stops=O.idleStops(a.data,a.index,mode==='office'?geometry:null);queueRoute(a,stops[a.roamStep++%stops.length]);a.rest=1.5+(a.index%3)*.4;}}
        const moving=motionEnabled()&&move(a,dt,a.ambient?70:105);a.element.classList.toggle('office-walking',Boolean(moving));place(a);
        if(a.departure){const departure=a.departure,arrived=Math.hypot(a.position.x-departure.target.x,a.position.y-departure.target.y)<2;
          if(arrived&&!a.route.length&&!routeQueue.has(a.data.id))departure.arrived??=now;
          if(departure.arrived&&now-departure.arrived>(departure.kind==='breakout'?4000:1200)||now-departure.started>60000){removeActor(a.data.id,a);continue;}
        }
        if(mode==='office')a.element.classList.toggle('at-conference-seat',Boolean(a.data.conferenceSeat)&&Math.hypot(a.position.x-a.data.conferenceSeat.point.x,a.position.y-a.data.conferenceSeat.point.y)<2);
        if(mode==='office')a.element.classList.toggle('at-desk',atHomeComputer(a.data)&&Math.hypot(a.position.x-a.data.station.point.x,a.position.y-a.data.station.point.y)<2);
        if(mode==='office'){const peer=actors.get(a.data.colleague?.id);a.element.classList.toggle('at-help',a.data.action==='helping'&&Boolean(peer)&&Math.hypot(a.position.x-peer.position.x,a.position.y-peer.position.y)<60);}
      }
      for(const [id,link]of helpLinks){const a=actors.get(id),b=actors.get(link.target);if(a&&b){const ap=sceneGeometry.project(a.position.x,a.position.y,15),bp=sceneGeometry.project(b.position.x,b.position.y,15);link.line.setAttribute('x1',ap.x);link.line.setAttribute('y1',ap.y);link.line.setAttribute('x2',bp.x);link.line.setAttribute('y2',bp.y);}}
      for(const [id,p] of packets) {if(!motionEnabled()){routeQueue.delete(`packet-${id}`);p.pending=false;p.position={...p.target};p.route=[];}if(!p.pending){p.age+=dt;if(motionEnabled())move(p,dt,155);}place(p);if(p.age>12||!p.pending&&!p.route.length&&p.age>3)dropPacket(id);}
      const bubbleInterval=actors.size<=16?0:actors.size<=40?100:250;if(now-lastBubbleLayout>bubbleInterval){lastBubbleLayout=now;layoutBubbles();}
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {sync,setView:next=>{if(['isometric','top-down'].includes(next))view=next;},setAngle:next=>{if(Number.isFinite(next))angle=((next%360)+360)%360;},getWorkstations:()=>workstations,getSceneLayout:()=>mode==='office'?(sceneWithOccupants||sceneGeometry):sceneGeometry,getLayout:()=>mode==='office'?geometry:{width:1280,height:610,stations:O.workstations},getState:()=>Array.from(actors.values()).map(a=>({id:a.data.id,role:a.data.role,station:a.data.station?.key||null,conferenceSeat:a.data.conferenceSeat?.key||null,action:a.data.action,taskLabel:a.data.taskLabel,colleague:a.data.colleague?.id||null,handoffTo:a.data.handoff?.toRole||null,state:a.data.state,working:a.data.working,awaitingHuman:!!a.data.awaitingHuman,departure:a.departure?.kind||null,ambient:a.ambient,motionEnabled:motionEnabled(),x:a.position.x,y:a.position.y,z:elevation(a),goal:a.goal}))};
})();
