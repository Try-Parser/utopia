const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('./screen-model.js');
const sim={active:['designer'],title:'Demo',stage:'Designing',events:[]};
test('computer binding isolates same-department native and external sessions and empty desks',()=>{
  const jobs=[{id:'a',role:'builder',status:'running',result:'A',changes:[{path:'a.js'}]},{id:'b',role:'builder',status:'running',result:'B',changes:[{path:'b.js'}]}],entries=[{id:'c',role:'builder',status:'adapter-working',label:'External C'}];
  assert.equal(M.project('builder','office',{jobs},{entries},sim,{id:'job-b'}).result,'B');
  const external=M.project('builder','office',{jobs},{entries},sim,{id:'session-c'});assert.equal(external.jobId,null);assert.equal(external.title,'External C');
  assert.equal(M.project('builder','office',{jobs},{entries},sim,null).jobId,null);
});
test('a shared computer identifies its open session without inventing task output',()=>{
  const screen=M.project('shared','office',{jobs:[]},{entries:[{id:'open',kind:'session',role:null,status:'running',label:'Local session'}]},sim,{id:'session-open'});
  assert.equal(screen.source,'Local session detected');assert.match(screen.activity,/No task or tool event/);assert.equal(screen.sessionId,'open');assert.equal(screen.jobId,null);assert.deepEqual(screen.events,[]);
});
test('native screen prioritizes active role task and keeps completion semantics',()=>{
  const old={id:'a',role:'builder',status:'completed',result:'old'},running={id:'b',role:'builder',status:'running',result:''};
  assert.equal(M.project('builder','office',{jobs:[old,running]},{entries:[]},sim).jobId,'b');
  const complete=M.project('builder','live',{jobs:[old]},{entries:[]},sim);assert.equal(complete.status,'Turn complete');assert.deepEqual(complete.changes,[]);
});
test('simulation and externally reported roles never invent source code or terminal output',()=>{
  const demo=M.project('designer','simulation',{jobs:[]},{entries:[]},sim);assert.match(demo.source,/illustrative/);assert.equal(demo.jobId,null);
  const external=M.project('builder','office',{jobs:[]},{entries:[{role:'builder',status:'adapter-working',label:'External'}]},sim);assert.match(external.activity,/not supplied/);assert.deepEqual(external.changes,[]);
  const unmapped=M.project('builder','observed',{jobs:[{role:'builder',status:'running'}]},{entries:[]},sim);assert.equal(unmapped.jobId,null);
});
test('only user-connected loopback HTTP previews on another port are accepted',()=>{
  assert.equal(M.previewURL('http://localhost:3000/app',8787),'http://localhost:3000/app');
  for(const url of ['https://example.com','http://127.0.0.1:8787','http://localhost:8787','http://localhost@evil.example:3000','javascript:alert(1)','file:///tmp/a','http://user:pass@localhost:3000'])assert.throws(()=>M.previewURL(url,8787));
});
