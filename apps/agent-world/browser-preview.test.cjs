const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'preview341-')),server=spawn('python3',['tests/fixtures/agent_world_server.py',dir],{stdio:'pipe'});let browser,timer,busy;const errors=[],origin='http://127.0.0.1:8787',output=process.env.EVIDENCE_DIR||'/run-evidence/screenshots/preview341';fs.mkdirSync(output,{recursive:true});
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));
 await page.addInitScript(()=>localStorage.setItem('agent-world.office-angle.v1','0'));await page.goto(origin);await page.waitForFunction(()=>window.Office3D?.diagnostics().active);
 const records=[];for(const role of ['builder','qa'])for(let i=0;i<(role==='builder'?4:3);i++)records.push({provider:'Preview341 Fixture',sessionId:role+'-'+i,state:'working',role,action:'coding',taskId:'preview341-'+role+'-'+i,taskLabel:'Synthetic preview diagnostic',workspace:'/work/demo',pid:null});
 const renew=async()=>{const {token}=await(await context.request.get(origin+'/api/sessions')).json();for(const record of records){const response=await context.request.post(origin+'/api/sessions/heartbeat',{headers:{Origin:origin,'X-Agent-World-Token':token},data:record});assert.ok(response.ok());}};
 await renew();timer=setInterval(()=>{if(!busy)busy=renew().catch(e=>errors.push(e.message)).finally(()=>busy=null);},8000);
 await page.waitForFunction(()=>window.OfficeWorldView.getWorkstations().find(s=>s.key==='builder:2')?.occupant?.working);
 await page.getByRole('button',{name:'Open Builder computer 3 code and activity',exact:true}).click();await page.getByRole('button',{name:'App preview',exact:true}).click();await page.getByLabel('Local app address').fill('http://127.0.0.1:8788/?expanded=3');await page.getByRole('button',{name:'Connect preview',exact:true}).click();await page.frameLocator('#preview-display iframe').locator('#preview-title').waitFor();await page.keyboard.press('Escape');await page.waitForSelector('[data-preview-station="builder:2"] iframe',{state:'attached'});
 const owner=await page.evaluate(()=>OfficeWorldView.getWorkstations().find(s=>s.key==='builder:2').occupant.id);
 async function measure(label){return page.evaluate(({label,owner})=>{
  const holder=document.querySelector('[data-preview-station="builder:2"]'),physical=document.querySelector('[data-workstation="builder:2"] .monitor-interior'),scene=OfficeWorldView.getSceneLayout(),desk=scene.stations.find(s=>s.key==='builder:2'),world=document.getElementById('world'),style=getComputedStyle(world),wr=world.getBoundingClientRect(),a=holder.getBoundingClientRect(),b=physical.getBoundingClientRect(),ctm=physical.getScreenCTM();
  const matrix=new DOMMatrix(getComputedStyle(holder).transform),naturalWidth=parseFloat(style.width),naturalHeight=parseFloat(style.height);
  const expected=desk.screenQuad?.map(p=>{const q=new DOMPoint(p.x,p.y).matrixTransform(ctm);return{x:q.x,y:q.y};});
  const actual=expected&&[[0,0],[38,0],[38,22],[0,22]].map(([x,y])=>{const q=new DOMPoint(x,y).matrixTransform(matrix);return{x:wr.left+q.x/q.w*wr.width/naturalWidth,y:wr.top+q.y/q.w*wr.height/naturalHeight};});
  const cornerErrors=expected?.map((p,i)=>({x:actual[i].x-p.x,y:actual[i].y-p.y}));
  return{label,angle:document.getElementById('camera-angle').textContent,zoom:document.getElementById('zoom-level').textContent,frontFacing:desk.frontFacing,hidden:holder.hidden,frameAttached:!!holder.querySelector('iframe'),ownerRetained:OfficeWorldView.getWorkstations().find(s=>s.key==='builder:2').occupant.id===owner,world:{naturalWidth,naturalHeight,clientWidth:world.clientWidth,clientHeight:world.clientHeight},expected,actual,cornerErrors,contained:!holder.hidden&&a.width>0&&a.left>=b.left-.5&&a.right<=b.right+.5&&a.top>=b.top-.5&&a.bottom<=b.bottom+.5};
 },{label,owner});}
 async function check(label){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const value=await measure(label);console.log('PREVIEW_MAPPING',JSON.stringify(value));assert.ok(value.frameAttached&&value.ownerRetained,'connected preview and exact owner retained');if(value.frontFacing===false)assert.ok(value.hidden,'back-face preview hidden');else{assert.ok(value.contained,'physical monitor polygon contains miniature at 0.5px tolerance');if(value.cornerErrors)assert.ok(value.cornerErrors.every(p=>Math.abs(p.x)<=.5&&Math.abs(p.y)<=.5),'every projected corner agrees with actual SVG CTM within0.5px');}assert.deepEqual(errors,[]);}
 console.log('PREVIEW_SCENE',JSON.stringify(await page.evaluate(()=>Office3D.diagnostics()))); await page.screenshot({path:path.join(output,'reference-v3-preview-baseline.png')}); await check('desktop-original');
 // Controlled fractional sizing exercises CSS layout rounding independently of
 // camera/viewport resize timing. Real projection/iframe remain unchanged.
 for(const width of [1440,390,391,393]){
  await page.setViewportSize({width,height:844});
  for(const dimensions of [{width:390.49,height:843.51},{width:391.49,height:843.51},{width:393.49,height:843.51}]){
   await page.evaluate(size=>{const world=document.getElementById('world');world.style.width=size.width+'px';world.style.height=size.height+'px';},dimensions);
   // Use actual UI zoom controls to avoid changing the camera's own zoom state.
   for(let i=0;i<8&&parseInt(await page.locator('#zoom-level').textContent(),10)<325;i++)await page.getByRole('button',{name:'Zoom in',exact:true}).click();
   await check('viewport'+width+'-fractional'+dimensions.width+'x'+dimensions.height);
  }
 }
 await page.evaluate(()=>{const world=document.getElementById('world');world.style.removeProperty('width');world.style.removeProperty('height');});
 for(let turn=0;turn<12;turn++){await check('yaw'+turn*30);await page.getByRole('button',{name:'Rotate office right 30 degrees'}).click();}
 await page.getByLabel('Office view',{exact:true}).selectOption('top-down');await check('topdown-fallback');
 console.log('PASS: fractional CSS physical preview corners, ownership, back-face and top-down fallback');
}finally{clearInterval(timer);if(busy)await busy;if(browser)await browser.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});