const{test}=require('node:test'),assert=require('node:assert/strict');
const O=require('./office-model.js'),M=require('./game-model.js'),golden=require('./office-layout.contract.json');
const inside=(p,r)=>p.x>r.x+1e-6&&p.x<r.x+r.width-1e-6&&p.y>r.y+1e-6&&p.y<r.y+r.height-1e-6;
const roomAt=(g,p)=>g.enclosures.find(r=>inside(p,r))?.roomId;
function segmentSamples(a,b){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));return Array.from({length:n+1},(_,i)=>({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n}));}
function checkedPath(g,start,target){
 const route=M.path(start,target);assert.ok(route.length,`reachable ${JSON.stringify(start)} -> ${JSON.stringify(target)}`);
 const allowed=new Set([roomAt(g,start),roomAt(g,target)].filter(Boolean));
 let previous=start;
 for(const next of route){
  for(const p of segmentSamples(previous,next)){
   assert.ok(M.free(p.x,p.y),`route segment stays collision-free at ${JSON.stringify(p)}`);
   const room=roomAt(g,p);assert.ok(!room||allowed.has(room),`route cannot use unrelated ${room} as a hallway`);
  }
  // Boundary crossings must use the one opening; coordinates are checked
  // independently of whatever grid or route restrictions the planner uses.
  for(const r of g.enclosures){
   for(const side of ['north','south','west','east']){
    const horizontal=side==='north'||side==='south',line=horizontal?(side==='north'?r.y:r.y+r.height):(side==='west'?r.x:r.x+r.width),a=horizontal?previous.y:previous.x,b=horizontal?next.y:next.x;
    if(Math.abs(b-a)<1e-9)continue;const t=(line-a)/(b-a);if(t<0||t>1)continue;
    const across=horizontal?previous.x+(next.x-previous.x)*t:previous.y+(next.y-previous.y)*t,low=horizontal?r.x:r.y,high=low+(horizontal?r.width:r.height);
    if(across<=low||across>=high)continue;
    const door=g.doorways.find(d=>d.roomId===r.roomId);assert.equal(side,door.side,`${r.roomId} crossed only at its hallway door`);
    const center=horizontal?door.center.x:door.center.y;assert.ok(Math.abs(across-center)<=door.width/2-8+1e-6,'door crossing preserves collision clearance');
   }
  }
  previous=next;
 }
 assert.ok(Math.hypot(route.at(-1).x-target.x,route.at(-1).y-target.y)<1e-6,'route retains exact destination');return route;
}
function withGeometry(g,run){M.configure(g);try{run();}finally{M.configure(null);}}

test('golden circulation has seven closed enclosures with one hallway-facing door each',()=>{
 const g=O.layout();assert.equal(golden.version,9);assert.deepEqual({width:g.width,height:g.height},golden.world);
 assert.equal(g.enclosures.length,7);assert.equal(new Set(g.enclosures.map(r=>r.roomId)).size,7);assert.equal(g.doorways.length,7);
 assert.deepEqual(g.corridors,golden.circulation.corridors);
 for(const expected of golden.circulation.doors){const door=g.doorways.find(d=>d.roomId===expected.roomId);assert.ok(door);assert.equal(door.side,expected.side);assert.deepEqual(door.center,{x:expected.x,y:expected.y});assert.equal(door.width,golden.circulation.doorWidth);}
 for(const r of g.enclosures){const expected=golden.rooms.find(room=>room.role===r.roomId)||golden[r.roomId];assert.ok(expected);for(const key of ['x','y','width','height'])assert.equal(r[key],expected[key],`${r.roomId} enclosure matches authored room`);assert.deepEqual(new Set(g.wallSegments.filter(w=>w.roomId===r.roomId).map(w=>w.side)),new Set(['north','south','east','west']));}
 withGeometry(g,()=>{
  for(const r of g.enclosures){const door=g.doorways.find(d=>d.roomId===r.roomId);
   for(const side of ['north','south','west','east']){const horizontal=side==='north'||side==='south',length=horizontal?r.width:r.height;
    for(let offset=15;offset<length-15;offset+=5){const p=horizontal?{x:r.x+offset,y:side==='north'?r.y:r.y+r.height}:{x:side==='west'?r.x:r.x+r.width,y:r.y+offset},along=horizontal?p.x:p.y,center=horizontal?door.center.x:door.center.y;
     if(side===door.side&&Math.abs(along-center)<door.width/2+8)continue;assert.equal(M.free(p.x,p.y),false,`${r.roomId}/${side} perimeter is closed away from its door`);
    }
   }
   for(const p of [door.center,door.inside,door.outside])assert.ok(M.free(p.x,p.y),`${r.roomId} doorway has a clear center and both landing points`);
   checkedPath(g,door.inside,door.outside);
  }
 });
});

