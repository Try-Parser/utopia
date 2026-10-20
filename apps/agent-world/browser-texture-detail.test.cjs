/* Real compositor pixels: preserve painted detail while resolving transparent edges. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.EVIDENCE_DIR||'/tmp/agent-world-texture-detail';
fs.mkdirSync(output,{recursive:true});

(async()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'texture-detail-'));
  const server=spawn('python3',['tests/fixtures/agent_world_server.py',fixture],{stdio:'pipe'});
  const origin='http://127.0.0.1:8787',errors=[],failures=[],cases=[];
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    if(process.env.TEXTURE_ART_SOURCE){
      const source=fs.readFileSync(process.env.TEXTURE_ART_SOURCE,'utf8');
      await page.route('**/office-art.js',route=>route.fulfill({contentType:'text/javascript',body:source}));
    }
    // Isolate only the document; use the actual shipped Three and compositor.
    await page.route(origin+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}canvas{display:block}</style><script src="/vendor/three.min.js"></script><script src="/office-art.js"></script>'}));
    await page.goto(origin);
    await page.waitForFunction(()=>window.OfficeThree&&window.OfficeRenderArt?.create);
    for(const kind of ['opaque-texture','translucent-silhouette']){
      const result=await page.evaluate(kind=>{
        const T=OfficeThree,width=1024,height=768;
        const renderer=new T.WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
        renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.setClearColor(0,0);
        renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
        document.body.append(renderer.domElement);
        const gl=renderer.getContext(),scene=new T.Scene(),camera=new T.OrthographicCamera(0,width,height,0,.1,10);
        camera.position.z=1;camera.updateMatrixWorld();
        const geometry=new T.PlaneGeometry(kind==='opaque-texture'?width:470,kind==='opaque-texture'?height:280);
        let texture,material,art;
        if(kind==='opaque-texture'){
          const source=document.createElement('canvas');source.width=width;source.height=height;
          const context=source.getContext('2d');context.fillStyle='#101010';context.fillRect(0,0,width,height);
          context.fillStyle='#eeeeee';context.fillRect(width/2,0,width/2,96);
          for(const [top,bottom,period]of [[144,304,8],[368,528,16]]){
            const data=context.createImageData(width,bottom-top);
            for(let y=0;y<bottom-top;y++)for(let x=0;x<width;x++){
              const value=(x+y)%period<period/2?238:16,index=(y*width+x)*4;
              data.data[index]=data.data[index+1]=data.data[index+2]=value;data.data[index+3]=255;
            }
            context.putImageData(data,0,top);
          }
          texture=new T.CanvasTexture(source);texture.colorSpace=T.SRGBColorSpace;
          texture.magFilter=texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;
          material=new T.MeshBasicMaterial({map:texture,toneMapped:false});
        }else material=new T.MeshBasicMaterial({color:0x269ee8,transparent:true,opacity:.5,depthWrite:false});
        const plane=new T.Mesh(geometry,material);plane.position.set(width/2,height/2,0);
        if(kind==='translucent-silhouette')plane.rotation.z=.41;
        scene.add(plane);
        function capture(){
          const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          const at=(x,y,channel=0)=>pixels[((height-1-y)*width+x)*4+channel]/255;
          function stats(x0,y0,x1,y1){
            let n=0,sum=0,sum2=0,gradient=0;
            for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
              const value=at(x,y);sum+=value;sum2+=value*value;gradient+=Math.abs(value-at(x+1,y));n++;
            }
            return {mean:sum/n,std:Math.sqrt(Math.max(0,sum2/n-(sum/n)**2)),gradient:gradient/n};
          }
          const black=stats(32,20,420,72).mean,white=stats(600,20,980,72).mean,range=white-black;
          const patterns=[{period:8,top:160,bottom:288},{period:16,top:384,bottom:512}].map(pattern=>{
            const measured=stats(64,pattern.top,960,pattern.bottom);
            return {period:pattern.period,contrast:measured.std/Math.max(.001,range),gradient:measured.gradient/Math.max(.001,range)};
          });
          let maxAlpha=0,alphaSum=0,xsum=0,ysum=0,left=width,right=-1,top=height,bottom=-1;
          for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const alpha=at(x,y,3);maxAlpha=Math.max(maxAlpha,alpha);
            if(alpha>0){alphaSum+=alpha;xsum+=(x+.5)*alpha;ysum+=(y+.5)*alpha;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
          }
          let coveredEdgePixels=0;
          for(let y=0;y<height;y++)for(let x=0;x<width;x++){const alpha=at(x,y,3);if(alpha>0&&alpha<maxAlpha-2/255)coveredEdgePixels++;}
          return {patterns,range,maxAlpha,alphaSum,coveredEdgePixels,bounds:{left,right,top,bottom},centroid:{x:xsum/alphaSum,y:ysum/alphaSum},glError:gl.getError(),png:renderer.domElement.toDataURL('image/png')};
        }
        try{
          renderer.render(scene,camera);const direct=capture(),effects=[];
          art=OfficeRenderArt.create(T,renderer);
          for(const style of ['illustrated','polished']){art.render(scene,camera,style);effects.push({style,pixels:capture(),diagnostics:art.diagnostics()});}
          return {kind,direct,effects,depthWrite:material.depthWrite,contextAttributes:gl.getContextAttributes()};
        }finally{art?.dispose();texture?.dispose();geometry.dispose();material.dispose();renderer.dispose();renderer.domElement.remove();}
      },kind);
      for(const [style,capture]of [['direct',result.direct],...result.effects.map(effect=>[effect.style,effect.pixels])]){
        fs.writeFileSync(path.join(output,kind+'-'+style+'.png'),Buffer.from(capture.png.split(',')[1],'base64'));delete capture.png;
      }
      if(result.direct.glError||!result.contextAttributes.antialias)failures.push({kind,what:'direct GPU fixture must support antialiasing without readback errors'});
      if(kind==='opaque-texture'&&(!Number.isFinite(result.direct.range)||result.direct.range<.5||result.direct.patterns.some(pattern=>!Number.isFinite(pattern.contrast)||pattern.contrast<.45)))failures.push({kind,what:'direct fixture must contain the intended high-contrast texture'});
      if(kind==='translucent-silhouette'&&(result.direct.coveredEdgePixels<10||Math.abs(result.direct.maxAlpha-.5)>2/255))failures.push({kind,what:'direct fixture must contain half-opacity antialiased diagonal edges'});
      for(const effect of result.effects){
        const tag={kind,style:effect.style},pixels=effect.pixels,direct=result.direct,diagnostics=effect.diagnostics;
        if(!diagnostics.active||diagnostics.shaderError||pixels.glError)failures.push({...tag,what:'actual compositor or GPU failed',diagnostics,glError:pixels.glError});
        if(diagnostics.buffer.width*diagnostics.buffer.height>4194304)failures.push({...tag,what:'compositor exceeds existing pixel budget'});
        if(kind==='opaque-texture')for(let index=0;index<direct.patterns.length;index++){
          const reference=direct.patterns[index],actual=pixels.patterns[index];
          actual.contrastRetention=actual.contrast/reference.contrast;actual.gradientRetention=actual.gradient/reference.gradient;
          if(!Number.isFinite(actual.contrastRetention)||!Number.isFinite(actual.gradientRetention)||actual.contrastRetention<.95||actual.gradientRetention<.95)failures.push({...tag,what:'opaque albedo detail is smoothed',period:actual.period,contrastRetention:actual.contrastRetention,gradientRetention:actual.gradientRetention});
        }else{
          if(result.depthWrite!==false)failures.push({...tag,what:'transparent fixture must not write depth'});
          for(const axis of ['left','right','top','bottom'])if(Math.abs(pixels.bounds[axis]-direct.bounds[axis])>2)failures.push({...tag,what:'transparent silhouette shifts',axis,direct:direct.bounds[axis],effect:pixels.bounds[axis]});
          if(Math.hypot(pixels.centroid.x-direct.centroid.x,pixels.centroid.y-direct.centroid.y)>2)failures.push({...tag,what:'transparent alpha centroid shifts'});
          if(Math.abs(pixels.alphaSum/direct.alphaSum-1)>.01||Math.abs(pixels.maxAlpha-direct.maxAlpha)>2/255)failures.push({...tag,what:'transparent coverage/opacity changes'});
          if(pixels.coveredEdgePixels<Math.max(10,direct.coveredEdgePixels*.25))failures.push({...tag,what:'transparent diagonal loses antialiased coverage',direct:direct.coveredEdgePixels,effect:pixels.coveredEdgePixels});
        }
      }
      cases.push(result);console.log('TEXTURE_DETAIL_CASE',JSON.stringify(result));
    }
    fs.writeFileSync(path.join(output,'texture-detail-result.json'),JSON.stringify({cases,errors,failures},null,2));
    assert.deepEqual(errors,[]);assert.deepEqual(failures,[],'actual painted detail and transparent geometry must both survive the compositor');
    console.log('PASS: opaque detail retains >=95% direct contrast/gradient and depthWrite=false transparent diagonals retain coverage in both effect styles');
  }finally{
    await browser?.close();server.kill();
    await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(()=>{server.kill('SIGKILL');resolve();},5000).unref();});
    fs.rmSync(fixture,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
