/* Focused browser regression for the orbit camera and projected office edges. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const referenceContract=JSON.parse(fs.readFileSync(path.join(__dirname,'reference-visual.contract.json'),'utf8').replace(/^\uFEFF/,''));

(async()=>{
  const fixtures=fs.mkdtempSync(path.join(os.tmpdir(),'agent-world-camera-'));
  const server=spawn('python3',['tests/fixtures/agent_world_server.py',fixtures],{stdio:'pipe'});
  let browser;
  try{
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server startup timeout')),10000);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited ${code}`)));server.stdout.once('data',()=>{clearTimeout(timeout);resolve();});});
    browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
    await page.addInitScript(()=>{if(localStorage.getItem('agent-world.office-angle.v1')===null)localStorage.setItem('agent-world.office-angle.v1','0');if(localStorage.getItem('agent-world.office-elevation.v1')===null)localStorage.setItem('agent-world.office-elevation.v1','35');});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:8787');
    await page.waitForFunction(()=>window.OfficeWorldView?.getSceneLayout()?.stations?.length>=9);
    assert.equal(await page.evaluate(()=>window.Office3D.diagnostics().active),true,'camera regression executes real WebGL');
    await page.waitForFunction(()=>window.Office3D.diagnostics().triangles>100);
    for(let step=0;step<12;step++){
      const walls=await page.evaluate(()=>{const d=window.Office3D.diagnostics(),v=window.OfficeWorldView.getSceneLayout(),g=window.OfficeWorldView.getLayout(),corners=[[25,25],[g.width-25,25],[g.width-25,g.height-25],[25,g.height-25]].map(p=>v.project(...p));return {room:d.wallCount,expected:g.walls.length+(g.props||[]).filter(p=>p.kind==='feature-wall').length,outer:d.perimeter.map(w=>w.side),fits:corners.every(p=>p.x>=0&&p.y>=0&&p.x<=v.width&&p.y<=v.height),viewport:v.width===innerWidth&&v.height===innerHeight};});
      assert.equal(walls.room,walls.expected,`room walls survive rotation ${step*30}°`);
      assert.deepEqual(walls.outer.sort(),['east','north','south','west'],`perimeter survives rotation ${step*30}°`);
      assert.equal(walls.fits,true,`physical floor fits at ${step*30}°`);assert.equal(walls.viewport,true,'3D dimensions match the viewport');
      await page.getByRole('button',{name:'Rotate office right 30 degrees'}).click();
    }
    assert.equal(await page.locator('#camera-angle').textContent(),'0°','full orbit returns to the starting angle');
    const floorPoint=()=>page.evaluate(()=>{const r=document.querySelector('.world-scroll').getBoundingClientRect();for(let row=2;row<9;row++)for(let col=2;col<9;col++){const x=r.left+r.width*col/10,y=r.top+r.height*row/10;if(document.elementFromPoint(x,y)?.closest('svg.office'))return {x,y};}return null;});
    const start=await floorPoint();assert.ok(start,'an exposed floor point accepts pointer input');
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+120,start.y-75,{steps:8});await page.mouse.up();
    const orbit=await page.evaluate(()=>({yaw:document.getElementById('camera-angle').value,pitch:document.getElementById('camera-elevation').value,storedYaw:localStorage.getItem('agent-world.office-angle.v1'),storedPitch:localStorage.getItem('agent-world.office-elevation.v1')}));
    assert.notEqual(orbit.yaw,'0°','horizontal drag orbits the office');assert.notEqual(orbit.pitch,'35°','vertical drag tilts the camera');
    assert.equal(Math.round(Number(orbit.storedYaw)),Number(orbit.yaw.replace('°','')));assert.equal(Math.round(Number(orbit.storedPitch)),Number(orbit.pitch.replace('°','')));
    const geometry=await page.evaluate(()=>{const scene=window.OfficeWorldView.getSceneLayout(),g=window.OfficeWorldView.getLayout(),corner=[[25,25],[g.width-25,25],[g.width-25,g.height-25],[25,g.height-25]].map(p=>scene.project(...p));return {aligned:scene.stations.every(s=>{const b=document.querySelector(`[data-computer="${s.role}"][data-station="${s.index}"]`)?.getBoundingClientRect(),floor=document.getElementById('world').getBoundingClientRect();return b&&Math.abs(b.x+b.width/2-floor.x-s.screen.x/scene.width*floor.width)<1&&Math.abs(b.y+b.height/2-floor.y-s.screen.y/scene.height*floor.height)<1;}),corner,edgeCount:document.querySelectorAll('[data-platform-edge]').length,roomWalls:document.querySelectorAll('[data-room-wall]').length,expectedWalls:g.walls.length,wallFaces:[...document.querySelectorAll('[data-outer-wall]')].map(w=>({wall:w.dataset.outerWall,height:Number(w.dataset.wallHeight),face:w.querySelector('[data-window-face]')?.getAttribute('data-window-face')}))};});
    assert.equal(geometry.aligned,true,'monitor controls remain attached after a two-axis orbit');
    assert.equal(await page.evaluate(()=>window.Office3D.diagnostics().camera.type),'PerspectiveCamera');
    const [a,b,c,d]=geometry.corner;assert.ok(Math.hypot((b.x-a.x)+(d.x-c.x),(b.y-a.y)+(d.y-c.y))>1,'perspective gives near and far edges different apparent lengths');
    await page.screenshot({path:path.join(process.env.EVIDENCE_DIR||'/tmp','orbit-drag-desktop.png'),fullPage:true});
    await page.reload();assert.equal(await page.locator('#camera-angle').textContent(),orbit.yaw);assert.equal(await page.locator('#camera-elevation').textContent(),orbit.pitch);
    await page.getByLabel('Office view',{exact:true}).selectOption('top-down');assert.equal(await page.locator('#camera-elevation').textContent(),'90°');await page.getByRole('button',{name:'Closer view',exact:true}).click();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const panState=await page.locator('#world').evaluate(e=>({x:parseFloat(e.style.getPropertyValue('--camera-x')),scale:Number(e.style.getPropertyValue('--camera-scale')),floorWidth:e.clientWidth,viewportWidth:e.parentElement.clientWidth}));
    const maxPan=Math.max(0,(panState.floorWidth*panState.scale-panState.viewportWidth)/2);assert.ok(maxPan>80,'zoom creates room to pan in both directions');
    const panPoint=await floorPoint();await page.mouse.move(panPoint.x,panPoint.y);await page.mouse.down();await page.mouse.move(panPoint.x+80,panPoint.y,{steps:4});await page.mouse.up();
    const afterRight=await page.locator('#world').evaluate(e=>parseFloat(e.style.getPropertyValue('--camera-x'))),expectedRight=Math.max(-maxPan,Math.min(maxPan,panState.x+80));
    console.log('TOP_DOWN_PAN_RIGHT',JSON.stringify({...panState,maxPan,afterRight,expectedRight}));assert.ok(Math.abs(afterRight-expectedRight)<1,'rightward drag reaches its actual bounded target');
    const reversePoint=await floorPoint();await page.mouse.move(reversePoint.x,reversePoint.y);await page.mouse.down();await page.mouse.move(reversePoint.x-80,reversePoint.y,{steps:4});await page.mouse.up();
    const afterLeft=await page.locator('#world').evaluate(e=>parseFloat(e.style.getPropertyValue('--camera-x'))),expectedLeft=Math.max(-maxPan,Math.min(maxPan,afterRight-80));
    console.log('TOP_DOWN_PAN_LEFT',JSON.stringify({before:afterRight,maxPan,afterLeft,expectedLeft}));assert.ok(Math.abs(afterLeft-expectedLeft)<1,'leftward drag reaches its actual bounded target');assert.notEqual(afterLeft,afterRight,'top-down drag actually pans when zoomed');
    const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    phone.on('pageerror',error=>errors.push(error.message));await phone.goto('http://127.0.0.1:8787');await phone.waitForFunction(()=>window.OfficeWorldView?.getSceneLayout()?.stations?.length>=9);
    const touch=await phone.evaluate(()=>{const r=document.querySelector('.world-scroll').getBoundingClientRect();for(let row=3;row<8;row++)for(let col=2;col<9;col++){const x=r.left+r.width*col/10,y=r.top+r.height*row/10;if(document.elementFromPoint(x,y)?.closest('svg.office'))return {x:Math.round(x),y:Math.round(y)};}return null;});assert.ok(touch,'phone has a touchable floor point');
    const phoneBefore={angle:await phone.locator('#camera-angle').textContent(),elevation:await phone.locator('#camera-elevation').textContent()};
    const cdp=await phone.context().newCDPSession(phone);const dispatch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
    await dispatch('touchStart',touch.x,touch.y);for(let i=1;i<=6;i++)await dispatch('touchMove',touch.x+60*i/6,touch.y-48*i/6);await dispatch('touchEnd',touch.x+60,touch.y-48);
    assert.notEqual(await phone.locator('#camera-angle').textContent(),phoneBefore.angle,'touch drag orbits on mobile');assert.notEqual(await phone.locator('#camera-elevation').textContent(),phoneBefore.elevation,'touch drag tilts on mobile');
    await phone.screenshot({path:path.join(process.env.EVIDENCE_DIR||'/tmp','orbit-drag-mobile.png'),fullPage:true});
    assert.equal(await phone.evaluate(()=>window.Office3D.diagnostics().active),true,'touch exercises WebGL');
    await phone.evaluate(()=>document.querySelector('canvas.office-3d').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await phone.waitForFunction(()=>document.getElementById('world').dataset.renderer==='svg');assert.equal(await phone.locator('[data-outer-wall]').count(),4,'lost graphics context switches to the usable office fallback');
    const fallback=await browser.newPage();fallback.on('pageerror',error=>errors.push(error.message));await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});await fallback.goto('http://127.0.0.1:8787');await fallback.waitForFunction(()=>window.OfficeWorldView?.getSceneLayout()?.stations?.length>=9);assert.equal(await fallback.evaluate(()=>window.Office3D.available),false);assert.equal(await fallback.locator('[data-outer-wall]').count(),4);
    async function sharedMonitorAlignment(label){
      await fallback.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const actual=await fallback.evaluate(label=>{const physical=document.querySelector('[data-workstation="shared:0"] .monitor-interior'),control=document.querySelector('[data-computer="shared"][data-station="0"]'),bounds=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,x:r.left+r.width/2,y:r.top+r.height/2};};return{label,angle:document.getElementById('camera-angle').textContent,physical:bounds(physical),control:bounds(control),controlVisible:!!control&&!control.hidden&&getComputedStyle(control).visibility==='visible'};},label);
      console.log('SVG_SHARED_MONITOR_ALIGNMENT',JSON.stringify(actual));assert.ok(actual.physical?.width>0&&actual.physical?.height>0&&actual.control?.width>0&&actual.control?.height>0&&actual.controlVisible,'actual SVG reception monitor and interactive control are both visible');assert.ok(Math.abs(actual.physical.x-actual.control.x)<=.75&&Math.abs(actual.physical.y-actual.control.y)<=.75,'actual reception SVG monitor and computer control centers align within0.75CSSpx');
    }
    await fallback.getByLabel('Office view',{exact:true}).selectOption('reference');await sharedMonitorAlignment('reference');
    await fallback.getByRole('button',{name:'Rotate office right 30 degrees'}).click();await sharedMonitorAlignment('reference-rotated');
    await fallback.getByRole('button',{name:'Open Builder computer 1 code and activity',exact:true}).click();assert.equal(await fallback.locator('#computer-dialog').evaluate(d=>d.open),true);await fallback.close();
    // A fresh stored top-down visit must keep its movement loop alive before
    // any 3D scene has been configured, then switch to a seated 3D employee.
    const fresh=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
    fresh.on('pageerror',error=>errors.push(error.message));
    await fresh.addInitScript(()=>{localStorage.setItem('agent-world.office-view.v1','top-down');localStorage.setItem('agent-world.office-angle.v1','90');});
    await fresh.goto('http://127.0.0.1:8787');await fresh.waitForFunction(()=>window.OfficeWorldView?.getState().length>0);
    const arrival=await fresh.evaluate(()=>window.OfficeWorldView.getState()[0]);
    await fresh.waitForFunction(first=>{const a=window.OfficeWorldView.getState().find(a=>a.id===first.id);return a&&Math.hypot(a.x-first.x,a.y-first.y)>100;},arrival,{timeout:10000});
    await fresh.waitForSelector(`[data-office="${arrival.id}"].at-desk:not(.office-walking)`,{timeout:20000});
    await fresh.getByLabel('Office view',{exact:true}).selectOption('isometric');
    await fresh.waitForFunction(id=>window.Office3D.diagnostics().active&&window.Office3D.diagnostics().actors.some(a=>a.id===id&&a.pose==='seated'),arrival.id);
    await fresh.close();
    // A shareable reference launch is an in-memory presentation override,
    // even when the recipient previously saved a different view and style.
    const launchContext=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),launchPage=await launchContext.newPage();
    launchPage.on('pageerror',error=>errors.push(error.message));
    const savedLaunch={'agent-world.office-view.v1':'top-down','agent-world.office-angle.v1':'90','agent-world.office-elevation.v1':'55','agent-world.graphics.v1':'pixel'};
    await launchPage.addInitScript(saved=>{for(const[key,value]of Object.entries(saved))localStorage.setItem(key,value);},savedLaunch);
    await launchPage.goto('http://127.0.0.1:8787/?office=reference');
    await launchPage.waitForFunction(()=>window.Office3D?.diagnostics().active&&Office3D.getGraphicsStyle()==='polished'&&Office3D.diagnostics().renderedFrames>0);
    const referenceLaunch=await launchPage.evaluate(keys=>({view:document.getElementById('camera-view').value,style:document.getElementById('graphics-style').value,yaw:Number(document.getElementById('camera-angle').textContent.replace(/[^\d.-]/g,'')),elevation:Number(document.getElementById('camera-elevation').textContent.replace(/[^\d.-]/g,'')),fov:Office3D.diagnostics().camera.fov,saved:Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]))}),Object.keys(savedLaunch));
    console.log('REFERENCE_QUERY_LAUNCH',JSON.stringify(referenceLaunch));assert.equal(referenceLaunch.view,'isometric');assert.equal(referenceLaunch.style,'polished');assert.equal(referenceLaunch.yaw,referenceContract.referenceCamera.yaw);assert.equal(referenceLaunch.elevation,referenceContract.referenceCamera.elevation);assert.equal(referenceLaunch.fov,referenceContract.referenceCamera.fov,'reference launch uses the contracted perspective camera');assert.deepEqual(referenceLaunch.saved,savedLaunch,'launch override leaves all saved preferences untouched');
    await launchPage.locator('#graphics-style').selectOption('low-poly');assert.equal(await launchPage.evaluate(()=>localStorage.getItem('agent-world.graphics.v1')),'low-poly','a deliberate user style control still persists its new choice');
    await launchContext.close();
    await page.getByLabel('Office view',{exact:true}).selectOption('reference');
    assert.equal(Number((await page.locator('#camera-angle').textContent()).replace(/[^\d.-]/g,'')),referenceContract.referenceCamera.yaw);assert.equal(Number((await page.locator('#camera-elevation').textContent()).replace(/[^\d.-]/g,'')),referenceContract.referenceCamera.elevation);assert.equal(await page.locator('#zoom-level').textContent(),'100%','reference preset frames the whole office');
    await page.screenshot({path:path.join(process.env.EVIDENCE_DIR||'/tmp','reference-office-desktop.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS: real perspective WebGL full orbit fits viewport; mouse/touch camera, monitor alignment, persistence, reference preset and unsupported-GPU fallback');
  }finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});fs.rmSync(fixtures,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
