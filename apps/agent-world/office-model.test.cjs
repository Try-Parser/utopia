const {test}=require('node:test');const assert=require('node:assert/strict');
const O=require('./office-model.js'),M=require('./game-model.js');
const base={id:'a'.repeat(32),provider:'Codex',label:'local',status:'running',evidence:'OS only'};
test('explicit help visits the exact colleague and handoffs preserve sender role and computer',()=>{
  const helper={id:'session-h',sourceId:'h',provider:'Codex',role:'builder',working:true,action:'helping',targetRef:'b',taskLabel:'Fix checkout'},a={id:'session-a',sourceId:'a',provider:'Other AI',role:'reviewer',working:true},b={...a,id:'session-b',sourceId:'b'};
  const actors=[helper,a,b],seats=O.assignWorkstations(actors,[]),g=O.layout(actors,seats);M.configure(g);
  try{const scene=O.sceneActors(actors,seats,M.free),h=scene[0];assert.equal(h.station.key,'builder:0');assert.equal(h.colleague.id,b.id);assert.ok(M.free(h.visitPoint.x,h.visitPoint.y));assert.ok(M.path(h.station.point,h.visitPoint).length);assert.notDeepEqual(O.destination(h,0,g),h.station.point);assert.equal(O.presentation(h).word,'Helping');
    const unavailable=O.sceneActors([helper,a],seats,M.free)[0];assert.equal(unavailable.colleague,null);assert.equal(unavailable.visitPoint,null);assert.equal(O.presentation(unavailable).word,'Colleague not connected');
    const native={...b,id:'job-native',sourceId:'native',role:'qa'},toNative={...helper,targetKind:'job',targetRef:'native'},nativeActors=[toNative,native],nativeSeats=O.assignWorkstations(nativeActors,[]);assert.equal(O.sceneActors(nativeActors,nativeSeats,M.free)[0].colleague.id,'job-native');
    const passing={...helper,working:false,handoff:{toRole:'reviewer',targetRef:'b',taskLabel:'Fix checkout'}};const assigned=O.assignWorkstations([passing,a,b],[],seats),sent=O.sceneActors([passing,a,b],assigned,M.free)[0];assert.equal(sent.role,'builder');assert.equal(sent.station.key,'builder:0');assert.equal(sent.colleague.id,b.id);assert.equal(O.presentation(sent).word,'Passing task');assert.equal(O.presentation(sent).title,'Fix checkout');
  }finally{M.configure(null);}
});
test('known events produce meaningful task actions; role alone never implies an action',()=>{
  const generic=O.project({entries:[{...base,role:'builder',status:'adapter-working'}]},{jobs:[]}).actors[0];assert.equal(generic.action,null);assert.equal(O.presentation(generic).title,'Task details not connected');
  const native=O.project({entries:[]},{jobs:[{id:'b',role:'qa',title:'Check checkout',status:'running',activity:'Running a command',action:'command'}]}).actors[0];assert.equal(O.presentation(native).word,'Terminal');assert.equal(O.presentation(native).title,'Check checkout');
  assert.notEqual(O.presentation({...generic,action:'testing'}).icon,O.presentation({...generic,action:'auditing'}).icon);
});
test('parallel workers own distinct stable computers; departments grow and role changes release safely',()=>{
  const a={id:'session-a',role:'builder',working:true},b={id:'session-b',role:'builder',working:true},c={id:'session-c',role:'builder',working:true};
  let seats=O.assignWorkstations([a,b,c],[]);
  assert.equal(seats.find(s=>s.occupant?.id===a.id).key,'builder:0');assert.equal(seats.find(s=>s.occupant?.id===b.id).key,'builder:1');assert.equal(seats.find(s=>s.occupant?.id===c.id).key,'builder:2');
  seats=O.assignWorkstations([b,a,c],[],seats);assert.equal(seats.find(s=>s.occupant?.id===a.id).key,'builder:0');
  seats=O.assignWorkstations([b,c,{...a,handoff:{toRole:'qa'}}],[],seats);assert.equal(seats.find(s=>s.occupant?.id===b.id).key,'builder:1');assert.equal(seats.find(s=>s.occupant?.id===c.id).key,'builder:2');assert.equal(seats.find(s=>s.occupant?.id===a.id).key,'builder:0');
  const spare=O.assignWorkstations([b],[{id:'old',role:'builder',status:'completed',title:'Old result'}],seats);assert.equal(spare.find(s=>s.key==='builder:1').occupant.id,b.id);assert.equal(spare.find(s=>s.key==='builder:0').occupant.id,'job-old');
  assert.deepEqual(O.destination({...c,station:null},2),O.lobby(2));
  for(const s of O.workstations){assert.ok(M.free(s.point.x,s.point.y));assert.ok(M.path(O.lobby(0),s.point).length);}
  const active={id:'job-new',sourceId:'new',role:'builder',working:true},old={id:'old',role:'builder',status:'completed',title:'Old'};
  const running=O.assignWorkstations([active],[old]);
  const finished=O.assignWorkstations([],[old,{id:'new',role:'builder',status:'completed',title:'New'}],running);
  assert.equal(finished.find(s=>s.key==='builder:0').occupant.id,'job-new');assert.equal(finished.find(s=>s.key==='builder:1').occupant.id,'job-old');
});
test('five computers circle a shared clear workspace in every live department',()=>{
  const g=O.layout();M.configure(g);
  try{assert.equal(g.stations.length,30);for(const role of O.roles){const seats=g.stations.filter(s=>s.role===role);assert.equal(seats.length,5);assert.ok(M.free(seats[0].center.x,seats[0].center.y));const room=g.rooms.find(r=>r.role===role);assert.ok(M.free(room.x+160,room.y+30),'door entrance clear');assert.ok(M.free(room.x+115,room.y+30),'space beside first desk through door');
    for(const seat of seats){assert.ok(Math.abs(Math.hypot(seat.desk.x-seat.center.x,seat.desk.y-seat.center.y)-100)<1e-6);assert.ok(M.free(seat.point.x,seat.point.y));assert.ok(M.path(g.lobby(0),seat.point).length,`${seat.key} seat reachable`);assert.equal(M.free(seat.desk.x,seat.desk.y),false);}}
  }finally{M.configure(null);}
});
test('every cubicle has a reachable named help and handoff entrance',()=>{
  const peers=O.roles.flatMap(role=>Array.from({length:6},(_,index)=>({id:`session-${role}-${index}`,sourceId:`${role}-${index}`,provider:'Fixture',role,working:true}))),seats=O.assignWorkstations(peers,[]),g=O.layout(peers,seats);M.configure(g);
  try{for(const target of peers){const role=target.role==='builder'?'qa':'builder',helper={id:'session-helper',role,working:true,action:'helping',targetRef:target.sourceId};
    for(const a of [helper,{...helper,working:false,handoff:{toRole:target.role,targetRef:target.sourceId}}]){const scene=O.sceneActors([a,...peers],seats,M.free)[0];assert.equal(scene.colleague.id,target.id);assert.ok(scene.visitPoint,`${target.id} visit`);assert.ok(M.free(scene.visitPoint.x,scene.visitPoint.y));assert.ok(M.path(g.lobby(0),scene.visitPoint).length,`${target.id} approach reachable`);}}
  }finally{M.configure(null);}
});
test('expanded departments and reception connect all new desks with matching collision geometry',()=>{
  const actors=Array.from({length:8},(_,i)=>({id:`session-${i}`,role:i<5?'builder':'qa',working:true}));
  const seats=O.assignWorkstations(actors,[]),g=O.layout(actors,seats);assert.equal(g.stations.filter(s=>s.role==='builder').length,5);assert.equal(g.height,850);
  M.configure(g);
  try{for(const s of g.stations){assert.equal(M.free(s.point.x,s.point.y),true);assert.ok(M.path(g.lobby(0),s.point).length,`${s.key} reachable`);assert.equal(M.free(s.desk.x,s.desk.y),false);}
    const unknown={role:null,working:true,station:null};assert.deepEqual(O.destination(unknown,0,g),g.lobby(0));assert.ok(M.free(O.destination(unknown,0,g).x,O.destination(unknown,0,g).y));
    assert.ok(M.path(g.lobby(0),{x:1335,y:470}).length);
  }finally{M.configure(null);}
  const retained=O.assignWorkstations([],[],seats);assert.equal(retained.filter(s=>s.role==='builder').length,5);
  const all=Array.from({length:210},(_,i)=>({id:String(i),role:'builder'})),large=O.layout(all),full=O.assignWorkstations(all,[]);assert.equal(large.stations.filter(s=>s.role==='builder').length,210);assert.equal(new Set(full.filter(s=>s.occupant).map(s=>s.occupant.id)).size,210);
});
test('unlinked processes stay off the floor while an identified open session waits in reception',()=>{
  const result=O.project({entries:[{...base,kind:'process'}, {...base,id:'b'.repeat(32),kind:'session'}, {...base,id:'c'.repeat(32),kind:'session',status:'recent'}, {...base,id:'d'.repeat(32),kind:'session',status:'adapter-stale',role:'builder'}]}, {jobs:[]});
  assert.equal(result.actors.length,1);assert.equal(result.actors[0].working,false);assert.equal(result.actors[0].role,null);
  assert.deepEqual(O.destination(result.actors[0],0),O.lobby(0));assert.equal(O.canRoam(result.actors[0]),false);
});
test('confirmed role changes retain session identity and route to the next department',()=>{
  const project=role=>O.project({entries:[{...base,status:'adapter-working',role}]},{jobs:[]}).actors[0];
  const builder=project('builder'),qa=project('qa');assert.equal(builder.id,qa.id);
  assert.deepEqual(O.destination(builder,0),O.desks.builder);assert.deepEqual(O.destination(qa,0),O.desks.qa);
  for(const point of [O.lobby(0),...Object.values(O.desks)]) {assert.equal(M.free(point.x,point.y),true);assert.ok(M.path(O.lobby(0),point).length>0);}
});
test('only explicit fresh handoffs transfer work; completion never invents a next role',()=>{
  const now=Date.now(),event={id:'d'.repeat(32),sourceId:base.id,fromRole:'builder',toRole:'reviewer',taskRef:'e'.repeat(32),at:new Date(now).toISOString()};
  const sessions={entries:[{...base,status:'adapter-waiting',role:'builder',taskRef:event.taskRef}],handoffs:[event]};
  const fresh=O.project(sessions,{jobs:[]},now);assert.deepEqual(O.destination(fresh.actors[0],0),O.desks.reviewer);
  const stale=O.project(sessions,{jobs:[]},now+31000);assert.equal(stale.events.length,0);assert.deepEqual(O.destination(stale.actors[0],0),O.lobby(0));
  const next=O.project({...sessions,entries:[{...sessions.entries[0],status:'adapter-working',role:'qa'}]},{jobs:[]},now);
  assert.deepEqual(O.destination(next.actors[0],0),O.desks.qa);
  const native=O.project({entries:[]},{jobs:[{id:'f'.repeat(32),role:'qa',status:'running',activity:'Running tests'},{id:'e'.repeat(32),role:'builder',status:'completed'}]});
  assert.equal(native.actors.length,1);assert.equal(native.actors[0].working,true);assert.deepEqual(O.destination(native.actors[0],0),O.desks.qa);assert.equal(native.events.length,0);
});
test('only explicitly role-reported idle sessions take cosmetic walks',()=>{
  const actor=O.project({entries:[{...base,kind:'session',status:'adapter-idle',role:'builder'}]},{jobs:[]}).actors[0];assert.equal(O.canRoam(actor),true);assert.equal(O.canRoam({...actor,role:null}),false);assert.equal(O.canRoam({...actor,state:'running'}),false);
  for(let i=0;i<12;i++){let p=O.lobby(i);for(const q of O.idleStops(actor,i)){assert.equal(M.free(q.x,q.y),true);assert.ok(M.path(p,q).length>0);p=q;}}
  assert.equal(actor.working,false);assert.equal(actor.role,'builder');
  assert.equal(O.canRoam({...actor,working:true}),false);assert.equal(O.canRoam({...actor,handoff:{toRole:'qa'}}),false);assert.equal(O.canRoam({...actor,state:'adapter-ended'}),false);
});

