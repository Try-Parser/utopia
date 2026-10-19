/* Offline provider selection, retry identity and office provenance contracts. */
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto');
const P=require('./mission-providers.js');
const office=require('./office-model.js');
const golden=require('./mission-providers.contract.json');
const state=(id,extra={})=>({id,label:id==='claude'?'Claude Code':id==='codex'?'Codex':id,installed:true,available:true,accessModes:['read-only','workspace-write'],reason:'Installed; login is checked at launch.',...extra});
test('selection follows every shared independent vector without Codex bias',()=>{
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname,'mission-providers.contract.json'),'utf8').replace(/\r\n/g,'\n')).digest('hex'),'c5f02d56acb88eb4d3a23f1b5d6d7d74735f72d128126732ebdc6845eaacf934');
  for(const vector of golden.selectionVectors)assert.equal(P.selectProvider(vector.available.map(id=>state(id)),vector.saved),vector.selected,JSON.stringify(vector));
  assert.equal(P.selectProvider([state('claude'),state('codex')],'codex','claude'),'claude','a still available in-progress choice wins over saved choice');
  assert.equal(P.selectProvider([state('claude')],'codex','codex'),'claude');
});
test('provider snapshots validate boundaries and truthful unavailable states',()=>{
  const unsupported=state('gemini',{available:false,accessModes:[],reason:'Detected; a native mission adapter is needed.'});
  assert.equal(P.validProviders([state('codex'),state('claude'),unsupported]),true);
  assert.equal(P.validProviders([]),true);
  for(const bad of [null,{},[state('codex'),state('codex')],[state('codex',{installed:false})],[state('codex',{accessModes:[]})],[state('codex',{accessModes:['admin']})],[state('codex',{id:'../codex'})],[state('codex',{id:null})],[state('codex',{id:true})],[state('codex',{id:undefined})],[state('codex',{label:'x'.repeat(81)})],[state('codex',{reason:'x'.repeat(241)})]])assert.equal(P.validProviders(bad),false,JSON.stringify(bad));
});
test('native employees and completed computer results retain actual provider',()=>{
  const stamp=new Date().toISOString(),jobs=[{id:'a'.repeat(32),role:'builder',provider:'claude',providerLabel:'Claude Code',title:'Implement task',status:'running',updatedAt:stamp,activity:'Editing files',events:[]}];
  const {actors}=office.project({entries:[],handoffs:[]},{jobs});
  assert.equal(actors[0].provider,'Claude Code');assert.equal(actors[0].label,'Claude Code / builder');
  jobs[0].status='completed';const seat=office.assignWorkstations([],jobs).find(s=>s.occupant);
  assert.equal(seat.occupant.provider,'Claude Code');
  assert.equal(P.jobProvider({}), 'Codex');
  assert.equal(P.jobProvider({provider:'unknown-tool'}),'unknown-tool','explicit unknown provenance is not relabeled');
});
function harness(){
  let receive,requests=[],fail=false,responseOverride=null;
  const providers=[state('codex'),state('claude')],snapshot={providers,enabled:true,allowEdits:true,workspace:'fixture',token:'PRIVATE_FIXTURE_TOKEN',warning:'',jobs:[]};
  const context={window:{AgentWorld:{ROLES:[{id:'builder'}]},MissionProviders:P,addEventListener(){}},setInterval(){},EventSource:class {},AbortSignal,crypto:webcrypto,fetch:async(url,options)=>{
    if(options?.method==='POST'){
      requests.push({...JSON.parse(options.body),token:options.headers['X-Agent-World-Token']});
      if(fail)throw new Error('offline');
      if(responseOverride)return {ok:responseOverride.status<400,status:responseOverride.status,json:async()=>{if(responseOverride.invalid)throw new SyntaxError('Invalid JSON');return responseOverride.body;}};
      return {ok:true,status:200,json:async()=>({id:requests.at(-1).requestId})};
    }
    return {ok:true,json:async()=>snapshot};
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'live.js'),'utf8'),context);
  context.window.LiveFeed.subscribe=(_kind,data)=>{receive=data;return ()=>{};};
  const live=context.window.LiveAgents;live.activate(true,()=>{});receive(snapshot);
  return {live,requests,snapshot,receive,fail:value=>{fail=value;},reject:(value,status=503)=>{responseOverride=value===null?null:{status,body:value};},ack:value=>{responseOverride={status:200,body:value};},normalAck:()=>{responseOverride=null;},invalidJson:()=>{responseOverride={status:200,invalid:true};},response:(status,body)=>{responseOverride={status,body};}};
}
test('uncertain retry pins original provider, payload and request ID even after removal',async()=>{
  const h=harness();h.fail(true);
  await assert.rejects(h.live.submit('Task','Brief','builder','read-only','claude'),/Connection lost/);
  const first=h.requests[0];assert.equal(first.provider,'claude');
  await assert.rejects(h.live.submit('Task','Brief','builder','read-only','codex'),/Reconcile the previous/);
  assert.equal(h.requests.length,1,'no fallback command can be launched');
  h.snapshot.providers=[state('codex')];h.receive(h.snapshot);h.fail(false);
  await h.live.submit('Task','Brief','builder','read-only','claude');
  assert.deepEqual(h.requests[1],first);assert.equal(h.live.pending(),null);
});
test('new requests reject missing, unavailable and unsupported provider access',async()=>{
  const h=harness();
  for(const provider of ['',undefined,'gemini'])await assert.rejects(h.live.submit('Task','','builder','read-only',provider),/Choose an available/);
  await assert.rejects(h.live.submit('Task','','builder','admin','claude'),/does not support/);
  assert.equal(h.requests.length,0);
});
test('definitively rejected 503 releases the form; ambiguous 503 keeps original provider pinned',async()=>{
  const definitive=harness();definitive.reject({error:'Provider unavailable',accepted:false});
  await assert.rejects(definitive.live.submit('Task','','builder','read-only','claude'),/Provider unavailable/);
  assert.equal(definitive.live.pending(),null,'a rejected request created no job and can be edited');
  definitive.reject(null);await definitive.live.submit('Task','','builder','read-only','codex');
  assert.equal(definitive.requests.at(-1).provider,'codex');
  const uncertain=harness();uncertain.reject({error:'Unexpected server failure'});
  await assert.rejects(uncertain.live.submit('Task','','builder','read-only','claude'),/Unexpected server failure/);
  assert.equal(uncertain.live.pending().provider,'claude');
  await assert.rejects(uncertain.live.submit('Task','','builder','read-only','codex'),/Reconcile the previous/);
  assert.equal(uncertain.requests.length,1);
});
test('lost acknowledgement survives stale-token 403 and reconciles original UUID after token refresh',async()=>{
  const h=harness();h.fail(true);
  await assert.rejects(h.live.submit('Task','Brief','builder','read-only','claude'),/Connection lost/);
  const original=h.requests[0];h.fail(false);h.reject({error:'Refresh the page to reconnect this session'},403);
  await assert.rejects(h.live.submit('Task','Brief','builder','read-only','claude'),/Refresh the page/);
  assert.equal(h.live.pending().provider,'claude');assert.deepEqual(h.requests[1],original);
  await assert.rejects(h.live.submit('Task','Brief','builder','read-only','codex'),/Reconcile the previous/);
  assert.equal(h.requests.length,2,'the original mission remains pinned before token refresh');
  h.snapshot.token='REFRESHED_FIXTURE_TOKEN';h.receive(h.snapshot);h.reject(null);
  await h.live.submit('Task','Brief','builder','read-only','claude');
  assert.deepEqual(h.requests[2],{...original,token:'REFRESHED_FIXTURE_TOKEN'});
  assert.equal(h.live.pending(),null);
});
test('a fresh, well-formed authentication rejection releases an unaccepted request',async()=>{
  const h=harness();h.reject({error:'Refresh the page to reconnect this session'},403);
  await assert.rejects(h.live.submit('Task','','builder','read-only','claude'),/Refresh the page/);
  assert.equal(h.live.pending(),null);
});
test('malformed JSON, scalar/array bodies and wrong acknowledgement IDs never discard an uncertain mission',async()=>{
  const vectors=[null,[],true,0,'accepted',{}, {id:null},{id:123},{id:'f'.repeat(32)}];
  for(const acknowledgement of vectors){
    const h=harness();h.fail(true);await assert.rejects(h.live.submit('Task','','builder','read-only','claude'),/Connection lost/);
    const original=h.requests[0];h.fail(false);h.ack(acknowledgement);
    await assert.rejects(h.live.submit('Task','','builder','read-only','claude'),error=>error.name!=='TypeError'&&/invalid|acknowledgement/.test(error.message));
    assert.equal(h.live.pending().provider,'claude',JSON.stringify(acknowledgement));
    await assert.rejects(h.live.submit('Task','','builder','read-only','codex'),/Reconcile the previous/);
    h.normalAck();await h.live.submit('Task','','builder','read-only','claude');assert.deepEqual(h.requests[2],original);assert.equal(h.live.pending(),null);
  }
  const h=harness();h.invalidJson();
  await assert.rejects(h.live.submit('Task','','builder','read-only','claude'),/could not be read/);
  const original=h.requests[0];assert.equal(h.live.pending().provider,'claude');h.normalAck();
  await h.live.submit('Task','','builder','read-only','claude');assert.deepEqual(h.requests[1],original);
  for(const body of [null,[{accepted:false}]]){
    const h=harness();h.fail(true);await assert.rejects(h.live.submit('Task','','builder','read-only','claude'),/Connection lost/);h.fail(false);h.response(403,body);
    await assert.rejects(h.live.submit('Task','','builder','read-only','claude'),error=>error.name!=='TypeError'&&/invalid/.test(error.message));
    assert.equal(h.live.pending().provider,'claude','malformed rejection cannot authoritatively release a prior unknown mission');
  }
});
