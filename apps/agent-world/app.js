/* Agent World UI. Untrusted text is rendered only through textContent. */
'use strict';
const E = window.AgentWorld;
const L = window.LiveAgents;
const S = window.LocalSessions;
const $ = id => document.getElementById(id);
const VIEW_STORAGE='agent-world.office-view.v1';
const ANGLE_STORAGE='agent-world.office-angle.v1';
const ELEVATION_STORAGE='agent-world.office-elevation.v1';
const GRAPHICS_STORAGE='agent-world.graphics.v1',GRAPHICS_STYLES=['illustrated','polished','pixel','low-poly'];
const REFERENCE_CAMERA={yaw:290,elevation:35};
let officeGraphics='polished';
try{const saved=localStorage.getItem(GRAPHICS_STORAGE);if(GRAPHICS_STYLES.includes(saved))officeGraphics=saved;}catch(_){/* Preferences remain usable in memory when storage is blocked. */}
const state={missions:[],events:[],paused:false};
let storageAvailable=true;
let officeView='isometric';
let officeAngle=REFERENCE_CAMERA.yaw;
let officeElevation=REFERENCE_CAMERA.elevation;
try{const saved=localStorage.getItem(VIEW_STORAGE),storedAngle=localStorage.getItem(ANGLE_STORAGE),angle=Number(storedAngle),storedElevation=localStorage.getItem(ELEVATION_STORAGE),elevation=Number(storedElevation);if(['isometric','top-down'].includes(saved))officeView=saved;if(storedAngle!==null&&Number.isFinite(angle)&&angle>=0&&angle<360)officeAngle=angle;if(storedElevation!==null&&Number.isFinite(elevation)&&elevation>=15&&elevation<=70)officeElevation=elevation;}catch(_){storageAvailable=false;}
// An explicit reference link opens the rebuilt native scene without replacing saved preferences.
if(new URLSearchParams(window.location.search).get('office')==='reference'){
  officeView='isometric';officeGraphics='polished';officeAngle=REFERENCE_CAMERA.yaw;officeElevation=REFERENCE_CAMERA.elevation;
}
let officeCameraPending=false,officeCameraManual=false,cameraRevision=0,cameraScale=1,cameraX=0,cameraY=0;
let mode = 'office', selected = 'planner', observed = [], observedMessage = 'Connecting to the local checkpoint reader…', pollGeneration = 0;
function node(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
const codexHelp=node('p','connection-help');codexHelp.id='codex-activity-help';codexHelp.hidden=true;$('office-sidebar').querySelector('.sidebar-body').prepend(codexHelp);
function announce(text) { $('announcement').textContent = text; }
function renderCrew(){document.body.dataset.mode='office';$('office-characters').hidden=false;$('office-roster').hidden=false;$('office-hud').hidden=false;$('crew-title').textContent='Employee profile';$('team-close').textContent='Close profile';}
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
  window.OfficeWorldView.setGraphicsStyle(officeGraphics);
  window.OfficeWorldView.sync(mode,S.get(),L.get(),state);
  document.body.dataset.graphicsStyle=officeGraphics;
  $('graphics-style').value=officeGraphics;
  const graphicsFallback=!window.Office3D?.available||window.Office3D.diagnostics().contextLost||officeView==='top-down';
  $('graphics-fallback').hidden=!graphicsFallback||!['polished','low-poly'].includes(officeGraphics);
  window.ConferenceInbox.sync();
  if(mode==='office'&&officeCameraPending&&!officeCameraManual&&$('world').classList.contains('zoomed')&&window.OfficeWorldView.getState().length)focusOfficeCamera();
  window.ComputerScreens.sync(mode,L.get(),S.get(),state);
  $('new-mission').disabled=!L.get().enabled;
  $('new-mission').textContent='+ New task';
  $('new-mission').title=L.get().enabled?'Assign a native Codex task.':L.get().warning||'Native runner unavailable.';
  $('camera-view').value=officeView;
  $('camera-angle').value=`${Math.round(officeAngle)}°`;
  $('camera-elevation').value=`${officeView==='top-down'?90:Math.round(officeElevation)}°`;
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
  $('camera-view').querySelector('[value=isometric]').textContent=window.Office3D?.available?'3D office':'Isometric';
  if(!window.Office3D?.available)document.querySelector('.camera-hint').textContent='3D unavailable · Isometric view';
  window.addEventListener('office3dfallback',()=>{$('camera-view').querySelector('[value=isometric]').textContent='Isometric';render();announce('3D graphics unavailable. The office is using the isometric view. Refresh to retry 3D.');});
  window.OfficeWorldView.setView(officeView);
  window.OfficeWorldView.setAngle(officeAngle);
  window.OfficeWorldView.setElevation(officeElevation);
  L.activate(true,render);S.activate(true,render);pollObserved();render();setOfficeZoom(officePhone.matches,true);
}
$('graphics-style').addEventListener('change',event=>{
  officeGraphics=GRAPHICS_STYLES.includes(event.target.value)?event.target.value:'illustrated';
  render();
  const label=$('graphics-style').selectedOptions[0].textContent;
  $('graphics-state').textContent=`Graphics changed to ${label}.`;
  try{localStorage.setItem(GRAPHICS_STORAGE,officeGraphics);}catch(_){storageAvailable=false;}
});
$('camera-view').addEventListener('change',event=>{
  if(event.target.value==='reference'){
    officeView='isometric';officeAngle=REFERENCE_CAMERA.yaw;officeElevation=REFERENCE_CAMERA.elevation;
    window.OfficeWorldView.setView(officeView);window.OfficeWorldView.setAngle(officeAngle);window.OfficeWorldView.setElevation(officeElevation);
    render();setOfficeZoom(false);
    try{localStorage.setItem(VIEW_STORAGE,officeView);localStorage.setItem(ANGLE_STORAGE,String(officeAngle));localStorage.setItem(ELEVATION_STORAGE,String(officeElevation));}catch(_){storageAvailable=false;render();}
    announce('Reference office view.');return;
  }
  officeView=event.target.value;window.OfficeWorldView.setView(officeView);render();cameraRevision++;officeCameraManual=true;officeCameraPending=false;
  if($('world').classList.contains('zoomed'))focusOfficeCamera();
  try{localStorage.setItem(VIEW_STORAGE,officeView);}catch(_){storageAvailable=false;render();}
  announce(officeView==='top-down'?'Top-down office view.':window.Office3D?.available&&!window.Office3D.diagnostics().contextLost?'3D office view.':'Isometric office view.');
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
const cameraFloor=document.querySelector('svg.office');let cameraDrag=null;
cameraFloor.addEventListener('pointerdown',event=>{if(event.button!==0||mode!=='office')return;event.preventDefault();cameraDrag={id:event.pointerId,x:event.clientX,y:event.clientY,cameraX,cameraY,angle:officeAngle,elevation:officeElevation,mode:officeView==='top-down'||event.shiftKey?'pan':'orbit',moved:false};cameraFloor.setPointerCapture(event.pointerId);});
cameraFloor.addEventListener('pointermove',event=>{if(!cameraDrag||event.pointerId!==cameraDrag.id)return;const dx=event.clientX-cameraDrag.x,dy=event.clientY-cameraDrag.y;if(Math.hypot(dx,dy)<3&&!cameraDrag.moved)return;cameraDrag.moved=true;officeCameraManual=true;officeCameraPending=false;cameraRevision++;
  if(cameraDrag.mode==='pan'){cameraX=cameraDrag.cameraX+dx;cameraY=cameraDrag.cameraY+dy;applyOfficeCamera();return;}
  officeAngle=((Math.round((cameraDrag.angle+dx*.45)*10)/10%360)+360)%360;
  officeElevation=Math.max(15,Math.min(70,Math.round((cameraDrag.elevation-dy*.25)*10)/10));
  window.OfficeWorldView.setAngle(officeAngle);window.OfficeWorldView.setElevation(officeElevation);render();applyOfficeCamera();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])cameraFloor.addEventListener(type,event=>{if(!cameraDrag||event.pointerId!==cameraDrag.id)return;const dragged=cameraDrag;cameraDrag=null;if(dragged.mode==='orbit'&&dragged.moved)try{localStorage.setItem(ANGLE_STORAGE,String(officeAngle));localStorage.setItem(ELEVATION_STORAGE,String(officeElevation));}catch(_){storageAvailable=false;render();}});
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
  const v=window.OfficeWorldView.getSceneLayout(),g=window.OfficeWorldView.getLayout(),crew=window.OfficeWorldView.getState(),actor=crew.find(a=>a.working)||crew[0],point=actor||g.breakout?.point||g.lobby(0),revision=cameraRevision;
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
let officeResizeFrame=0;
const officeResizeObserver=new ResizeObserver(()=>{if(officePhone.matches&&!officeCameraManual&&cameraScale>1){const scale=preferredCloseScale();if(scale!==cameraScale){cameraScale=scale;focusOfficeCamera();}}applyOfficeCamera();$('world').style.setProperty('--actor-scale',String(document.body.dataset.mode==='office'?Math.max(.44,Math.min(.64,$('world').clientWidth/(window.OfficeWorldView?.getSceneLayout().width||1280)*.98)):Math.max(.42,Math.min(1.2,$('world').clientWidth/1280))));});
officeResizeObserver.observe($('world'));officeResizeObserver.observe(officeViewport);
new ResizeObserver(()=>{if(!officeResizeFrame&&window.Office3D?.diagnostics?.().active)officeResizeFrame=requestAnimationFrame(()=>{officeResizeFrame=0;render();});}).observe(officeViewport);
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

/* An original local score; sound starts only from the music controls. */
(()=>{
  const menu=$('office-music'),button=$('music-toggle'),slider=$('music-volume');
  const Audio=window.AudioContext||window.webkitAudioContext,volumeKey='agent-world.music-volume.v1';
  const bpm=96,sixteenth=60/bpm/4;
  const chords=[[60,64,67,71],[59,62,67,69],[57,60,64,67],[57,60,64,65],[57,60,62,65],[55,59,62,67],[55,59,64,67],[57,60,64,65]];
  const bass=[48,43,45,41,50,43,40,41];
  const melody=[[76,0,79,81,79,0,76,74],[71,0,74,76,74,0,71,67],[72,0,76,79,76,0,74,72],[69,0,72,76,74,0,72,69],[74,0,77,79,77,0,74,72],[71,0,74,79,77,0,74,71],[76,0,79,83,81,0,79,76],[72,0,76,79,76,74,72,0]];
  let context=null,master=null,tone=null,noise=null,timer=null,step=0,nextAt=0,scheduled=0;
  let wanted=false,starting=false,generation=0,volume=25,message='';
  const sources=new Set();
  try{const raw=localStorage.getItem(volumeKey),saved=Number(raw);if(raw!==null&&raw.trim()!==''&&Number.isFinite(saved)&&saved>=0&&saved<=100)volume=Math.round(saved);}catch(_){}
  const playing=()=>!!timer&&context?.state==='running'&&!document.hidden;
  function renderMusic(){
    const active=playing();slider.value=String(volume);$('music-volume-label').value=`${volume}%`;
    $('music-state').textContent=!Audio?'Unavailable':starting?'Starting':active?volume?'On':'Muted':wanted?'Paused':'Off';
    button.textContent=starting||active?'Pause music':wanted?'Resume music':'Play music';
    button.setAttribute('aria-pressed',String(starting||active));button.disabled=!Audio;slider.disabled=!Audio;
    $('music-status').textContent=!Audio?'Background music is unavailable in this browser.':message||(!wanted?'Press Play to start.':starting?'Starting your music…':active?volume?'Sunny workday is playing.':'Music is muted.':'Music is paused.');
  }
  function halt(){
    if(timer!==null)clearInterval(timer);timer=null;
    if(context&&master){const now=context.currentTime;master.gain.cancelScheduledValues(now);master.gain.setTargetAtTime(0,now,.008);for(const source of sources){try{source.stop(now+.03);}catch(_){}}}
    sources.clear();
  }
  function graph(){
    if(context&&context.state!=='closed')return;
    context=new Audio();const created=context;master=context.createGain();master.gain.value=0;master.connect(context.destination);
    tone=context.createBiquadFilter();tone.type='lowpass';tone.frequency.value=2300;tone.Q.value=.35;tone.connect(master);
    noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const samples=noise.getChannelData(0);let seed=0xdecafbad;
    for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
    context.onstatechange=()=>{if(context!==created)return;if(context.state!=='running')halt();renderMusic();};
  }
  function finish(source,nodes){sources.add(source);source.onended=()=>{sources.delete(source);for(const node of [source,...nodes])node.disconnect();};}
  const frequency=midi=>440*2**((midi-69)/12);
  function note(midi,at,length,level,wave='sine'){
    const source=context.createOscillator(),gain=context.createGain();source.type=wave;source.frequency.value=frequency(midi);
    gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(level,at+.018);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    source.connect(gain);gain.connect(tone);finish(source,[gain]);source.start(at);source.stop(at+length+.02);
  }
  function tap(at,hat){
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noise;
    filter.type=hat?'highpass':'bandpass';filter.frequency.value=hat?5400:1600;filter.Q.value=.7;
    const length=hat?.045:.085;gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(hat?.018:.035,at+.004);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    source.connect(filter);filter.connect(gain);gain.connect(master);finish(source,[filter,gain]);source.start(at,(step*131%700)/1000);source.stop(at+length+.01);
  }
  function kick(at){
    const source=context.createOscillator(),gain=context.createGain();source.frequency.setValueAtTime(112,at);source.frequency.exponentialRampToValueAtTime(47,at+.14);
    gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(.1,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+.2);
    source.connect(gain);gain.connect(master);finish(source,[gain]);source.start(at);source.stop(at+.22);
  }
  function schedule(){
    if(!wanted||document.hidden||context?.state!=='running')return;
    const now=context.currentTime;if(nextAt<now-.15)nextAt=now+.04;
    for(let count=0;nextAt<now+.15&&count<8;count++){
      const beat=step%16,bar=Math.floor(step/16)%8,phrase=Math.floor(step/128)%4;
      if(beat===0||beat===8)for(const pitch of chords[bar])note(pitch,nextAt,.95,.034);
      if([0,6,8,14].includes(beat))note(bass[bar],nextAt,.34,.1);
      if(beat%2===0){const pitch=melody[bar][beat/2];if(pitch&&!(phrase===3&&bar%2))note(pitch,nextAt,.38,phrase===2?.065:.09,'triangle');}
      if(beat===0||beat===8)kick(nextAt);if(beat===4||beat===12)tap(nextAt,false);if(beat%4===2)tap(nextAt,true);
      step=(step+1)%512;scheduled++;nextAt+=sixteenth;
    }
  }
  async function play(){
    if(!Audio)return;wanted=true;starting=true;message='';const request=++generation;renderMusic();
    if(document.hidden){starting=false;renderMusic();return;}
    try{
      graph();await context.resume();if(request!==generation||!wanted||document.hidden)return;
      if(context.state!=='running')throw new Error('Audio is paused');
      halt();master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);master.gain.setTargetAtTime(volume/100*.6,context.currentTime,.025);
      step=0;nextAt=context.currentTime+.05;schedule();timer=setInterval(schedule,75);starting=false;renderMusic();
    }catch(_){if(request!==generation)return;wanted=false;starting=false;halt();message='Music could not start. Press Play to try again.';renderMusic();}
  }
  function pause(keepChoice=false){
    if(!keepChoice)wanted=false;starting=false;message='';const request=++generation,pausedContext=context;halt();renderMusic();
    if(pausedContext)setTimeout(()=>{if(request===generation&&context===pausedContext&&pausedContext.state!=='closed')pausedContext.suspend().catch(()=>{});},40);
  }
  button.addEventListener('click',()=>{if(starting||playing())pause();else play();});
  slider.addEventListener('input',()=>{volume=Math.max(0,Math.min(100,Number(slider.value)||0));if(master&&playing())master.gain.setTargetAtTime(volume/100*.6,context.currentTime,.025);try{localStorage.setItem(volumeKey,String(volume));}catch(_){}renderMusic();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);else if(wanted)play();});
  window.addEventListener('pagehide',event=>{pause(event.persisted);if(!event.persisted&&context){const old=context;context=null;master=null;tone=null;noise=null;old.close().catch(()=>{});}});
  window.addEventListener('pageshow',event=>{if(event.persisted&&wanted&&!document.hidden)play();});
  document.addEventListener('pointerdown',event=>{if(menu.open&&!menu.contains(event.target))menu.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open&&menu.contains(event.target)){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary').focus();}},true);
  menu.addEventListener('focusout',event=>{if(menu.contains(event.relatedTarget))return;setTimeout(()=>{if(menu.open&&!menu.contains(document.activeElement))menu.open=false;},0);});
  window.OfficeMusic={diagnostics:()=>({available:!!Audio,playing:playing(),wanted,volume,contextState:context?.state||'not-created',schedulerActive:timer!==null,voices:sources.size,scheduledSteps:scheduled})};
  renderMusic();
})();
