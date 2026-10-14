/* Player controls are cosmetic; real work always uses the explicit mission form. */
'use strict';
(() => {
  const M=window.OfficeGameModel, $=id=>document.getElementById(id), world=$('world');
  let position={x:480,y:325}, route=[], last=performance.now(), met=false, mode=document.body.dataset.mode||'office', missions=0, completed=0;
  const held=new Set(), player=$('game-player'), conversation=$('game-dialog');
  const directions={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};
  const visibleActors=()=>Array.from(world.querySelectorAll('.character')).filter(n=>!n.closest('[hidden]'));
  const actorPosition=n=>({x:parseFloat(n.style.left)*12.8,y:parseFloat(n.style.top)*6.1});
  function clear() {held.clear();route=[];player.classList.remove('walking');}
  function blocked() {return document.hidden || Boolean(document.querySelector('dialog[open]'));}
  function nearest() {
    return visibleActors().map(n=>({node:n,distance:Math.hypot(actorPosition(n).x-position.x,actorPosition(n).y-position.y)})).sort((a,b)=>a.distance-b.distance)[0];
  }
  function paint() {
    if(mode==='office')return;
    player.style.left=`${position.x/12.8}%`;player.style.top=`${position.y/6.1}%`;
    const near=nearest(), available=near && near.distance<85;
    $('interact').disabled=!available;
    $('game-prompt').textContent=available ? `E / Talk to ${near.node.querySelector('.character-name').textContent}` : 'WASD / arrows to move · Click the floor to walk';
    visibleActors().forEach(n=>n.classList.toggle('nearby',available && n===near.node));
  }
  function quest() {
    $('quest-text').textContent=mode==='simulation' ? !met ? '01 / Meet your crew. Walk up and press E.' : !missions ? '02 / Give an agent your first mission.' : !completed ? '03 / Watch your crew finish a simulated mission.' : 'Quest complete! Create another mission to keep building.' : mode==='live' ? 'Native tasks / Talk to a specialist to assign real work.' : 'Explorer / Inspect local evidence. This mode is read-only.';
    $('game-xp').textContent=`${completed*100} SIM XP`;
  }
  function talk(n) {
    clear();met=true;quest();
    $('talk-name').textContent=n.querySelector('.character-name').textContent;
    $('talk-description').textContent=$('agent-detail').textContent;
    $('talk-source').textContent=$('source-note').textContent;
    $('talk-mission').disabled=$('new-mission').disabled;
    if(!conversation.open) conversation.showModal();
  }
  world.addEventListener('click',event=>{
    if(mode==='office')return;
    const actor=event.target.closest('.character');
    if(actor) {talk(actor);return;}
    if(blocked()) return;
    world.focus({preventScroll:true});
    const rect=world.getBoundingClientRect();
    route=M.path(position,{x:(event.clientX-rect.left)*1280/rect.width,y:(event.clientY-rect.top)*610/rect.height});
    if(!route.length) $('game-prompt').textContent='Choose a clear spot on the floor.';
  });
  function interact() {const n=nearest();if(n && n.distance<85) n.node.click();}
  world.addEventListener('keydown',event=>{
    if(mode==='office'||blocked() || event.target!==world) return;
    const key=event.key.length===1 ? event.key.toLowerCase() : event.key;
    if(directions[key]) {event.preventDefault();held.add(key);route=[];}
    else if((key==='e' || key===' ') && !event.repeat) {event.preventDefault();interact();}
  });
  window.addEventListener('keyup',event=>held.delete(event.key.length===1?event.key.toLowerCase():event.key));
  window.addEventListener('blur',clear);world.addEventListener('blur',clear);
  document.addEventListener('visibilitychange',clear);
  document.addEventListener('focusin',()=>{if(blocked()) clear();});
  for(const button of document.querySelectorAll('[data-move]')) {
    const key=button.dataset.move;
    button.addEventListener('pointerdown',event=>{if(blocked()) return;event.preventDefault();clear();held.add(key);button.setPointerCapture(event.pointerId);});
    for(const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type,clear);
    button.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key) && !blocked()) {event.preventDefault();held.add(key);}});
    button.addEventListener('keyup',clear);button.addEventListener('blur',clear);
  }
  $('interact').addEventListener('click',interact);
  $('talk-close').addEventListener('click',()=>conversation.close());
  conversation.addEventListener('close',()=>world.focus({preventScroll:true}));
  $('talk-mission').addEventListener('click',()=>{conversation.close();$('new-mission').click();});
  $('talk-journal').addEventListener('click',()=>{conversation.close();$('work-tray').open=true;$('work-tray').querySelector('summary').focus({preventScroll:true});});
  $('enter-world').addEventListener('click',()=>{world.focus();$('game-prompt').textContent='Welcome to Agent HQ. Find Frank in Planning!';});
  function frame(now) {
    const dt=Math.min((now-last)/1000,.1);last=now;
    let dx=0,dy=0;
    if(!blocked()) {
      for(const key of held) {dx+=directions[key][0];dy+=directions[key][1];}
      if(dx || dy) {const length=Math.hypot(dx,dy);dx=dx/length*145*dt;dy=dy/length*145*dt;}
      else if(route.length) {const target=route[0],distance=Math.hypot(target.x-position.x,target.y-position.y);if(distance<3) route.shift();else {const amount=Math.min(distance,145*dt);dx=(target.x-position.x)/distance*amount;dy=(target.y-position.y)/distance*amount;}}
    } else clear();
    if(dx || dy) {
      const next=M.move(position,dx,dy), moving=Math.hypot(next.x-position.x,next.y-position.y)>.01;
      position=next;player.classList.toggle('walking',moving);player.dataset.facing=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
      if(!moving) route=[];
      // Follow the player when the map is wider than the touch viewport.
      const scroller=world.parentElement,px=position.x/1280*world.clientWidth;
      if(px<scroller.scrollLeft+65 || px>scroller.scrollLeft+scroller.clientWidth-65) scroller.scrollLeft=px-scroller.clientWidth/2;
    } else player.classList.remove('walking');
    paint();requestAnimationFrame(frame);
  }
  window.AgentGame={update(data){if(mode!==data.mode)clear();mode=data.mode;missions=data.missions;completed=data.completed;quest();},getState(){return {...position,nearby:nearest()?.distance<85,mode};}};
  paint();quest();requestAnimationFrame(frame);
})();