test('all department pairs and common halls route only through origin and destination rooms',()=>{
 const g=O.layout();withGeometry(g,()=>{
  const representatives=g.enclosures.map(r=>g.stations.find(s=>s.role===r.roomId)?.point||(r.roomId==='conference'?g.conferenceSeats[0].point:g.doorways.find(d=>d.roomId===r.roomId).inside));
  for(const start of representatives)for(const target of representatives)checkedPath(g,start,target);
  const main=g.corridors.find(c=>c.id==='main'),cross=g.corridors.find(c=>c.id==='cross');
  checkedPath(g,{x:main.x+80,y:main.y+main.height/2},{x:cross.x+30,y:cross.y+cross.height/2});
  for(const target of [...g.stations.flatMap(s=>[s.point,s.approach]),...g.conferenceSeats.flatMap(s=>[s.point,s.approach]),g.cafe.point,O.departureTarget(g,'breakout'),O.departureTarget(g,'exit')])checkedPath(g,g.lobby(0),target);
 });
});

test('public reception arrivals and departures stay outside unrelated closed departments',()=>{
 const g=O.layout();withGeometry(g,()=>{
  assert.equal(g.enclosures.some(r=>r.roomId==='shared'),false);assert.equal(g.entrance.x,golden.entrance.x);assert.equal(g.entrance.width,golden.entrance.width);
  for(let i=0;i<32;i++){const arrival=g.lobby(i);assert.ok(g.enclosures.every(r=>!inside(arrival,r)));checkedPath(g,arrival,g.entrance.point);checkedPath(g,arrival,O.departureTarget(g,'exit'));}
  for(const station of g.stations.filter(s=>s.role!=='shared'))for(const kind of ['exit','breakout']){const route=checkedPath(g,station.point,O.departureTarget(g,kind));for(const p of route)for(const room of g.enclosures.filter(r=>r.roomId!==station.role))assert.equal(inside(p,room),false,'departures never shortcut through unrelated closed departments');}
 });
});

test('expanded and retained pods and conference overflow keep hallway routes that actually finish',()=>{
 const actors=[...O.roles,'shared'].flatMap(role=>Array.from({length:6},(_,i)=>({id:`hall-${role}-${i}`,role:role==='shared'?null:role,working:true,state:'adapter-working'})));
 actors.push(...Array.from({length:19},(_,i)=>({id:`hall-wait-${i}`,role:'planner',awaitingHuman:true,state:'adapter-waiting'})));
 const assigned=O.assignWorkstations(actors,[]),expanded=O.layout(actors,assigned),retained=O.layout([],assigned,expanded.conferenceSeats);
 assert.ok(expanded.height>golden.world.height);assert.ok(expanded.conferenceSeats.length>8);assert.deepEqual(retained.stations,assigned.map(({occupant,...seat})=>seat));
 for(const g of [expanded,retained])withGeometry(g,()=>{
  for(const door of g.doorways)checkedPath(g,door.inside,door.outside);
  const targets=[...g.stations.flatMap(s=>[s.point,s.approach]),...g.conferenceSeats.flatMap(s=>[s.point,s.approach])];
  for(const target of targets){const start=g.lobby(0),route=checkedPath(g,start,target);let worker={position:start,route};
   // Large distance budgets must consume turns safely, not cut across walls.
   for(let step=0;worker.route.length&&step<20000;step++){worker=M.advanceRoute(worker.position,worker.route,O.motionSpeed(g)/10);assert.ok(M.free(worker.position.x,worker.position.y),'actual movement stays collision-free');const room=roomAt(g,worker.position);assert.ok(!room||room===roomAt(g,target),'actual worker stays in common circulation or the destination room');}
   assert.equal(worker.route.length,0,'expanded route consumes all waypoints');assert.ok(Math.hypot(worker.position.x-target.x,worker.position.y-target.y)<1,'actual worker reaches the retained destination');
  }
 });
});
