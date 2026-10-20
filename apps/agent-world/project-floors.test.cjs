const {test}=require('node:test'),assert=require('node:assert/strict');
const O=require('./office-model.js'),contract=require('./project-floors.contract.json');
const aid='a'.repeat(32),bid='b'.repeat(32),cid='c'.repeat(32),wid='1'.repeat(32),other='2'.repeat(32);
const session=(id,extra={})=>({id,kind:'session',provider:'Any provider',workspace:'demo',workspaceId:wid,status:'adapter-working',role:'builder',updatedAt:new Date().toISOString(),...extra});
const live={jobs:[],workspace:'demo',workspaceId:wid};

test('versioned project keys preserve opaque identity, same-name separation and legacy/unknown privacy',()=>{
  assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify(contract.vectors)).digest('hex'),'44b27691229c7c0a761a1b0e11e408f34a4b47b249b92dc06d8dc761fc0549a9','reviewed golden vectors stay identical across consumers');
  assert.equal(contract.version,1);
  for(const v of contract.vectors)assert.equal(O.projectKey(v.workspace,v.workspaceId),v.key);
  assert.notEqual(O.projectKey('demo',wid),O.projectKey('demo',other));
  assert.notEqual(O.projectKey('demo',wid),O.projectKey('demo',null));
});

test('actual worker counts group providers, exclude process sightings, and inherit only explicit parents',()=>{
  const sessions={entries:[session(aid),session(bid,{provider:'Another provider'}),session(cid,{parentId:aid,workspace:'Unknown',workspaceId:null}),session('d'.repeat(32),{workspaceId:other}),session('e'.repeat(32),{kind:'process'}),session('f'.repeat(32),{status:'recorded'})]};
  const floors=O.projectFloors(sessions,live);
  assert.deepEqual(floors.map(f=>[f.key,f.count]),[[`project:${wid}`,3],[`project:${other}`,1]]);
  assert.deepEqual(floors.map(f=>f.label),['demo · 1','demo · 2']);
  assert.equal(O.scopeFloor(`project:${wid}`,sessions,live).sessions.entries.find(e=>e.id===cid).parentId,aid);
  const cyclic={entries:[session(aid,{parentId:bid,workspace:'Unknown',workspaceId:null}),session(bid,{parentId:aid,workspace:'Unknown',workspaceId:null})]};
  assert.deepEqual(O.projectFloors(cyclic,{jobs:[]}).map(f=>[f.key,f.count]),[['unassigned',2]]);
});

test('scoped copies isolate native jobs and handoffs without modifying the shared feed',()=>{
  const same={id:'same',sourceId:aid,targetRef:bid},foreign={id:'cross',sourceId:aid,targetRef:cid};
  const sessions={token:'same-token',scannedAt:'same-scan',entries:[session(aid),session(bid),session(cid,{workspaceId:other})],handoffs:[same,foreign]};
  const native={...live,jobs:[{id:'9'.repeat(32),status:'running',role:'qa',events:[],updatedAt:new Date().toISOString()}]};
  const before=JSON.stringify({sessions,native});
  const a=O.scopeFloor(`project:${wid}`,sessions,native),b=O.scopeFloor(`project:${other}`,sessions,native);
  assert.equal(a.sessions.token,sessions.token);assert.deepEqual(a.sessions.handoffs,[same]);assert.equal(a.live.jobs.length,1);
  assert.deepEqual(b.sessions.entries.map(e=>e.id),[cid]);assert.deepEqual(b.live.jobs,[]);assert.deepEqual(b.sessions.handoffs,[]);
  assert.equal(JSON.stringify({sessions,native}),before);
  assert.equal(O.scopeFloor('all',sessions,native).sessions,sessions);
  assert.equal(O.scopeFloor('all',sessions,native).live,native);
});

test('empty runner floors and unknown workers remain honest while archived sessions do not create floors',()=>{
  const sessions={entries:[session(aid,{status:'recorded'}),session(bid,{workspace:'Unknown',workspaceId:null})]};
  const floors=O.projectFloors(sessions,live);
  assert.equal(floors.find(f=>f.key===`project:${wid}`).count,0);
  assert.equal(floors.find(f=>f.key==='unassigned').count,1);
  assert.deepEqual(O.scopeFloor('missing',sessions,live).sessions.entries,[]);
  assert.equal(O.actorProject('missing',sessions,live).key,'unassigned');
});
