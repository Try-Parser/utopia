const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('./game-model.js');
test('wide conference room is connected through its doorway and table/chairs block travel',()=>{
  for(const point of [{x:930,y:310},{x:1070,y:470},{x:1205,y:310}])assert.ok(M.path({x:480,y:325},point).length);
  for(const point of [{x:1070,y:300},{x:960,y:235},{x:908,y:150}])assert.equal(M.free(point.x,point.y),false);
});
test('player cannot cross desks, glass or floor bounds even with a large movement',()=>{
  assert.equal(M.free(194,160),false);assert.equal(M.free(339,160),false);assert.equal(M.free(-1,300),false);
  assert.equal(M.free(NaN,300),false);
  const result=M.move({x:194,y:270},0,-200);assert.ok(result.y>=244);
  assert.ok(M.move({x:480,y:310},1000,0).x<811);
});
test('click path routes around furniture using only valid floor points',()=>{
  const route=M.path({x:480,y:325},{x:474,y:110});assert.ok(route.length>10);
  for(const p of route) assert.equal(M.free(p.x,p.y),true);
  let p={x:480,y:325};for(const q of route) {p=M.move(p,q.x-p.x,q.y-p.y);assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<.01);}
  assert.deepEqual(p,{x:474,y:110});
});
test('unreachable clicks produce no route',()=>{
  assert.deepEqual(M.path({x:480,y:325},{x:474,y:160}),[]);
  assert.deepEqual(M.path({x:480,y:325},{x:960,y:610}),[]);
});
test('pointer navigation connects clear endpoints beside chairs and desks',()=>{
  const corridor={x:480,y:325};
  for(const edge of [{x:474,y:244.2},{x:574,y:210},{x:136,y:160},M.move({x:480,y:325},0,-200)]) {
    for(const [start,target] of [[edge,corridor],[corridor,edge]]) {
      const route=M.path(start,target);assert.ok(route.length>0);
      let p=start;for(const q of route) {p=M.move(p,q.x-p.x,q.y-p.y);assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<.01);}
      assert.ok(Math.hypot(p.x-target.x,p.y-target.y)<.0001);
    }
  }
});
test('furnished office equipment blocks paths and all workstation aisles remain connected',()=>{
  for(const p of [{x:100,y:420},{x:552,y:163},{x:832,y:408}]){assert.equal(M.free(p.x,p.y),false);assert.deepEqual(M.path({x:480,y:325},p),[]);}
  for(const p of [{x:130,y:160},{x:410,y:160},{x:690,y:160},{x:130,y:420},{x:410,y:420},{x:690,y:420}])assert.ok(M.path({x:480,y:325},p).length>0);
});
test('slow frames consume multiple route waypoints at the same travel speed',()=>{
  M.configure({width:1000,height:1000,furniture:[],walls:[],stations:[]});
  try{const start={x:100,y:100},route=Array.from({length:20},(_,i)=>({x:110+i*10,y:100}));const slow=M.advanceRoute(start,route,70);let fast={position:start,route};for(let i=0;i<7;i++)fast=M.advanceRoute(fast.position,fast.route,10);assert.deepEqual(slow.position,{x:170,y:100});assert.deepEqual(slow.position,fast.position);assert.deepEqual(slow.route,fast.route);assert.equal(route.length,20,'caller route remains intact');const finish=M.advanceRoute(start,route,500);assert.deepEqual(finish.position,{x:300,y:100});assert.equal(finish.route.length,0);assert.equal(M.advanceRoute(finish.position,[],10).moved,false);
  }finally{M.configure(null);}
});

test('large route budgets retain wall collision protection',()=>{
  M.configure({width:1000,height:1000,furniture:[],walls:[[130,50,140,250]],stations:[]});
  try{const result=M.advanceRoute({x:100,y:100},[{x:200,y:100}],100);assert.ok(result.position.x<=122);assert.ok(M.free(result.position.x,result.position.y));assert.equal(result.route.length,1);
  }finally{M.configure(null);}
});
