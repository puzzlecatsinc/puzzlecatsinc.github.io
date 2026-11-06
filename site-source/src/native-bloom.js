/** Authored low-resolution bloom. No environment map or external texture. */
import * as T from 'three';
const yieldMain=()=>globalThis.scheduler?.yield?scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
export function createBloom(renderer,kind){
  const source=new T.WebGLRenderTarget(1,1,{depthBuffer:true}),blurred=new T.WebGLRenderTarget(1,1,{depthBuffer:false});
  const geometry=new T.PlaneGeometry(2,2),scene=new T.Scene(),camera=new T.Camera();
  const vertexShader='varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const fragmentShader=`varying vec2 uv0;uniform sampler2D source;uniform sampler2D coverage;uniform vec2 stepSize;uniform float extract;uniform float strength;
    vec3 sampleLight(vec2 p){vec3 c=texture2D(source,p).rgb;float l=dot(c,vec3(.2126,.7152,.0722));return c*mix(1.,smoothstep(.48,.82,l),extract);}
    void main(){vec3 c=sampleLight(uv0)*.1633;
      c+=(sampleLight(uv0-stepSize)+sampleLight(uv0+stepSize))*.1531;
      c+=(sampleLight(uv0-stepSize*2.)+sampleLight(uv0+stepSize*2.))*.12245;
      c+=(sampleLight(uv0-stepSize*3.)+sampleLight(uv0+stepSize*3.))*.0918;
      c+=(sampleLight(uv0-stepSize*4.)+sampleLight(uv0+stepSize*4.))*.051;
      if(extract>.5){gl_FragColor=vec4(c,1.);}else{float visibility=1.-texture2D(coverage,uv0).a*.99;float a=max(c.r,max(c.g,c.b))*strength*visibility;gl_FragColor=vec4(c/max(max(c.r,max(c.g,c.b)),.001),a);}}
  `;
  const horizontal=new T.ShaderMaterial({vertexShader,fragmentShader,uniforms:{source:{value:source.texture},coverage:{value:source.texture},stepSize:{value:new T.Vector2(1/(kind==='hero'?212:275),0)},extract:{value:1},strength:{value:1}},depthTest:false,depthWrite:false,toneMapped:false});
  const composite=new T.ShaderMaterial({vertexShader,fragmentShader,uniforms:{source:{value:blurred.texture},coverage:{value:source.texture},stepSize:{value:new T.Vector2(0,1/(kind==='hero'?133:150))},extract:{value:0},strength:{value:1.1}},transparent:true,blending:T.AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false});
  const quad=new T.Mesh(geometry,horizontal);quad.frustumCulled=false;scene.add(quad);
  let width=0,height=0;
  return {
    resize(w,h){
      // The reference's glow shrinks less than its geometry on narrow screens.
      const spread=Math.max(1,Math.min(1.8,Math.sqrt((kind==='hero'?847:1100)/w)));
      horizontal.uniforms.stepSize.value.set(spread/(kind==='hero'?212:275),0);
      composite.uniforms.stepSize.value.set(0,spread/(kind==='hero'?133:150));
      const x=Math.max(1,Math.ceil(w/4)),y=Math.max(1,Math.ceil(h/4));if(x===width&&y===height)return;width=x;height=y;source.setSize(x,y);blurred.setSize(x,y);
    },
    async prepare(world,worldCamera){
      renderer.setRenderTarget(source);await renderer.compileAsync(world,worldCamera);await yieldMain();
      quad.material=horizontal;renderer.setRenderTarget(blurred);await renderer.compileAsync(scene,camera);await yieldMain();
      quad.material=composite;renderer.setRenderTarget(null);await renderer.compileAsync(scene,camera);await yieldMain();
      renderer.initRenderTarget(source);renderer.initRenderTarget(blurred);await yieldMain();
    },
    render(world,worldCamera){
      const autoClear=renderer.autoClear;renderer.autoClear=true;
      renderer.setRenderTarget(source);renderer.render(world,worldCamera);
      quad.material=horizontal;renderer.setRenderTarget(blurred);renderer.render(scene,camera);
      quad.material=composite;renderer.setRenderTarget(null);renderer.autoClear=false;renderer.render(scene,camera);renderer.autoClear=autoClear;
    },
    snapshot(){return {width,height,drawPasses:3};},
    dispose(){source.dispose();blurred.dispose();horizontal.dispose();composite.dispose();geometry.dispose();}
  };
}
