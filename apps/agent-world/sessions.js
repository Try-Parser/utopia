/* Provider-neutral inventory. Activity provenance stays visible. */
window.LocalSessions = (() => {
  'use strict';
  const states=['event-working','event-waiting','running','recorded','recent','adapter-working','adapter-waiting','adapter-idle','adapter-ended','adapter-stale'];
  const stateLabel={'event-working':'Local activity: working','event-waiting':'Local activity: recently seen',running:'Process alive',recorded:'Stored session',recent:'Recently updated','adapter-working':'Adapter: working','adapter-waiting':'Adapter: waiting','adapter-idle':'Adapter: idle','adapter-ended':'Adapter: ended','adapter-stale':'Heartbeat expired'};
  const colors={'Codex':'#739777','Claude Code':'#c38f78','Gemini CLI':'#659cae','Ollama':'#a492c3'};
  const positions=[[194,217],[474,217],[754,217],[194,462],[474,462],[754,462],[235,305],[340,305],[445,305],[550,305],[655,305],[760,305]];
  let data={entries:[],warnings:[],coverage:[],partial:true,scannedAt:null,limitations:'Connecting to local session discovery…'},active=false,generation=0,inFlight=false,selected=null,filter='all',onChange=()=>{};
  const $=id=>document.getElementById(id);
  const n=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls||'';if(text!==undefined)el.textContent=text;return el;};
  const activeEntry=e=>['running','event-working','event-waiting'].includes(e.status)||['adapter-working','adapter-waiting','adapter-idle'].includes(e.status);
  const roles=window.AgentWorld.ROLES.map(r=>r.id),hex=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
  const eventLabels=new Set(['New turn','Turn started','Turn finished','Turn activity','Tool activity','Assistant responding','Using tool',
    'Editing files','Using terminal','Reading project files','Planning work','Coordinating agents','Waiting for agents','Researching']);
  const validEvents=events=>events==null||Array.isArray(events)&&events.length<=8&&events.every(event=>event&&typeof event.label==='string'&&eventLabels.has(event.label)&&typeof event.at==='string'&&Number.isFinite(Date.parse(event.at)));
  const transcriptCache=new Map();
  const validTranscript=value=>value&&typeof value.available==='boolean'&&(value.available?
    typeof value.live==='boolean'&&Number.isFinite(Date.parse(value.updatedAt))&&Array.isArray(value.entries)&&value.entries.length<=80&&value.entries.every(e=>e&&['Assistant','You','You / tool','Tool call','Tool result'].includes(e.speaker)&&typeof e.text==='string'&&e.text.length<=8000&&Number.isFinite(Date.parse(e.at))):
    typeof value.reason==='string'&&value.reason.length<=200);
  async function transcript(id){
    const entry=data.entries.find(e=>e.id===id&&e.kind==='session');
    if(!entry||!data.token)return {available:false,reason:'Session output is unavailable.'};
    const cached=transcriptCache.get(id),now=Date.now();
    const version=`${entry.transcriptRevision||entry.updatedAt}:${entry.transcriptLive}`;
    if(cached&&cached.version===version&&now-cached.at<1000)return cached.promise;
    const promise=fetch(`/api/sessions/${id}/transcript`,{cache:'no-store',headers:{'X-Agent-World-Token':data.token},signal:AbortSignal.timeout(6000)})
      .then(async response=>{if(!response.ok)throw new Error();const value=await response.json();if(!validTranscript(value))throw new Error();return value;})
      .catch(()=>({available:false,reason:'Session output reader unavailable.'}));
    transcriptCache.set(id,{version,at:now,promise});
    if(transcriptCache.size>24)transcriptCache.delete(transcriptCache.keys().next().value);
    return promise;
  }
  function valid(value){return value&&Array.isArray(value.entries)&&value.entries.length<=200&&value.entries.every(e=>e&&hex(e.id)&&['provider','label','workspace','evidence'].every(k=>typeof e[k]==='string'&&e[k].length<=150)&&states.includes(e.status)&&['process','session'].includes(e.kind)&&(e.pid===null||Number.isInteger(e.pid)&&e.pid>0)&&Number.isFinite(Date.parse(e.updatedAt))&&validEvents(e.recentEvents)&&(e.role==null||roles.includes(e.role))&&(e.taskRef==null||hex(e.taskRef))&&(e.taskLabel==null||typeof e.taskLabel==='string'&&e.taskLabel.length<=100)&&(e.action==null||['planning','designing','coding','reviewing','testing','auditing','helping','command','research','tool','coordination','reporting'].includes(e.action))&&(e.targetRef==null||hex(e.targetRef))&&(e.targetKind==null||['session','job'].includes(e.targetKind))&&(e.parentId==null||hex(e.parentId))&&(e.activeChildCount==null||Number.isInteger(e.activeChildCount)&&e.activeChildCount>0&&e.activeChildCount<=200))&&Array.isArray(value.handoffs)&&value.handoffs.length<=80&&value.handoffs.every(h=>h&&hex(h.id)&&hex(h.sourceId)&&hex(h.taskRef)&&roles.includes(h.fromRole)&&roles.includes(h.toRole)&&typeof h.provider==='string'&&h.provider.length<=40&&Number.isFinite(Date.parse(h.at))&&(h.taskLabel==null||typeof h.taskLabel==='string'&&h.taskLabel.length<=100)&&(h.targetRef==null||hex(h.targetRef))&&(h.targetKind==null||['session','job'].includes(h.targetKind)))&&typeof value.partial==='boolean'&&Number.isFinite(Date.parse(value.scannedAt))&&Array.isArray(value.warnings)&&value.warnings.length<=20&&value.warnings.every(w=>typeof w==='string'&&w.length<=200)&&typeof value.limitations==='string'&&value.limitations.length<=500&&Array.isArray(value.coverage)&&value.coverage.length<=20&&value.coverage.every(c=>c&&typeof c.provider==='string'&&typeof c.records==='string');}
  let unsubscribe=null,requestGeneration=0;
  function unavailable(){requestGeneration++;transcriptCache.clear();data={entries:[],warnings:['Session discovery unavailable. Last results were cleared.'],coverage:[],partial:true,scannedAt:null,limitations:'Reconnect the local reader to discover sessions.'};onChange();}
  function activate(value,callback){active=value;onChange=callback;generation++;unsubscribe?.();unsubscribe=null;
    if(active){data={entries:[],warnings:[],coverage:[],partial:true,scannedAt:null,limitations:'Connecting to live session stream...'};const current=generation;unsubscribe=window.LiveFeed.subscribe('sessions',result=>{if(!active||current!==generation)return;if(!valid(result)){unavailable();return false;}requestGeneration++;data=result;onChange();return true;},()=>{if(active&&current===generation)unavailable();});}}
  async function poll(){
    if(!active)return;if(!window.LiveFeed.healthy()){window.LiveFeed.reconnect();return;}
    const request=++requestGeneration,current=generation;
    try{const response=await fetch('/api/sessions',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error();const result=await response.json();if(!valid(result))throw new Error();if(active&&current===generation&&request===requestGeneration&&window.LiveFeed.healthy()){data=result;onChange();}}
    catch(_){if(active&&current===generation&&request===requestGeneration)unavailable();}
  }
  function visible(){return data.entries.filter(e=>filter==='all'||filter==='active'&&activeEntry(e)||filter==='records'&&e.kind==='session');}
  function select(id){selected=id;onChange();}
  function renderCrew(){
    const entries=visible();if(!entries.some(e=>e.id===selected))selected=entries[0]?.id||null;
    const focused=document.activeElement?.dataset?.session;
    $('session-characters').replaceChildren();$('session-roster').replaceChildren();
    for(const [index,e] of entries.slice(0,12).entries()){
      const color=colors[e.provider]||'#a492c3',point=positions[index];
      const character=n('button','character external-character');character.type='button';character.style.setProperty('--agent',color);character.style.left=`${point[0]/12.8}%`;character.style.top=`${point[1]/6.1}%`;character.setAttribute('aria-label',`Inspect ${e.label}`);character.setAttribute('aria-pressed',String(e.id===selected));character.dataset.session=e.id;character.classList.toggle('selected',e.id===selected);character.classList.toggle('working',e.status==='adapter-working');character.append(n('span','character-bubble','Reported work'),n('span','person'),n('span','character-name',`${e.provider} ${index+1}`));character.addEventListener('click',()=>select(e.id));$('session-characters').append(character);
      const row=n('button','roster-row');row.type='button';row.style.setProperty('--agent',color);row.dataset.session=e.id;row.setAttribute('aria-pressed',String(e.id===selected));const info=n('span','person-info');info.append(n('strong','',e.provider),n('span','',stateLabel[e.status]));row.append(n('span','portrait',e.provider.slice(0,2).toUpperCase()),info);row.addEventListener('click',()=>select(e.id));$('session-roster').append(row);
    }
    const e=data.entries.find(entry=>entry.id===selected),detail=$('agent-detail');detail.replaceChildren(n('h3','',e?.label||'Local session discovery'),n('p','',e?`${stateLabel[e.status]} · ${e.workspace}${e.pid?` · PID ${e.pid}`:''}`:'No entries match this view.'),n('p','detail-note',e?.evidence||data.limitations));
    if(focused){const target=document.querySelector(`#session-characters [data-session="${focused}"], #session-roster [data-session="${focused}"]`);target?.focus({preventScroll:true});}
  }
  function renderMissions(target){
    const focused=document.activeElement?.dataset?.inspect;target.replaceChildren();const entries=visible();
    if(!entries.length){const empty=n('div','empty');empty.append(n('strong','',data.scannedAt?'No matching local sessions found':'Session reader unavailable or scanning'),n('span','',data.warnings.join(' ')||data.limitations));target.append(empty);}
    for(const e of entries){const card=n('article','mission-card'),content=n('div');content.append(n('div','mission-title',e.label),n('div','mission-meta',`${e.provider} · ${e.workspace}${e.pid?` · PID ${e.pid}`:''}`),n('div','mission-meta',e.evidence));const button=n('button','session-inspect','Inspect session');button.type='button';button.dataset.inspect=e.id;button.addEventListener('click',()=>select(e.id));card.append(content,n('span','status',stateLabel[e.status]),button);target.append(card);}
    if(focused)target.querySelector(`[data-inspect="${focused}"]`)?.focus({preventScroll:true});
  }
  function renderActivity(list){list.replaceChildren();for(const text of [data.partial?'Partial inventory: scan limits, access restrictions, or unsupported sources may hide sessions.':'Recognized process and configured session-record scan completed.',...data.warnings,...data.coverage.map(c=>`${c.provider} metadata: ${c.records}`),data.limitations])list.append(n('li','empty',text));}
  function note(){return `Local discovery · ${data.entries.filter(e=>e.status==='running'||e.pid&&e.status.startsWith('event-')).length} live process entries, ${data.entries.filter(e=>e.kind==='session').length} session entries. ${data.partial?'Partial inventory. ':''}Process presence does not prove an agent is working.`;}
  $('session-filter').addEventListener('change',e=>{filter=e.target.value;onChange();});$('refresh-sessions').addEventListener('click',poll);

  return {get:()=>data,transcript,activate,renderCrew,renderMissions,renderActivity,note,count:()=>visible().length};
})();
