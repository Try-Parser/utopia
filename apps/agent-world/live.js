/* One same-origin live connection shared by native tasks and local sessions. */
window.LiveFeed = (() => {
  'use strict';
  const listeners=new Map(),latest=new Map();let source=null,lastEvent=0,healthy=false;
  const notifyError=()=>{healthy=false;latest.clear();for(const set of listeners.values())for(const listener of set)listener.error();};
  function connect(){
    if(source||!listeners.size)return;
    const current=new EventSource('/api/events');source=current;lastEvent=Date.now();
    for(const kind of ['sessions','native'])current.addEventListener(kind,event=>{
      if(source!==current)return;lastEvent=Date.now();healthy=true;
      try{if(event.data.length>24*1024*1024)throw new Error();const value=JSON.parse(event.data);let accepted=false;for(const listener of listeners.get(kind)||[])accepted=listener.data(value)===true||accepted;if(accepted)latest.set(kind,value);else latest.delete(kind);}
      catch(_){latest.delete(kind);for(const listener of listeners.get(kind)||[])listener.error();}
    });
    current.addEventListener('heartbeat',()=>{if(source===current){lastEvent=Date.now();healthy=true;}});
    current.onerror=()=>{if(source===current)notifyError();};
  }
  function subscribe(kind,data,error){
    const listener={data,error};if(!listeners.has(kind))listeners.set(kind,new Set());listeners.get(kind).add(listener);
    if(latest.has(kind))data(latest.get(kind));connect();
    return ()=>{listeners.get(kind)?.delete(listener);if(!listeners.get(kind)?.size)listeners.delete(kind);if(!listeners.size){source?.close();source=null;healthy=false;latest.clear();}};
  }
  function reconnect(){source?.close();source=null;notifyError();connect();}
  setInterval(()=>{if(source&&Date.now()-lastEvent>12000)reconnect();},1000);
  window.addEventListener('pagehide',()=>{source?.close();source=null;notifyError();});
  window.addEventListener('pageshow',connect);
  return {subscribe,reconnect,healthy:()=>healthy};
})();

