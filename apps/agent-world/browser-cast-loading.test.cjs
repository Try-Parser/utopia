/* Late local artwork must recover from a temporary native representation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.EVIDENCE_DIR||'/tmp/office-cast-loading';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const fixtures=fs.mkdtempSync(path.join(os.tmpdir(),'office-cast-loading-')),server=spawn('python3',['tests/fixtures/agent_world_server.py',fixtures],{stdio:'pipe'}),origin='http://127.0.0.1:8787',errors=[];let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  let releaseMetadata,releaseImages,imagesRequested,metadataRequests=0,imageRequests=0;const metadataGate=new Promise(resolve=>{releaseMetadata=resolve;}),imageGate=new Promise(resolve=>{releaseImages=resolve;}),allImagesRequested=new Promise(resolve=>{imagesRequested=resolve;});
  await page.route('**/assets/employee-cast-v1.json',async route=>{metadataRequests++;await metadataGate;await route.continue().catch(()=>{});});
  await page.route(/\/assets\/employee-(?:mica|lilt|brim|quill|tavi|sable)-v1\.png$/,async route=>{imageRequests++;if(imageRequests===6)imagesRequested();await imageGate;await route.continue().catch(()=>{});});
  await page.addInitScript(()=>localStorage.setItem('agent-world.graphics.v1','illustrated'));
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>Office3D?.diagnostics().active&&Office3D.diagnostics().castAssets.manifest==='fallback',null,{timeout:30000});
  assert.equal(metadataRequests,1,'one bounded metadata request remains pending');assert.equal(imageRequests,0);console.log('CAST_METADATA_DEADLINE',JSON.stringify(await page.evaluate(()=>Office3D.diagnostics().castAssets)));
  releaseMetadata();
  await page.waitForFunction(()=>{const c=Office3D.diagnostics().castAssets;return c.manifest==='ready'&&Object.values(c.profiles).every(p=>p.state==='loading');},null,{timeout:30000});
  console.log('CAST_IMAGES_LOADING',JSON.stringify(await page.evaluate(()=>Office3D.diagnostics().castAssets)));
  await Promise.race([allImagesRequested,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Six image requests never started')),30000);timer.unref();})]);
  await page.waitForFunction(()=>{const c=Office3D.diagnostics().castAssets;return c.textureCount===0&&Object.values(c.profiles).every(p=>p.state==='fallback');},null,{timeout:30000});
  assert.equal(imageRequests,6,'one pending image request per authored profile');console.log('CAST_IMAGE_DEADLINE',JSON.stringify(await page.evaluate(()=>Office3D.diagnostics().castAssets)));
  releaseImages();
  await page.waitForFunction(()=>Office3D.diagnostics().castAssets.state==='illustrated',null,{timeout:60000});
  const recovered=await page.evaluate(()=>Office3D.diagnostics().castAssets);assert.equal(recovered.textureCount,6);assert.ok(Object.values(recovered.profiles).every(p=>p.state==='ready'&&p.frameCount===24));assert.equal(metadataRequests,1);assert.equal(imageRequests,6,'recovery never starts retries');
  await page.waitForFunction(()=>Office3D.diagnostics().actors.some(a=>a.visualKind==='illustrated'&&a.illustrationVisible));
  console.log('CAST_LATE_RECOVERY',JSON.stringify(recovered));await page.screenshot({path:path.join(output,'cast-late-recovery.png')});
  // Disposal is terminal even when a response is still pending.
  const closing=await context.newPage();closing.on('pageerror',error=>errors.push(error.message));let closingRelease,closingRequested,closingMetadata=0,closingImages=0;const closingGate=new Promise(resolve=>{closingRelease=resolve;}),closingRequest=new Promise(resolve=>{closingRequested=resolve;});
  await closing.route('**/assets/employee-cast-v1.json',async route=>{closingMetadata++;closingRequested();await closingGate;await route.continue().catch(()=>{});});
  await closing.route(/\/assets\/employee-(?:mica|lilt|brim|quill|tavi|sable)-v1\.png$/,async route=>{closingImages++;await route.abort();});
  await closing.goto(origin,{waitUntil:'domcontentloaded',timeout:90000});await closing.waitForFunction(()=>Office3D?.available);
  await Promise.race([closingRequest,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Disposal metadata request never started')),30000);timer.unref();})]);
  const cancelled=closing.waitForEvent('requestfailed',{predicate:request=>request.url().endsWith('/assets/employee-cast-v1.json'),timeout:15000});
  await closing.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));closingRelease();
  const cancelledRequest=await cancelled;assert.match(cancelledRequest.failure().errorText,/ABORT|CANCEL/i,'disposal actually cancels the held transport');
  await closing.waitForFunction(()=>Office3D.diagnostics().castAssets.state==='fallback');
  const disposed=await closing.evaluate(()=>Office3D.diagnostics().castAssets);assert.equal(disposed.textureCount,0);assert.equal(closingMetadata,1);assert.equal(closingImages,0,'late metadata cannot create textures after disposal');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'cast-loading-result.json'),JSON.stringify({recovered,disposed,metadataRequests,imageRequests,closingMetadata,closingImages,errors},null,2));console.log('PASS: temporary metadata/image deadline fallback recovers without retries; disposal prevents late resources');
 }finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});fs.rmSync(fixtures,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
