const {test}=require('node:test'),assert=require('node:assert/strict'),O=require('./office-model.js'),M=require('./game-model.js');
const idle=(id,extra={})=>({id,role:'builder',state:'adapter-idle',working:false,provider:'Fixture',sourceId:id,...extra});
function scene(actors,previous=[]){const seats=O.assignWorkstations(actors,[]),g=O.layout(actors,seats);M.configure(g);return{g,seats,actors:O.sceneActors(actors,seats,M.free,g,previous)};}
test('break eligibility uses explicit idle/completion, preserving work/question/children/wait priorities',()=>{
 assert.equal(O.canRoam(idle('a',{role:null})),true);
 assert.equal(O.canRoam(idle('a',{state:'event-waiting',recentEvents:[{label:'Turn finished'}]})),true);
 for(const extra of [{working:true},{awaitingHuman:true},{handoff:{toRole:'qa'}},{activeChildCount:1},{state:'running'},{state:'adapter-waiting'},{state:'adapter-ended'},{state:'queued'},{state:'event-waiting',recentEvents:[{label:'Session updated'}]}])assert.equal(O.canRoam(idle('a',extra)),false,JSON.stringify(extra));
 const data=scene([idle('a'),idle('b',{awaitingHuman:true}),idle('c',{state:'adapter-waiting'})]);
 assert.ok(data.actors[0].cafeSeat);assert.equal(data.actors[0].conferenceSeat,null);
 assert.ok(data.actors[1].conferenceSeat);assert.equal(data.actors[1].cafeSeat,null);assert.ok(data.actors[2].conferenceSeat);
 M.configure(null);
});
test('parallel idle workers get distinct reachable seats, extra tables and stable ownership',()=>{
 for(const count of [2,13,33]){const source=Array.from({length:count},(_,i)=>idle('idle-'+String(i).padStart(3,'0'))),data=scene(source),keys=data.actors.map(a=>a.cafeSeat?.key);assert.equal(keys.filter(Boolean).length,count);assert.equal(new Set(keys).size,count);assert.ok(data.g.cafeSeats.length>=count);
 for(const a of data.actors){const p=O.destination(a,0,data.g);assert.deepEqual(p,a.cafeSeat.point);assert.ok(M.free(p.x,p.y));assert.ok(p.x>=data.g.cafe.x&&p.x<=data.g.cafe.x+data.g.cafe.width&&p.y>=data.g.cafe.y&&p.y<=data.g.cafe.y+data.g.cafe.height);}
 // Walk the real collision route from a department desk to the first and last seat.
 for(const a of [data.actors[0],data.actors.at(-1)]){const route=M.path(a.station.point,a.cafeSeat.point);assert.ok(route.length,'cafe destination is reachable');let current={position:a.station.point,route};for(let ticks=0;current.route.length&&ticks<2000;ticks++)current=M.advanceRoute(current.position,current.route,30);assert.equal(current.route.length,0);assert.ok(Math.hypot(current.position.x-a.cafeSeat.point.x,current.position.y-a.cafeSeat.point.y)<2);}
 const updated=O.sceneActors([...source].reverse(),data.seats,M.free,data.g,data.actors);for(const a of updated)assert.equal(a.cafeSeat.key,data.actors.find(old=>old.id===a.id).cafeSeat.key,'live ordering does not swap assigned cafe seats');
 }
 M.configure(null);
});
test('real work and questions release cafe state and immediately restore actual destination',()=>{
 const data=scene([idle('a'),idle('b')]),old=data.actors[0];
 for(const source of [idle('a',{working:true,state:'adapter-working',role:'qa',action:'testing'}),idle('a',{awaitingHuman:true,state:'adapter-waiting'})]){const seats=O.assignWorkstations([source],[],data.seats),g=O.layout([source],seats);M.configure(g);const next=O.sceneActors([source],seats,M.free,g,data.actors)[0];assert.equal(next.cafeSeat,null);assert.equal(O.socialBubble(next,[{...old,atCafe:true}],0),null);assert.deepEqual(O.destination(next,0,g),source.working?next.station.point:next.conferenceSeat.point);}
 M.configure(null);
});
test('social turns require arrived idle peers at the same table and include quiet pauses',()=>{
 const data=scene([idle('a'),idle('b'),idle('c'),idle('d'),idle('e')]),peers=data.actors.map(a=>({...a,atCafe:true}));
 assert.equal(O.socialBubble(peers[0],[peers[0]],0),null);assert.equal(O.socialBubble(peers[0],[peers[0],{...peers[1],atCafe:false}],0),null);assert.equal(O.socialBubble(peers[0],[peers[0],peers[4]],0),null);
 const pair=peers.slice(0,2);assert.deepEqual(O.socialBubble(pair[0],pair,0),{speaker:'Cafeteria \u00b7 simulated',text:'Coffee break?'});assert.equal(O.socialBubble(pair[1],pair,0),null);assert.ok(O.socialBubble(pair[1],pair,4000));assert.equal(O.socialBubble(pair[0],pair,8000),null);assert.equal(O.socialBubble(pair[1],pair,8000),null);assert.equal(O.socialBubble({...pair[0],working:true},pair,0),null);
 assert.equal(O.presentation(peers[0]).action,'break');assert.match(O.presentation(peers[0]).detail,/simulated/);M.configure(null);
});

test('a fixed-height fifth table supports an existing seventeenth employee without changing homes',()=>{
 const source=Array.from({length:17},(_,i)=>idle('fixed-'+String(i).padStart(2,'0'),i===16?{state:'adapter-working',working:true,action:'coding'}:{})),before=scene(source),afterSource=source.map(a=>a.id===source[16].id?{...a,state:'adapter-idle',working:false,action:null}:a),homes=O.assignWorkstations(afterSource,[],before.seats),g=O.layout(afterSource,homes);
 assert.equal(before.g.props.filter(p=>p.kind==='cafe-table').length,4);assert.equal(g.props.filter(p=>p.kind==='cafe-table').length,5);assert.equal(g.width,before.g.width);assert.equal(g.height,before.g.height);assert.deepEqual(homes.map(s=>[s.key,s.occupant?.id]),before.seats.map(s=>[s.key,s.occupant?.id]));
 M.configure(g);const after=O.sceneActors(afterSource,homes,M.free,g,before.actors);assert.equal(new Set(after.map(a=>a.cafeSeat.key)).size,17);for(const a of before.actors.filter(a=>a.cafeSeat))assert.equal(after.find(b=>b.id===a.id).cafeSeat.key,a.cafeSeat.key);assert.ok(M.path(after.at(-1).station.point,after.at(-1).cafeSeat.point).length);M.configure(null);
});
