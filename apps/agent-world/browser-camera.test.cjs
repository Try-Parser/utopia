/* Focused browser regression for the orbit camera and projected office edges. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const fixtures=fs.mkdtempSync(path.join(os.tmpdir(),'agent-world-camera-'));
  const server=spawn('python3',['tests/fixtures/agent_world_server.py',fixtures],{stdio:'pipe'});
  let browser;
  try{
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server startup timeout')),10000);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited ${code}`)));server.stdout.once('data',()=>{clearTimeout(timeout);resolve();});});
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:8787');
    await page.waitForFunction(()=>window.OfficeWorldView?.getSceneLayout()?.stations?.length===35);
    const floorPoint=()=>page.evaluate(()=>{const r=document.querySelector('.world-scroll').getBoundingClientRect();for(let row=2;row<9;row++)for(let col=2;col<9;col++){const x=r.left+r.width*col/10,y=r.top+r.height*row/10;if(document.elementFromPoint(x,y)?.closest('svg.office'))return {x,y};}return null;});
    const start=await floorPoint();assert.ok(start,'an exposed floor point accepts pointer input');
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+120,start.y-75,{steps:8});await page.mouse.up();
    const orbit=await page.evaluate(()=>({yaw:document.getElementById('camera-angle').value,pitch:document.getElementById('camera-elevation').value,storedYaw:localStorage.getItem('agent-world.office-angle.v1'),storedPitch:localStorage.getItem('agent-world.office-elevation.v1')}));
    assert.notEqual(orbit.yaw,'0°','horizontal drag orbits the office');assert.notEqual(orbit.pitch,'35°','vertical drag tilts the camera');
    assert.equal(Math.round(Number(orbit.storedYaw)),Number(orbit.yaw.replace('°','')));assert.equal(Math.round(Number(orbit.storedPitch)),Number(orbit.pitch.replace('°','')));
    const geometry=await page.evaluate(()=>{const scene=window.OfficeWorldView.getSceneLayout(),g=window.OfficeWorldView.getLayout(),corner=[[25,25],[g.width-25,25],[g.width-25,g.height-25],[25,g.height-25]].map(p=>scene.project(...p));return {aligned:scene.stations.every(s=>{const b=document.querySelector(`[data-computer="${s.role}"][data-station="${s.index}"]`)?.getBoundingClientRect(),floor=document.getElementById('world').getBoundingClientRect();return b&&Math.abs(b.x+b.width/2-floor.x-s.screen.x/scene.width*floor.width)<1&&Math.abs(b.y+b.height/2-floor.y-s.screen.y/scene.height*floor.height)<1;}),corner,edgeCount:document.querySelectorAll('[data-platform-edge]').length,wallFaces:[...document.querySelectorAll('[data-outer-wall]')].map(w=>({wall:w.dataset.outerWall,face:w.querySelector('[data-window-face]')?.getAttribute('data-window-face')}))};});
    assert.equal(geometry.aligned,true,'monitor overlays remain attached after a two-axis orbit');assert.equal(geometry.edgeCount,1,'perimeter has one continuous top outline');
    for(const {wall,face}of geometry.wallFaces)assert.equal(face,{north:'south',south:'north',west:'east',east:'west'}[wall],'windows face the office interior');
    const [a,b,c,d]=geometry.corner;assert.ok(Math.hypot((b.x-a.x)+(d.x-c.x),(b.y-a.y)+(d.y-c.y))<1e-7,'opposite projected edges are parallel and equal');
    await page.screenshot({path:path.join(process.env.EVIDENCE_DIR||'/tmp','orbit-drag-desktop.png'),fullPage:true});
    await page.reload();assert.equal(await page.locator('#camera-angle').textContent(),orbit.yaw);assert.equal(await page.locator('#camera-elevation').textContent(),orbit.pitch);
    await page.getByLabel('Office view',{exact:true}).selectOption('top-down');assert.equal(await page.locator('#camera-elevation').textContent(),'90°');await page.getByRole('button',{name:'Closer view',exact:true}).click();const before=await page.locator('#world').evaluate(e=>e.style.getPropertyValue('--camera-x'));
    const panPoint=await floorPoint();await page.mouse.move(panPoint.x,panPoint.y);await page.mouse.down();await page.mouse.move(panPoint.x+80,panPoint.y,{steps:4});await page.mouse.up();
    assert.notEqual(await page.locator('#world').evaluate(e=>e.style.getPropertyValue('--camera-x')),before,'top-down drag pans when zoomed');
    const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    phone.on('pageerror',error=>errors.push(error.message));await phone.goto('http://127.0.0.1:8787');await phone.waitForFunction(()=>window.OfficeWorldView?.getSceneLayout()?.stations?.length===35);
    const touch=await phone.evaluate(()=>{const r=document.querySelector('.world-scroll').getBoundingClientRect();for(let row=3;row<8;row++)for(let col=2;col<9;col++){const x=r.left+r.width*col/10,y=r.top+r.height*row/10;if(document.elementFromPoint(x,y)?.closest('svg.office'))return {x:Math.round(x),y:Math.round(y)};}return null;});assert.ok(touch,'phone has a touchable floor point');
    const cdp=await phone.context().newCDPSession(phone);const dispatch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
    await dispatch('touchStart',touch.x,touch.y);for(let i=1;i<=6;i++)await dispatch('touchMove',touch.x+60*i/6,touch.y-48*i/6);await dispatch('touchEnd',touch.x+60,touch.y-48);
    assert.notEqual(await phone.locator('#camera-angle').textContent(),'0°','touch drag orbits on mobile');assert.notEqual(await phone.locator('#camera-elevation').textContent(),'35°','touch drag tilts on mobile');
    await phone.screenshot({path:path.join(process.env.EVIDENCE_DIR||'/tmp','orbit-drag-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS: desktop and touch drag orbit both axes, camera persists, wall edges/windows and monitor overlays stay aligned');
  }finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});fs.rmSync(fixtures,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
