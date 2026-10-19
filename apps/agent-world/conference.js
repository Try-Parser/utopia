/* Private human-input inbox. Replies leave the browser only for opt-in adapters. */
window.ConferenceInbox=(()=>{
  'use strict';
  const $=id=>document.getElementById(id),sessions=window.LocalSessions,dialog=$('conference-dialog'),list=$('conference-list'),answer=$('conference-answer');
  const questions=new Map(),pending=new Map(),drafts=new Map();
  let selected=null,current=null,revision=0,opener=null,busy=false;
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  const waiting=()=>sessions.get().entries.filter(e=>e.kind==='session'&&e.awaitingHuman&&['event-waiting','adapter-waiting'].includes(e.status));
  const entry=id=>waiting().find(e=>e.id===id);
  const hex=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
  const valid=q=>q&&typeof q.available==='boolean'&&(q.available?hex(q.questionId)&&typeof q.text==='string'&&q.text.length>0&&q.text.length<=8000&&Array.isArray(q.choices)&&q.choices.length<=12&&q.choices.every(c=>typeof c==='string'&&c.length<=200)&&['adapter','copy'].includes(q.delivery)&&(q.answer===null||q.answer&&hex(q.answer.id)&&['queued','acknowledged'].includes(q.answer.status)):typeof q.reason==='string'&&q.reason.length<=200);
  function remember(map,key,value){map.delete(key);map.set(key,value);while(map.size>24)map.delete(map.keys().next().value);}
  function status(text){$('conference-status').textContent=text;}
  async function request(path,data){
    const token=sessions.get().token;if(typeof token!=='string'||!token)throw Error('Reconnect local sessions to continue.');
    const response=await fetch(path,{method:data===undefined?'GET':'POST',cache:'no-store',headers:{'X-Agent-World-Token':token,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(6000)});
    const value=await response.json();if(!response.ok)throw Error(typeof value.error==='string'?value.error.slice(0,200):'The session could not accept this request.');return value;
  }
  async function question(id,force=false){
    if(!entry(id))return {available:false,reason:'This session is no longer waiting for an answer.'};
    if(pending.has(id))return pending.get(id);
    const cached=questions.get(id);if(!force&&cached&&Date.now()-cached.at<1000)return cached.value;
    const token=sessions.get().token;
    const promise=request(`/api/sessions/${id}/question`).then(value=>{
      if(!valid(value))throw Error('The question reader returned an invalid response.');
      if(token!==sessions.get().token||!entry(id))return {available:false,reason:'This session is no longer waiting for an answer.'};
      remember(questions,id,{at:Date.now(),value});return value;
    }).catch(error=>({available:false,reason:error.name==='TimeoutError'?'The question reader timed out. Try again.':error.message||'Question reader unavailable.'})).finally(()=>pending.delete(id));
    pending.set(id,promise);return promise;
  }
  function controls(){
    const live=!!selected&&!!entry(selected),available=live&&current?.available;
    const sent=!!current?.answer;
    answer.disabled=!available;answer.readOnly=busy||sent;
    $('conference-send').hidden=!available||current.delivery!=='adapter';
    $('conference-send').disabled=busy||sent||!answer.value.trim()||!live;
    $('conference-copy').disabled=busy||!live||!answer.value.trim();
  }
  function showQuestion(q){
    const changed=!current?.available||!q.available||current.questionId!==q.questionId;
    const previous=current;current=q;
    if(changed){
      $('conference-question-text').textContent=q.available?q.text:q.reason;
      $('conference-choices').replaceChildren();
      answer.value=q.available?drafts.get(`${selected}:${q.questionId}`)||'':'';
      if(q.available)for(const choice of q.choices){const button=node('button',choice);button.type='button';button.addEventListener('click',()=>{if(busy||current?.answer||current?.questionId!==q.questionId)return;answer.value=choice;saveDraft();answer.focus();});$('conference-choices').append(button);}
    }
    if(q.available){
      $('conference-delivery').textContent=q.delivery==='adapter'?'Connected adapter: your reply can be queued here.':'Reply in the original CLI or extension. You can draft and copy your answer here.';
      if(q.answer)status(q.answer.status==='acknowledged'?'Acknowledged by adapter. Waiting for the session to report that work resumed.':'Queued for adapter. The employee stays in Conference until the session resumes.');
      else if(changed)status(previous?.available?'The question changed. Review it before replying.':'');
    }else{$('conference-delivery').textContent='The original CLI or extension may have more detail.';if(changed)status('');}
    for(const button of $('conference-choices').querySelectorAll('button'))button.disabled=busy||!!q.answer;
    controls();
  }
  async function refresh(force=false){
    if(!dialog.open||!selected||busy)return;
    const id=selected,version=revision,q=await question(id,force);
    if(dialog.open&&selected===id&&revision===version&&!busy&&entry(id))showQuestion(q);
  }
  function select(id,moveFocus=false){
    if(!entry(id))return;const changed=selected!==id;selected=id;if(changed)revision++;
    if(changed){busy=false;current=null;answer.value='';$('conference-question-text').textContent='Reading the reported question…';$('conference-choices').replaceChildren();status('');}
    $('conference-session-name').textContent=entry(id).label;
    $('conference-provider').textContent=entry(id).provider;
    for(const button of list.querySelectorAll('[data-question-session]'))button.setAttribute('aria-pressed',String(button.dataset.questionSession===selected));
    controls();refresh(true);if(moveFocus)$('conference-question-title').focus({preventScroll:true});
  }
  function saveDraft(){if(selected&&current?.available&&!current.answer)remember(drafts,`${selected}:${current.questionId}`,answer.value);controls();}
  function sync(){
    const entries=waiting();$('conference-inbox-count').textContent=String(entries.length);
    $('conference-inbox-toggle').setAttribute('aria-label',`Conference inbox, ${entries.length} waiting question${entries.length===1?'':'s'}`);
    for(const id of questions.keys())if(!entries.some(e=>e.id===id))questions.delete(id);
    for(const key of drafts.keys())if(!entries.some(e=>key.startsWith(e.id+':')))drafts.delete(key);
    if(!dialog.open)return;
    const focused=document.activeElement?.dataset?.questionSession,signature=JSON.stringify(entries.map(e=>[e.id,e.label,e.provider]));
    if(list.dataset.signature!==signature){
      list.dataset.signature=signature;list.replaceChildren();
      for(const item of entries){const button=node('button',undefined,'conference-person');button.type='button';button.dataset.questionSession=item.id;button.append(node('strong',item.label),node('span',item.provider));button.setAttribute('aria-pressed',String(item.id===selected));button.addEventListener('click',()=>select(item.id,true));list.append(button);}
      if(focused)list.querySelector(`[data-question-session="${focused}"]`)?.focus({preventScroll:true});
    }
    $('conference-empty').hidden=entries.length>0;$('conference-detail').hidden=!entries.length;
    if(!entries.length){selected=null;current=null;revision++;answer.value='';status('');controls();return;}
    if(!entry(selected)){busy=false;select(entries[0].id);return;}
    controls();refresh();
  }
  function open(id,from){
    if(!dialog.open){opener=from||document.activeElement;dialog.showModal();$('conference-inbox-toggle').setAttribute('aria-expanded','true');}
    sync();if(id&&entry(id))select(id);$('conference-close').focus({preventScroll:true});
  }
  $('conference-inbox-toggle').addEventListener('click',event=>open(null,event.currentTarget));
  $('conference-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{revision++;busy=false;$('conference-inbox-toggle').setAttribute('aria-expanded','false');(opener?.isConnected?opener:$('conference-inbox-toggle')).focus({preventScroll:true});});
  $('conference-refresh').addEventListener('click',()=>refresh(true));
  answer.addEventListener('input',saveDraft);
  $('conference-copy').addEventListener('click',async()=>{
    const id=selected,qid=current?.questionId,text=answer.value;if(!text.trim()||!entry(id))return;
    try{await navigator.clipboard.writeText(text);if(selected===id&&current?.questionId===qid)status('Reply copied. Paste it into the original CLI or extension.');}
    catch(_){if(selected===id&&current?.questionId===qid){answer.focus();answer.select();status('Select and copy this reply, then paste it into the original CLI or extension.');}}
  });
  $('conference-answer-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!entry(selected)||!current?.available||current.delivery!=='adapter'||current.answer||!answer.value.trim())return;
    const id=selected,qid=current.questionId,text=answer.value,version=revision;busy=true;controls();status('Queueing reply…');
    try{
      const value=await request(`/api/sessions/${id}/answer`,{questionId:qid,text});
      if(!hex(value.id)||!['queued','acknowledged'].includes(value.status))throw Error('The adapter returned an invalid receipt.');
      if(dialog.open&&selected===id&&revision===version&&entry(id)){current={...current,answer:value};showQuestion(current);}
    }catch(error){if(dialog.open&&selected===id&&revision===version)status(error.message||'Reply could not be queued.');}
    finally{const inFlight=pending.get(id);if(inFlight)await inFlight;if(selected===id&&revision===version){questions.delete(id);busy=false;controls();refresh(true);}}
  });
  document.addEventListener('click',event=>{const button=event.target.closest('[data-conference-session]');if(button)open(button.dataset.conferenceSession,button);});
  function attachProfile(id,slot){
    slot.dataset.profileQuestion=id;slot.textContent='Reading the reported question…';
    question(id).then(q=>{if(!slot.isConnected||!entry(id))return;slot.textContent=q.available?q.text:q.reason;});
  }
  setInterval(()=>{if(dialog.open&&!document.hidden)refresh();},1000);
  return {sync,open,attachProfile};
})();
