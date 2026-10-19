/* Real Web Audio and compact-control lifecycle regression, using an offline fixture. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const fixtures=fs.mkdtempSync(path.join(os.tmpdir(),'agent-world-music-'));
  const server=spawn('python3',['tests/fixtures/agent_world_server.py',fixtures],{stdio:'pipe'});
  let browser;
  try{
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),10000);server.once('error',reject);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const Native=window.AudioContext;
      window.AudioContext=class extends Native{
        constructor(...args){super(...args);window.testAudio=this;window.testGains=[];}
        createGain(){const gain=super.createGain();window.testGains.push(gain);return gain;}
      };
    });
    const load=async()=>{await page.goto('http://127.0.0.1:8787');await page.waitForFunction(()=>window.OfficeMusic&&window.Office3D?.diagnostics().active);};
    await load();
    assert.equal(await page.locator('#camera-angle').textContent(),`${require('./reference-visual.contract.json').referenceCamera.yaw}\u00b0`,'fresh visitors get reference framing');assert.equal(parseInt(await page.locator('#camera-elevation').textContent(),10),require('./reference-visual.contract.json').referenceCamera.elevation);
    assert.equal(await page.evaluate(()=>OfficeMusic.diagnostics().contextState),'not-created','load never creates an audio context');
    const menu=page.locator('#office-music'),button=page.locator('#music-toggle');
    await menu.locator('summary').focus();await page.keyboard.press('Enter');await button.click();
    await page.waitForFunction(()=>OfficeMusic.diagnostics().playing);
    await page.evaluate(()=>{const analyser=testAudio.createAnalyser();analyser.fftSize=2048;testGains[0].connect(analyser);window.testAnalyser=analyser;});
    const level=()=>page.evaluate(async()=>{let peak=0;for(let i=0;i<15;i++){const data=new Float32Array(testAnalyser.fftSize);testAnalyser.getFloatTimeDomainData(data);peak=Math.max(peak,...data.map(Math.abs));await new Promise(r=>setTimeout(r,30));}return peak;});
    assert.ok(await level()>.0001,'actual audio graph produces a nonzero signal');
    const volume=async value=>page.locator('#music-volume').evaluate((slider,v)=>{slider.value=String(v);slider.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await volume(100);assert.ok(await level()<.95,'full-volume output has headroom');
    await volume(0);await page.waitForTimeout(300);assert.ok(await level()<.00001,'mute silences actual output');
    await volume(37);await button.click();await page.waitForFunction(()=>OfficeMusic.diagnostics().contextState==='suspended');
    const stopped=await page.evaluate(()=>OfficeMusic.diagnostics().scheduledSteps);await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>OfficeMusic.diagnostics().scheduledSteps),stopped,'pause stops scheduling');
    await page.evaluate(()=>{for(let i=0;i<6;i++)document.getElementById('music-toggle').click();});
    await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>OfficeMusic.diagnostics().playing),false,'rapid even toggles leave silence');
    await button.click();await page.waitForFunction(()=>OfficeMusic.diagnostics().playing);
    // Explicitly simulated visibility/BFCache events exercise lifecycle decisions in headless Chromium.
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>!OfficeMusic.diagnostics().schedulerActive);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>OfficeMusic.diagnostics().playing);
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await page.waitForFunction(()=>!OfficeMusic.diagnostics().schedulerActive);
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await page.waitForFunction(()=>OfficeMusic.diagnostics().playing);
    await page.reload();await page.waitForFunction(()=>window.OfficeMusic);
    assert.equal(await page.evaluate(()=>OfficeMusic.diagnostics().volume),37,'volume survives reload');
    assert.equal(await page.evaluate(()=>OfficeMusic.diagnostics().contextState),'not-created','reload stays silent');
    await menu.locator('summary').focus();await page.keyboard.press('Enter');await button.focus();await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate(e=>e.open),false);assert.equal(await menu.locator('summary').evaluate(e=>e===document.activeElement),true,'Escape returns focus');
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await menu.locator('summary').click();
      const fit=await page.locator('.music-panel').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<innerHeight&&document.documentElement.scrollWidth<=innerWidth;});
      assert.ok(fit,`music menu fits ${width}px`);
      if(width===390)await page.screenshot({path:path.join(process.env.EVIDENCE_DIR||'/tmp','music-mobile.png')});
      await menu.locator('summary').click();
    }
    const unsupported=await browser.newPage();unsupported.on('pageerror',error=>errors.push(error.message));
    await unsupported.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;Storage.prototype.getItem=()=>{throw Error('Storage unavailable');};Storage.prototype.setItem=()=>{throw Error('Storage unavailable');};});
    await unsupported.goto('http://127.0.0.1:8787');await unsupported.waitForFunction(()=>window.OfficeMusic);
    await unsupported.locator('#office-music summary').click();assert.equal(await unsupported.locator('#music-toggle').isDisabled(),true);
    await unsupported.getByRole('button',{name:'Rotate office right 30 degrees'}).click();
    assert.deepEqual(errors,[]);
    console.log('PASS: real audio signal/mute/headroom; pause, rapid toggles, simulated hidden/BFCache lifecycle, silent reload, saved volume, keyboard, 390/320px and unsupported audio/storage');
  }finally{if(browser)await browser.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});fs.rmSync(fixtures,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
