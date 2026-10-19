const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const crypto=require('node:crypto');const path=require('node:path');

function setup(options={}){
  const context=vm.createContext({console,window:{}});vm.runInContext(fs.readFileSync(path.join(__dirname,'vendor/three.min.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(__dirname,'office-art.js'),'utf8'),context);
  const T=context.OfficeThree,created={target:0,depth:0,material:0,geometry:0},disposed={target:0,depth:0,material:0,geometry:0},owned={};
  const instrument={...T};
  for(const [name,key]of [['WebGLRenderTarget','target'],['DepthTexture','depth'],['ShaderMaterial','material'],['PlaneGeometry','geometry']])instrument[name]=class extends T[name]{constructor(...args){super(...args);created[key]++;owned[key]=this;this.addEventListener('dispose',()=>disposed[key]++);}};
  let lost=false,status=36053,shaderFailure=false,renderFailure=false,checks=0;
  const gl={FRAMEBUFFER:36160,FRAMEBUFFER_COMPLETE:36053,isContextLost:()=>lost,checkFramebufferStatus:()=>{checks++;return status;},getContextAttributes:()=>({premultipliedAlpha:options.premultipliedAlpha!==false}),getProgramInfoLog:()=> 'fixture composite shader failed',getShaderInfoLog:()=>''};
  const pixelRatio=options.pixelRatio||1,viewport=new T.Vector4(3,4,640,480),scissor=new T.Vector4(8,9,100,90),color=new T.Color('#204060');const originalTarget=options.defaultTarget?null:new T.WebGLRenderTarget(512,400),calls=[];
  if(originalTarget){originalTarget.viewport.set(13,17,310,240);originalTarget.scissor.set(19,23,90,80);originalTarget.scissorTest=false;}
  const physicalViewport=originalTarget?originalTarget.viewport.clone():viewport.clone().multiplyScalar(pixelRatio).floor(),physicalScissor=originalTarget?originalTarget.scissor.clone():scissor.clone().multiplyScalar(pixelRatio).floor();
  if(options.explicitViewport)physicalViewport.copy(viewport).multiplyScalar(pixelRatio).round();
  let currentTarget=originalTarget,cube=2,mip=3,scissorTest=true,physicalScissorTest=originalTarget?originalTarget.scissorTest:scissorTest,alpha=.35;
  // Match the pinned renderer: public viewport/scissor setters are logical and
  // multiply DPR; binding a render target consumes its physical viewport.
  const renderer={autoClear:true,toneMapping:T.ACESFilmicToneMapping,toneMappingExposure:1.17,outputColorSpace:T.SRGBColorSpace,xr:{enabled:false},debug:{checkShaderErrors:false,onShaderError:null},info:{render:{triangles:0,calls:0}},extensions:{has:()=>options.supported!==false},buffer:new T.Vector2(Math.floor(1200*pixelRatio),Math.floor(800*pixelRatio)),getContext:()=>gl,getPixelRatio:()=>pixelRatio,setPixelRatio(){assert.fail('the compositor cannot change renderer DPR');},setSize(){assert.fail('the compositor cannot resize the renderer canvas');},getDrawingBufferSize(out){return out.copy(this.buffer);},getRenderTarget:()=>currentTarget,getActiveCubeFace:()=>cube,getActiveMipmapLevel:()=>mip,getViewport:out=>out.copy(viewport),getCurrentViewport:out=>out.copy(physicalViewport),getScissor:out=>out.copy(scissor),getScissorTest:()=>scissorTest,getClearColor:out=>out.copy(color),getClearAlpha:()=>alpha,
  setRenderTarget(target,face=0,level=0){currentTarget=target;cube=face;mip=level;if(target){physicalViewport.copy(target.viewport);physicalScissor.copy(target.scissor);physicalScissorTest=target.scissorTest;}else{physicalViewport.copy(viewport).multiplyScalar(pixelRatio).floor();physicalScissor.copy(scissor).multiplyScalar(pixelRatio).floor();physicalScissorTest=scissorTest;}},
  setViewport(x,y,z,w){if(x?.isVector4)viewport.copy(x);else viewport.set(x,y,z,w);physicalViewport.copy(viewport).multiplyScalar(pixelRatio).round();},setScissor(x,y,z,w){if(x?.isVector4)scissor.copy(x);else scissor.set(x,y,z,w);physicalScissor.copy(scissor).multiplyScalar(pixelRatio).round();},setScissorTest(value){scissorTest=physicalScissorTest=value;},setClearColor(value,nextAlpha=1){color.set(value);alpha=nextAlpha;},clear(){},render(scene,camera){
    const composite=scene.children.some(child=>child.material?.isShaderMaterial);calls.push({scene,camera,target:currentTarget,viewport:physicalViewport.toArray(),logicalViewport:viewport.toArray(),scissor:physicalScissor.toArray(),scissorTest:physicalScissorTest,composite});
    if(composite&&shaderFailure)this.debug.onShaderError(gl,{}, {}, {});
    if(composite&&renderFailure)throw new Error('fixture composite rendering failed');
    this.info.render={triangles:composite?2:471,calls:composite?1:17};
  }};
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1.5,2,12000),before={target:originalTarget,cube,mip,viewport:viewport.toArray(),scissor:scissor.toArray(),physicalViewport:physicalViewport.toArray(),physicalScissor:physicalScissor.toArray(),physicalScissorTest,scissorTest,alpha,color:color.getHex(),autoClear:renderer.autoClear,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,colorSpace:renderer.outputColorSpace,checkShaders:renderer.debug.checkShaderErrors,shaderError:renderer.debug.onShaderError};
  const art=context.window.OfficeRenderArt.create(instrument,renderer);
  function restored(){assert.equal(currentTarget,before.target);assert.equal(cube,before.cube);assert.equal(mip,before.mip);assert.deepEqual(viewport.toArray(),before.viewport);assert.deepEqual(physicalViewport.toArray(),before.physicalViewport);assert.deepEqual(scissor.toArray(),before.scissor);assert.deepEqual(physicalScissor.toArray(),before.physicalScissor);assert.equal(physicalScissorTest,before.physicalScissorTest);assert.equal(scissorTest,before.scissorTest);assert.equal(alpha,before.alpha);assert.equal(color.getHex(),before.color);assert.equal(renderer.autoClear,before.autoClear);assert.equal(renderer.toneMapping,before.toneMapping);assert.equal(renderer.toneMappingExposure,before.exposure);assert.equal(renderer.outputColorSpace,before.colorSpace);assert.equal(renderer.debug.checkShaderErrors,before.checkShaders);assert.equal(renderer.debug.onShaderError,before.shaderError);assert.equal(renderer.getPixelRatio(),pixelRatio);}
  return {T,art,renderer,scene,camera,created,disposed,owned,calls,restored,before,setLost:()=>{lost=true;},setIncomplete:()=>{status=36054;},setShaderFailure:()=>{shaderFailure=true;},setRenderFailure:()=>{renderFailure=true;},checks:()=>checks};
}

test('render art contract bounds one HDR/depth/composite pool and two direct styles',()=>{
  const bytes=fs.readFileSync(path.join(__dirname,'render-art.contract.json'),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'e37dc48f04e4eea1a2fd409456ab8857d3bfb6932133399d1a24e65d7bb5dae6');
  const golden=JSON.parse(bytes),f=setup();
  assert.equal(golden.version,2);assert.equal(golden.buffer.maxPixels,4194304);assert.equal(golden.buffer.maxSide,4096);assert.equal(golden.viewport.renderTargetUnits,'physical-framebuffer-pixels');assert.equal(golden.antialiasing.method,'alpha-fxaa');
  assert.equal(f.art.diagnostics().supported,true);assert.equal(f.created.target,golden.resources.renderTargets);assert.equal(f.created.depth,golden.resources.depthTextures);assert.equal(f.created.material,golden.resources.compositeMaterials);
  assert.equal(f.owned.target.texture.type,f.T.HalfFloatType);assert.equal(f.owned.target.texture.colorSpace,f.T.LinearSRGBColorSpace);assert.equal(f.owned.target.depthTexture,f.owned.depth);assert.equal(f.owned.depth.type,f.T.UnsignedIntType);
  for(const [style,expected]of Object.entries(golden.styles)){const start=f.calls.length;assert.equal(f.art.render(f.scene,f.camera,style),expected.depthShading);const d=f.art.diagnostics();assert.equal(d.depthShading,expected.depthShading);assert.equal(d.ink,expected.ink);assert.equal(d.antialiasing,expected.depthShading?golden.antialiasing.method:'direct');assert.equal(f.calls.length-start,expected.depthShading?2:1);assert.equal(f.calls[start].scene,f.scene);assert.equal(f.calls[start].camera,f.camera);f.restored();}
  f.art.dispose();
});

test('supported effects preserve renderer and camera state and retain scene draw statistics',()=>{
  const f=setup(),matrix=f.camera.matrixWorld.toArray(),projection=f.camera.projectionMatrix.toArray();
  assert.equal(f.art.render(f.scene,f.camera,'illustrated'),true);f.restored();
  assert.deepEqual(f.camera.matrixWorld.toArray(),matrix);assert.deepEqual(f.camera.projectionMatrix.toArray(),projection);
  assert.deepEqual({...f.art.diagnostics().sceneRender},{triangles:471,calls:17});assert.equal(f.renderer.info.render.triangles,2,'the composite is a separate draw, never reported as scene geometry');
  assert.equal(f.calls[0].target,f.owned.target);assert.equal(f.calls[0].scissorTest,false);assert.equal(f.calls[1].composite,true);assert.equal(f.owned.material.uniforms.cameraNear.value,f.camera.near);assert.equal(f.owned.material.uniforms.cameraFar.value,f.camera.far);assert.equal(f.owned.material.uniforms.perspective.value,1);
  f.art.render(f.scene,f.camera,'polished');assert.equal(f.art.diagnostics().ink,false);assert.equal(f.art.diagnostics().effectFrames,2);assert.equal(f.checks(),1,'validate a framebuffer once per resize');f.restored();f.art.dispose();
});

test('source viewport stays in physical target pixels at DPR 1, 1.95 and 3, including capped buffers',()=>{
  let capped=false;
  for(const pixelRatio of [1,1.95,3])for(const defaultTarget of [true,false])for(const explicitViewport of [true,false]){
    const f=setup({pixelRatio,defaultTarget,explicitViewport}),cameraWorld=f.camera.matrixWorld.toArray(),cameraProjection=f.camera.projectionMatrix.toArray();
    for(const style of ['illustrated','polished']){
      const start=f.calls.length;assert.equal(f.art.render(f.scene,f.camera,style),true);const source=f.calls[start],screen=f.calls[start+1],buffer=f.art.diagnostics().buffer;
      assert.deepEqual(Array.from(source.viewport),[0,0,buffer.width,buffer.height],`${style} source physical viewport at DPR ${pixelRatio}`);
      assert.deepEqual(Array.from(source.scissor),[0,0,buffer.width,buffer.height]);assert.equal(source.scissorTest,false);
      assert.deepEqual(source.logicalViewport,f.before.viewport,'binding a physical target never overwrites the logical renderer viewport');
      assert.deepEqual(screen.viewport,f.before.physicalViewport,'composite returns to the actual original physical viewport');
      assert.deepEqual(screen.scissor,f.before.physicalScissor);assert.equal(screen.scissorTest,f.before.physicalScissorTest);
      assert.deepEqual(f.camera.matrixWorld.toArray(),cameraWorld);assert.deepEqual(f.camera.projectionMatrix.toArray(),cameraProjection);f.restored();
      if(buffer.width<f.renderer.buffer.x||buffer.height<f.renderer.buffer.y)capped=true;
    }
    f.art.dispose();
  }
  assert.equal(capped,true,'DPR 3 exercises a source framebuffer smaller than the renderer drawing buffer');
});

test('extreme finite buffers remain bounded and repeated frames reuse owned GPU resources',()=>{
  const f=setup();
  for(const [width,height]of [[1200,800],[1e308,1e308],[1e308,1],[1,1e308],[8192,8192],[10000,2000],[1,1],[3840,2160]]){
    f.renderer.buffer.set(width,height);assert.equal(f.art.render(f.scene,f.camera,'illustrated'),true);const b=f.art.diagnostics().buffer;
    assert.ok(Number.isInteger(b.width)&&Number.isInteger(b.height));assert.ok(b.width>0&&b.height>0&&b.width<=4096&&b.height<=4096);assert.ok(b.width*b.height<=4194304);f.restored();
  }
  const allocations={...f.created},resizes=f.art.diagnostics().resizeCount;
  for(let i=0;i<100;i++)assert.equal(f.art.render(f.scene,f.camera,i%2?'polished':'illustrated'),true);
  assert.deepEqual(f.created,allocations);assert.equal(f.art.diagnostics().resizeCount,resizes);assert.deepEqual(allocations,{target:1,depth:1,material:1,geometry:1});f.art.dispose();
});

test('invalid buffer sizes and unrecognized or direct styles preserve the direct renderer',()=>{
  const f=setup();
  for(const [width,height]of [[0,100],[-1,100],[NaN,100],[Infinity,100],[100,Infinity]]){f.renderer.buffer.set(width,height);assert.equal(f.art.render(f.scene,f.camera,'illustrated'),false);assert.equal(f.art.diagnostics().reason,'invalid-buffer-size');f.restored();}
  for(const style of ['pixel','low-poly','unknown',null,{},'__proto__']){assert.equal(f.art.render(f.scene,f.camera,style),false);assert.equal(f.art.diagnostics().reason,'direct-style');f.restored();}
  f.renderer.buffer.set(800,600);assert.equal(f.art.render(f.scene,f.camera,'illustrated'),true,'an invalid-size frame does not permanently disable capability');f.art.dispose();
});

test('unsupported HDR, XR and context loss report the fallback and release owned resources',()=>{
  const unavailable=setup({supported:false});assert.equal(unavailable.art.diagnostics().supported,false);assert.equal(unavailable.art.render(unavailable.scene,unavailable.camera,'illustrated'),false);assert.equal(unavailable.art.diagnostics().reason,'unsupported-hdr-depth');assert.deepEqual(unavailable.created,{target:0,depth:0,material:0,geometry:0});unavailable.restored();unavailable.art.dispose();
  const f=setup();f.renderer.xr.enabled=true;assert.equal(f.art.render(f.scene,f.camera,'illustrated'),false);assert.equal(f.art.diagnostics().reason,'unsupported-xr');f.renderer.xr.enabled=false;assert.equal(f.art.render(f.scene,f.camera,'illustrated'),true);f.setLost();assert.equal(f.art.render(f.scene,f.camera,'illustrated'),false);assert.equal(f.art.diagnostics().reason,'context-lost');assert.equal(f.art.diagnostics().resources.renderTargets,0);assert.equal(f.disposed.depth,1);f.art.dispose();assert.equal(f.disposed.depth,1);f.restored();
});

test('incomplete framebuffers and real shader error callbacks restore state and fail visibly',()=>{
  for(const error of ['framebuffer','shader','render']){
    const f=setup();if(error==='framebuffer')f.setIncomplete();else if(error==='shader')f.setShaderFailure();else f.setRenderFailure();
    assert.equal(f.art.render(f.scene,f.camera,'illustrated'),false);const d=f.art.diagnostics();assert.equal(d.supported,false);assert.equal(d.active,false);assert.equal(d.reason,error==='shader'?'shader-failed':'render-failed');assert.match(d.shaderError,error==='framebuffer'?/framebuffer/i:error==='shader'?/shader failed/:/rendering failed/);assert.equal(d.resources.renderTargets,0);assert.equal(f.calls.at(-1).scene,f.scene,'the original live scene is used after an effect failure');f.restored();
    const count=f.calls.length;assert.equal(f.art.render(f.scene,f.camera,'polished'),false);assert.equal(f.calls.length,count+1,'a failed effect is not retried every frame');f.art.dispose();
  }
});

test('disposal is idempotent and no resource is recreated or rendered afterwards',()=>{
  const f=setup();f.art.render(f.scene,f.camera,'illustrated');f.art.dispose();const counts={...f.disposed},calls=f.calls.length;f.art.dispose();assert.deepEqual(f.disposed,counts);assert.equal(f.disposed.depth,1);assert.equal(f.disposed.material,1);assert.equal(f.disposed.geometry,1);assert.equal(f.art.render(f.scene,f.camera,'polished'),false);assert.equal(f.calls.length,calls);assert.equal(f.art.diagnostics().reason,'disposed');assert.equal(f.art.diagnostics().resources.renderTargets,0);f.restored();
});

test('output alpha obeys the actual canvas context and target conventions',()=>{
  for(const premultipliedAlpha of [true,false]){const f=setup({defaultTarget:true,premultipliedAlpha});f.art.render(f.scene,f.camera,'illustrated');assert.equal(f.owned.material.uniforms.premultiplyOutput.value,premultipliedAlpha?1:0);f.restored();f.art.dispose();}
  const f=setup({premultipliedAlpha:false});f.art.render(f.scene,f.camera,'illustrated');assert.equal(f.owned.material.uniforms.premultiplyOutput.value,1,'render targets retain premultiplied RGB independently of the eventual canvas');f.art.dispose();
});
