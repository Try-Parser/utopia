/* Live workstation UI. App URLs are user-connected and never fetched by the server. */
window.ComputerScreens=(()=>{
  'use strict';
  const M=window.ComputerModel,$=id=>document.getElementById(id),dialog=$('computer-dialog');
  const monitors=new Map(),previews=new Map();let role='builder',station=0,mode='office',source={jobs:[]},sessions={entries:[]},simulation={active:[],events:[],stage:'',title:''};
  let returnTo=null,tab='code',selectedPath=null,patchGeneration=0,transcriptGeneration=0,patchBusy=false,lastPatch=0,patchKey='';
  const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
  const key=()=>`${role}:${station}`;
  const desks=()=>mode==='office'&&window.OfficeWorldView.getWorkstations().length?window.OfficeWorldView.getSceneLayout().stations:window.OfficeWorld.workstations;
  const floor=()=>window.OfficeWorldView.getSceneLayout();
  const seat=()=>window.OfficeWorldView.getWorkstations().find(s=>s.key===key());
  const projection=()=>M.project(role,mode,source,sessions,simulation,mode==='office'?seat()?.occupant||null:station===0?undefined:null);
  function previewState() {
    if(!previews.has(key())){
      const frame=make('iframe','computer-preview');frame.title=`${role} computer ${station+1} local app preview`;frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.referrerPolicy='no-referrer';
      const holder=key()==='builder:0'?$('mini-app-preview'):make('div','mini-workstation-preview');holder.hidden=true;holder.setAttribute('aria-hidden','true');holder.dataset.previewStation=key();if(!holder.isConnected)$('world').append(holder);
      previews.set(key(),{frame,holder,url:'',owner:seat()?.occupant?.id||null});
    }
    return previews.get(key());
  }
  function locatePreview() {
    const preview=previewState().url;
    for(const [id,state] of previews){
      const large=dialog.open&&tab==='preview'&&id===key(),holder=large?$('preview-display'):state.holder;
      state.holder.hidden=!state.url||large;
      const point=desks().find(s=>s.key===id)?.screen;
      if(!point){state.holder.hidden=true;continue;}
      state.holder.style.left=`${(point.x-17)/(floor().width/100)}%`;state.holder.style.top=`${(point.y-9)/(floor().height/100)}%`;
      if(state.url){const frame=state.frame;if(frame.parentElement!==holder)holder.append(frame);frame.tabIndex=large?0:-1;frame.setAttribute('aria-hidden',String(!large));frame.style.transform=large?'none':`scale(${holder.clientWidth/800})`;frame.style.width=large?'100%':'800px';frame.style.height=large?'100%':'500px';}
    }
    $('preview-empty').hidden=Boolean(preview);$('preview-display').hidden=!preview;$('preview-reload').disabled=!preview;
    $('preview-open').hidden=!preview;if(preview)$('preview-open').href=preview;
  }
  function showTab(value) {tab=value;$('computer-code').hidden=tab!=='code';$('computer-preview-tab').hidden=tab!=='preview';$('computer-code-button').setAttribute('aria-pressed',String(tab==='code'));$('computer-preview-button').setAttribute('aria-pressed',String(tab==='preview'));locatePreview();}
  function selectComputer(value,index) {role=value;station=index;syncMonitors();$('computer-role').value=role;$('computer-station').value=String(station);$('preview-url').value=previewState().url;$('preview-error').textContent='';selectedPath=null;patchKey='';patchGeneration++;}
  function open(value,which,button,index=0) {selectComputer(value,index);returnTo=button||$('computers-toggle');if(!dialog.open)dialog.showModal();showTab(which||'code');render();$('computer-close').focus();}
  function render() {
    if(!dialog.open)return;
    const data=projection(),info=window.AgentWorld.ROLES.find(r=>r.id===role);
    $('computer-title').textContent=`${info?.role||'Shared workspace'} / Computer ${station+1}`;$('computer-source').textContent=data.source;$('computer-state').textContent=data.status;$('computer-task').textContent=data.title;$('computer-activity').textContent=data.activity;
    const events=$('computer-events'),scroll=events.scrollTop,nearBottom=events.scrollHeight-events.clientHeight-scroll<30;
    events.replaceChildren();for(const e of (data.events||[]).slice(-30)){const li=make('li');li.append(make('time','',e.at?new Date(e.at).toLocaleTimeString():String(e.time)),make('span','',e.text));events.append(li);}
    if(!events.children.length)events.append(make('li','empty','No task events are available for this computer.'));
    events.scrollTop=nearBottom?events.scrollHeight:scroll;
    const result=$('computer-result'),displayResult=data.result||'Agent output will appear here when reported.';
    if(!data.sessionId){transcriptGeneration++;result.dataset.sessionId='';if(result.textContent!==displayResult)result.textContent=displayResult;}
    if(data.sessionId){
      if(result.dataset.sessionId!==data.sessionId){result.dataset.sessionId=data.sessionId;result.textContent='Reading local session output…';}
      const generation=++transcriptGeneration;
      window.LocalSessions.transcript(data.sessionId).then(value=>{
        if(generation!==transcriptGeneration||!dialog.open||tab!=='code'||projection().sessionId!==data.sessionId)return;
        result.textContent=value.available?(value.entries.map(e=>`[${new Date(e.at).toLocaleTimeString()}] ${e.speaker}\n${e.text}`).join('\n\n')||'No text has been recorded for this session yet.'):value.reason;
      });
    }
    const focus=document.activeElement?.dataset?.changePath,files=$('computer-files');files.replaceChildren();
    for(const change of data.changes||[]){const button=make('button','change-file',`${change.kind} / ${change.path}`);button.type='button';button.dataset.changePath=change.path;button.setAttribute('aria-pressed',String(change.path===selectedPath));button.addEventListener('click',()=>{selectedPath=change.path;patchKey='';render();loadPatch();});files.append(button);}
    if(!files.children.length)files.append(make('p','muted','No previewable file changes were reported for this task.'));
    if(focus)for(const b of files.querySelectorAll('button'))if(b.dataset.changePath===focus)b.focus({preventScroll:true});
    const current=data.jobId&&selectedPath&&data.changes.some(c=>c.path===selectedPath)?`${data.jobId}:${selectedPath}`:'';
    if(current!==patchKey){patchGeneration++;patchKey=current;$('computer-patch').textContent=current?'Loading the reported file diff…':'Select a reported file to see its current workspace diff.';$('computer-patch-note').textContent='Current workspace diffs may include changes made before this task.';lastPatch=0;}
    if(current&&Date.now()-lastPatch>3500)loadPatch();
    locatePreview();
  }
  async function loadPatch() {
    if(patchBusy||!dialog.open||tab!=='code')return;
    const data=projection(),index=(data.changes||[]).findIndex(c=>c.path===selectedPath);if(!data.jobId||index<0)return;
    patchBusy=true;lastPatch=Date.now();const generation=patchGeneration;
    try {
      const response=await fetch(`/api/live/missions/${data.jobId}/changes/${index}`,{cache:'no-store',headers:{'X-Agent-World-Token':source.token},signal:AbortSignal.timeout(6000)});
      if(!response.ok)throw new Error();const value=await response.json();
      if(typeof value.patch!=='string'||value.patch.length>24000||typeof value.note!=='string'||value.note.length>500||typeof value.truncated!=='boolean')throw new Error();
      if(generation!==patchGeneration||!dialog.open)return;
      $('computer-patch').textContent=value.patch||'No text difference is available.';$('computer-patch-note').textContent=`${value.note}${value.truncated?' Preview truncated.':''}`;
    } catch(_){if(generation===patchGeneration&&dialog.open){$('computer-patch').textContent='Diff reader unavailable. Refresh this file after reconnecting.';}}
    finally{patchBusy=false;}
  }
  function syncMonitors() {
    const current=desks(),keys=new Set(current.map(s=>s.key));
    for(const [id,button]of monitors)if(!keys.has(id)){button.remove();monitors.delete(id);const preview=previews.get(id);if(preview){preview.frame.src='about:blank';preview.frame.remove();preview.holder.remove();previews.delete(id);}}
    for(const seat of current){
      let button=monitors.get(seat.key);
      if(!button){const info=window.AgentWorld.ROLES.find(r=>r.id===seat.role);button=make('button','desk-screen');button.type='button';button.dataset.computer=seat.role;button.dataset.station=String(seat.index);button.setAttribute('aria-label',`Open ${info?.role||'Shared workspace'} computer ${seat.index+1} code and activity`);button.append(make('span','monitor-state','IDLE'));button.addEventListener('click',()=>open(seat.role,'code',button,seat.index));$('computer-screens').append(button);monitors.set(seat.key,button);}
      button.style.left=`${seat.screen.x/(floor().width/100)}%`;button.style.top=`${seat.screen.y/(floor().height/100)}%`;
    }
    const choices=current.filter(s=>s.role===role);if(!choices.some(s=>s.index===station)){station=0;selectedPath=null;patchKey='';patchGeneration++;$('preview-url').value=previewState().url;$('preview-error').textContent='';}
    const selector=$('computer-station');if(selector.options.length!==choices.length){selector.replaceChildren(...choices.map(s=>{const option=make('option','',`Computer ${s.index+1}`);option.value=String(s.index);return option;}));}selector.value=String(station);
  }
  syncMonitors();
  $('computers-toggle').addEventListener('click',()=>open(role,'code',$('computers-toggle'),station));
  $('computer-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{patchGeneration++;locatePreview();if(returnTo?.isConnected)returnTo.focus({preventScroll:true});});
  $('computer-role').addEventListener('change',event=>{selectComputer(event.target.value,station);render();});
  $('computer-station').addEventListener('change',event=>{selectComputer(role,Number(event.target.value));render();});
  $('computer-code-button').addEventListener('click',()=>{showTab('code');render();});$('computer-preview-button').addEventListener('click',()=>showTab('preview'));
  $('preview-form').addEventListener('submit',event=>{event.preventDefault();try{const state=previewState();state.url=M.previewURL($('preview-url').value,new URL(location.href).port);state.frame.src=state.url;$('preview-error').textContent='';locatePreview();}catch(error){$('preview-error').textContent=error.message;}});
  $('preview-reload').addEventListener('click',()=>{const state=previewState();if(state.url)state.frame.src=state.url;});
  new ResizeObserver(locatePreview).observe($('world'));
  setInterval(()=>{if(dialog.open&&!document.hidden){render();loadPatch();}},4000);
  function sync(nextMode,live,inventory,state){
    if(mode!==nextMode){patchGeneration++;selectedPath=null;patchKey='';}
    mode=nextMode;source=live;sessions=inventory;
    const mission=state.missions.find(m=>m.status==='active');simulation={title:mission?.title||'',active:mission?window.AgentWorld.stage(mission).roles:[],stage:mission?window.AgentWorld.stage(mission).label:'',events:state.events.slice(0,10).reverse()};
    syncMonitors();
    const seats=window.OfficeWorldView.getWorkstations();
    for(const desk of desks()){
      const occupant=seats.find(s=>s.key===desk.key)?.occupant||null;
      const data=M.project(desk.role,mode,source,sessions,simulation,mode==='office'?occupant:desk.index===0?undefined:null),button=monitors.get(desk.key);
      button.querySelector('.monitor-state').textContent=data.changes?.length?`${data.changes.length} FILES`:['running','working'].includes(data.status)?'WORK':data.status==='Simulating'?'SIM':data.status==='Turn complete'?'DONE':'IDLE';button.classList.toggle('screen-working',['running','working','Simulating'].includes(data.status));button.title=`Computer ${desk.index+1} / ${occupant?.label||data.title} / ${data.source} / ${data.activity}`;
      const preview=previews.get(desk.key);
      if(mode==='office'&&preview&&preview.owner!==(occupant?.id||null)){preview.owner=occupant?.id||null;preview.url='';preview.frame.src='about:blank';if(desk.key===key()){$('preview-url').value='';$('preview-error').textContent='Computer assignment changed. Connect the app for its new occupant.';}}
    }
    locatePreview();render();
  }
  return {sync,open};
})();
