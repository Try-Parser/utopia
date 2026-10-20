const {test}=require('node:test'),assert=require('node:assert/strict'),O=require('./office-model.js');
test('empty rooms switch off without turning public navigation areas into rooms',()=>{
 const g=O.layout(),rooms=O.roomOccupancy([],g);assert.equal(rooms.length,8);assert.ok(rooms.every(r=>r.count===0&&!r.lit));assert.equal(rooms.some(r=>['shared','main','cross'].includes(r.id)),false);
});
test('lights follow body positions rather than assigned department or task state',()=>{
 const g=O.layout(),cafe=g.cafeSeats[0].point,build=g.stations.find(s=>s.role==='builder').point,conference=g.conferenceSeats[0].point;
 const rooms=O.roomOccupancy([{id:'idle-builder',role:'builder',...cafe},{id:'working',...build},{id:'question',...conference}],g),by=id=>rooms.find(r=>r.id===id);
 assert.equal(by('builder').count,1);assert.equal(by('cafe').count,1);assert.equal(by('conference').count,1);assert.equal(by('qa').lit,false);
 const leaving=O.roomOccupancy([{id:'departing',...cafe}],g);assert.equal(leaving.find(r=>r.id==='cafe').lit,true);
 assert.ok(O.roomOccupancy([{id:'departing',x:930,y:g.height-70}],g).every(r=>!r.lit));
});
test('duplicate identities and invalid points cannot create phantom occupancy',()=>{
 const g=O.layout(),room=g.rooms.find(r=>r.role==='qa'),point={x:room.x+room.width/2,y:room.y+room.height/2},source=JSON.stringify(g.rooms);
 const rooms=O.roomOccupancy([{id:'one',...point},{id:'one',...point},{id:'bad',x:NaN,y:point.y},{id:'edge',x:room.x,y:point.y}],g);
 assert.equal(rooms.find(r=>r.id==='qa').count,1);assert.equal(rooms.reduce((n,r)=>n+r.count,0),1);assert.equal(JSON.stringify(g.rooms),source);
});
test('expanded cafeteria occupancy counts all current physical seats',()=>{
 const actors=Array.from({length:33},(_,i)=>({id:'idle-'+i,state:'adapter-idle',working:false,role:'builder'})),g=O.layout(actors),points=g.cafeSeats.slice(0,33).map((s,i)=>({id:'body-'+i,...s.point})),rooms=O.roomOccupancy(points,g);
 assert.equal(rooms.find(r=>r.id==='cafe').count,33);assert.equal(rooms.filter(r=>r.lit).length,1);
});