test('local session events seat observed coding activity without adapter or inferred colleague',()=>{
  const events={entries:[{...base,status:'event-working',role:'builder',action:'coding',taskLabel:'Editing files',taskRef:'a'.repeat(32),evidence:'Local tool events; department follows activity'}]};
  const actor=O.project(events,{jobs:[]}).actors[0];assert.equal(actor.working,true);assert.equal(O.canRoam(actor),false);assert.equal(actor.action,'coding');assert.equal(actor.handoff,undefined);
  const seats=O.assignWorkstations([actor],[]),scene=O.sceneActors([actor],seats,M.free)[0];assert.equal(scene.station.key,'builder:0');assert.deepEqual(O.destination(scene,0),scene.station.point);assert.equal(scene.colleague,null);
  events.entries[0].status='event-waiting';events.entries[0].action=null;const ended=O.project(events,{jobs:[]}).actors[0];assert.equal(ended.working,false);assert.equal(ended.activity,'Turn ended');
});

test('game presentation projects world positions without changing movement or station ownership',()=>{
  const g=O.layout(),v=O.sceneLayout(g);assert.equal(v.width,2105);assert.equal(v.height,1032.5);
  assert.deepEqual(v.project(0,0),{x:465,y:80});assert.deepEqual(v.project(1600,850),{x:1640,y:952.5});
  assert.deepEqual(v.project(220,140,45),{x:615,y:170});
  for(const [i,s]of v.stations.entries()){assert.equal(s.key,g.stations[i].key);assert.deepEqual(s.point,g.stations[i].point);assert.deepEqual(s.desk,g.stations[i].desk);assert.deepEqual(s.screen,v.project(s.desk.x,s.desk.y,45));assert.ok(s.screen.x>0&&s.screen.x<v.width&&s.screen.y>0&&s.screen.y<v.height);}
});

