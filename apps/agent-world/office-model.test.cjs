const {test}=require('node:test');const assert=require('node:assert/strict');
const O=require('./office-model.js'),M=require('./game-model.js');
const projectedScreenHeight=(station,geometry)=>station.reception?require('./office-layout.contract.json').sharedReception.svgScreenHeight:45*(geometry.stationScale||1);
const base={id:'a'.repeat(32),provider:'Codex',label:'local',status:'running',evidence:'OS only'};

test('scaled movement and handoff budgets complete actual routes across expanded office bands',()=>{
  const actors=Array.from({length:16},(_,i)=>({id:`builder-${i}`,role:'builder',working:true}));
  const g=O.layout(actors),start=g.lobby(0),goal=g.stations.find(s=>s.role==='planner').point;
  M.configure(g);
  try{
    const route=M.path(start,goal);assert.ok(route.length>0);
    assert.equal(O.motionSpeed(g)/O.motionSpeed(null),g.staffScale,'walk stride scales with employee size');
    assert.ok(O.motionSpeed(g,'packet')>O.motionSpeed(g));assert.ok(O.motionSpeed(g,'idle')<O.motionSpeed(g));
    const lifetime=O.packetLifetime([start,...route],g);assert.ok(lifetime>12,'long routes outlive the old fixed timeout');
    let packet={position:start,route},elapsed=0;
    while(packet.route.length&&elapsed<lifetime){packet=M.advanceRoute(packet.position,packet.route,O.motionSpeed(g,'packet')/60);elapsed+=1/60;}
    assert.equal(packet.route.length,0,'handoff arrives before its animation budget expires');assert.ok(Math.hypot(packet.position.x-goal.x,packet.position.y-goal.y)<1);
    assert.equal(O.packetLifetime([],g),12,'an empty route stays bounded');
  }finally{M.configure(null);}
});
test('reference office preserves versioned golden room vectors and targets',()=>{
  const fs=require('node:fs'),crypto=require('node:crypto'),bytes=fs.readFileSync(require('node:path').join(__dirname,'office-layout.contract.json'));
  assert.equal(crypto.createHash('sha256').update(bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')).digest('hex'),'bcc33f7a9581f426099dc85a7a06166183a3f7edc6bd57eb6404188b8475f340');
  const golden=JSON.parse(bytes),g=O.layout(),pick=(actual,expected)=>Object.fromEntries(Object.keys(expected).map(key=>[key,actual[key]]));
  assert.deepEqual({width:g.width,height:g.height},golden.world);
  assert.deepEqual(g.baselineComputers,golden.baselineComputers);
  for(const key of ['stationScale','staffScale','ceilingHeight','podPitch'])assert.equal(g[key],golden[key]);
  assert.equal(g.stations.length,17);
  for(const [role,count]of Object.entries(golden.baselineComputers))assert.equal(g.stations.filter(s=>s.role===role).length,count);
  assert.deepEqual(g.rooms.map((room,i)=>pick(room,golden.rooms[i])),golden.rooms);
  for(const key of ['devops','conference','cafe','breakout','entrance'])assert.deepEqual(pick(g[key],golden[key]),golden[key]);
  assert.equal(g.stations.some(s=>s.role==='devops'),false,'an unassigned visual room never acquires invented provider work');
  assert.equal(g.furniture[2],g.conference.tableBounds);
  for(const seat of g.conferenceSeats)assert.deepEqual(seat.target,g.conference.target);
  assert.deepEqual(g.props.filter(p=>p.kind==='feature-wall'),golden.featureWalls);
  const cafe=golden.cafeFurniture,tables=g.props.filter(p=>p.kind==='cafe-table'),chairs=g.props.filter(p=>p.kind==='cafe-chair');assert.equal(tables.length,3);assert.equal(chairs.length,12);
  for(const [i,[x,y]]of cafe.tableCenters.entries()){assert.deepEqual(tables[i].bounds,[x-cafe.tableRadius,y-cafe.tableRadius,x+cafe.tableRadius,y+cafe.tableRadius]);for(const [j,[dx,dy]]of cafe.chairOffsets.entries()){const chair=chairs[i*4+j];assert.deepEqual(chair.bounds,[x+dx-cafe.chairHalfExtent,y+dy-cafe.chairHalfExtent,x+dx+cafe.chairHalfExtent,y+dy+cafe.chairHalfExtent]);assert.equal(chair.rotation,Math.atan2(-dx,-dy));}}
  for(const prop of [...tables,...chairs])assert.ok(prop.bounds[0]>=g.cafe.x&&prop.bounds[1]>=g.cafe.y&&prop.bounds[2]<=g.cafe.x+g.cafe.width&&prop.bounds[3]<=g.cafe.y+g.cafe.height,'cafe furniture stays within its room');
  const expanded=O.layout([...O.roles,'shared'].flatMap(role=>Array.from({length:5},(_,i)=>({id:`${role}-${i}`,role:role==='shared'?null:role,working:true}))));
  for(const room of expanded.rooms)for(const station of expanded.stations.filter(s=>s.role===room.role)){if(room.role==='shared'){const vector=station.index===0?golden.sharedReception.desk:golden.sharedHotdesks[station.index-1],shift=station.index===0?expanded.height-golden.world.height:expanded.topExtra+expanded.middleExtra;assert.deepEqual(station.desk,{x:vector[0],y:vector[1]+shift});}else{const vector=golden.stationSlots[station.index%golden.regularPodCapacity];assert.equal(station.desk.x,room.x+room.width/2+vector.centerOffset*golden.stationScale);assert.equal(station.desk.y,room.y+vector.regularY+Math.floor(station.index/golden.regularPodCapacity)*golden.podPitch);}}
  const waiting=O.layout(Array.from({length:19},(_,i)=>({id:`waiting-${i}`,awaitingHuman:true})));
  for(const seat of waiting.conferenceSeats.slice(8)){const n=seat.index-8,vector=golden.conferenceOverflow;assert.equal(seat.point.x,vector.firstX+n%vector.columns*vector.columnPitch);assert.equal(seat.point.y,waiting.conference.y+vector.firstYOffset+Math.floor(n/vector.columns)*vector.rowPitch);assert.equal(seat.approach.y-seat.point.y,vector.approachOffset);assert.equal(seat.target.y-seat.point.y,vector.targetOffset);}
});
test('reference furniture and every destination share reachable authoritative geometry',()=>{
  const g=O.layout();M.configure(g);
  try{
    for(const prop of g.props){const [x,y,r,b]=prop.bounds;assert.equal(M.free((x+r)/2,(y+b)/2),prop.blocking===false,`${prop.kind} is blocked unless explicitly designated a reachable seat`);}
    const targets=[...g.stations.flatMap(s=>[s.point,s.approach]),...g.conferenceSeats.flatMap(s=>[s.point,s.approach]),...g.cafeSeats.map(s=>s.point),O.departureTarget(g,'exit'),O.departureTarget(g,'breakout'),g.cafe.point];
    for(const target of targets){assert.ok(M.free(target.x,target.y),`${JSON.stringify(target)} is clear`);assert.ok(M.path(g.lobby(0),target).length,`${JSON.stringify(target)} reachable`);}
    for(let i=0;i<32;i++){const start=g.lobby(i);assert.ok(M.free(start.x,start.y));assert.ok(M.path(start,g.entrance.point).length,`arrival ${i} reaches open front door`);}
  }finally{M.configure(null);}
});
test('reference proportions enlarge desk collisions, chairs and monitor projection together',()=>{
  const g=O.layout(),scene=O.sceneLayout(g);M.configure(g);
  try{
    for(const station of g.stations){
      assert.deepEqual(station.deskBounds,station.reception?g.reception.deskBounds:[station.desk.x-28*g.stationScale,station.desk.y-20*g.stationScale,station.desk.x+28*g.stationScale,station.desk.y+20*g.stationScale]);
      assert.equal(M.free(station.desk.x+50,station.desk.y),false,'scaled table blocks movement outside the former small footprint');
      assert.equal(station.point.y-station.desk.y,station.seatOffset*g.stationScale);assert.ok(Math.abs(station.approach.y-station.desk.y-Math.sign(station.seatOffset)*46*g.stationScale)<1e-9);assert.equal(station.seatOffset,station.role!=='shared'&&station.index%4>=2?36:-36);
      assert.deepEqual(scene.stations.find(s=>s.key===station.key).screen,scene.project(station.desk.x,station.desk.y,projectedScreenHeight(station,g)));
    }
    assert.ok(O.assignWorkstations([],[]).every(station=>station.occupant===null),'reference furniture never fabricates employees');
  }finally{M.configure(null);}
});
test('staggered full pods keep scaled seated footprints inside rooms without overlapping tables or chairs',()=>{
  const actors=[...O.roles,'shared'].flatMap(role=>Array.from({length:11},(_,index)=>({id:`fit-${role}-${index}`,role:role==='shared'?null:role,working:true})));
  actors.push(...Array.from({length:29},(_,index)=>({id:`fit-question-${index}`,role:'builder',awaitingHuman:true})));
  const g=O.layout(actors),radius=16*g.staffScale,inside=(bounds,room)=>bounds[0]>=room.x&&bounds[1]>=room.y&&bounds[2]<=room.x+room.width&&bounds[3]<=room.y+room.height;
  const intersects=(a,b)=>a[0]<b[2]-1e-9&&a[2]>b[0]+1e-9&&a[1]<b[3]-1e-9&&a[3]>b[1]+1e-9;
  for(const room of g.rooms){const stations=g.stations.filter(s=>s.role===room.role);
    for(const station of stations){const seated=[station.point.x-radius,station.point.y-radius,station.point.x+radius,station.point.y+radius];
      assert.ok(inside(station.deskBounds,room),`${station.key} physical desk remains in its department`);
      assert.ok(inside(seated,room),`${station.key} seated chair and employee remain in their department`);
      for(const other of stations){assert.equal(intersects(seated,other.deskBounds),false,`${station.key} seated footprint clears ${other.key} table`);if(other.index>station.index){assert.equal(intersects(station.deskBounds,other.deskBounds),false,`${station.key} table clears ${other.key}`);assert.equal(intersects(seated,[other.point.x-radius,other.point.y-radius,other.point.x+radius,other.point.y+radius]),false,`${station.key} seated footprint clears ${other.key} employee`);}}
    }
  }
  const seated=g.conferenceSeats.map(seat=>[seat.point.x-radius,seat.point.y-radius,seat.point.x+radius,seat.point.y+radius]);
  for(const [index,bounds]of seated.entries()){assert.ok(inside(bounds,g.conference),`conference:${index} footprint stays in conference`);assert.equal(intersects(bounds,g.conference.tableBounds),false,`conference:${index} chair clears table`);for(const other of seated.slice(index+1))assert.equal(intersects(bounds,other),false,'conference chairs remain distinct');}
});
test('centered primary stations do not seal narrow-room doorways behind side desks',()=>{
  const actors=Array.from({length:6},(_,index)=>({id:`narrow-${index}`,role:'reviewer',working:true})),g=O.layout(actors);M.configure(g);
  try{const door=g.doorways.find(d=>d.roomId==='reviewer').inside;
    for(const station of g.stations.filter(s=>s.role==='reviewer')){
      const route=M.path(door,station.point);assert.ok(route.length,`${station.key} can be reached from its actual department doorway`);
      let worker={position:door,route};for(let frame=0;worker.route.length&&frame<6000;frame++)worker=M.advanceRoute(worker.position,worker.route,O.motionSpeed(g)/60);
      assert.equal(worker.route.length,0,`${station.key} route actually consumes its waypoints`);assert.ok(Math.hypot(worker.position.x-station.point.x,worker.position.y-station.point.y)<1);
      assert.ok(M.path(station.point,station.approach).length,`${station.key} help approach remains clear beside a later pod`);
    }
  }finally{M.configure(null);}
});
test('expanded reference bands retain computers, identities and routes without imposing a worker cap',()=>{
  const actors=O.roles.flatMap(role=>Array.from({length:11},(_,index)=>({id:`${role}-${index}`,role,working:true,state:'adapter-working'})));
  actors.push(...Array.from({length:16},(_,index)=>({id:`shared-${index}`,role:null,working:true,state:'adapter-working'})));
  const seats=O.assignWorkstations(actors,[]),g=O.layout(actors,seats),retained=O.layout([],seats,g.conferenceSeats);
  assert.equal(g.topExtra,1000);assert.equal(g.middleExtra,3000);assert.equal(g.rightExtra,3000);assert.equal(g.sharedExtra,1500);assert.equal(g.height,7400);
  assert.equal(new Set(seats.filter(s=>s.occupant).map(s=>s.occupant.id)).size,actors.length);
  assert.deepEqual(retained.stations,seats.map(({occupant,...seat})=>seat));
  M.configure(g);
  try{for(const station of g.stations){assert.ok(M.free(station.point.x,station.point.y),station.key);assert.ok(M.free(station.approach.x,station.approach.y),`${station.key} approach clear`);assert.ok(M.path(station.point,station.approach).length,`${station.key} help approach reachable`);assert.ok(M.path(g.lobby(0),station.point).length,`${station.key} reachable after all bands expand`);}}
  finally{M.configure(null);}
});
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
test('automatically observed threads keep shared computers and expand capacity',()=>{
  const note='Codex local runtime activity observed; current task state unavailable';
  const actors=Array.from({length:32},(_,i)=>({id:`session-auto-${i}`,provider:'Codex',role:null,working:false,state:'event-waiting',note}));
  let seats=O.assignWorkstations(actors,[]);
  assert.equal(seats.filter(s=>s.occupant).length,32);
  assert.equal(seats.find(s=>s.occupant?.id===actors[0].id).key,'shared:31');
  seats=O.assignWorkstations([...actors].reverse(),[],seats);
  assert.equal(seats.find(s=>s.occupant?.id===actors[0].id).key,'shared:31');
  const geometry=O.layout(actors,seats),scene=O.sceneActors(actors,seats,()=>true,geometry);
  assert.equal(geometry.conferenceSeats.length,32);
  assert.deepEqual(O.destination(scene[0],0,geometry),scene[0].conferenceSeat.point);
  assert.match(O.presentation(scene[0]).destination,/Conference room/);
});
test('every parallel arrival and idle waypoint stays clear of shared computers',()=>{
  const actors=Array.from({length:32},(_,index)=>({id:`session-${index}`,role:null,working:true,state:'running'}));
  const seats=O.assignWorkstations(actors,[]),geometry=O.layout(actors,seats);
  M.configure(geometry);
  try{
    for(const [index,actor] of actors.entries()){
      const start=geometry.lobby(index),desk=seats.find(seat=>seat.occupant?.id===actor.id);
      assert.ok(M.free(start.x,start.y),`arrival ${index} overlaps furniture`);
      assert.ok(M.path(start,desk.point).length,`arrival ${index} cannot reach ${desk.key}`);
    }
    for(const point of O.idleStops({role:'builder',station:seats.find(seat=>seat.role==='builder')},0,geometry)){
      assert.ok(M.free(point.x,point.y),`idle waypoint ${point.x},${point.y} overlaps furniture`);
    }
  }finally{M.configure(null);}
});
test('a roleless worker moves to shared space without occupying a specialist desk',()=>{
  const prior={id:'session-prior',role:'planner',working:true,state:'adapter-working'};
  const priorSeats=O.assignWorkstations([prior],[]);
  const shared={...prior,role:null,working:false,state:'running'};
  const planners=Array.from({length:25},(_,index)=>({id:`session-planner-${index}`,role:'planner',working:true,state:'adapter-working'}));
  const actors=[shared,...planners],seats=O.assignWorkstations(actors,[],priorSeats);
  assert.equal(seats.find(s=>s.occupant?.id===shared.id).key,'shared:0');
  assert.equal(seats.filter(s=>s.role==='planner').length,25);
  assert.equal(planners.filter(actor=>seats.some(s=>s.occupant?.id===actor.id&&s.role==='planner')).length,25);
});
test('a newly identified agent leaves its shared desk for its own department',()=>{
  const unknown={id:'session-promoted',provider:'Codex',role:null,working:false,state:'event-waiting',note:'Codex local runtime activity observed; current task state unavailable'};
  const before=O.assignWorkstations([unknown],[]);
  assert.equal(before.find(s=>s.occupant?.id===unknown.id).role,'shared');
  const known={...unknown,role:'qa'},after=O.assignWorkstations([known],[],before);
  assert.equal(after.find(s=>s.occupant?.id===known.id).role,'qa');
  const geometry=O.layout([known],after),scene=O.sceneActors([known],after,()=>true,geometry);
  assert.deepEqual(O.destination(scene[0],0,geometry),scene[0].conferenceSeat.point);
  const active={...known,state:'event-working',working:true},resumed=O.sceneActors([active],after,()=>true,geometry,scene);
  assert.equal(resumed[0].conferenceSeat,null);assert.deepEqual(O.destination(resumed[0],0,geometry),resumed[0].station.point);
});
test('recent Codex thread metadata can seat a specialist without claiming tool work',()=>{
  const entry={...base,provider:'Codex',kind:'session',status:'event-waiting',role:'qa',action:null,
    evidence:'Codex local thread metadata recently updated; current task state unavailable',
    recentEvents:[{at:new Date().toISOString(),label:'Session updated'}]};
  const actor=O.project({entries:[entry]},{jobs:[]}).actors[0],seat=O.assignWorkstations([actor],[]).find(s=>s.occupant?.id===actor.id);
  assert.equal(actor.working,false);assert.equal(actor.activity,'Session recently updated');assert.equal(seat.role,'qa');
});
test('explicit human questions sit in conference and release the seat after an answer',()=>{
  const question={...base,kind:'session',status:'event-waiting',role:'builder',awaitingHuman:true,updatedAt:new Date().toISOString()};
  const waiting=O.project({entries:[question]},{jobs:[]}).actors[0];
  const seats=O.assignWorkstations([waiting],[]),g=O.layout([waiting],seats);M.configure(g);
  try{const scene=O.sceneActors([waiting],seats,M.free,g)[0];
    assert.equal(scene.station.key,'builder:0');assert.equal(scene.conferenceSeat.key,'conference:0');
    assert.deepEqual(O.destination(scene,0,g),scene.conferenceSeat.point);
    assert.ok(M.path(scene.station.point,scene.conferenceSeat.point).length);
    assert.equal(O.presentation(scene).word,'Waiting for your answer');
    const answered=O.project({entries:[{...question,awaitingHuman:false,status:'event-waiting'}]},{jobs:[]}).actors[0];
    const replyGap=O.sceneActors([answered],O.assignWorkstations([answered],[],seats),M.free,g,[scene])[0];
    assert.equal(replyGap.station.key,scene.station.key,'the reply-to-work gap retains the same computer');
    assert.equal(replyGap.conferenceSeat.key,scene.conferenceSeat.key,'a still-waiting session stays in conference after the reply');
    const resumed=O.project({entries:[{...question,awaitingHuman:false,status:'event-working',action:'coding'}]},{jobs:[]}).actors[0];
    const home=O.sceneActors([resumed],O.assignWorkstations([resumed],[],seats),M.free,g,[replyGap])[0];
    assert.equal(home.conferenceSeat,null);assert.equal(home.station.key,scene.station.key);
    assert.deepEqual(O.destination(home,0,g),home.station.point);
  }finally{M.configure(null);}
});
test('reported waiting sessions and queued agents move to conference, then return to their own department',()=>{
  const entry={...base,kind:'session',status:'adapter-working',role:'builder',action:'coding'};
  const working=O.project({entries:[entry]},{jobs:[]}).actors[0],home=O.assignWorkstations([working],[]);
  const waiting=O.project({entries:[{...entry,status:'adapter-waiting',action:null}]},{jobs:[]}).actors[0];
  const seats=O.assignWorkstations([waiting],[],home),g=O.layout([waiting],seats);M.configure(g);
  try{
    const inConference=O.sceneActors([waiting],seats,M.free,g)[0];
    assert.equal(inConference.station.key,home.find(s=>s.occupant?.id===working.id).key);
    assert.ok(inConference.conferenceSeat);assert.deepEqual(O.destination(inConference,0,g),inConference.conferenceSeat.point);
    assert.match(O.presentation(inConference).destination,/Conference room/);
    const eventWait=O.project({entries:[{...entry,status:'event-waiting',role:null,action:null}]},{jobs:[]}).actors[0];
    assert.ok(O.sceneActors([eventWait],[],M.free,g)[0].conferenceSeat,'an observed roleless Codex wait also has a conference seat');
    const queued=O.project({entries:[]},{jobs:[{id:'q'.repeat(32),role:'qa',status:'queued',title:'Run tests'}]}).actors[0];
    assert.ok(O.sceneActors([queued],O.assignWorkstations([queued],[]),M.free,g)[0].conferenceSeat);
    const resumed=O.project({entries:[{...entry,role:'qa',action:'testing'}]},{jobs:[]}).actors[0];
    const newSeats=O.assignWorkstations([resumed],[],seats),next=O.sceneActors([resumed],newSeats,M.free,g,[inConference])[0];
    assert.equal(next.conferenceSeat,null);assert.equal(next.station.role,'qa');assert.deepEqual(O.destination(next,0,g),next.station.point);
  }finally{M.configure(null);}
});
test('completed workers can reach breakout and the office exit from every computer',()=>{
  const g=O.layout();M.configure(g);
  try{for(const kind of ['breakout','exit']){const target=O.departureTarget(g,kind);assert.equal(M.free(target.x,target.y),true);for(const station of g.stations)assert.ok(M.path(station.point,target).length,`${station.key} can reach ${kind}`);}}
  finally{M.configure(null);}
});
test('live child work is the initial focus while a manually selected parent stays selected',()=>{
  const parent={...base,id:'a'.repeat(32),provider:'Claude Code',label:'Claude session',kind:'session',activeChildCount:2};
  const child={...base,id:'b'.repeat(32),parentId:parent.id,provider:'Claude Code',label:'Claude agent',kind:'session',status:'event-working',role:'builder',action:'coding'};
  const actors=O.project({entries:[parent,child]}, {jobs:[]}).actors;
  assert.equal(O.focusActor(actors,null).sourceId,child.id);
  assert.equal(O.focusActor(actors,actors[0].id).sourceId,child.id);
  assert.equal(O.focusActor(actors,actors[0].id,true).sourceId,parent.id);
  assert.equal(O.presentation(actors[0]).title,'2 subagents working');
  assert.match(O.presentation(actors[0]).detail,/parent action unknown/);
  assert.equal(actors[1].parentId,parent.id);
});
test('recent exact session activity takes focus over a process-only worker unless selection is pinned',()=>{
  const processOnly={...base,id:'a'.repeat(32),provider:'Claude Code',status:'running'};
  const observed={...base,id:'b'.repeat(32),provider:'Codex',status:'event-waiting',recentEvents:[{at:new Date().toISOString(),label:'Tool activity'}]};
  const actors=O.project({entries:[processOnly,observed]}, {jobs:[]}).actors;
  assert.equal(O.focusActor(actors,actors[0].id).sourceId,observed.id);
  assert.equal(O.focusActor(actors,actors[0].id,true).sourceId,processOnly.id);
  const actualWork=O.project({entries:[{...processOnly,status:'event-working'},observed]}, {jobs:[]}).actors;
  assert.equal(O.focusActor(actualWork,null).sourceId,processOnly.id);
});
test('worker labels distinguish observed activity, connected parent and open session',()=>{
  assert.equal(O.workerLabel({role:null,activeChildCount:1,recentEvents:[]}), 'Parent session');
  assert.equal(O.workerLabel({role:null,activeChildCount:0,recentEvents:[{label:'Tool activity'}]}), 'Activity observed');
  assert.equal(O.workerLabel({role:null,activeChildCount:0,working:true,recentEvents:[]}), 'Activity observed');
  assert.equal(O.workerLabel({role:null,activeChildCount:0,recentEvents:[]}), 'Session open');
  assert.equal(O.workerLabel({role:'builder'}, 'Builder'), 'Builder');
});
test('speech bubbles use the latest bounded real session text and preserve its speaker',()=>{
  const transcript={available:true,live:true,entries:[{speaker:'You',text:'Please fix checkout',at:'2026-10-14T00:00:00Z'},{speaker:'Tool call',text:'Edit\n{"new_string":"const total = 7"}',at:'2026-10-14T00:00:01Z'}]};
  assert.deepEqual(O.transcriptBubble(transcript),{speaker:'Tool call · Live',text:'Edit\n{"new_string":"const total = 7"}',at:'2026-10-14T00:00:01Z'});
  assert.equal(O.transcriptBubble({...transcript,available:false}),null);
  assert.equal(O.transcriptBubble({...transcript,entries:[]}),null);
  const long=O.transcriptBubble({...transcript,live:false,entries:[{speaker:'Assistant',text:'🧪'.repeat(300),at:'2026-10-14T00:00:02Z'}]});
  assert.equal(Array.from(long.text).length,181);
  assert.match(long.speaker,/Last recorded/);
});
test('a reported activity event supplies a bubble when transcript text is unavailable',()=>{
  const now=Date.parse('2026-10-15T04:00:00Z');
  const actor={working:false,recentEvents:[{at:new Date(now-30000).toISOString(),label:'Tool activity'}]};
  assert.deepEqual(O.activityBubble(actor,now),{speaker:'Recent reported activity',text:'Tool activity',at:actor.recentEvents[0].at});
  assert.equal(O.activityBubble(actor,now+121000),null,'a waiting worker does not keep stale activity on screen');
  assert.equal(O.activityBubble({...actor,recentEvents:[]},now),null,'an open session without an event stays silent');
  assert.equal(O.activityBubble({...actor,working:true},now).speaker,'Latest reported activity');
});
test('five workers use connected four-place benches and retain clear approaches in every live department',()=>{
  const workers=[...O.roles,'shared'].flatMap(role=>Array.from({length:5},(_,i)=>({id:`${role}-${i}`,role:role==='shared'?null:role,working:true,state:'adapter-working'}))),g=O.layout(workers);M.configure(g);
  try{assert.equal(g.stations.length,35);for(const role of [...O.roles,'shared']){const seats=g.stations.filter(s=>s.role===role);assert.equal(seats.length,5);const room=g.rooms.find(r=>r.role===role);const entry=role==='shared'?g.lobby(0):g.doorways.find(d=>d.roomId===role).inside;assert.ok(M.free(entry.x,entry.y),'authoritative department doorway stays clear');for(const seat of seats)assert.ok(M.path(entry,seat.point).length,`${seat.key} reachable from its own doorway`);
    if(role==='shared'){assert.equal(seats[0].desk.x,room.x+room.width/2);assert.equal(seats[0].reception,true);assert.ok(seats.slice(1).every(s=>!s.reception));assert.deepEqual(seats.slice(1).map(s=>[s.desk.x,s.desk.y]),require('./office-layout.contract.json').sharedHotdesks.map(([x,y])=>[x,y+g.topExtra+g.middleExtra]));}else{assert.equal(seats[0].desk.x,room.x+room.width/2-28*g.stationScale);assert.equal(seats[0].desk.y,seats[1].desk.y);assert.equal(seats[2].desk.y,seats[3].desk.y);assert.equal(seats[2].desk.y-seats[0].desk.y,40*g.stationScale);assert.equal(seats[4].desk.y-seats[0].desk.y,g.podPitch);}
    for(const seat of seats){assert.ok(M.free(seat.point.x,seat.point.y));assert.ok(M.free(seat.approach.x,seat.approach.y));assert.ok(M.path(g.lobby(0),seat.point).length,`${seat.key} seat reachable`);assert.equal(M.free(seat.desk.x,seat.desk.y),false);}}
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
  const seats=O.assignWorkstations(actors,[]),g=O.layout(actors,seats);assert.equal(g.stations.filter(s=>s.role==='builder').length,5);assert.equal(g.height,require('./office-layout.contract.json').world.height+require('./office-layout.contract.json').podPitch);
  M.configure(g);
  try{for(const s of g.stations){assert.equal(M.free(s.point.x,s.point.y),true);assert.ok(M.path(g.lobby(0),s.point).length,`${s.key} reachable`);assert.equal(M.free(s.desk.x,s.desk.y),false);}
    const unknown={role:null,working:true,station:null};assert.deepEqual(O.destination(unknown,0,g),g.lobby(0));assert.ok(M.free(O.destination(unknown,0,g).x,O.destination(unknown,0,g).y));
    assert.ok(M.path(g.lobby(0),g.conferenceSeats[0].point).length);
  }finally{M.configure(null);}
  const retained=O.assignWorkstations([],[],seats);assert.equal(retained.filter(s=>s.role==='builder').length,5);
  const all=Array.from({length:210},(_,i)=>({id:String(i),role:'builder'})),large=O.layout(all),full=O.assignWorkstations(all,[]);assert.equal(large.stations.filter(s=>s.role==='builder').length,210);assert.equal(new Set(full.filter(s=>s.occupant).map(s=>s.occupant.id)).size,210);
});
test('unlinked processes stay off the floor while an identified open session sits at a shared computer',()=>{
  const result=O.project({entries:[{...base,kind:'process'}, {...base,id:'b'.repeat(32),kind:'session'}, {...base,id:'c'.repeat(32),kind:'session',status:'recent'}, {...base,id:'d'.repeat(32),kind:'session',status:'adapter-stale',role:'builder'}]}, {jobs:[]});
  assert.equal(result.actors.length,1);assert.equal(result.actors[0].working,false);assert.equal(result.actors[0].role,null);
  const seats=O.assignWorkstations(result.actors,[]),g=O.layout(result.actors,seats),actor=O.sceneActors(result.actors,seats,()=>true,g)[0];
  assert.equal(actor.station.role,'shared');assert.notDeepEqual(O.destination(actor,0,g),g.lobby(0));
  assert.deepEqual(O.destination(actor,0,g),actor.station.point);assert.equal(O.canRoam(actor),false);
  assert.match(O.presentation(actor).destination,/Shared computer/);assert.equal(O.presentation(actor).word,'Session open');
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
test('only explicitly idle sessions or confirmed finished turns take cafeteria breaks',()=>{
  const actor=O.project({entries:[{...base,kind:'session',status:'adapter-idle',role:'builder'}]},{jobs:[]}).actors[0];assert.equal(O.canRoam(actor),true);assert.equal(O.canRoam({...actor,role:null}),true);assert.equal(O.canRoam({...actor,state:'running'}),false);
  for(let i=0;i<12;i++){let p=O.lobby(i);for(const q of O.idleStops(actor,i)){assert.notDeepEqual(q,O.lobby(i),'the lobby is transit only');assert.equal(M.free(q.x,q.y),true);assert.ok(M.path(p,q).length>0);p=q;}}
  assert.equal(actor.working,false);assert.equal(actor.role,'builder');
  assert.equal(O.canRoam({...actor,working:true}),false);assert.equal(O.canRoam({...actor,handoff:{toRole:'qa'}}),false);assert.equal(O.canRoam({...actor,state:'adapter-ended'}),false);
});

test('local session events seat observed coding activity without adapter or inferred colleague',()=>{
  const events={entries:[{...base,status:'event-working',role:'builder',action:'coding',taskLabel:'Editing files',taskRef:'a'.repeat(32),evidence:'Local tool events; department follows activity'}]};
  const actor=O.project(events,{jobs:[]}).actors[0];assert.equal(actor.working,true);assert.equal(O.canRoam(actor),false);assert.equal(actor.action,'coding');assert.equal(actor.handoff,undefined);
  const seats=O.assignWorkstations([actor],[]),scene=O.sceneActors([actor],seats,M.free)[0];assert.equal(scene.station.key,'builder:0');assert.deepEqual(O.destination(scene,0),scene.station.point);assert.equal(scene.colleague,null);
  events.entries[0].status='event-waiting';events.entries[0].action=null;const ended=O.project(events,{jobs:[]}).actors[0];assert.equal(ended.working,false);assert.equal(ended.activity,'Turn ended');
  const runtime=O.project({entries:[{...base,status:'event-waiting',evidence:'Codex local runtime activity observed; current task state unavailable'}]},{jobs:[]}).actors[0];assert.equal(runtime.activity,'Activity recently seen');assert.equal(runtime.working,false);
});

test('game presentation projects world positions without changing movement or station ownership',()=>{
  const g=O.layout(),v=O.sceneLayout(g),slope=Math.sqrt(3)/2,near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} differs from ${expected}`);
  near(v.width,(g.width+g.height)*slope+80);near(v.height,(g.width+g.height)*.5+160);
  const origin=v.project(0,0),far=v.project(g.width,g.height),raised=v.project(220,140,45);
  near(origin.x,g.height*slope+40);near(origin.y,80);near(far.x,g.width*slope+40);near(far.y,(g.width+g.height)*.5+80);
  near(raised.x,(220-140+g.height)*slope+40);near(raised.y,(220+140)*.5+80-45);
  for(const [i,s]of v.stations.entries()){assert.equal(s.key,g.stations[i].key);assert.deepEqual(s.point,g.stations[i].point);assert.deepEqual(s.desk,g.stations[i].desk);assert.deepEqual(s.screen,v.project(s.desk.x,s.desk.y,projectedScreenHeight(s,g)));assert.ok(s.screen.x>0&&s.screen.x<v.width&&s.screen.y>0&&s.screen.y<v.height);}
});

test('planning uses stable unique conference seats and retains home computers across phase changes',()=>{
  const actors=Array.from({length:10},(_,i)=>({id:`session-plan${i}`,sourceId:`plan${i}`,role:i===2?'builder':'planner',provider:'Fixture',working:true,action:'planning'}));
  const stations=O.assignWorkstations(actors,[]),g=O.layout(actors,stations);M.configure(g);
  try{
    const scene=O.sceneActors(actors,stations,M.free,g);assert.equal(g.conferenceSeats.length,10);assert.equal(new Set(scene.map(a=>a.conferenceSeat.key)).size,10);
    for(const a of scene){assert.ok(a.station);assert.deepEqual(O.destination(a,0,g),a.conferenceSeat.point);assert.ok(M.free(a.conferenceSeat.point.x,a.conferenceSeat.point.y));assert.ok(M.path(g.lobby(0),a.conferenceSeat.point).length);assert.match(O.presentation(a).destination,/Conference room/);}
    assert.equal(M.free(g.conference.target.x,g.conference.target.y),false,'conference table still blocks movement');
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
 const g=O.layout(),home=O.sceneLayout(g);assert.ok(Math.abs(home.project(100,200).x-(100-200+g.height)*Math.sqrt(3)/2-40)<1e-9);
 for(const view of ['isometric','top-down'])for(const angle of [0,30,90,180,270,359]){
   const scene=O.sceneLayout(g,view,angle);
   if(view==='isometric'){
     const p=scene.project(200,200),x=scene.project(201,200),y=scene.project(200,201),z=scene.project(200,200,1),length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
     if(angle%90===0)assert.ok(Math.abs(length(x,p)-length(y,p))<1e-9,'cardinal views balance X and Y');
     assert.ok(Math.abs(Math.abs((x.x-p.x)*(y.y-p.y)-(x.y-p.y)*(y.x-p.x))-Math.sqrt(3)/2)<1e-9,'rotating the floor preserves projected area');
     assert.ok(Math.abs(z.y-p.y+1)<1e-9,'Z raises a point by one projected unit');assert.equal(z.x,p.x);
   }
   for(const station of scene.stations){const physical=g.stations.find(s=>s.key===station.key);assert.deepEqual(station.point,physical.point);assert.deepEqual(station.screen,scene.project(physical.desk.x,physical.desk.y,view==='top-down'?0:projectedScreenHeight(physical,g)));assert.ok(station.screen.x>0&&station.screen.x<scene.width&&station.screen.y>0&&station.screen.y<scene.height);}
   assert.notDeepEqual(scene.project(100,200),scene.project(200,100));
 }
 assert.notDeepEqual(O.sceneLayout(g,'isometric',180).project(100,200),home.project(100,200));
 assert.deepEqual([0,90,180,270].map(angle=>O.sceneLayout(g,'isometric',angle).visibleFaces([100,100,200,200])),[['east','south'],['north','east'],['north','west'],['south','west']]);
 assert.deepEqual(O.sceneLayout(g,'top-down').visibleFaces([100,100,200,200]),[]);
});

test('camera elevation changes the floor and Z together without bending room edges',()=>{
 const g=O.layout(),point=[220,140],low=O.sceneLayout(g,'isometric',32,15),high=O.sceneLayout(g,'isometric',32,70);
 for(const scene of [low,high]){
   const floor=scene.project(...point),raised=scene.project(...point,45),outline=[[25,25],[g.width-25,25],[g.width-25,g.height-25],[25,g.height-25]].map(p=>scene.project(...p));
   assert.equal(raised.x,floor.x);assert.ok(raised.y<floor.y);
   for(let i=0;i<2;i++){const a=outline[i],b=outline[(i+1)%4],c=outline[i+2],d=outline[(i+3)%4];assert.ok(Math.abs((b.x-a.x)+(d.x-c.x))<1e-9);assert.ok(Math.abs((b.y-a.y)+(d.y-c.y))<1e-9);}
   for(const station of scene.stations)assert.deepEqual(station.screen,scene.project(station.desk.x,station.desk.y,projectedScreenHeight(station,g)));
 }
 assert.ok(high.project(220,140).y!==low.project(220,140).y,'floor pitch changes the projected room position');
 assert.ok(low.project(...point).y-low.project(...point,45).y>high.project(...point).y-high.project(...point,45).y,'walls get shorter as camera looks down');
 assert.equal(O.sceneLayout(g,'isometric',0,-500).elevation,15);assert.equal(O.sceneLayout(g,'isometric',0,500).elevation,70);
});
test('expanded conference seats and approaches stay clear of collision-backed breakout furniture',()=>{
  try{for(const count of [23,50,100]){const actors=Array.from({length:count},(_,i)=>({id:`meeting-${i}`,role:O.roles[i%6],working:true,action:'planning'})),g=O.layout(actors);M.configure(g);
    for(const seat of g.conferenceSeats){assert.ok(M.free(seat.point.x,seat.point.y),`seat ${seat.index} clear with ${count} attendees`);assert.ok(M.free(seat.approach.x,seat.approach.y),`approach ${seat.index} clear`);}
    for(const bounds of [g.breakout.sofa,g.breakout.table]){const [x,y,r,b]=bounds;assert.equal(M.free((x+r)/2,(y+b)/2),false,'rendered lounge equipment blocks walking');assert.ok(y>g.conferenceSeats.at(-1).approach.y);assert.ok(b<g.height-35);}
    const target=O.departureTarget(g,'breakout');assert.ok(M.free(target.x,target.y));assert.ok(M.path(g.conferenceSeats.at(-1).point,target).length,'last meeting chair can reach breakout');
  }}finally{M.configure(null);}
});
test('parallel meeting overflow keeps every chair reachable and retained capacity below the work bands',()=>{
  const actors=Array.from({length:50},(_,index)=>({id:`question-${index}`,role:'builder',working:false,awaitingHuman:true,state:'adapter-waiting'}));
  const g=O.layout(actors),retained=O.layout([],g.stations,g.conferenceSeats);M.configure(g);
  try{
    assert.equal(g.conferenceSeats.length,50);assert.equal(g.conferenceExtra,720);assert.equal(g.middleExtra,720);
    assert.equal(retained.middleExtra,g.middleExtra);assert.deepEqual(retained.conferenceSeats,g.conferenceSeats);
    for(const seat of g.conferenceSeats){assert.ok(M.path(g.entrance.point,seat.approach).length,`${seat.key} approach reachable`);assert.ok(M.path(seat.approach,seat.point).length,`${seat.key} can sit`);assert.ok(seat.point.y<g.breakout.y);}
  }finally{M.configure(null);}
});


test('reference composition centers reception in the hall and keeps small support and Cafe lounge as annexes',()=>{
  const fs=require('node:fs'),visual=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'reference-visual.contract.json'),'utf8')),golden=require('./office-layout.contract.json'),g=O.layout();
  assert.equal(visual.layoutVersion,golden.version);assert.equal(golden.version,9);assert.equal(golden.sharedReception.svgScreenHeight,110);assert.equal(golden.sharedReception.nativeScreenHeight,97.5);
  assert.deepEqual(g.rooms.filter(r=>r.y===60&&r.role!=='shared').map(r=>r.role),visual.composition.rear);
  const conference=g.conference,cafe=g.cafe;assert.equal(conference.x,cafe.x);assert.ok(conference.y+conference.height<cafe.y);
  const wing=['reviewer','qa','security'].map(role=>g.rooms.find(r=>r.role===role));assert.ok(wing.every(r=>r.x===1150));for(let i=1;i<wing.length;i++)assert.ok(wing[i].y>wing[i-1].y+wing[i-1].height);
  assert.equal(g.devops.annex,true);assert.equal(g.breakout.annex,true);assert.equal(g.enclosures.some(r=>r.roomId==='devops'),false);assert.equal(g.enclosures.some(r=>r.roomId==='cafe'),false);
  const shared=g.rooms.find(r=>r.role==='shared'),development=g.rooms.find(r=>r.role==='builder');assert.equal(shared.annex,true);assert.equal(g.enclosures.some(r=>r.roomId==='shared'),false);assert.ok(g.devops.x>=development.x&&g.devops.y>=development.y&&g.devops.x+g.devops.width<=development.x+development.width&&g.devops.y+g.devops.height<=development.y+development.height);
  assert.ok(g.breakout.x>=cafe.x&&g.breakout.y>=cafe.y&&g.breakout.x+g.breakout.width<=cafe.x+cafe.width&&g.breakout.y+g.breakout.height<=cafe.y+cafe.height);
  const hall=g.corridors.find(c=>c.id==='main');assert.equal(hall.width,440);assert.equal(g.entrance.point.x,hall.x+hall.width/2);assert.equal(g.reception.point.x,g.entrance.point.x);assert.equal((g.reception.deskBounds[0]+g.reception.deskBounds[2])/2,g.entrance.point.x);
  assert.deepEqual(g.props.find(p=>p.kind==='reception-desk').bounds,g.reception.deskBounds);
  M.configure(g);try{assert.equal(M.free(g.reception.point.x,g.reception.point.y),true);assert.ok(M.path(g.lobby(0),g.reception.point).length);assert.equal(M.free(g.entrance.point.x,(g.reception.deskBounds[1]+g.reception.deskBounds[3])/2),false);for(const x of [750,1110])assert.ok(M.path({x,y:g.height-260},{x,y:g.height-100}).length,'real aisles pass both sides of reception');}finally{M.configure(null);}
});


test('compact rear cabinets and all38 authored plants preserve whole seated bodies and exact physical bounds',()=>{
  const golden=require('./office-layout.contract.json'),intersects=(a,b)=>a[0]<b[2]-1e-9&&a[2]>b[0]+1e-9&&a[1]<b[3]-1e-9&&a[3]>b[1]+1e-9;
  for(const count of [0,5,11]){
    const actors=count?[...O.roles,'shared'].flatMap(role=>Array.from({length:count},(_,i)=>({id:`furniture-${role}-${i}`,role:role==='shared'?null:role,working:true}))):[],g=O.layout(actors),radius=16*g.staffScale,plants=g.props.filter(p=>p.kind==='plant'),cabinets=g.decorations.filter(p=>p.kind==='bookcase');
    assert.equal(plants.length,38);assert.equal(cabinets.length,6);
    const expected=[];for(const room of g.rooms.filter(r=>!r.annex)){for(const [dx,dy]of golden.plants.departmentCorners){const x=room.x+(dx<0?room.width+dx:dx),y=room.y+(dy<0?room.height+dy:dy);expected.push([x-12,y-12,x+12,y+12]);}const cabinet=cabinets.find(p=>p.bounds[0]===room.x+room.width-150&&p.bounds[1]===room.y+5);assert.ok(cabinet);assert.deepEqual(cabinet.bounds,[room.x+room.width-150,room.y+5,room.x+room.width-30,room.y+40]);assert.equal(cabinet.bounds[2]-cabinet.bounds[0],120);assert.equal(cabinet.height,125);}
    for(const [x,y]of golden.plants.conference){const yy=y+g.topExtra+(y>1000?g.conferenceExtra:0);expected.push([x-12,yy-12,x+12,yy+12]);}
    for(const [x,y]of golden.plants.cafe){const yy=g.cafe.y+y;expected.push([x-12,yy-12,x+12,yy+12]);}
    for(const [x,y]of golden.plants.hall){const yy=y+g.topExtra;expected.push([x-12,yy-12,x+12,yy+12]);}
    assert.deepEqual(plants.map(p=>p.bounds),expected);assert.ok(plants.every(p=>p.foliageHeight>=135&&p.foliageHeight<=150));
    const blockers=[...g.props,...g.decorations].filter(p=>p.blocking!==false);M.configure(g);try{for(const station of g.stations){const body=[station.point.x-radius,station.point.y-radius,station.point.x+radius,station.point.y+radius];for(const blocker of blockers)assert.equal(intersects(body,blocker.bounds),false,`${station.key} body clears ${blocker.kind}`);assert.ok(M.free(station.point.x,station.point.y));assert.ok(M.free(station.approach.x,station.approach.y));}}finally{M.configure(null);}
  }
});

test('public Shared counter and hotdesk pods remain distinct, retained and reachable at capacity boundaries',()=>{
  const intersects=(a,b)=>a[0]<b[2]-1e-9&&a[2]>b[0]+1e-9&&a[1]<b[3]-1e-9&&a[3]>b[1]+1e-9;
  for(const count of [1,5,6,10,11,32]){
    const actors=Array.from({length:count},(_,i)=>({id:`public-${i}`,role:null,working:true,state:'adapter-working'})),assigned=O.assignWorkstations(actors,[]),g=O.layout(actors,assigned),retained=O.layout([],assigned,g.conferenceSeats),shared=g.stations.filter(s=>s.role==='shared'),counter=shared[0],radius=16*g.staffScale;
    assert.equal(g.topExtra,0,'Shared cannot grow the rear departments');assert.equal(g.sharedExtra,Math.floor((count-1)/5)*500);assert.equal(g.height,1900+g.sharedExtra);assert.equal(g.enclosures.length,7);assert.equal(g.doorways.some(d=>d.roomId==='shared'),false);
    assert.deepEqual(retained.stations,g.stations);assert.equal(shared.length,count);assert.equal(shared.filter(s=>s.reception).length,1);assert.equal(counter.key,'shared:0');assert.deepEqual(counter.deskBounds,g.reception.deskBounds);assert.deepEqual(counter.desk,{x:930,y:g.height-195});assert.deepEqual(counter.point,{x:930,y:g.height-285});assert.deepEqual(counter.approach,{x:930,y:g.height-310});
    for(const room of g.rooms.filter(r=>!r.annex)){const base=O.layout().rooms.find(r=>r.role===room.role);assert.deepEqual(room,base,'Shared expansion leaves actual specialist rooms intact');}
    M.configure(g);try{for(const station of shared){if(station.index){const n=station.index%5,pod=Math.floor(station.index/5);assert.equal(station.reception,undefined);assert.deepEqual(station.desk,{x:[912.5,800,1025,800,1025][n],y:[1410,1300,1300,1520,1520][n]+pod*500});assert.deepEqual(station.deskBounds,[station.desk.x-70,station.desk.y-50,station.desk.x+70,station.desk.y+50]);}
      const body=[station.point.x-radius,station.point.y-radius,station.point.x+radius,station.point.y+radius];for(const other of shared){assert.equal(intersects(body,other.deskBounds),false,`${station.key} seated body clears ${other.key}`);if(other.index>station.index)assert.equal(intersects(station.deskBounds,other.deskBounds),false,'Shared physical desks never overlap');}assert.ok(M.free(station.point.x,station.point.y));assert.ok(M.free(station.approach.x,station.approach.y));}
      for(const station of [counter,shared.at(-1)]){assert.ok(M.path(g.lobby(0),station.point).length,`${station.key} reachable across new public capacity`);assert.ok(M.path(station.point,station.approach).length,`${station.key} helper approach reachable`);}
    }finally{M.configure(null);}
  }
});

// Compare furniture and cast coverage to the previous sparse floor, without adding synthetic employees.
test('compact office increases physical occupancy while preserving public circulation clearance',()=>{
  const g=O.layout(),old={width:2360,height:2000,scale:2.2,hallWidth:600,developmentWidth:1220};
  const areaRatio=g.width*g.height/(old.width*old.height),deskRatio=(g.stationScale/old.scale)**2;
  assert.ok(areaRatio<.77,'the complete floor loses at least 23% of empty spread');
  assert.ok(deskRatio/areaRatio>1.68,'identical computer count has at least 68% greater floor coverage');
  assert.ok(g.rooms.find(r=>r.role==='builder').width/old.developmentWidth<.65,'Development no longer occupies half the rear wing');
  const hall=g.corridors.find(c=>c.id==='main'),reception=g.reception.deskBounds;
  assert.equal(hall.width,440);assert.ok(hall.width<old.hallWidth);
  assert.ok(reception[0]-hall.x>=80&&hall.x+hall.width-reception[2]>=80,'both reception aisles retain an employee body width');
  assert.ok(g.ceilingHeight>=64*g.staffScale+50,'full-size chibi heads have real room headroom');
  assert.ok(O.assignWorkstations([],[]).every(s=>!s.occupant),'compact furniture never creates fake staffing');
});