/* Real native tasks. Neither simulated state nor native tokens are persisted here. */
window.LiveAgents = (() => {
  'use strict';
  const statuses = ['queued', 'starting', 'running', 'completed', 'failed', 'cancelled', 'timed-out', 'interrupted'];
  let snapshot = {providers:[],enabled:false,allowEdits:false,workspace:'',token:'',warning:'Connecting to native task runner…',jobs:[]};
  let active = false, generation = 0, onChange = () => {}, pending = null;
  const operationErrors = new Map();
  const element = (tag, cls, text) => { const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n; };
  const terminal = status => ['completed','failed','cancelled','timed-out','interrupted'].includes(status);
  function valid(data) {
    return data && window.MissionProviders.validProviders(data.providers) && typeof data.enabled==='boolean' && typeof data.allowEdits==='boolean' && ['workspace','token','warning'].every(k=>typeof data[k]==='string'&&data[k].length<=1000) && Array.isArray(data.jobs) && data.jobs.length<=100 && data.jobs.every(j=>j&&(j.provider===undefined||typeof j.provider==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(j.provider)&&typeof j.providerLabel==='string'&&j.providerLabel.length>0&&j.providerLabel.length<=80)&&typeof j.id==='string'&&/^[a-f0-9]{32}$/.test(j.id)&&window.AgentWorld.ROLES.some(r=>r.id===j.role)&&statuses.includes(j.status)&&['read-only','workspace-write'].includes(j.access)&&typeof j.title==='string'&&j.title.length<=100&&typeof j.activity==='string'&&j.activity.length<=100&&(j.action==null||['command','coding','tool','research','planning','coordination','reporting'].includes(j.action))&&typeof j.result==='string'&&j.result.length<=16000&&['createdAt','updatedAt'].every(k=>typeof j[k]==='string'&&Number.isFinite(Date.parse(j[k])))&&Array.isArray(j.events)&&j.events.length<=80&&j.events.every(e=>e&&typeof e.text==='string'&&e.text.length<=100&&Number.isFinite(Date.parse(e.at))));
  }
  async function poll() {
    const current=++generation;
    try {
      const response=await fetch('/api/live',{cache:'no-store',signal:AbortSignal.timeout(4000)});
      if(!response.ok)throw new Error();
      const data=await response.json();if(!valid(data)||data.jobs.some(j=>j.changes!==undefined&&(!Array.isArray(j.changes)||j.changes.length>20||j.changes.some(c=>!c||typeof c.path!=='string'||c.path.length>200||!['add','update','delete'].includes(c.kind)))))throw new Error();
      if(current!==generation||!active)return;
      snapshot=data;
    } catch (_) { if(current!==generation||!active)return;snapshot={providers:[],enabled:false,allowEdits:false,workspace:'',token:'',warning:'Native task reader unavailable. Reconnect to see actual outcomes. Existing runs may continue.',jobs:[]}; }
    onChange();
  }
  let unsubscribe=null;
  function unavailable(){generation++;snapshot={providers:[],enabled:false,allowEdits:false,workspace:'',token:'',warning:'Live task stream unavailable. Existing runs may continue.',jobs:[]};onChange();}
  function activate(value,callback){active=value;onChange=callback;generation++;unsubscribe?.();unsubscribe=null;
    if(active){snapshot={providers:[],enabled:false,allowEdits:false,workspace:'',token:'',warning:'Connecting to live task stream...',jobs:[]};unsubscribe=window.LiveFeed.subscribe('native',data=>{if(!active)return;if(!valid(data)||data.jobs.some(j=>j.changes!==undefined&&(!Array.isArray(j.changes)||j.changes.length>20||j.changes.some(c=>!c||typeof c.path!=='string'||c.path.length>200||!['add','update','delete'].includes(c.kind))))){unavailable();return false;}generation++;snapshot=data;onChange();return true;},()=>{if(active)unavailable();});}}
  async function request(url,data) {
    let response;
    try { response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Agent-World-Token':snapshot.token},body:JSON.stringify(data),signal:AbortSignal.timeout(7000)}); }
    catch (_) { const error=new Error('Connection lost. This mission may already be queued. Retry the same mission to reconcile it.');error.uncertain=true;throw error; }
    let result;try{result=await response.json();}catch(_){const error=new Error('The runner response could not be read. Retry this mission to reconcile it.');error.uncertain=true;throw error;}
    if(!result||typeof result!=='object'||Array.isArray(result)){const error=new Error('The runner response was invalid. Retry this mission to reconcile it.');error.uncertain=true;throw error;}
    if(!response.ok){const error=new Error(typeof result.error==='string'?result.error:'Mission operation failed');error.definitiveRejection=result.accepted===false;error.uncertain=response.status>=500&&!error.definitiveRejection;throw error;}return result;
  }
  async function submit(title,brief,role,access,provider) {
    const payload={title,brief,role,access,provider},key=JSON.stringify(payload);
    if(pending&&pending.key!==key)throw new Error('Reconcile the previous mission before changing its provider or task.');
    if(!snapshot.token||!snapshot.enabled&&!pending)throw new Error('Native tasks unavailable. Reconnect the local runner.');
    if(!pending){
      const selected=snapshot.providers.find(p=>p.id===provider&&p.available);
      if(!selected)throw new Error('Choose an available local AI provider.');
      if(!selected.accessModes.includes(access))throw new Error('This provider does not support the selected access.');
      pending={key,payload,requestId:crypto.randomUUID().replaceAll('-',''),uncertain:false};
    }
    const submission=pending;let result;
    try{
      result=await request('/api/live/missions',{...submission.payload,requestId:submission.requestId});
      if(result.id!==submission.requestId){const error=new Error('The mission acknowledgement did not match this request. Retry the same mission to reconcile it.');error.uncertain=true;throw error;}
    }catch(error){
      // A token/origin rejection cannot establish the outcome of an earlier
      // accepted request. Only the queue's explicit rejection can release it.
      if(pending===submission){if(error.definitiveRejection||!submission.uncertain&&!error.uncertain)pending=null;else submission.uncertain=true;}
      throw error;
    }
    if(pending===submission)pending=null;await poll();return result;
  }
  function activity(role) { return snapshot.jobs.find(j=>j.role===role&&j.status==='running'); }
  function renderMissions(target) {
    const expanded = new Set(Array.from(target.querySelectorAll('details[open]')).map(e=>e.dataset.job));
    const focused = document.activeElement?.dataset?.cancel, focusedResult = document.activeElement?.dataset?.result;
    const scrollPositions = new Map(Array.from(target.querySelectorAll('details')).map(e=>[e.dataset.job,e.querySelector('pre')?.scrollTop||0]));
    target.replaceChildren();
    if(!snapshot.jobs.length){const empty=element('div','empty');empty.append(element('strong','',snapshot.enabled?'Ready for real work.':'Native runner unavailable'),element('span','',snapshot.warning||'Assign a mission to a specialist. Activity comes from the selected provider session.'));target.append(empty);}
    for(const job of snapshot.jobs){
      const card=element('article','mission-card live-card'),content=element('div');
      const role=window.AgentWorld.ROLES.find(r=>r.id===job.role);
      content.append(element('div','mission-title',job.title),element('div','mission-meta',`${window.MissionProviders.jobProvider(job)} · ${role.name} / ${role.role} · ${job.access} · ${job.activity}`));
      card.append(content,element('span',`status ${job.status}`,job.status==='completed'?'Turn complete':job.status));
      if(!terminal(job.status)){const cancel=element('button','cancel-mission','Cancel mission');cancel.type='button';cancel.dataset.cancel=job.id;cancel.setAttribute('aria-label',`Cancel mission: ${job.title}`);cancel.addEventListener('click',async()=>{cancel.disabled=true;try{await request(`/api/live/missions/${job.id}/cancel`,{});operationErrors.delete(job.id);await poll();}catch(e){document.getElementById('announcement').textContent=e.message;operationErrors.set(job.id,e.message);onChange();}});card.append(cancel);}
      if(operationErrors.has(job.id))card.append(element('p','operation-error',operationErrors.get(job.id)));
      if(job.result){const detail=element('details','mission-result'),summary=element('summary','','Agent result'),answer=element('pre','',job.result);detail.dataset.job=job.id;summary.dataset.result=job.id;detail.open=expanded.has(job.id);detail.append(summary,answer);card.append(detail);requestAnimationFrame(()=>{answer.scrollTop=scrollPositions.get(job.id)||0;});}
      if(job.status==='completed')card.append(element('p','mission-meta','Agent turn ended. Test and review approval are not certified by this viewer.'));
      target.append(card);
    }
    if(focused)target.querySelector(`[data-cancel="${focused}"]`)?.focus({preventScroll:true});
    if(focusedResult)target.querySelector(`[data-result="${focusedResult}"]`)?.focus({preventScroll:true});
  }
  function renderActivity(list) {
    list.replaceChildren();
    const notes=snapshot.jobs.flatMap(j=>j.events.map(e=>({...e,role:`${window.MissionProviders.jobProvider(j)} / ${window.AgentWorld.ROLES.find(r=>r.id===j.role).name}`}))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,10);
    if(!notes.length){list.append(element('li','empty',snapshot.warning||'Recorded native activity will appear here.'));return;}
    for(const note of notes){const item=element('li'),stamp=element('time','',new Date(note.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}));item.append(stamp,element('span','',`${note.role} · ${note.text}`));list.append(item);}
  }

  return {get:()=>snapshot,pending:()=>pending?.payload||null,activate,poll,submit,activity,renderMissions,renderActivity};
})();
