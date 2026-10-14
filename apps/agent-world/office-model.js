/* Read-only office projections. Role placement follows explicit metadata or typed local activity; handoffs require explicit evidence. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.OfficeWorld=value;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const roles=['planner','designer','builder','reviewer','qa','security'];
  const roleNames={planner:'Planning',designer:'Design',builder:'Build',reviewer:'Code review',qa:'QA',security:'Security'};
  const actions={planning:['Planning','≡'],designing:['Designing','✎'],coding:['Coding','</>'],reviewing:['Reviewing','⌕'],testing:['Testing','▦'],auditing:['Auditing','◇'],helping:['Helping','↔'],command:['Terminal','>_'],research:['Research','⌕'],tool:['Using tool','⚙'],coordination:['Coordinating','⇄'],reporting:['Reporting','▤']};
  const desks={planner:{x:194,y:250},designer:{x:474,y:250},builder:{x:754,y:250},reviewer:{x:194,y:495},qa:{x:474,y:495},security:{x:754,y:495}};
  const lobby=index=>({x:200+(index%12)*48,y:310});
  function isPlanning(actor) {return actor.working&&!actor.handoff&&actor.action!=='helping'&&(actor.action==='planning'||actor.role==='planner'&&['research','coordination'].includes(actor.action));}
  function layout(actors=[],previous=[],previousConference=[]) {
    const counts=Object.fromEntries(roles.map(role=>[role,Math.max(5,actors.filter(a=>a.role===role).length,...previous.filter(s=>s.role===role).map(s=>s.index+1))]));
    const extra=group=>Math.max(...group.map(role=>Math.ceil(counts[role]/5)-1))*300;
    const topExtra=extra(roles.slice(0,3)),bottomExtra=extra(roles.slice(3));
    const lobbyExtra=Math.max(0,Math.ceil(actors.filter(a=>!a.role).length/15)-1)*44,bottomShift=topExtra+lobbyExtra;
    const conferenceCount=Math.max(8,actors.filter(isPlanning).length,previousConference.length);
    const height=Math.max(850+bottomShift+bottomExtra,conferenceCount>8?630+Math.ceil((conferenceCount-8)/6)*60:0);
    const rooms=roles.map((role,i)=>({role,x:60+(i%3)*350,y:i>=3?465+bottomShift:65,width:320,height:300+(i>=3?bottomExtra:topExtra),name:roleNames[role],color:['#e4ebf5','#ece8f5','#e2eef2','#f1e9dd','#e2efe8','#f2e6e4'][i]}));
    const stations=roles.flatMap(role=>Array.from({length:counts[role]},(_,index)=>{
      const room=rooms.find(r=>r.role===role),row=Math.floor(index/5),angle=(-90+(index%5)*72)*Math.PI/180,center={x:room.x+160,y:room.y+175+row*300};
      const radial=radius=>({x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius});
      const desk=radial(100),point=radial(45),approach=radial(15);
      return {key:`${role}:${index}`,role,index,center,angle,point,approach,screen:{x:desk.x-3,y:desk.y-6},desk};
    }));
    const furniture=[[70,385+topExtra,145,415+topExtra],[1030,385+topExtra,1095,415+topExtra],[1250,205,1430,385],[1320,155,1350,180],[1320,405,1350,430]];
    for(const x of [1200,1460])for(const y of [215,285,355])furniture.push([x,y,x+28,y+35]);
    // Conference chairs are intentional sitting destinations, not walking obstacles.
    for(let i=8;i<conferenceCount;i++){const x=1180+(i-8)%6*65,y=510+Math.floor((i-8)/6)*60;furniture.push([x-14,y-20,x+14,y+8]);}
    const conferenceSeats=furniture.slice(3).map((b,index)=>{const point={x:(b[0]+b[2])/2,y:b[3]-8};const approach=index===0?{x:point.x,y:130}:index===1?{x:point.x,y:455}:index<5?{x:1182,y:point.y}:index<8?{x:1510,y:point.y}:{x:point.x,y:point.y+30};return {key:`conference:${index}`,index,point,approach};});
    const walls=rooms.flatMap(r=>[[r.x-10,r.y+15,r.x-5,r.y+r.height-20],[r.x,r.y+15,r.x+125,r.y+20],[r.x+195,r.y+15,r.x+r.width,r.y+20]]);
    walls.push([1120,65,1540,70],[1115,65,1120,375],[1115,475,1120,height-80]);
    return {width:1600,height,topExtra,bottomExtra,bottomShift,lobbyExtra,stations,conferenceSeats,rooms,partitions:[],furniture,walls,conference:{x:1120,y:65,width:420,height:height-145},lobby:index=>({x:160+(index%15)*55,y:445+topExtra+Math.floor(index/15)*44})};
  }
  // Movement stays in world coordinates; only presentation uses this projection.
  function sceneLayout(geometry,view='isometric',angle=0) {
    const flat=view==='top-down',radians=(Number.isFinite(angle)?angle:0)*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
    const centerX=geometry.width/2,centerY=geometry.height/2;
    const raw=(x,y,z=0)=>{const dx=x-centerX,dy=y-centerY,u=dx*cos-dy*sin,v=dx*sin+dy*cos;return flat?{x:u,y:v}:{x:u-v*.5,y:u*.2+v*.65-z};};
    const corners=[[0,0],[geometry.width,0],[geometry.width,geometry.height],[0,geometry.height]].map(([x,y])=>raw(x,y));
    const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
    const project=(x,y,z=0)=>{const p=raw(x,y,flat?0:z);return {x:p.x-minX+40,y:p.y-minY+(flat?40:80)};};
    return {width:maxX-minX+80,height:maxY-minY+(flat?80:160),project,stations:geometry.stations.map(s=>({...s,screen:project(s.desk.x,s.desk.y,flat?0:45)}))};
  }
  // The manual/demo floor retains its original two desks; live departments use layout().
  const workstations=roles.flatMap(role=>[0,1].map(index=>{const lower=roles.indexOf(role)>=3,x=desks[role].x+index*78,y=desks[role].y;return {key:`${role}:${index}`,role,index,point:{x,y},screen:{x:x-3,y:y-(lower?92:94)},desk:{x,y:y-(lower?85:87)}};}));
  function assignWorkstations(actors,jobs,previous=[]) {
    const seats=layout(actors,previous).stations.map(s=>({...s,occupant:null})),assigned=new Set();
    const department=a=>a.role;
    for(const old of previous){const actor=actors.find(a=>a.id===old.occupant?.id),seat=seats.find(s=>s.key===old.key);if(actor&&seat.role===department(actor)){seat.occupant=actor;assigned.add(actor.id);}}
    for(const actor of actors){if(assigned.has(actor.id))continue;const seat=seats.find(s=>s.role===department(actor)&&!s.occupant);if(seat){seat.occupant=actor;assigned.add(actor.id);}}
    for(const old of previous){const job=jobs.find(j=>`job-${j.id}`===old.occupant?.id&&['completed','failed','cancelled','timed-out','interrupted'].includes(j.status)),seat=seats.find(s=>s.key===old.key);if(job&&seat.role===job.role&&!seat.occupant&&!assigned.has(old.occupant.id)){seat.occupant=old.occupant;assigned.add(old.occupant.id);}}
    // Keep the latest native result visible in spare desks; active workers take priority.
    for(const job of jobs){const id=`job-${job.id}`;if(assigned.has(id)||!['completed','failed','cancelled','timed-out','interrupted'].includes(job.status))continue;const seat=seats.find(s=>s.role===job.role&&!s.occupant);if(seat){seat.occupant={id,sourceId:job.id,role:job.role,provider:'Codex',label:job.title};assigned.add(id);}}
    return seats;
  }
  function project(sessions,live,now=Date.now()) {
    const events=(sessions.handoffs||[]).filter(e=>now-Date.parse(e.at)>=0&&now-Date.parse(e.at)<30000);
    const actors=sessions.entries.filter(e=>e.kind!=='process'&&(['event-working','event-waiting','running','adapter-working','adapter-waiting','adapter-idle'].includes(e.status)||e.status==='adapter-ended'&&events.some(h=>h.sourceId===e.id&&h.fromRole===e.role&&h.taskRef===e.taskRef))).map(e=>{
      const role=roles.includes(e.role)?e.role:null,working=['event-working','adapter-working'].includes(e.status);
      const handoff=events.filter(h=>h.sourceId===e.id&&h.fromRole===role&&h.taskRef===e.taskRef&&['adapter-waiting','adapter-ended'].includes(e.status)).at(-1);
      return {id:`session-${e.id}`,sourceId:e.id,provider:e.provider,label:e.label,role,working,state:e.status,updatedAt:e.updatedAt,taskRef:e.taskRef||null,
        note:e.evidence,taskLabel:e.taskLabel||'',action:working&&actions[e.action]?e.action:null,targetRef:e.targetRef||null,targetKind:e.targetKind||'session',
        activity:working?(actions[e.action]?.[0]||'Working / activity details not connected'):e.status==='running'?'Session open; no current task event':e.status==='event-waiting'?'Turn ended':e.status.replace('adapter-',''),handoff};
    });
    for(const job of live.jobs.filter(j=>['queued','starting','running'].includes(j.status))) {
      actors.push({id:`job-${job.id}`,sourceId:job.id,provider:'Codex',label:`Codex / ${job.role}`,role:job.role,working:job.status==='running',state:job.status,updatedAt:job.updatedAt,taskRef:job.id,taskLabel:job.title||'',action:job.status==='running'&&actions[job.action]?job.action:null,targetRef:null,note:'Native task runner event',activity:job.activity,handoff:null});
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
    for(const actor of result.filter(isPlanning)){const old=previous.find(a=>a.id===actor.id)?.conferenceSeat,seat=geometry?.conferenceSeats?.find(s=>s.key===old?.key);if(seat&&!occupied.has(seat.key)){actor.conferenceSeat=seat;occupied.add(seat.key);}}
    for(const actor of result.filter(a=>isPlanning(a)&&!a.conferenceSeat)){const seat=geometry?.conferenceSeats?.find(s=>!occupied.has(s.key));if(seat){actor.conferenceSeat=seat;occupied.add(seat.key);}}
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
    const title=actor.handoff?.taskLabel||actor.taskLabel||'Task details not connected';
    if(actor.handoff)return {title,action:'handoff',word:'Passing task',icon:'→',destination:actor.colleague?.label||`${roleNames[actor.handoff.toRole]} department`,detail:`Taking ${title} to ${actor.colleague?.label||roleNames[actor.handoff.toRole]+' department'}`};
    if(actor.working&&actor.action==='helping')return {title,action:actor.colleague?'helping':'waiting',word:actor.colleague?'Helping':'Colleague not connected',icon:'↔',destination:actor.colleague?.label||'Own computer',detail:actor.colleague?`Helping ${actor.colleague.label} with ${title}`:'Helping was reported, but the colleague is not currently connected to a working desk.'};
    const known=actor.working&&actions[actor.action];
    return {title,action:known?actor.action:'unknown',word:known?known[0]:actor.working?'Working · details missing':actor.state==='running'?'Session open':actor.activity||'Waiting',icon:known?known[1]:'?',destination:actor.conferenceSeat?`Conference room · Seat ${actor.conferenceSeat.index+1}`:actor.role?`${roleNames[actor.role]} · Computer ${(actor.station?.index||0)+1}`:'Reception',detail:actor.activity};
  }
  // Only an explicitly reported idle role may take a visual waiting walk.
  function canRoam(actor) {return Boolean(actor.role)&&actor.state==='adapter-idle'&&!actor.working&&!actor.handoff;}
  function idleStops(actor,index,geometry) {
    const shift=geometry?.topExtra||0,left=geometry?{x:160,y:445+shift}:{x:160,y:310},coffee=geometry?{x:1020,y:445+shift}:{x:790,y:310},middle=geometry?{x:570,y:445+shift}:{x:480,y:330};
    const waiting=geometry?geometry.lobby(index):lobby(index);
    return [index%2?left:coffee,middle,actor.station?.point||(actor.role?desks[actor.role]:waiting),index%2?coffee:left,waiting];
  }
  return {roles,roleNames,actions,desks,workstations,layout,isPlanning,sceneLayout,assignWorkstations,lobby,project,destination,sceneActors,presentation,canRoam,idleStops};
});
