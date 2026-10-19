/* Read-only office projections. Role placement follows explicit metadata or typed local activity; handoffs require explicit evidence. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.OfficeWorld=value;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const roles=['planner','designer','builder','reviewer','qa','security'];
  const roleNames={planner:'Planning',designer:'Design',builder:'Build',reviewer:'Code review',qa:'QA',security:'Security'};
  const actions={planning:['Planning','≡'],designing:['Designing','✎'],coding:['Coding','</>'],reviewing:['Reviewing','⌕'],testing:['Testing','▦'],auditing:['Auditing','◇'],helping:['Helping','↔'],command:['Terminal','>_'],research:['Research','⌕'],tool:['Using tool','⚙'],coordination:['Coordinating','⇄'],reporting:['Reporting','▤']};
  const desks={planner:{x:194,y:250},designer:{x:474,y:250},builder:{x:754,y:250},reviewer:{x:194,y:495},qa:{x:474,y:495},security:{x:754,y:495}};
  const lobby=index=>({x:200+(index%12)*48,y:310});
  const sharedSeatWithoutRole=a=>!a.role&&(a.working||a.awaitingHuman||['running','event-working','event-waiting','adapter-working','adapter-waiting','adapter-idle','adapter-ended'].includes(a.state));
  function isPlanning(actor) {return actor.awaitingHuman||actor.working&&!actor.handoff&&actor.action!=='helping'&&(actor.action==='planning'||actor.role==='planner'&&['research','coordination'].includes(actor.action));}
  function isConferenceBound(actor) {return isPlanning(actor)||!actor.handoff&&['event-waiting','adapter-waiting','queued'].includes(actor.state);}
  function layout(actors=[],previous=[],previousConference=[]) {
    const baselineComputers={planner:3,designer:2,builder:4,reviewer:2,security:3,qa:2,shared:1},stationScale=2.5,staffScale=2.5,ceilingHeight=210,podPitch=500;
    const shared=actors.filter(sharedSeatWithoutRole).length;
    const counts=Object.fromEntries(roles.map(role=>[role,Math.max(baselineComputers[role],actors.filter(a=>a.role===role).length,...previous.filter(s=>s.role===role).map(s=>s.index+1))]));
    counts.shared=Math.max(baselineComputers.shared,shared,...previous.filter(s=>s.role==='shared').map(s=>s.index+1));
    const growth=role=>(Math.ceil(counts[role]/(role==='shared'?5:4))-1)*podPitch;
    const topExtra=Math.max(...['planner','designer','builder'].map(growth)),sharedExtra=growth('shared');
    const conferenceCount=Math.max(8,actors.filter(isConferenceBound).length,previousConference.length),overflowRows=Math.ceil(Math.max(0,conferenceCount-8)/5),conferenceExtra=Math.max(0,overflowRows-1)*90;
    const sideExtra=Object.fromEntries(['reviewer','qa','security'].map(role=>[role,growth(role)])),rightExtra=Object.values(sideExtra).reduce((sum,n)=>sum+n,0),middleExtra=Math.max(rightExtra,conferenceExtra);
    const lowerY=600+topExtra,cafeY=1190+topExtra+conferenceExtra,height=1900+topExtra+middleExtra+sharedExtra;
    const vectors=[['planner','Planning',60,60,500,400+topExtra],['designer','Design',580,60,460,400+topExtra],['builder','Development',1060,60,780,400+topExtra],['reviewer','Code Review',1150,lowerY,690,400+sideExtra.reviewer],['qa','QA Testing',1150,1020+topExtra+sideExtra.reviewer,690,400+sideExtra.qa],['security','Security',1150,1440+topExtra+sideExtra.reviewer+sideExtra.qa,690,400+sideExtra.security],['shared','Reception hotdesks',710,1160+topExtra+middleExtra,440,680+sharedExtra]];
    const rooms=vectors.map(([role,name,x,y,width,height],i)=>({role,name,x,y,width,height,...(role==='shared'?{annex:true}:{}),color:['#ead6b6','#eedcbd','#e5d3b4','#ead3ac','#e5d7ba','#dfcfb2','#e1d3b9'][i]}));
    const sharedShift=topExtra+middleExtra,devops={x:1800,y:260,width:30,height:60,name:'Wall utility',annex:true};
    const cafe={x:60,y:cafeY,width:650,height:650,name:'Caf\u00e9',point:{x:660,y:cafeY+320}};
    const breakout={x:100,y:cafeY+375,width:560,height:230,name:'Cafe lounge',annex:true,sofa:[130,cafeY+490,360,cafeY+550],table:[175,cafeY+390,315,cafeY+450],point:{x:430,y:cafeY+510}};
    const entrance={x:710,y:height-310,width:440,height:250,name:'Welcome',point:{x:930,y:height-57}};
    const reception={deskBounds:[790,height-230,1070,height-160],point:{x:930,y:height-120}};
    const conference={x:60,y:lowerY,width:650,height:570+conferenceExtra,name:'Conference',target:{x:385,y:lowerY+260},tableBounds:[260,lowerY+150,510,lowerY+370]};
    const stations=rooms.flatMap(room=>Array.from({length:counts[room.role]},(_,index)=>{
      const isShared=room.role==='shared',capacity=isShared?5:4,n=index%capacity,pod=Math.floor(index/capacity),isReception=isShared&&index===0;
      let x=room.x+room.width/2+[-28,28,-28,28][n]*stationScale,y=room.y+pod*podPitch+[170,170,270,270][n];
      if(isShared){x=[912.5,800,1025,800,1025][n];y=sharedShift+pod*podPitch+[1410,1300,1300,1520,1520][n];if(isReception){x=930;y=height-195;}}
      const seatOffset=!isShared&&n>=2?36:-36,desk={x,y},point={x,y:y+seatOffset*stationScale},approach={x,y:y+Math.sign(seatOffset)*46*stationScale};
      const deskBounds=isReception?reception.deskBounds:[x-28*stationScale,y-20*stationScale,x+28*stationScale,y+20*stationScale];
      return {key:`${room.role}:${index}`,role:room.role,index,center:{x:room.x+room.width/2,y:room.y+240+pod*podPitch},angle:seatOffset<0?180:0,seatOffset,...(isReception?{reception:true}:{}),point,approach,screen:{x:x-3*stationScale,y:y-6*stationScale},desk,deskBounds};
    }));
    const conferenceSeats=[];
    function meetingSeat(point,approach,target=conference.target){const index=conferenceSeats.length;conferenceSeats.push({key:`conference:${index}`,index,point,approach,target});}
    meetingSeat({x:385,y:lowerY+105},{x:385,y:lowerY+65});
    meetingSeat({x:385,y:lowerY+415},{x:385,y:lowerY+455});
    for(const x of [210,560])for(const y of [lowerY+180,lowerY+260,lowerY+340])meetingSeat({x,y},{x:x<385?170:600,y});
    for(let i=8;i<conferenceCount;i++){const x=150+(i-8)%5*104,y=lowerY+500+Math.floor((i-8)/5)*90;meetingSeat({x,y},{x,y:y+45},{x,y:y-60});}
    const furniture=[[85,cafeY+35,310,cafeY+90],[330,cafeY+35,650,cafeY+90],conference.tableBounds,...conferenceSeats.map(s=>[s.point.x-14,s.point.y-20,s.point.x+14,s.point.y+8])];
    const enclosures=[...rooms.filter(room=>!room.annex).map(room=>({...room,roomId:room.role})),{...conference,roomId:'conference'}];
    const doorways=enclosures.map(room=>{const side=room.roomId==='conference'?'east':['reviewer','qa','security'].includes(room.roomId)?'west':'south',horizontal=side==='south',x=horizontal?room.x+room.width/2:room.x+(side==='east'?room.width:0),y=horizontal?room.y+room.height:room.y+room.height/2,dx=side==='west'?40:side==='east'?-40:0,dy=horizontal?-40:0;return {roomId:room.roomId,side,center:{x,y},width:130,inside:{x:x+dx,y:y+dy},outside:{x:x-dx,y:y-dy}};});
    const wallSegments=enclosures.flatMap(room=>{
      const door=doorways.find(d=>d.roomId===room.roomId),left=room.x,right=left+room.width,top=room.y,bottom=top+room.height,result=[];
      for(const [side,y]of [['north',top],['south',bottom]]){const spans=door.side===side?[[left-5,door.center.x-65],[door.center.x+65,right+5]]:[[left-5,right+5]];for(const [x,r]of spans)result.push({roomId:room.roomId,side,bounds:[x,y-5,r,y+5]});}
      for(const [side,x]of [['west',left],['east',right]]){const spans=door.side===side?[[top-5,door.center.y-65],[door.center.y+65,bottom+5]]:[[top-5,bottom+5]];for(const [y,b]of spans)result.push({roomId:room.roomId,side,bounds:[x-5,y,x+5,b]});}return result;
    });
    const walls=wallSegments.map(wall=>wall.bounds),corridors=[{id:'cross',x:45,y:460+topExtra,width:1810,height:140},{id:'main',x:710,y:lowerY,width:440,height:height-60-lowerY}];
    const decorations=rooms.filter(r=>!r.annex).map(r=>({kind:'bookcase',bounds:[r.x+r.width-150,r.y+5,r.x+r.width-30,r.y+40],height:125}));
    decorations.push({kind:'sofa',bounds:breakout.sofa},{kind:'table',bounds:breakout.table});
    const props=[],prop=(kind,bounds,details={})=>props.push({kind,bounds,...details});
    prop('feature-wall',[85,cafeY+22,650,cafeY+28],{label:'Caf\u00e9',color:'#bd9c6c'});
    const plant=(x,y)=>prop('plant',[x-12,y-12,x+12,y+12],{foliageHeight:135+(props.length%4)*5});
    for(const room of rooms.filter(r=>!r.annex)){
      for(const [dx,dy]of [[30,30],[-30,30],[30,-30],[-30,-30]])plant(room.x+(dx<0?room.width+dx:dx),room.y+(dy<0?room.height+dy:dy));
      prop('wall-art',[room.x+30,room.y+12,room.x+130,room.y+16],{label:room.name});
    }
    for(const [x,y]of [[95,640],[660,640],[95,1130],[660,1130]])plant(x,y+topExtra+(y>1000?conferenceExtra:0));
    for(const [x,y]of [[85,160],[85,440],[680,130],[680,480],[300,610],[640,610]])plant(x,cafeY+y);
    for(const [x,y]of [[755,660],[1105,660],[755,1100],[1105,1100]])plant(x,y+topExtra);
    for(const [x,y]of [[220,cafeY+230],[500,cafeY+230],[570,cafeY+445]]){
      prop('cafe-table',[x-40,y-40,x+40,y+40]);
      for(const [dx,dy]of [[0,-65],[0,65],[-65,0],[65,0]])prop('cafe-chair',[x+dx-20,y+dy-20,x+dx+20,y+dy+20],{rotation:Math.atan2(-dx,-dy)});
    }
    prop('water-cooler',[660,cafeY+80,695,cafeY+120]);
    prop('wall-utility',[devops.x,devops.y,devops.x+devops.width,devops.y+devops.height]);
    prop('whiteboard',[conference.x+90,lowerY+27,conference.x+285,lowerY+35]);
    prop('reception-desk',reception.deskBounds,{label:'Reception'});
    prop('glass-panel',[60,height-45,840,height-40]);prop('glass-panel',[1020,height-45,1840,height-40]);
    return {width:1900,height,baselineComputers,stationScale,staffScale,ceilingHeight,podPitch,topExtra,bottomExtra:middleExtra,bottomShift:topExtra+middleExtra,middleExtra,sharedExtra,conferenceExtra,rightExtra,sideExtra,lobbyExtra:0,stations,conferenceSeats,rooms,enclosures,doorways,wallSegments,corridors,partitions:[],furniture,walls,decorations,props,breakout,cafe,devops,entrance,reception,conference,lobby:index=>({x:755+(index%8)*45,y:height-82-Math.floor(index/8)%4*20})};
  }
  // Movement stays in world coordinates; only presentation uses this projection.
  function sceneLayout(geometry,view='isometric',angle=0,elevation=Math.asin(1/Math.sqrt(3))*180/Math.PI) {
    const flat=view==='top-down',radians=(Number.isFinite(angle)?angle:0)*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians),isoX=Math.sqrt(3)/2;
    const elevationDegrees=Math.max(15,Math.min(70,Number.isFinite(elevation)?elevation:35.264389682754654)),pitch=elevationDegrees*Math.PI/180;
    const floorY=isoX*Math.sin(pitch),heightZ=Math.sqrt(3/2)*Math.cos(pitch);
    const centerX=geometry.width/2,centerY=geometry.height/2;
    const raw=(x,y,z=0)=>{const dx=x-centerX,dy=y-centerY,u=dx*cos-dy*sin,v=dx*sin+dy*cos;return flat?{x:u,y:v}:{x:(u-v)*isoX,y:(u+v)*floorY-z*heightZ};};
    const corners=[[0,0],[geometry.width,0],[geometry.width,geometry.height],[0,geometry.height]].map(([x,y])=>raw(x,y));
    const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
    const project=(x,y,z=0)=>{const p=raw(x,y,flat?0:z);return {x:p.x-minX+40,y:p.y-minY+(flat?40:80)};};
    const visibleFaces=bounds=>{
      if(flat)return [];
      const [x,y,r,b]=bounds,points=[project(x,y),project(r,y),project(r,b),project(x,b)],center=points.reduce((sum,p)=>sum+p.y,0)/4;
      return [[0,1,'north'],[1,2,'east'],[2,3,'south'],[3,0,'west']].filter(([a,c])=>(points[a].y+points[c].y)/2>center+1e-7).map(([, ,side])=>side);
    };
    return {width:maxX-minX+80,height:maxY-minY+(flat?80:160),project,visibleFaces,elevation:flat?90:elevationDegrees,stations:geometry.stations.map(s=>({...s,screen:project(s.desk.x,s.desk.y,flat?0:s.reception?70+16*(geometry.stationScale||1):45*(geometry.stationScale||1))}))};
  }
  // The manual/demo floor retains its original two desks; live departments use layout().
  const workstations=roles.flatMap(role=>[0,1].map(index=>{const lower=roles.indexOf(role)>=3,x=desks[role].x+index*78,y=desks[role].y;return {key:`${role}:${index}`,role,index,point:{x,y},screen:{x:x-3,y:y-(lower?92:94)},desk:{x,y:y-(lower?85:87)}};}));
  function assignWorkstations(actors,jobs,previous=[]) {
    const seats=layout(actors,previous).stations.map(s=>({...s,occupant:null})),assigned=new Set();
    const department=a=>a.role;
    for(const old of previous){const actor=actors.find(a=>a.id===old.occupant?.id),seat=seats.find(s=>s.key===old.key);if(actor&&seat&&(seat.role===department(actor)||seat.role==='shared'&&sharedSeatWithoutRole(actor))){seat.occupant=actor;assigned.add(actor.id);}}
    for(const actor of actors){if(assigned.has(actor.id))continue;const seat=seats.find(s=>s.role===department(actor)&&!s.occupant);if(seat){seat.occupant=actor;assigned.add(actor.id);}}
    // Active threads without a verified department use neutral shared computers.
    for(const actor of actors){if(assigned.has(actor.id)||!sharedSeatWithoutRole(actor))continue;const seat=seats.findLast(s=>s.role==='shared'&&!s.occupant);if(seat){seat.occupant=actor;assigned.add(actor.id);}}
    for(const old of previous){const job=jobs.find(j=>`job-${j.id}`===old.occupant?.id&&['completed','failed','cancelled','timed-out','interrupted'].includes(j.status)),seat=seats.find(s=>s.key===old.key);if(job&&seat.role===job.role&&!seat.occupant&&!assigned.has(old.occupant.id)){seat.occupant=old.occupant;assigned.add(old.occupant.id);}}
    // Keep the latest native result visible in spare desks; active workers take priority.
    for(const job of jobs){const id=`job-${job.id}`;if(assigned.has(id)||!['completed','failed','cancelled','timed-out','interrupted'].includes(job.status))continue;const seat=seats.find(s=>s.role===job.role&&!s.occupant);if(seat){seat.occupant={id,sourceId:job.id,role:job.role,provider:job.provider===undefined?'Codex':job.providerLabel||job.provider,label:job.title};assigned.add(id);}}
    return seats;
  }
  function project(sessions,live,now=Date.now()) {
    const events=(sessions.handoffs||[]).filter(e=>now-Date.parse(e.at)>=0&&now-Date.parse(e.at)<30000);
    const actors=sessions.entries.filter(e=>e.kind!=='process'&&(['event-working','event-waiting','running','adapter-working','adapter-waiting','adapter-idle'].includes(e.status)||e.status==='adapter-ended'&&events.some(h=>h.sourceId===e.id&&h.fromRole===e.role&&h.taskRef===e.taskRef))).map(e=>{
      const role=roles.includes(e.role)?e.role:null,working=['event-working','adapter-working'].includes(e.status);
      const handoff=events.filter(h=>h.sourceId===e.id&&h.fromRole===role&&h.taskRef===e.taskRef&&['adapter-waiting','adapter-ended'].includes(e.status)).at(-1);
      return {id:`session-${e.id}`,sourceId:e.id,parentId:e.parentId||null,activeChildCount:e.activeChildCount||0,provider:e.provider,label:e.label,role,working,awaitingHuman:!!e.awaitingHuman,state:e.status,updatedAt:e.updatedAt,transcriptRevision:e.transcriptRevision||null,transcriptLive:e.transcriptLive??null,taskRef:e.taskRef||null,
        note:e.evidence,taskLabel:e.taskLabel||'',recentEvents:e.recentEvents||[],action:working&&actions[e.action]?e.action:null,targetRef:e.targetRef||null,targetKind:e.targetKind||'session',
        activity:working?(actions[e.action]?.[0]||'Working / activity details not connected'):e.activeChildCount?`${e.activeChildCount} subagent${e.activeChildCount===1?'':'s'} working in this session; parent action unknown`:e.status==='running'?'Session open; no current task event':e.status==='event-waiting'?(e.evidence?.startsWith('Codex local runtime activity observed')?'Activity recently seen':e.evidence?.startsWith('Codex local thread metadata recently updated')?'Session recently updated':'Turn ended'):e.status.replace('adapter-',''),handoff};
    });
    for(const job of live.jobs.filter(j=>['queued','starting','running'].includes(j.status))) {
      actors.push({id:`job-${job.id}`,sourceId:job.id,provider:job.provider===undefined?'Codex':job.providerLabel||job.provider,label:`${job.provider===undefined?'Codex':job.providerLabel||job.provider} / ${job.role}`,role:job.role,working:job.status==='running',state:job.status,updatedAt:job.updatedAt,taskRef:job.id,taskLabel:job.title||'',recentEvents:(job.events||[]).slice(-8).map(event=>({at:event.at,label:event.text})),action:job.status==='running'&&actions[job.action]?job.action:null,targetRef:null,note:'Native task runner event',activity:job.activity,handoff:null});
    }
    return {actors,events};
  }
  function destination(actor,index,geometry) {
    if(actor.visitPoint)return actor.visitPoint;
    if(actor.conferenceSeat)return actor.conferenceSeat.point;
    if(Object.hasOwn(actor,'station'))return actor.station?.point||(geometry?geometry.lobby(index):lobby(index));
    if(actor.handoff) return desks[actor.handoff.toRole];
    return actor.working&&actor.role ? desks[actor.role] : lobby(index);
  }
  function sceneActors(actors,stations,isFree,geometry,previous=[]) {
    const result=actors.map(a=>({...a,station:stations.find(s=>s.occupant?.id===a.id)||null,visitPoint:null,colleague:null,conferenceSeat:null}));
    const occupied=new Set();
    for(const actor of result.filter(isConferenceBound)){const old=previous.find(a=>a.id===actor.id)?.conferenceSeat,seat=geometry?.conferenceSeats?.find(s=>s.key===old?.key);if(seat&&!occupied.has(seat.key)){actor.conferenceSeat=seat;occupied.add(seat.key);}}
    for(const actor of result.filter(a=>isConferenceBound(a)&&!a.conferenceSeat)){const seat=geometry?.conferenceSeats?.find(s=>!occupied.has(s.key));if(seat){actor.conferenceSeat=seat;occupied.add(seat.key);}}
    for(const actor of result){
      const reference=actor.handoff?.targetRef||actor.targetRef,kind=actor.handoff?.targetKind||actor.targetKind||'session',target=reference?result.find(a=>a.id===`${kind}-${reference}`&&a.id!==actor.id&&a.role&&a.station):null;
      const helping=actor.working&&actor.action==='helping';
      if(helping&&target?.working){actor.colleague={id:target.id,label:`${roleNames[target.role]} · ${target.provider} ${target.sourceId.slice(0,4)}`,role:target.role};}
      if(actor.handoff&&target?.role===actor.handoff.toRole){actor.colleague={id:target.id,label:`${roleNames[target.role]} · ${target.provider} ${target.sourceId.slice(0,4)}`,role:target.role};}
      const desk=actor.colleague?(target.conferenceSeat||target.station):actor.handoff?(actor.handoff.toRole==='planner'?geometry?.conferenceSeats?.[0]:stations.find(s=>s.role===actor.handoff.toRole)):null;
      if(desk){actor.visitPoint=[desk.approach,{x:desk.point.x+35,y:desk.point.y},{x:desk.point.x-35,y:desk.point.y},{x:desk.point.x,y:desk.point.y+30}].find(p=>p&&isFree(p.x,p.y))||null;}
    }
    return result;
  }
  function presentation(actor) {
    if(actor.awaitingHuman)return {title:'Question waiting for your answer',action:'awaiting-human',word:'Waiting for your answer',icon:'?',destination:actor.conferenceSeat?`Conference room / Seat ${actor.conferenceSeat.index+1}`:'Conference room',detail:'The session requested human input. It will return to work after an answer is recorded.'};
    const title=actor.handoff?.taskLabel||actor.taskLabel||(actor.activeChildCount?`${actor.activeChildCount} subagent${actor.activeChildCount===1?'':'s'} working`:actor.state==='running'?'No current task event':'Task details not connected');
    if(actor.handoff)return {title,action:'handoff',word:'Passing task',icon:'→',destination:actor.colleague?.label||`${roleNames[actor.handoff.toRole]} department`,detail:`Taking ${title} to ${actor.colleague?.label||roleNames[actor.handoff.toRole]+' department'}`};
    if(actor.conferenceSeat&&['event-waiting','adapter-waiting','queued'].includes(actor.state))return {title,action:'waiting',word:actor.state==='queued'?'Queued':'Waiting',icon:'…',destination:`Conference room · Seat ${actor.conferenceSeat.index+1}`,detail:actor.activity||'Waiting for the next task or turn.'};
    if(actor.working&&actor.action==='helping')return {title,action:actor.colleague?'helping':'waiting',word:actor.colleague?'Helping':'Colleague not connected',icon:'↔',destination:actor.colleague?.label||'Own computer',detail:actor.colleague?`Helping ${actor.colleague.label} with ${title}`:'Helping was reported, but the colleague is not currently connected to a working desk.'};
    const known=actor.working&&actions[actor.action];
    return {title,action:known?actor.action:'unknown',word:known?known[0]:actor.working?'Working · details missing':actor.activeChildCount?'Connected team':actor.state==='running'?'Session open':actor.activity||'Waiting',icon:known?known[1]:'?',destination:actor.conferenceSeat?`Conference room · Seat ${actor.conferenceSeat.index+1}`:actor.role?`${roleNames[actor.role]} · Computer ${(actor.station?.index||0)+1}`:actor.station?`Shared computer ${actor.station.index+1}`:'Reception',detail:actor.activity};
  }
  function focusActor(actors,selected,manual=false) {
    const current=actors.find(actor=>actor.id===selected);
    if(current&&manual)return current;
    const question=actors.find(actor=>actor.awaitingHuman);
    if(question)return question;
    const active=actors.find(actor=>actor.working&&(actor.action||actor.taskLabel));
    if(active)return active;
    const working=actors.find(actor=>actor.working);
    if(working)return working;
    const observed=actors.filter(actor=>actor.state==='event-waiting'&&actor.recentEvents?.length)
      .sort((a,b)=>Date.parse(b.recentEvents.at(-1).at)-Date.parse(a.recentEvents.at(-1).at))[0];
    return observed||current||actors[0]||null;
  }
  function departureTarget(geometry,kind) {
    return kind==='exit'?(geometry.entrance?.point||{x:geometry.width/2,y:geometry.height-57}):geometry.breakout?.point||{x:1220,y:Math.min(geometry.height-175,620)};
  }
  function workerLabel(actor,roleLabel) {
    if(actor.awaitingHuman)return 'Awaiting your answer';
    return roleLabel||roleNames[actor.role]|| (actor.activeChildCount?'Parent session':actor.working||actor.recentEvents?.length?'Activity observed':actor.station?'Shared computer':'Session open');
  }
  function transcriptBubble(transcript) {
    if(!transcript?.available||!Array.isArray(transcript.entries))return null;
    const entry=[...transcript.entries].reverse().find(item=>typeof item?.text==='string'&&item.text.trim());
    if(!entry)return null;
    const characters=Array.from(entry.text.trim()),text=characters.slice(0,180).join('');
    return {speaker:`${entry.speaker} · ${transcript.live?'Live':'Last recorded'}`,text:text+(characters.length>180?'…':''),at:entry.at};
  }
  function activityBubble(actor,now=Date.now()) {
    const event=actor.recentEvents?.at(-1),at=Date.parse(event?.at);
    if(!event?.label||!Number.isFinite(at)||at>now+5000)return null;
    if(!actor.working&&now-at>120000)return null;
    return {speaker:actor.working?'Latest reported activity':'Recent reported activity',text:event.label,at:event.at};
  }
  // Only an explicitly reported idle role may take a visual waiting walk.
  function canRoam(actor) {return Boolean(actor.role)&&actor.state==='adapter-idle'&&!actor.working&&!actor.handoff;}
  function idleStops(actor,index,geometry) {
    const coffee=geometry?.cafe?.point||{x:790,y:310},middle=geometry?.breakout?.point||{x:480,y:330};
    return [coffee,middle,actor.station?.point||desks[actor.role]];
  }
  function motionSpeed(geometry,kind='worker'){return ({worker:105,idle:70,packet:155}[kind]||105)*(geometry?.staffScale||1);}
  function packetLifetime(route,geometry){const distance=route.reduce((sum,p,index)=>sum+(index?Math.hypot(p.x-route[index-1].x,p.y-route[index-1].y):0),0);return Math.max(12,distance/motionSpeed(geometry,'packet')+4);}
  return {roles,roleNames,actions,desks,workstations,layout,isPlanning,sceneLayout,assignWorkstations,lobby,project,destination,departureTarget,sceneActors,presentation,workerLabel,transcriptBubble,activityBubble,focusActor,canRoam,idleStops,motionSpeed,packetLifetime};
});