test('planning uses stable unique conference seats and retains home computers across phase changes',()=>{
  const actors=Array.from({length:10},(_,i)=>({id:`session-plan${i}`,sourceId:`plan${i}`,role:i===2?'builder':'planner',provider:'Fixture',working:true,action:'planning'}));
  const stations=O.assignWorkstations(actors,[]),g=O.layout(actors,stations);M.configure(g);
  try{
    const scene=O.sceneActors(actors,stations,M.free,g);assert.equal(g.conferenceSeats.length,10);assert.equal(new Set(scene.map(a=>a.conferenceSeat.key)).size,10);
    for(const a of scene){assert.ok(a.station);assert.deepEqual(O.destination(a,0,g),a.conferenceSeat.point);assert.ok(M.free(a.conferenceSeat.point.x,a.conferenceSeat.point.y));assert.ok(M.path(g.lobby(0),a.conferenceSeat.point).length);assert.match(O.presentation(a).destination,/Conference room/);}
    assert.equal(M.free(1340,290),false,'conference table still blocks movement');
    const reordered=O.sceneActors([...actors].reverse(),stations,M.free,g,scene);for(const a of reordered)assert.equal(a.conferenceSeat.key,scene.find(old=>old.id===a.id).conferenceSeat.key);
    const changed=actors.map(a=>a.id==='session-plan2'?{...a,action:'coding'}:a),nextStations=O.assignWorkstations(changed,[],stations),nextGeometry=O.layout(changed,nextStations,g.conferenceSeats),next=O.sceneActors(changed,nextStations,M.free,nextGeometry,scene),builder=next.find(a=>a.id==='session-plan2');
    assert.equal(builder.conferenceSeat,null);assert.equal(builder.station.key,scene[2].station.key);assert.deepEqual(O.destination(builder,0,nextGeometry),builder.station.point);assert.equal(nextGeometry.conferenceSeats.length,10,'capacity retained');
    const unknown={...actors[0],action:null};assert.equal(O.sceneActors([unknown],stations,M.free,g)[0].conferenceSeat,null,'role alone does not invent planning');
    const idle={...actors[0],working:false};assert.equal(O.sceneActors([idle],stations,M.free,g)[0].conferenceSeat,null);
  }finally{M.configure(null);}
});
test('help and named handoff follow a conference planner instead of the home desk',()=>{
  const planner={id:'session-p',sourceId:'p',role:'planner',provider:'Fixture',working:true,action:'planning'},helper={id:'session-h',sourceId:'h',role:'builder',provider:'Fixture',working:true,action:'helping',targetRef:'p'};
  const stations=O.assignWorkstations([planner,helper],[]),g=O.layout([planner,helper],stations);M.configure(g);
  try{for(const sender of [helper,{...helper,working:false,handoff:{toRole:'planner',targetRef:'p'}}]){const scene=O.sceneActors([planner,sender],stations,M.free,g);assert.equal(scene[1].colleague.id,planner.id);assert.deepEqual(scene[1].visitPoint,scene[0].conferenceSeat.approach);assert.ok(M.path(scene[1].station.point,scene[1].visitPoint).length);assert.equal(scene[1].conferenceSeat,null);}}
  finally{M.configure(null);}
});

