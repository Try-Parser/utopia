/* Depth-derived presentation for the live scene; native UI stays outside it. */
window.OfficeRenderArt=(()=>{
  'use strict';
  const maxPixels=4194304,maxSide=4096;
  const vertexShader=`varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
  const fragmentShader=`
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cameraNear;
uniform float cameraFar;
uniform float perspective;
uniform float ink;
uniform float premultiplyOutput;
varying vec2 vUv;
vec4 colorAt(vec2 uv){return texture2D(tColor,clamp(uv,texel*0.5,vec2(1.0)-texel*0.5));}
float edgeLuma(vec4 color){
  float luma=dot(max(color.rgb,vec3(0.0)),vec3(0.299,0.587,0.114));
  return luma/(1.0+luma)+color.a*0.075;
}
vec4 antialiasedColor(vec2 uv){
  vec4 center=colorAt(uv),nw=colorAt(uv+vec2(-1.0,1.0)*texel),ne=colorAt(uv+texel),sw=colorAt(uv-texel),se=colorAt(uv+vec2(1.0,-1.0)*texel);
  float m=edgeLuma(center),a=edgeLuma(nw),b=edgeLuma(ne),c=edgeLuma(sw),d=edgeLuma(se);
  float low=min(m,min(min(a,b),min(c,d))),high=max(m,max(max(a,b),max(c,d)));
  if(high-low<max(0.015625,high*0.125))return center;
  vec2 direction=vec2(-((a+b)-(c+d)),(a+c)-(b+d));
  float reduce=max((a+b+c+d)*0.03125,0.0078125);
  direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduce),vec2(-3.0),vec2(3.0))*texel;
  // Mix coverage and premultiplied HDR RGB with exactly the same weights.
  // Unpremultiplication occurs only after this bounded edge resolve.
  vec4 narrow=0.5*(colorAt(uv-direction/6.0)+colorAt(uv+direction/6.0));
  vec4 wide=narrow*0.5+0.25*(colorAt(uv-direction*0.5)+colorAt(uv+direction*0.5));
  float resolved=edgeLuma(wide);return resolved<low||resolved>high?narrow:wide;
}
float depthAt(vec2 uv){
  float d=texture2D(tDepth,clamp(uv,texel*0.5,vec2(1.0)-texel*0.5)).x;
  return mix(cameraNear+(cameraFar-cameraNear)*d,cameraNear*cameraFar/(cameraFar-(cameraFar-cameraNear)*d),perspective);
}
float contact(vec2 offset,float z,vec2 slope){
  float other=depthAt(vUv+offset*texel);
  float delta=z+dot(slope,offset)-other;
  // The local view-depth gradient removes continuous floor/wall slope.
  // Only closer geometry within a bounded physical neighborhood grounds it.
  return smoothstep(2.0,15.0,delta)*(1.0-smoothstep(55.0,170.0,abs(delta)));
}
void main(){
  vec4 source=antialiasedColor(vUv);
  float z=depthAt(vUv);
  float east=depthAt(vUv+vec2(texel.x,0.0)),west=depthAt(vUv-vec2(texel.x,0.0));
  float north=depthAt(vUv+vec2(0.0,texel.y)),south=depthAt(vUv-vec2(0.0,texel.y));
  // Gradients use target texels, even when the HDR buffer is capped below
  // the final drawing buffer. Screen derivatives would use a different unit.
  vec2 slope=vec2(east-west,north-south)*0.5;
  if(source.a<0.0001){gl_FragColor=vec4(0.0);return;}
  float radius=mix(5.0,3.5,ink);
  float ao=contact(vec2(radius,0.0),z,slope)+contact(vec2(-radius,0.0),z,slope)
    +contact(vec2(0.0,radius),z,slope)+contact(vec2(0.0,-radius),z,slope)
    +contact(vec2(radius,radius)*0.7071,z,slope)+contact(vec2(-radius,radius)*0.7071,z,slope)
    +contact(vec2(radius,-radius)*0.7071,z,slope)+contact(vec2(-radius,-radius)*0.7071,z,slope);
  float curvature=max(abs(east+west-2.0*z),abs(north+south-2.0*z));
  float edge=smoothstep(2.0+z*0.0006,11.0+z*0.0012,curvature);
  // Offscreen blending stores premultiplied linear RGB over transparent black.
  // Grade and tone-map straight HDR color once, then restore canvas alpha.
  vec3 color=source.rgb/max(source.a,0.0001);
  color*=1.0-ao*mix(0.026,0.037,ink);
  color*=1.0-edge*ink*0.16;
  color*=vec3(1.016,1.002,0.981);
  gl_FragColor=vec4(color,source.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb*=mix(1.0,gl_FragColor.a,premultiplyOutput);
}`;
  function boundedSize(width,height,out){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return false;
    const scale=Math.min(1,maxSide/width,maxSide/height,Math.sqrt(maxPixels)/Math.sqrt(width)/Math.sqrt(height));
    out.width=Math.max(1,Math.min(maxSide,Math.floor(width*scale)));out.height=Math.max(1,Math.min(maxSide,Math.floor(height*scale)));return true;
  }
  function create(T,renderer){
    let target=null,depth=null,material=null,geometry=null,composite=null,screenCamera=null,gl=null;
    let supported=false,active=false,disposed=false,reason='initializing',shaderError=null,effectFrames=0,directFrames=0,resizeCount=0,width=0,height=0,framebufferValidated=false,premultipliedCanvas=true;
    const size=T?.Vector2?new T.Vector2():null,viewport=T?.Vector4?new T.Vector4():null,physicalViewport=T?.Vector4?new T.Vector4():null,boundViewport=T?.Vector4?new T.Vector4():null,clearColor=T?.Color?new T.Color():null;
    const state={target:null,cube:0,mip:0,autoClear:true,clearAlpha:0,shaderError:null,checkShaders:true};
    const next={width:0,height:0},sceneRender={triangles:0,calls:0};
    function disposeResources(){
      if(target){target.depthTexture=null;target.dispose();target=null;}
      if(depth)depth.dispose();
      depth=null;if(material){material.dispose();material=null;}if(geometry){geometry.dispose();geometry=null;}composite=null;screenCamera=null;
    }
    function fail(why,error){supported=false;active=false;reason=why;if(error)shaderError=String(error?.message||error).slice(0,2048);disposeResources();}
    const required=['Scene','OrthographicCamera','Mesh','PlaneGeometry','ShaderMaterial','WebGLRenderTarget','DepthTexture','Vector2','Vector4','Color'];
    try{
      if(!T||required.some(key=>typeof T[key]!=='function')||!renderer?.getContext||!renderer?.getDrawingBufferSize){reason='unsupported-api';}
      else{
        gl=renderer.getContext();
        if(gl.isContextLost()){reason='context-lost';}
        else if(!renderer.extensions?.has('EXT_color_buffer_float')){reason='unsupported-hdr-depth';}
        else{
          depth=new T.DepthTexture(1,1,T.UnsignedIntType);depth.minFilter=depth.magFilter=T.NearestFilter;depth.generateMipmaps=false;
          premultipliedCanvas=gl.getContextAttributes?.()?.premultipliedAlpha!==false;
          target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true,stencilBuffer:false,generateMipmaps:false});
          target.texture.colorSpace=T.LinearSRGBColorSpace;target.texture.name='office-art-hdr';target.depthTexture=depth;depth.name='office-art-depth';
          material=new T.ShaderMaterial({vertexShader,fragmentShader,uniforms:{tColor:{value:target.texture},tDepth:{value:depth},texel:{value:new T.Vector2(1,1)},cameraNear:{value:1},cameraFar:{value:12000},perspective:{value:1},ink:{value:1},premultiplyOutput:{value:1}},depthTest:false,depthWrite:false,blending:T.NoBlending,toneMapped:true});
          geometry=new T.PlaneGeometry(2,2);composite=new T.Scene();composite.add(new T.Mesh(geometry,material));screenCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);supported=true;reason='ready';
        }
      }
    }catch(error){fail('initialization-failed',error);}
    function captureState(){
      state.target=renderer.getRenderTarget();state.cube=renderer.getActiveCubeFace();state.mip=renderer.getActiveMipmapLevel();renderer.getViewport(viewport);renderer.getCurrentViewport(physicalViewport);state.autoClear=renderer.autoClear;renderer.getClearColor(clearColor);state.clearAlpha=renderer.getClearAlpha();state.shaderError=renderer.debug.onShaderError;state.checkShaders=renderer.debug.checkShaderErrors;
    }
    function restoreTarget(){
      renderer.setRenderTarget(state.target,state.cube,state.mip);renderer.getCurrentViewport(boundViewport);
      // Binding restores a target's physical viewport. Only an original
      // explicit logical override needs setViewport (which multiplies DPR).
      if(!boundViewport.equals(physicalViewport))renderer.setViewport(viewport);
    }
    function restoreState(){restoreTarget();renderer.autoClear=state.autoClear;renderer.setClearColor(clearColor,state.clearAlpha);renderer.debug.onShaderError=state.shaderError;renderer.debug.checkShaderErrors=state.checkShaders;}
    function onShaderError(context,program,vertex,fragment){
      shaderError=String(context.getProgramInfoLog(program)||context.getShaderInfoLog(vertex)||context.getShaderInfoLog(fragment)||'Shader compilation failed').slice(0,2048);
      if(typeof state.shaderError==='function')state.shaderError(context,program,vertex,fragment);
    }
    function rememberScene(){sceneRender.triangles=renderer.info?.render.triangles||0;sceneRender.calls=renderer.info?.render.calls||0;}
    function direct(scene,camera,why){active=false;reason=why;directFrames++;renderer.render(scene,camera);rememberScene();return false;}
    function render(scene,camera,style){
      if(disposed){active=false;reason='disposed';return false;}
      if(gl?.isContextLost()){fail('context-lost');return direct(scene,camera,'context-lost');}
      if(style!=='illustrated'&&style!=='polished')return direct(scene,camera,'direct-style');
      if(!supported)return direct(scene,camera,reason);
      if(renderer.xr?.enabled)return direct(scene,camera,'unsupported-xr');
      renderer.getDrawingBufferSize(size);if(!boundedSize(size.x,size.y,next))return direct(scene,camera,'invalid-buffer-size');
      let failure=null;captureState();
      try{
        if(next.width!==width||next.height!==height){width=next.width;height=next.height;target.setSize(width,height);material.uniforms.texel.value.set(1/width,1/height);resizeCount++;framebufferValidated=false;}
        renderer.autoClear=false;renderer.debug.checkShaderErrors=true;renderer.debug.onShaderError=onShaderError;
        // A render target already owns its physical-pixel viewport/scissor.
        // setViewport would multiply these dimensions by renderer DPR again.
        renderer.setRenderTarget(target);
        if(!framebufferValidated){if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('HDR/depth framebuffer is incomplete');framebufferValidated=true;}
        renderer.setClearColor(0,0);renderer.clear(true,true,true);renderer.render(scene,camera);rememberScene();
        if(shaderError)throw new Error(shaderError);
        material.uniforms.cameraNear.value=camera.near;material.uniforms.cameraFar.value=camera.far;material.uniforms.perspective.value=camera.isPerspectiveCamera?1:0;material.uniforms.ink.value=style==='illustrated'?1:0;
        material.uniforms.premultiplyOutput.value=state.target||premultipliedCanvas?1:0;
        restoreTarget();renderer.render(composite,screenCamera);if(shaderError)throw new Error(shaderError);
        effectFrames++;active=true;reason='depth-composite';
      }catch(error){failure=error;}
      finally{restoreState();}
      if(failure){fail(shaderError?'shader-failed':'render-failed',failure);return direct(scene,camera,reason);}
      return true;
    }
    function dispose(){if(disposed)return;disposed=true;active=false;reason='disposed';disposeResources();}
    function diagnostics(){return {supported,active,disposed,reason,shaderError,effectFrames,directFrames,resizeCount,antialiasing:active?'alpha-fxaa':'direct',sceneRender:{...sceneRender},buffer:{width,height,maxPixels,maxSide},resources:{renderTargets:target?1:0,depthTextures:depth?1:0,compositeMaterials:material?1:0,compositeGeometries:geometry?1:0},depthShading:active,ink:active&&material?.uniforms.ink.value===1};}
    return {render,dispose,diagnostics};
  }
  return {create};
})();
