/* Agent World UI. Untrusted text is rendered only through textContent. */
'use strict';
const E = window.AgentWorld;
const L = window.LiveAgents;
const S = window.LocalSessions;
const $ = id => document.getElementById(id);
const VIEW_STORAGE='agent-world.office-view.v1';
const ANGLE_STORAGE='agent-world.office-angle.v1';
const state={missions:[],events:[],paused:false};
let storageAvailable=true;
let officeView='isometric';
let officeAngle=0;
try{const saved=localStorage.getItem(VIEW_STORAGE),angle=Number(localStorage.getItem(ANGLE_STORAGE));if(['isometric','top-down'].includes(saved))officeView=saved;if(Number.isFinite(angle)&&angle>=0&&angle<360)officeAngle=angle;}catch(_){storageAvailable=false;}
let officeCameraPending=false,officeCameraManual=false,cameraRevision=0,cameraScale=1,cameraX=0,cameraY=0;
let mode = 'office', selected = 'planner', observed = [], observedMessage = 'Connecting to the local checkpoint reader…', pollGeneration = 0;
function node(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
const codexHelp=node('p','connection-help');codexHelp.id='codex-activity-help';codexHelp.hidden=true;$('office-sidebar').querySelector('.sidebar-body').prepend(codexHelp);
function announce(text) { $('announcement').textContent = text; }
function renderCrew(){document.body.dataset.mode='office';$('office-characters').hidden=false;$('office-roster').hidden=false;$('office-hud').hidden=false;$('crew-title').textContent='Observed coworkers';}
function renderMissions() {
  const target = $('missions');
  $('local-section').hidden=mode!=='office'; $('checkpoint-section').hidden=mode!=='office';
  if(mode==='office') {
    L.renderMissions(target); S.renderMissions($('local-missions'));
    $('board-label').textContent='LIVE WORKSPACE'; $('mission-count').textContent=String(L.get().jobs.length); $('local-count').textContent=String(S.count());
    const checkpoints=$('checkpoint-list'); checkpoints.replaceChildren();
    if(!observed.length)checkpoints.append(node('div','empty',observedMessage));
    for(const run of observed){const card=node('article','checkpoint-card'); card.append(node('strong','',run.name),node('span','mission-meta',`${run.phase} / ${run.tier} / ${new Date(run.updatedAt).toLocaleString()}`),node('span','status',run.stale?'Stale checkpoint':run.status));checkpoints.append(card);}
    return;
  }
}
function renderActivity() {
  const list = $('activity'); list.replaceChildren();
  if(mode==='office') {
    L.renderActivity(list);
    const entries=S.get().entries.filter(e=>['event-working','event-waiting','adapter-working','adapter-waiting'].includes(e.status)).slice(0,24);
    const events=entries.flatMap(e=>(e.recentEvents||[]).map(event=>({...event,provider:e.provider,session:e.label}))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,24);
    for(const event of events.reverse())list.prepend(node('li','activity-event',`${new Date(event.at).toLocaleTimeString()} · ${event.session} · ${event.label}`));
    for(const e of entries.filter(e=>!e.recentEvents?.length).reverse())list.prepend(node('li','activity-event',`${e.provider} · ${e.workspace} · ${e.taskLabel||e.action||e.status} · ${new Date(e.updatedAt).toLocaleTimeString()}`));
    for(const e of (S.get().handoffs||[]).slice(-8).reverse())list.prepend(node('li','activity-event',`Reported handoff / ${e.fromRole} → ${e.toRole} / ${e.taskRef.slice(0,8)}`));
    for(const warning of S.get().warnings)list.prepend(node('li','empty',warning));
    if(!entries.length&&!(S.get().handoffs||[]).length)list.prepend(node('li','empty','No current local session task or tool events are visible. Open processes may be idle; workers appear when a linked session reports activity.'));
    return;
  }
}
function render() {
  renderCrew(); renderMissions(); renderActivity();
  window.OfficeWorldView.sync(mode,S.get(),L.get(),state);
  if(mode==='office'&&officeCameraPending&&!officeCameraManual&&$('world').classList.contains('zoomed')&&window.OfficeWorldView.getState().length)focusOfficeCamera();
  window.ComputerScreens.sync(mode,L.get(),S.get(),state);
  $('new-mission').disabled=!L.get().enabled;
  $('new-mission').textContent='+ New task';
  $('new-mission').title=L.get().enabled?'Assign a native Codex task.':L.get().warning||'Native runner unavailable.';
  $('camera-view').value=officeView;
  $('camera-angle').value=`${Math.round(officeAngle)}°`;
  if(!storageAvailable)$('storage-note').textContent='Browser storage unavailable. View choices last only for this visit.';
  $('connection-health').textContent=S.get().scannedAt?S.get().partial?'Live / partial':'Live':S.get().warnings.length?'Reader offline':'Connecting';
  const connected=S.get().entries.filter(e=>['running','event-working','event-waiting','adapter-working','adapter-waiting'].includes(e.status));
  const reporting=connected.filter(e=>e.action||e.taskLabel);
  const codexProcess=S.get().entries.some(e=>e.provider==='Codex'&&e.kind==='process'&&e.status==='running');
  const codexEvents=S.get().entries.some(e=>e.provider==='Codex'&&e.kind==='session'&&['event-working','event-waiting','adapter-working','adapter-waiting','adapter-idle'].includes(e.status));
  codexHelp.hidden=!codexProcess||codexEvents;
  if(!codexHelp.hidden)codexHelp.textContent='Codex is running, but no session activity has reached the office. In Codex, open /hooks and review or trust the Agent World hooks, then start or resume a session. Until events arrive, the office cannot show that worker’s task.';
  $('activity-connection').textContent=`${connected.length} local sessions/processes · ${reporting.length} reporting activity${S.get().partial?' · partial inventory':''}`;
  $('mobile-flow-count').textContent=`${reporting.length} active reports`;
  $('world-title').textContent='The living office';$('world-count').textContent='AUTOMATIC';
  $('source-note').textContent=`${S.note()} ${L.get().enabled?'Native runner connected. '+L.get().workspace:L.get().warning} Claude live session events are read when available. Codex activity requires a trusted local hook or a fresh readable turn log. Recorded runs are read-only journal entries.`;
  $('world-status').textContent='Observing local agents';$('game-prompt').textContent='Automatic office / Select a coworker or computer to inspect their work';

}
async function pollObserved() {
  const generation = ++pollGeneration;
  try {
    const response = await fetch('/api/runs', { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!response.ok) throw new Error('Reader unavailable');
    const data = await response.json();
    if (!Array.isArray(data.runs) || data.runs.length > 100 || data.runs.some(r => !r || ['name', 'phase', 'tier', 'status', 'updatedAt'].some(k => typeof r[k] !== 'string') || !Number.isFinite(Date.parse(r.updatedAt)) || typeof r.stale !== 'boolean')) throw new Error('Invalid checkpoint response');
    if (generation !== pollGeneration || mode !== 'office') return;
    observed = data.runs; observedMessage = `${observed.length} recorded runs. ${data.unreadable || 0} unreadable checkpoint(s). Per-agent actions and completion percentages are unknown.`;
  } catch (_) {
    if (generation !== pollGeneration || mode !== 'office') return;
    observed = []; observedMessage = 'Checkpoint reader unavailable. Start scripts/agent_world.py locally, then return to Live workspace. No live activity is inferred.';
  }
  render();
}
function startOffice(){
  window.OfficeWorldView.setView(officeView);
  window.OfficeWorldView.setAngle(officeAngle);
  L.activate(true,render);S.activate(true,render);pollObserved();render();setOfficeZoom(officePhone.matches,true);
}
$('camera-view').addEventListener('change',event=>{
  officeView=event.target.value;window.OfficeWorldView.setView(officeView);render();cameraRevision++;officeCameraManual=true;officeCameraPending=false;
  if($('world').classList.contains('zoomed'))focusOfficeCamera();
  try{localStorage.setItem(VIEW_STORAGE,officeView);}catch(_){storageAvailable=false;render();}
  announce(officeView==='top-down'?'Top-down office view.':'Isometric office view.');
});
function rotateOffice(next,save=true){
  officeAngle=((Math.round(next)%360)+360)%360;window.OfficeWorldView.setAngle(officeAngle);render();cameraRevision++;officeCameraManual=true;officeCameraPending=false;
  if($('world').classList.contains('zoomed'))focusOfficeCamera();
  if(save)try{localStorage.setItem(ANGLE_STORAGE,String(officeAngle));}catch(_){storageAvailable=false;render();}
}
$('camera-left').addEventListener('click',()=>rotateOffice(officeAngle-30));
$('camera-right').addEventListener('click',()=>rotateOffice(officeAngle+30));
const feedButton=$('office-feed-toggle'),feed=$('office-sidebar');
$('team-toggle').before(feedButton);
feed.querySelector('.sidebar-body').append($('work-tray'),document.querySelector('.source-details'));
function setFeedOpen(open,moveFocus=true){if(open&&!$('team-panel').hidden)closeInspector(false);feed.classList.toggle('open',open);feedButton.setAttribute('aria-expanded',String(open));if(moveFocus)(open?$('office-sidebar-close'):feedButton).focus({preventScroll:true});}
feedButton.addEventListener('click',()=>setFeedOpen(true));
$('office-sidebar-close').addEventListener('click',()=>setFeedOpen(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&feed.classList.contains('open')&&!document.querySelector('dialog[open]')){event.preventDefault();setFeedOpen(false);}});
$('conference-focus').addEventListener('click',()=>{
  if(cameraScale===1)setOfficeZoom(true);
  const revision=++cameraRevision;officeCameraManual=true;officeCameraPending=false;
  requestAnimationFrame(()=>{const scene=window.OfficeWorldView.getSceneLayout(),room=window.OfficeWorldView.getLayout().conference;
    if(revision!==cameraRevision)return;
    const point=scene.project(room.x+room.width/2,room.y+room.height/2);
    centerOfficePoint(point,scene);
    announce('Conference room centered.');
  });
});
const cameraFloor=document.querySelector('svg.office');let panDrag=null;
cameraFloor.addEventListener('pointerdown',event=>{if(event.button!==0)return;panDrag={id:event.pointerId,x:event.clientX,y:event.clientY,cameraX,cameraY};cameraFloor.setPointerCapture(event.pointerId);});
cameraFloor.addEventListener('pointermove',event=>{if(!panDrag||event.pointerId!==panDrag.id)return;cameraX=panDrag.cameraX+event.clientX-panDrag.x;cameraY=panDrag.cameraY+event.clientY-panDrag.y;officeCameraManual=true;officeCameraPending=false;cameraRevision++;applyOfficeCamera();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])cameraFloor.addEventListener(type,event=>{if(panDrag&&event.pointerId===panDrag.id)panDrag=null;});
let inspectedSession=null;
$('local-missions').addEventListener('click',event=>{
  const button=event.target.closest('[data-inspect]'); if(!button)return;
  const actor=Array.from(document.querySelectorAll('.office-character')).find(el=>el.dataset.office===`session-${button.dataset.inspect}`);
  if(actor){actor.click(); return;}
  const entry=S.get().entries.find(e=>e.id===button.dataset.inspect); if(!entry)return;
  inspectedSession=entry.id;
  $('session-record-title').textContent=entry.label;
  $('session-record-detail').textContent=`${entry.provider} / ${entry.status} / ${entry.workspace} / ${entry.evidence}`;
  $('session-record-dialog').showModal(); $('session-record-close').focus();
});
$('session-record-close').addEventListener('click',()=>$('session-record-dialog').close());
$('session-record-dialog').addEventListener('close',()=>{const button=Array.from($('local-missions').querySelectorAll('[data-inspect]')).find(el=>el.dataset.inspect===inspectedSession);(button||$('team-toggle')).focus(); inspectedSession=null;});
let inspectorReturn=null;
function showInspector(returnTo) {const taskTrigger=document.activeElement?.dataset?.flowAgent?document.activeElement:null,fromFeed=feed.classList.contains('open');if(fromFeed)setFeedOpen(false,false);inspectorReturn=fromFeed?feedButton:taskTrigger||returnTo||$('team-toggle');$('team-panel').hidden=false;document.querySelector('.workspace-grid').classList.add('inspector-open');$('team-toggle').setAttribute('aria-expanded','true');$('team-close').focus({preventScroll:true});}
function closeInspector(moveFocus=true) {$('team-panel').hidden=true;document.querySelector('.workspace-grid').classList.remove('inspector-open');$('team-toggle').setAttribute('aria-expanded','false');if(moveFocus){const currentSession=inspectorReturn?.dataset?.inspect?Array.from($('local-missions').querySelectorAll('[data-inspect]')).find(button=>button.dataset.inspect===inspectorReturn.dataset.inspect):null;const currentFlow=inspectorReturn?.dataset?.flowAgent?Array.from($('task-flow-list').querySelectorAll('[data-flow-agent]')).find(button=>button.dataset.flowAgent===inspectorReturn.dataset.flowAgent):null;(currentSession||currentFlow||inspectorReturn?.isConnected&&inspectorReturn||$('team-toggle')).focus({preventScroll:true});}}
$('team-toggle').addEventListener('click',()=>{$('team-panel').hidden?showInspector($('team-toggle')):closeInspector();});
$('team-close').addEventListener('click',closeInspector);
$('world').addEventListener('click',event=>{const actor=event.target.closest('.character');if(actor&&mode==='office')showInspector(actor);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('team-panel').hidden&&!document.querySelector('dialog[open]')){event.preventDefault();closeInspector();}});
function focusOfficeCamera() {
  const v=window.OfficeWorldView.getSceneLayout(),g=window.OfficeWorldView.getLayout(),crew=window.OfficeWorldView.getState(),actor=crew.find(a=>a.working)||crew[0],point=actor||{x:570,y:445+g.topExtra},revision=cameraRevision;
  if(actor)officeCameraPending=false;
  requestAnimationFrame(()=>{if(revision!==cameraRevision||mode!=='office'||cameraScale===1||!v.project)return;centerOfficePoint(v.project(point.x,point.y),v);});
}
function applyOfficeCamera(){
  const floor=$('world'),viewport=floor.parentElement;
  cameraX=Math.max(-Math.max(0,(floor.clientWidth*cameraScale-viewport.clientWidth)/2),Math.min(Math.max(0,(floor.clientWidth*cameraScale-viewport.clientWidth)/2),cameraX));
  cameraY=Math.max(-Math.max(0,(floor.clientHeight*cameraScale-viewport.clientHeight)/2),Math.min(Math.max(0,(floor.clientHeight*cameraScale-viewport.clientHeight)/2),cameraY));
  floor.style.setProperty('--camera-scale',String(cameraScale));floor.style.setProperty('--camera-x',`${cameraX}px`);floor.style.setProperty('--camera-y',`${cameraY}px`);
  floor.classList.toggle('zoomed',cameraScale>1);$('zoom-level').textContent=`${Math.round(cameraScale*100)}%`;
  $('zoom-out').disabled=cameraScale<=1;$('zoom-in').disabled=cameraScale>=3.5;
  $('map-zoom').setAttribute('aria-pressed',String(cameraScale>1));$('map-zoom').textContent=cameraScale>1?'Whole office':'Closer view';
}
function centerOfficePoint(point,scene){
  const floor=$('world');cameraX=(.5-point.x/scene.width)*floor.clientWidth*cameraScale;cameraY=(.5-point.y/scene.height)*floor.clientHeight*cameraScale;applyOfficeCamera();
}
function zoomOffice(next,clientX,clientY){
  const scale=Math.max(1,Math.min(3.5,Math.round(next*100)/100));if(scale===cameraScale)return;
  const rect=$('world').parentElement.getBoundingClientRect(),x=(clientX??rect.left+rect.width/2)-rect.left-rect.width/2,y=(clientY??rect.top+rect.height/2)-rect.top-rect.height/2;
  cameraX=x-(x-cameraX)*scale/cameraScale;cameraY=y-(y-cameraY)*scale/cameraScale;cameraScale=scale;
  cameraRevision++;officeCameraManual=true;officeCameraPending=false;applyOfficeCamera();
}
function preferredCloseScale(){
  if(!officePhone.matches)return 2.2;
  const floor=$('world'),viewport=floor.parentElement;
  return Math.min(3.25,Math.max(2.2,Math.round(viewport.clientHeight*.73/Math.max(1,floor.clientHeight)*100)/100));
}
function setOfficeZoom(zoomed,automatic=false) {
  cameraRevision++;if(!automatic){officeCameraManual=true;officeCameraPending=false;}
  cameraScale=zoomed?preferredCloseScale():1;cameraX=0;cameraY=0;applyOfficeCamera();
  if(zoomed&&mode==='office'){officeCameraPending=automatic&&window.OfficeWorldView.getState().length===0;focusOfficeCamera();}
}
$('map-zoom').addEventListener('click',()=>setOfficeZoom(!$('world').classList.contains('zoomed')));
$('zoom-in').addEventListener('click',()=>zoomOffice(cameraScale*1.25));
$('zoom-out').addEventListener('click',()=>zoomOffice(cameraScale/1.25));
const officeViewport=$('world').parentElement;
officeViewport.addEventListener('wheel',event=>{if(mode!=='office')return;event.preventDefault();zoomOffice(cameraScale*(event.deltaY<0?1.12:1/1.12),event.clientX,event.clientY);},{passive:false});
$('world').addEventListener('keydown',event=>{if(event.key==='+'||event.key==='='){event.preventDefault();zoomOffice(cameraScale*1.25);}else if(event.key==='-'){event.preventDefault();zoomOffice(cameraScale/1.25);}else if(event.key==='0'){event.preventDefault();setOfficeZoom(false);}});
const officePhone=matchMedia('(max-width:560px)');officePhone.addEventListener('change',()=>{if(mode==='office'){officeCameraManual=false;setOfficeZoom(officePhone.matches,true);}});
const officeResizeObserver=new ResizeObserver(()=>{if(officePhone.matches&&!officeCameraManual&&cameraScale>1){const scale=preferredCloseScale();if(scale!==cameraScale){cameraScale=scale;focusOfficeCamera();}}applyOfficeCamera();$('world').style.setProperty('--actor-scale',String(document.body.dataset.mode==='office'?Math.max(.44,Math.min(.64,$('world').clientWidth/(window.OfficeWorldView?.getSceneLayout().width||1280)*.98)):Math.max(.42,Math.min(1.2,$('world').clientWidth/1280))));});
officeResizeObserver.observe($('world'));officeResizeObserver.observe(officeViewport);
let lastCameraFollow=0;
function followActiveWorker(now){
  requestAnimationFrame(followActiveWorker);
  if(now-lastCameraFollow<80||!officePhone.matches||officeCameraManual||cameraScale<=1||document.hidden)return;
  lastCameraFollow=now;
  const crew=window.OfficeWorldView.getState(),actor=crew.find(a=>a.awaitingHuman)||crew.find(a=>a.working),scene=window.OfficeWorldView.getSceneLayout();
  if(!actor||!scene.project)return;
  const point=scene.project(actor.x,actor.y),floor=$('world'),viewport=floor.parentElement;
  const onScreenX=viewport.clientWidth/2+cameraX+(point.x/scene.width-.5)*floor.clientWidth*cameraScale;
  const onScreenY=viewport.clientHeight/2+cameraY+(point.y/scene.height-.5)*floor.clientHeight*cameraScale;
  let moved=false;
  if(onScreenX<viewport.clientWidth*.35||onScreenX>viewport.clientWidth*.65){
    const target=(.5-point.x/scene.width)*floor.clientWidth*cameraScale;
    cameraX+=(target-cameraX)*.28;moved=true;
  }
  if(onScreenY<viewport.clientHeight*.35||onScreenY>viewport.clientHeight*.65){
    const target=(.5-point.y/scene.height)*floor.clientHeight*cameraScale;
    cameraY+=(target-cameraY)*.28;moved=true;
  }
  if(moved)applyOfficeCamera();
}
requestAnimationFrame(followActiveWorker);
function accessOptions() { const canEdit = L.get().allowEdits && ['planner', 'builder'].includes($('mission-role').value); $('mission-access').options[1].disabled = !canEdit; if (!canEdit) $('mission-access').value = 'read-only'; }
$('mission-role').addEventListener('change', accessOptions);
$('new-mission').addEventListener('click',()=>{$('mission-role').value=selected;$('mission-access').value='read-only';accessOptions();$('mission-description').textContent=`Assign a native Codex task in ${L.get().workspace}. Choose a specialist and access.`;$('mission-note').textContent='Uses your Codex account. Local edits are possible when selected. Commits, publication, and deployment are not part of task execution.';$('mission-error').textContent='';$('mission-title').setCustomValidity('');$('mission-dialog').showModal();$('mission-title').focus();});$('close-dialog').addEventListener('click',()=>$('mission-dialog').close());
$('mission-title').addEventListener('input', () => $('mission-title').setCustomValidity(''));
$('mission-form').addEventListener('submit',async event=>{event.preventDefault();$('launch-mission').disabled=true;$('mission-error').textContent='';try{await L.submit($('mission-title').value,$('mission-brief').value,$('mission-role').value,$('mission-access').value);render();$('mission-dialog').close();event.target.reset();$('work-tray').open=true;setFeedOpen(true);announce('Native task queued.');}catch(error){$('mission-error').textContent=error.message;}finally{$('launch-mission').disabled=false;}});
startOffice();
setInterval(()=>{if(!document.hidden)pollObserved();},5000);