test('top-down is a presentation projection of the same computers and conference seats',()=>{
 const actors=[{id:'session-plan',sourceId:'plan',role:'planner',working:true,action:'planning'}],g=O.layout(actors),iso=O.sceneLayout(g),flat=O.sceneLayout(g,'top-down');
 assert.deepEqual(flat.project(100,200),{x:140,y:240});assert.equal(flat.width,g.width+80);assert.equal(flat.height,g.height+80);
 for(const station of flat.stations){const original=g.stations.find(s=>s.key===station.key);assert.deepEqual(station.point,original.point);assert.deepEqual(station.screen,flat.project(original.desk.x,original.desk.y));}
 assert.deepEqual(O.sceneLayout(g,'invalid').project(100,200),iso.project(100,200));assert.notDeepEqual(flat.project(g.conferenceSeats[0].point.x,g.conferenceSeats[0].point.y),iso.project(g.conferenceSeats[0].point.x,g.conferenceSeats[0].point.y));
});

test('orbit projection keeps every physical computer on its own monitor through a full turn',()=>{
 const g=O.layout(),home=O.sceneLayout(g);assert.deepEqual(home.project(100,200),{x:100-200*.5+g.height*.5+40,y:100*.2+200*.65+80});
 for(const view of ['isometric','top-down'])for(const angle of [0,30,90,180,270,359]){
   const scene=O.sceneLayout(g,view,angle);
   for(const station of scene.stations){const physical=g.stations.find(s=>s.key===station.key);assert.deepEqual(station.point,physical.point);assert.deepEqual(station.screen,scene.project(physical.desk.x,physical.desk.y,view==='top-down'?0:45));assert.ok(station.screen.x>0&&station.screen.x<scene.width&&station.screen.y>0&&station.screen.y<scene.height);}
   assert.notDeepEqual(scene.project(100,200),scene.project(200,100));
 }
 assert.notDeepEqual(O.sceneLayout(g,'isometric',180).project(100,200),home.project(100,200));
});
