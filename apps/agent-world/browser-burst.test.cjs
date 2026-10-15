/* Isolated high-concurrency Chromium journey; fixture heartbeats have a 30-second active window. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const fixtures=fs.mkdtempSync(path.join(os.tmpdir(),'agent-world-burst-'));
  const server=spawn('python3',['tests/fixtures/agent_world_server.py',fixtures],{stdio:'pipe'});
  let browser;
  try{
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server startup timeout')),10000);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited ${code}`)));server.stdout.once('data',()=>{clearTimeout(timeout);resolve();});});
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1050}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const report=async data=>page.evaluate(async data=>{const session=await(await fetch('/api/sessions')).json();const response=await fetch('/api/sessions/heartbeat',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-World-Token':session.token},body:JSON.stringify(data)});if(!response.ok)throw new Error(`Role report rejected ${response.status}`);return(await response.json()).id;},data);
    await page.goto('http://127.0.0.1:8787');
    await page.waitForSelector('.office-character');
    const base={provider:'Office Fixture',sessionId:'base-builder',state:'working',workspace:'/work/demo',pid:null,role:'builder',taskId:'base-task',taskLabel:'Build office',action:'coding'};
    await report(base);
    const burst=Array.from({length:25},(_,n)=>({...base,sessionId:`burst-worker-${n}`,role:'planner',taskId:`burst-task-${n}`}));
    const ids=await page.evaluate(async records=>{const session=await(await fetch('/api/sessions')).json();return Promise.all(records.map(async data=>{const response=await fetch('/api/sessions/heartbeat',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-World-Token':session.token},body:JSON.stringify(data)});if(!response.ok)throw new Error(`Burst report rejected ${response.status}`);return(await response.json()).id;}));},burst);
    await page.evaluate(records=>{window.burstKeepalive=setInterval(()=>{if(window.burstKeepaliveBusy)return;window.burstKeepaliveBusy=(async()=>{const session=await(await fetch('/api/sessions')).json();await Promise.all(records.map(data=>fetch('/api/sessions/heartbeat',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-World-Token':session.token},body:JSON.stringify(data)})));})().finally(()=>{window.burstKeepaliveBusy=null;});},8000);},burst);
    await page.waitForFunction(ids=>ids.every(id=>window.OfficeWorldView.getState().some(a=>a.id===`session-${id}`&&a.station)),ids);
    assert.ok(await page.locator('.office-character').count()>24,'all parallel workers render beyond the former avatar cap');
    assert.ok(await page.locator('[data-workstation^="planner:"]').count()>=25,'the planner room expands to seat parallel workers');
    assert.match(await page.locator('#office-summary').textContent(),/computers/);
    assert.doesNotMatch(await page.locator('#office-summary').textContent(),/additional entries/);
    const unknown={...base,sessionId:'unknown-working',role:undefined,taskId:undefined,taskLabel:undefined,action:undefined};
    const unknownId=await report(unknown);
    await page.waitForFunction(id=>window.OfficeWorldView.getState().some(a=>a.id===`session-${id}`&&a.working&&!a.role),unknownId);
    await page.getByRole('button',{name:'Pause movement',exact:true}).click();
    const paused=await page.evaluate(id=>{const a=window.OfficeWorldView.getState().find(a=>a.id===`session-${id}`),desk=window.OfficeWorldView.getLayout().stations.find(s=>s.key===a?.station);return Boolean(a&&desk)&&window.OfficeGameModel.free(a.x,a.y)&&Math.hypot(a.x-desk.point.x,a.y-desk.point.y)<2;},unknownId);
    assert.equal(paused,true,'pausing a role-unknown worker keeps them at the assigned shared computer');
    await page.getByRole('button',{name:'Play movement',exact:true}).click();
    await report({...unknown,state:'ended'});
    await page.evaluate(()=>{window.routeBurstProbe={callsInSync:0,insideSync:false,originalPath:window.OfficeGameModel.path,originalSync:window.OfficeWorldView.sync};const probe=window.routeBurstProbe;window.OfficeGameModel.path=(...args)=>{if(probe.insideSync)probe.callsInSync++;return probe.originalPath(...args);};window.OfficeWorldView.sync=(...args)=>{probe.insideSync=true;try{return probe.originalSync(...args);}finally{probe.insideSync=false;}};});
    await page.evaluate(async()=>{clearInterval(window.burstKeepalive);if(window.burstKeepaliveBusy)await window.burstKeepaliveBusy;});
    const handoff=Array.from({length:20},(_,n)=>({...base,sessionId:`burst-worker-${n}`,state:'waiting',role:'planner',taskId:`burst-task-${n}`,handoffTo:'reviewer',eventId:`burst-handoff-${n}`}));
    await page.evaluate(async records=>{const session=await(await fetch('/api/sessions')).json();await Promise.all(records.map(async data=>{const response=await fetch('/api/sessions/heartbeat',{method:'POST',headers:{'Content-Type':'application/json','X-Agent-World-Token':session.token},body:JSON.stringify(data)});if(!response.ok)throw new Error(`Handoff report rejected ${response.status}`);}));},handoff);
    try{await page.waitForFunction(()=>window.OfficeWorldView.getState().filter(a=>a.role==='planner'&&a.handoffTo==='reviewer').length>=20&&window.LocalSessions.get().handoffs.length>=20&&document.querySelectorAll('.work-packet').length>=1,null,{timeout:35000});}
    catch(error){const counts=await page.evaluate(()=>({workers:window.OfficeWorldView.getState().filter(a=>a.role==='planner'&&a.handoffTo==='reviewer').length,handoffs:window.LocalSessions.get().handoffs.length,packets:document.querySelectorAll('.work-packet').length}));console.error('Burst handoff counts',counts);throw error;}
    const result=await page.evaluate(()=>({handoffs:window.LocalSessions.get().handoffs.length,visible:window.OfficeWorldView.getState().filter(a=>a.handoffTo==='reviewer').length,packets:document.querySelectorAll('.work-packet').length}));
    assert.ok(result.handoffs>=20&&result.visible>=20&&result.packets>=1,'the complete burst reaches the scene and activity stream');
    assert.equal(await page.evaluate(()=>window.routeBurstProbe.callsInSync),0,'route finding does not block a synchronous source refresh');
    await page.evaluate(()=>{window.OfficeGameModel.path=window.routeBurstProbe.originalPath;window.OfficeWorldView.sync=window.routeBurstProbe.originalSync;delete window.routeBurstProbe;});
    assert.deepEqual(errors,[]);
    console.log('PASS: isolated parallel workers, overflow desks, shared seat pause and 20 reported handoffs');
  }finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});fs.rmSync(fixtures,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
