/* Actual host-renderer pixels: bounded Illustrated Chibi zoom must retain detail and alignment. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.EVIDENCE_DIR||'/tmp/agent-world-illustrated-clarity';
fs.mkdirSync(output,{recursive:true});

// Test instrumentation wraps the renderer constructor because Three defines
// render on each instance. The following production source bytes stay intact.
function installPixelProbe(){
  const T=window.OfficeThree,Base=T.WebGLRenderer;
  const probe=window.__officeClarity={nonce:0,pending:null,last:null,bufferResizes:0};
  window.OfficeThree={...T,WebGLRenderer:class extends Base{
    constructor(...args){
      super(...args);
      const nativeRender=this.render.bind(this),renderer=this;
      let markers=null,sourceScene=null,positions=null,boardCorners=null,prepared=0;
      for(const method of ['setDrawingBufferSize','setPixelRatio','setSize']){
        const original=this[method].bind(this);
        this[method]=(...values)=>{probe.bufferResizes++;return original(...values);};
      }
      const projectWorld=point=>{
        const view=OfficeWorldView.getSceneLayout(),p=view.project(point.x,point.z,point.y),r=document.getElementById('world').getBoundingClientRect();
        return{x:r.left+p.x/view.width*r.width,y:r.top+p.y/view.height*r.height};
      };
      function prepare(scene,camera){
        if(!probe.pending||prepared===probe.pending.nonce)return;
        prepared=probe.pending.nonce;
        if(probe.pending.fixed&&markers)return;
        if(markers){sourceScene.remove(markers);markers.traverse(m=>{m.geometry?.dispose();m.material?.map?.dispose();m.material?.dispose();});}
        sourceScene=scene;markers=new T.Group();scene.add(markers);
        const viewport=document.getElementById('world').parentElement.getBoundingClientRect(),rect=renderer.domElement.getBoundingClientRect();
        // Unprojecting into the actual render camera keeps fixtures visible.
        // Expected pixels are independently projected through the PUBLIC world
        // camera and floor CSS transform, so an incorrect crop matrix fails.
        const at=(x,y)=>new T.Vector3(2*(x-rect.left)/rect.width-1,1-2*(y-rect.top)/rect.height,.96).unproject(camera);
        function panel(x,y,width,height,material){
          const sx=viewport.left+(x+1)*viewport.width/2,sy=viewport.top+(1-y)*viewport.height/2;
          const center=at(sx,sy),right=at(sx+width,sy),up=at(sx,sy-height);
          const mesh=new T.Mesh(new T.PlaneGeometry(right.distanceTo(center),up.distanceTo(center)),material);
          mesh.position.copy(center);mesh.quaternion.copy(camera.quaternion);mesh.renderOrder=1000000;mesh.frustumCulled=false;markers.add(mesh);return mesh;
        }
        positions=[-.42,0,.42].map((x,i)=>{
          const color=[0xff0000,0x00ff00,0x0000ff][i],material=new T.MeshBasicMaterial({color,depthTest:false,depthWrite:false,toneMapped:false});
          return panel(x,.12,34,34,material).position.clone();
        });
        const image=document.createElement('canvas');image.width=128;image.height=64;
        const context=image.getContext('2d');context.fillStyle='#101010';context.fillRect(0,0,128,64);
        context.fillStyle='#eeeeee';context.fillRect(64,0,64,16);
        for(let x=0;x<128;x+=4){context.fillStyle='#eeeeee';context.fillRect(x,16,2,48);}
        const texture=new T.CanvasTexture(image);texture.colorSpace=T.SRGBColorSpace;texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;
        const board=panel(0,-.34,128,64,new T.MeshBasicMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false}));
        board.updateMatrixWorld(true);
        boardCorners=[new T.Vector3(-.5,.5,0),new T.Vector3(.5,-.5,0)].map(p=>{
          const dimensions=board.geometry.parameters;return board.localToWorld(p.multiply(new T.Vector3(dimensions.width,dimensions.height,1)));
        });
      }
      function capture(){
        if(!probe.pending||!positions||prepared!==probe.pending.nonce)return;
        const gl=renderer.getContext(),canvas=renderer.domElement,rect=canvas.getBoundingClientRect(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
        const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        const read=(x,y)=>{const px=Math.floor((x-rect.left)/rect.width*width),py=Math.floor((y-rect.top)/rect.height*height);if(px<0||py<0||px>=width||py>=height)return[0,0,0,0];const offset=((height-1-py)*width+px)*4;return Array.from(pixels.subarray(offset,offset+4));};
        const colors=positions.map(point=>{const screen=projectWorld(point);return{screen,rgb:read(screen.x,screen.y),world:point.toArray()};});
        const [a,b]=boardCorners.map(projectWorld),board={left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};
        const sample=(x,y)=>read(board.left+x/128*board.width,board.top+y/64*board.height)[0]/255;
        const range=sample(96,8)-sample(32,8);let n=0,sum=0,sum2=0,gradient=0;
        for(let y=24;y<56;y+=1/devicePixelRatio)for(let x=16;x<112;x+=1/devicePixelRatio){const value=sample(x,y);sum+=value;sum2+=value*value;gradient+=Math.abs(value-sample(x+1/devicePixelRatio,y));n++;}
        probe.last={nonce:probe.pending.nonce,colors,board:{...board,range,contrast:Math.sqrt(Math.max(0,sum2/n-(sum/n)**2))/Math.max(.01,range),gradient:gradient/n/Math.max(.01,range)},canvas:{width,height,rect:rect.toJSON()},bufferResizes:probe.bufferResizes,glError:gl.getError()};
        probe.pending=null;
      }
      this.render=(scene,camera)=>{
        if(camera.isPerspectiveCamera)prepare(scene,camera);
        nativeRender(scene,camera);
        if(renderer.getRenderTarget()===null)capture();
      };
    }
  }};
  probe.request=(options={})=>{const nonce=++probe.nonce;probe.pending={...options,nonce};return nonce;};
}

(async()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'illustrated-clarity-'));
  const server=spawn('python3',['tests/fixtures/agent_world_server.py',fixture],{stdio:'pipe'});
  const cases=[],errors=[],failures=[];let browser;
  try{
    await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
    browser=await chromium.launch({headless:true});
    const source=fs.readFileSync(process.env.CLARITY_RENDERER_SOURCE||path.join(__dirname,'office-3d.js'),'utf8');
    for(const config of [{name:'desktop-dpr1',width:1440,height:1050,dpr:1,zooms:[1,3.5]},{name:'desktop-dpr2',width:1440,height:1050,dpr:2,zooms:[3.5]},{name:'phone-dpr2',width:390,height:844,dpr:2,zooms:[3.5]}]){
      const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:config.dpr,reducedMotion:'reduce'}),page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/office-3d.js',route=>route.fulfill({contentType:'text/javascript',body:`(${installPixelProbe.toString()})();\n${source}`}));
      await page.goto('http://127.0.0.1:8787/?office=reference');
      await page.waitForFunction(()=>Office3D?.diagnostics().active&&Office3D.diagnostics().castAssets.state==='illustrated');
      if(await page.locator('#motion-toggle').getAttribute('aria-pressed')!=='true')await page.locator('#motion-toggle').click();
      const snapshot=()=>page.evaluate(()=>({actors:OfficeWorldView.getState().map(a=>({id:a.id,role:a.role,station:a.station,x:a.x,y:a.y})),camera:Office3D.diagnostics().camera}));
      async function pixels(label,{fixed=false,force=true}={}){
        const nonce=await page.evaluate(({fixed,force})=>{
          const nonce=__officeClarity.request({fixed});
          if(force){const draw=()=>{if(__officeClarity.last?.nonce!==nonce){Office3D.render(performance.now(),true);requestAnimationFrame(draw);}};draw();}
          return nonce;
        },{fixed,force});
        await page.waitForFunction(nonce=>__officeClarity.last?.nonce===nonce,nonce);
        const result=await page.evaluate(()=>({probe:__officeClarity.last,graphics:Office3D.diagnostics().graphics}));
        for(const [index,color]of result.probe.colors.entries()){const rgb=color.rgb.slice(0,3);if(!(rgb[index]>100&&rgb[index]>Math.max(...rgb.filter((_,i)=>i!==index))*1.5))failures.push({label,what:'Actual marker pixel misses public world projection',index,color});}
        if(result.probe.glError)failures.push({label,what:'GPU readback error',error:result.probe.glError});
        cases.push({label,...result});fs.writeFileSync(path.join(output,'illustrated-clarity-cases.json'),JSON.stringify({cases,errors,failures},null,2));return result;
      }
      for(const zoom of config.zooms){
        await page.locator('#graphics-style').selectOption('illustrated');
        await page.evaluate(zoom=>zoomOffice(zoom),zoom);
        const result=await pixels(`${config.name}-z${zoom}`),rect=result.probe.canvas.rect,art=result.graphics.renderArt.buffer,density=art.width/(rect.width*config.dpr);
        if(density<.72)failures.push({label:`${config.name}-z${zoom}`,what:'Visible scene is upscaled from insufficient source samples',density});
        if(result.probe.board.contrast<.28)failures.push({label:`${config.name}-z${zoom}`,what:'Actual high-frequency board loses close-zoom contrast',contrast:result.probe.board.contrast});
        if(art.width*art.height>4194304||art.width>4096||art.height>4096||result.probe.canvas.width*result.probe.canvas.height>8000000)failures.push({label:config.name,what:'Existing GPU pixel budgets exceeded'});
        await page.screenshot({path:path.join(output,`${config.name}-z${zoom}.png`)});
      }
      // A failed quality precondition is reported before checking interaction
      // behavior. This also gives the old-source diagnostic a precise failure.
      if(failures.length){
        fs.writeFileSync(path.join(output,'illustrated-clarity-result.json'),JSON.stringify({cases,errors,failures},null,2));
        console.log('ILLUSTRATED_CLARITY_FAILURES',JSON.stringify(failures));
        assert.deepEqual(failures,[],'actual rendered markers align and fine detail survives bounded close zoom');
      }
      if(config.name==='desktop-dpr1'){
        const before=await pixels('before-pan'),state=await snapshot();
        const nonce=await page.evaluate(()=>{const nonce=__officeClarity.request({fixed:true});cameraX+=60;applyOfficeCamera();return nonce;});
        await page.waitForFunction(nonce=>__officeClarity.last?.nonce===nonce,nonce,{timeout:3000});
        const pan=await page.evaluate(()=>({probe:__officeClarity.last,graphics:Office3D.diagnostics().graphics}));
        assert.equal(pan.probe.bufferResizes,before.probe.bufferResizes,'same-size pan redraws without reallocating the drawing buffer');
        assert.equal(pan.graphics.renderArt.resizeCount,before.graphics.renderArt.resizeCount,'same-size pan retains the compositor target');
        assert.ok(Math.abs(pan.probe.colors[1].screen.x-before.probe.colors[1].screen.x)>40,'fixed world marker moves with the actual pan');
        for(const [i,c]of pan.probe.colors.entries())assert.ok(c.rgb[i]>100&&c.rgb[i]>Math.max(...c.rgb.slice(0,3).filter((_,j)=>j!==i))*1.5,'panned actual pixels follow the public projection');
        assert.deepEqual(await snapshot(),state,'presentation pan preserves actor identities, physical positions and public camera');
        cases.push({label:'same-size-pan',...pan});
        await page.getByRole('button',{name:'Rotate office right 30 degrees'}).click();await pixels('rotated-320');
        for(const style of ['polished','pixel','low-poly','illustrated']){
          await page.locator('#graphics-style').selectOption(style);await pixels('switch-'+style);
          const css=await page.locator('canvas.office-3d').evaluate(c=>({left:c.style.left,top:c.style.top,width:c.style.width,height:c.style.height}));
          if(style!=='illustrated')assert.deepEqual(css,{left:'',top:'',width:'',height:''},'switching away clears viewport-specific canvas styles');
        }
      }
      await context.close();
    }
    const fallback=await browser.newContext({viewport:{width:390,height:844}});
    await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^webgl/.test(kind)?null:original.call(this,kind,...args);};});
    const page=await fallback.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8787/');await page.waitForFunction(()=>OfficeWorldView?.getLayout()?.stations.length>0);await page.locator('#graphics-style').selectOption('illustrated');assert.equal(await page.locator('svg.office').isVisible(),true,'unsupported GPU retains the office fallback');await fallback.close();
    fs.writeFileSync(path.join(output,'illustrated-clarity-result.json'),JSON.stringify({cases,errors,failures},null,2));
    console.log('ILLUSTRATED_CLARITY',JSON.stringify({cases:cases.map(c=>({label:c.label,contrast:c.probe.board.contrast,canvas:c.probe.canvas,art:c.graphics.renderArt.buffer})),errors,failures}));
    assert.deepEqual(errors,[]);assert.deepEqual(failures,[],'actual rendered markers align and fine detail survives bounded close zoom');
    console.log('PASS: actual host-renderer projected color pixels/detail, DPR1/2 and phone, bounded close zoom, same-size pan redraw, rotation, style cleanup and SVG fallback');
  }finally{
    await browser?.close();server.kill();await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});fs.rmSync(fixture,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
