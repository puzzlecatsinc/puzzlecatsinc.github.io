/** Site-owned artwork. Geometry, textures and timelines are constructed here.
 * Three.js (MIT) supplies only the general-purpose WebGL renderer. */
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { createBloom } from './native-bloom.js';
import catMark from '../public/assets/67d3e45b5509b201e76e022f_pc-icon.svg';

const instances = new WeakMap();
export const getArtwork = canvas => instances.get(canvas);
const TAU = Math.PI * 2;
const yieldMain = () => globalThis.scheduler?.yield ? scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
let markTemplate;
async function coinMarkGeometry() {
  if (!markTemplate) {
    const templates=[];
    for (const path of new SVGLoader().parse(catMark).paths) {
      for (const shape of SVGLoader.createShapes(path)) {
        templates.push(new T.ExtrudeGeometry(shape,{depth:.6,bevelEnabled:true,bevelThickness:.25,bevelSize:.25,bevelSegments:2,curveSegments:8}));
        await yieldMain();
      }
    }
    // CPU-only templates are never uploaded; each scene owns disposable clones.
    markTemplate=templates;
  }
  return markTemplate.map(geometry=>geometry.clone());
}
function disposeWorld(world) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  world.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m)materials.add(m);});
  for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}
  for(const t of textures)t.dispose();for(const g of geometries)g.dispose();
}
function coinMaterial(radius, surface) {
  // Analytic studio reflections: no downloaded environment or runtime PMREM.
  return new T.ShaderMaterial({uniforms:{radius:{value:radius},surface:{value:surface},narrow:{value:0}},
    vertexShader:`varying vec3 n;varying vec3 v;varying vec3 q;varying vec3 l;uniform float radius;uniform float surface;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vec3 N=normal;if(surface>.5&&surface<1.5)N=normalize(normal+vec3(position.xy/radius*.10,0.));n=normalize(normalMatrix*N);v=normalize(-p.xyz);q=mat3(modelViewMatrix)*position/radius;l=position/radius;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec3 n;varying vec3 v;varying vec3 q;varying vec3 l;uniform float surface;uniform float radius;uniform float narrow;void main(){vec3 N=normalize(n);vec3 R=reflect(-normalize(v),N);float facing=abs(N.z);float y=clamp((surface>.5&&surface<1.5?l.y:q.y)*.5+.5,0.,1.);float panel=exp(-pow((R.x+.30)/.32,2.))*smoothstep(-.7,.8,R.y);float band=exp(-pow((R.x-.68)/.17,2.))*.5;vec3 c=mix(vec3(.76,.565,.07),vec3(1.01,.845,.36),y);c*=.90+.10*facing;c+=max(0.,1.-abs(y-.5)*4.)*vec3(.04,.045,.03);if(surface<.5){c=mix(vec3(.50,.34,.005),vec3(1.,.84,.15),pow(abs(N.x),.65));c+=vec3(.30,.24,.04)*panel+vec3(.10,.09,.02)*band;float softbox=pow(abs(N.x),3.)*(.5+.5*sin(N.y*5.+N.z*3.));c+=vec3(.03,.065,.30)*softbox;}else if(surface>2.5){float markY=clamp(1.-l.y*radius/48.,0.,1.);c=mix(vec3(.66,.45,.10),vec3(.79,.58,.20),markY)+vec3(.12,.09,.02)*(1.-facing);}else if(surface>1.5){c=vec3(.97,.72,.15)+vec3(.10,.13,.12)*panel;}else{float sweep=exp(-pow((q.x*.3+R.x+.25)/.36,2.));float windowLight=exp(-pow((R.x+.35)/.60,2.)-pow((R.y-.4)/.8,2.));c+=vec3(.13,.10,.045)*(windowLight-.55)+vec3(.09,.07,.025)*sweep*max(R.y,.0);float tilt=1.-facing;c+=vec3(.12,.10,0.)*tilt+vec3(0.,0.,.40)*min(tilt,.5)-vec3(.018,.035,.03)*facing;c-=vec3(.009,.024,.022)*narrow*facing;}gl_FragColor=vec4(c,1.);}`
  });
}
function easedHalfTurn(time, halfPeriod) {
  const cycle=Math.max(0,time)/halfPeriod,whole=Math.floor(cycle),fraction=cycle-whole;
  return Math.PI*(whole+.5-.5*Math.cos(Math.PI*fraction));
}
function samplePose(keys,time) {
  if(time>=keys.at(-1)[0])return keys.at(-1);
  let index=0;while(index+1<keys.length&&keys[index+1][0]<time)index++;
  const a=keys[index],b=keys[index+1],before=keys[Math.max(0,index-1)],after=keys[Math.min(keys.length-1,index+2)],span=b[0]-a[0],t=clamp((time-a[0])/span,0,1);
  return a.map((value,i)=>i===0?time:(2*t**3-3*t*t+1)*value+(t**3-2*t*t+t)*(b[i]-before[i])/(b[0]-before[0])*span+(-2*t**3+3*t*t)*b[i]+(t**3-t*t)*(after[i]-a[i])/(after[0]-a[0])*span);
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function roundRect(w, h, r) {
  const x = -w / 2, y = -h / 2, s = new T.Shape();
  s.moveTo(x + r, y); s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y); return s;
}
function slab(w, h, r, depth, material) {
  const geometry = new T.ExtrudeGeometry(roundRect(w, h, r), {depth, bevelEnabled:true, bevelSize:1.2, bevelThickness:1.2, bevelSegments:3, steps:1, curveSegments:12});
  geometry.translate(0, 0, -depth / 2);
  return new T.Mesh(geometry, material);
}
function createCoin(radius, markGeometry, depthRatio=.19) {
  const coin = new T.Group(),rim=coinMaterial(radius,0),gold=coinMaterial(radius,1),lipMaterial=coinMaterial(radius,2),relief=coinMaterial(radius,3);
  coin.userData.radius=radius;
  const depth = radius * depthRatio;
  const edge=radius*.018;
  const profile=[[0,-depth/2],[radius*.965,-depth/2],[radius-edge,-depth/2+edge*.35],[radius,-depth/2+edge],[radius,depth/2-edge],[radius-edge,depth/2-edge*.35],[radius*.965,depth/2],[0,depth/2]].map(([x,y])=>new T.Vector2(x,y));
  const body = new T.Mesh(new T.LatheGeometry(profile,96),rim);
  body.rotation.x = Math.PI / 2; coin.add(body);
  for (const side of [-1,1]) {
    const face = new T.Mesh(new T.CircleGeometry(radius * .93,96),gold);
    face.position.z = side * (depth / 2 + .15); face.rotation.y = side < 0 ? Math.PI : 0; coin.add(face);
    const lip = new T.Mesh(new T.TorusGeometry(radius * .944,radius * .012,8,96),lipMaterial);
    // Lift the thin lip clear of the flat cap to prevent coincident surfaces.
    lip.position.z = side * (depth / 2 + radius * .015); coin.add(lip);
    const logo = new T.Group();
    for(const geometry of markGeometry)logo.add(new T.Mesh(geometry,relief));
    const scale = radius * 1.34 / 53;
    logo.scale.set(scale,-scale,1); logo.position.set(-26.5 * scale,24 * scale,side * (depth / 2 + .8));
    if (side < 0) { logo.rotation.y = Math.PI; logo.position.x *= -1; }
    coin.add(logo);
  }
  return coin;
}

function createCrystal(width, height) {
  // Independently modeled asymmetric bipyramid: a short crown and long point.
  // The central crown junction and broad facets follow the observed silhouette.
  const A=[-.08*width,.53*height,-.13*width], B=[-.54*width,.21*height,0];
  const C=[-.18*width,.25*height,.42*width], D=[.5*width,.15*height,0];
  const E=[-.04*width,-.52*height,-.1*width], F=[0,.23*height,-.4*width];
  const faces=[[A,B,C,1.03],[A,C,D,1.12],[B,E,C,.93],[C,E,D,1.04],[A,D,F,.95],[A,F,B,.87],[B,F,E,.85],[F,D,E,.99]];
  const vertices=[], shades=[];
  for(const [a,b,c,shade] of faces)for(const p of [a,b,c]){vertices.push(...p);shades.push(shade);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('shade',new T.Float32BufferAttribute(shades,1));geo.computeVertexNormals();
  const gem=new T.Group();
  gem.add(new T.Mesh(geo,new T.ShaderMaterial({
    uniforms:{height:{value:height}},
    vertexShader:`attribute float shade;varying vec3 p;varying float light;void main(){p=position;light=shade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float height;varying vec3 p;varying float light;void main(){float y=clamp(p.y/height+.55,0.,1.);vec3 c=mix(vec3(1.,.75,.56),vec3(.60,.33,.92),smoothstep(0.,.40,y));c=mix(c,vec3(.80,.60,.93),smoothstep(.47,.78,y));c=mix(c,vec3(.98,.82,.65),smoothstep(.78,1.10,y));gl_FragColor=vec4(c*light,1.);}`,
    side:T.DoubleSide
  })));
  return gem;
}
async function woodTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const c=canvas.getContext('2d'),pixels=c.createImageData(512,512);
  let seed=1937;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const boards=Array.from({length:16},()=>rnd()*14-7);
  for(let y=0;y<512;y++){
    if(y%64===0)await yieldMain();
    for(let x=0;x<512;x++){
    const bend=Math.sin(y*.011+x*.003)*2.4+Math.sin(y*.029)*.6;
    const grain=Math.sin(x*.41+bend)+.6*Math.sin(x*1.13+bend*2.7);
    const fine=Math.sin(x*2.3+bend*4.)*2.;
    const value=boards[Math.floor(x/32)]+grain*3.4+fine+Math.sin(x*.095+Math.sin(y*.007+x*.02)*2)*3+(rnd()-.5)*12;
    const i=(y*512+x)*4;pixels.data[i]=190+value;pixels.data[i+1]=129+value*.85;pixels.data[i+2]=82+value*.65;pixels.data[i+3]=255;
  }
  }
  c.putImageData(pixels,0,0);
  for(let x=32;x<512;x+=32){c.fillStyle='rgba(71,39,16,.18)';c.fillRect(x,0,1,512);c.fillStyle='rgba(249,206,159,.17)';c.fillRect(x+1,0,1,512);}
  c.strokeStyle='rgba(246,193,137,.55)';c.lineWidth=6;c.strokeRect(3,3,506,506);
  c.strokeStyle='rgba(92,49,23,.25)';c.lineWidth=2;c.strokeRect(8,8,496,496);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return map;
}
async function createBlocks() {
  const group=new T.Group(),map=await woodTexture();
  // Static wood uses baked face shading to keep the warm reference palette.
  const sideMap=map.clone();sideMap.center.set(.5,.5);sideMap.rotation=Math.PI/2;sideMap.needsUpdate=true;
  const materials=[1.1,1.0,1.0,.7,1.25,.9].map((brightness,i)=>new T.MeshBasicMaterial({map:i===2||i===3?map:sideMap,color:new T.Color(brightness,brightness,brightness),toneMapped:false}));
  const geometry=new RoundedBoxGeometry(112,48,112,3,4);
  for(const [x,y] of [[1,0],[1,1],[0,1]]) {
    const cube=new T.Mesh(geometry,materials);cube.position.set(x*115-56,0,y*115-56);group.add(cube);
  }
  group.rotation.set(.82,.7,0,'XYZ');group.scale.setScalar(1.10);return group;
}

function solitaireTexture() {
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=768;
  const c=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const marks=[...new DOMParser().parseFromString(catMark,'image/svg+xml').querySelectorAll('path')].map(p=>new Path2D(p.getAttribute('d')));
  // Authored card atlas: the brand mark comes from the existing site SVG.
  const atlas=Array.from({length:53},(_,index)=>{
    const tile=document.createElement('canvas');tile.width=70;tile.height=100;const a=tile.getContext('2d');
    a.fillStyle='#fffdfd';a.beginPath();a.roundRect(1,1,68,98,5);a.fill();a.strokeStyle='#d2cdcc';a.lineWidth=2;a.stroke();
    if(index===52){
      a.fillStyle='#078eb4';a.beginPath();a.roundRect(1,1,68,98,5);a.fill();a.strokeStyle='#5ed7df';a.lineWidth=.8;a.stroke();
      const g=a.createLinearGradient(0,0,65,100);g.addColorStop(0,'#03bce2');g.addColorStop(1,'#087da4');a.fillStyle=g;a.beginPath();a.roundRect(5,5,60,90,4);a.fill();
      a.strokeStyle='#67e5ec';a.lineWidth=1;a.strokeRect(9,9,52,82);a.save();a.translate(17,32);a.scale(.68,.68);a.fillStyle='#d6fffc';for(const path of marks)a.fill(path);a.restore();
    }else{
      const suit=Math.floor(index/13),symbol=['♠','♥','♣','♦'][suit];
      a.fillStyle=suit%2?'#f5787d':'#979594';a.font='italic bold 31px Times New Roman';a.fillText(['A','2','3','4','5','6','7','8','9','10','J','Q','K'][index%13],6,31);
      a.font='24px Georgia';a.fillText(symbol,44,31);a.font='68px Georgia';a.fillText(symbol,8,86);
    }
    return tile;
  });
  function card(x,y,rank,back=false,width=34){c.drawImage(atlas[back?52:rank%52],x,y,width,width*100/70);}
  function board(loop){
    const g=c.createRadialGradient(172,285,50,190,370,460);g.addColorStop(0,'#65d992');g.addColorStop(.68,'#2ec472');g.addColorStop(1,'#159454');c.fillStyle=g;c.fillRect(0,0,384,768);
    c.fillStyle='#145c45';c.fillRect(0,678,384,90);c.strokeStyle='#b0be64';c.lineWidth=2;
    for(let i=0;i<8;i++){c.beginPath();c.roundRect(9+i*46,20,38,57,3);c.stroke();}
    const ranks=[3,7,5,11,4,7,12,6,9,2];
    for(let row=0;row<6;row++)for(let col=0;col<10;col++){
      const start=(col*6+row)*.022,p=clamp((loop-start)/.48,0,1),endX=5+col*37.5,endY=90+row*8;
      // A diagonal train of blue backs resolves into the ten columns.
      if(p>0)card(192+(endX-192)*(1-(1-p)**2),650+(endY-650)*p,ranks[col],row<5||loop<1.72+col*.065);
    }
    for(let i=0;i<3;i++)card(348-i*6,24,0,true);
    c.fillStyle='#e1d78b';c.font='italic 15px Arial';c.fillText('Score',32,620);c.fillText('Time',174,620);c.fillText('Moves',303,620);
    c.font='19px Arial';c.fillText('0',47,645);c.fillText('00:00',163,645);c.fillText('0',320,645);
    c.fillStyle='#21814b';c.beginPath();c.roundRect(176,582,32,14,6);c.fill();c.fillStyle='#f7d676';c.beginPath();c.moveTo(184,585);c.lineTo(200,585);c.lineTo(192,595);c.fill();
    const labels=['SETTINGS','GAMES','PLAY','HINT','UNDO'];c.fillStyle='#efdd95';
    for(let i=0;i<5;i++){
      const x=36+i*76;c.save();c.translate(x,714);
      if(i===0){for(let j=0;j<8;j++){c.rotate(Math.PI/4);c.fillRect(-3,-19,6,8);}c.beginPath();c.arc(0,0,13,0,TAU);c.arc(0,0,6,0,TAU,true);c.fill();}
      if(i===1){for(const [dx,dy]of [[-14,-15],[3,-15],[-14,2],[3,2]]){c.strokeStyle='#efdd95';c.lineWidth=3;c.strokeRect(dx,dy,11,11);}}
      if(i===2){c.rotate(-.16);c.fillRect(-13,-17,26,32);c.fillStyle='#21814b';c.font='23px Georgia';c.fillText('♠',-10,8);}
      if(i===3){c.beginPath();c.arc(0,-5,11,0,TAU);c.fill();c.fillRect(-5,5,10,9);c.fillRect(-4,16,8,3);}
      if(i===4){c.lineWidth=5;c.strokeStyle='#efdd95';c.beginPath();c.arc(0,3,13,Math.PI*1.1,Math.PI*1.95);c.stroke();c.beginPath();c.moveTo(-18,-3);c.lineTo(-5,-9);c.lineTo(-5,2);c.fill();}
      c.restore();c.font='bold 10px Arial';c.textAlign='center';c.fillText(labels[i],x,751);c.textAlign='start';
    }
  }
  // Four foundation piles launch a staggered stream of cards. Sampling each
  // trajectory from its start rebuilds the classic persistent, overlapping
  // trail without retaining copyrighted Windows card art or an extra buffer.
  const cascade=Array.from({length:20},(_,i)=>{
    const pile=i%4,direction=pile<2?1:-1;
    return {launch:3.88+i*.095,x:16+pile*89,vx:direction*(110+i%5*21),vy:-(210+i%4*33),rank:pile*13+(i*7+3)%13};
  });
  function cascadePose(item,age) {
    const gravity=1080,floor=586;let y=72,vy=item.vy,remaining=age;
    for(let bounce=0;bounce<4;bounce++){
      const impact=(-vy+Math.sqrt(vy*vy+2*gravity*(floor-y)))/gravity;
      if(remaining<=impact)return {x:item.x+item.vx*age,y:y+vy*remaining+gravity*remaining*remaining/2};
      remaining-=impact;y=floor;vy=-(vy+gravity*impact)*.72;
      if(Math.abs(vy)<45)break;
    }
    return {x:item.x+item.vx*age,y:floor};
  }
  function draw(time) {
    const loop=time%6.67;
    if(loop<4.05)board(loop);
    if(loop>3.55){
      // Fade the dealt board into felt, then launch cards from four piles.
      const g=c.createLinearGradient(0,0,384,768);g.addColorStop(0,'#16ae4f');g.addColorStop(1,'#006d31');c.globalAlpha=clamp((loop-3.55)/.50,0,1);c.fillStyle=g;c.fillRect(0,0,384,768);c.globalAlpha=1;
      if(loop<4.45)for(let i=0;i<24;i++){
        const x=(i%2?366:18)+Math.sin(i*3.1)*15,y=(i*61+loop*90)%768,alpha=(.5+.5*Math.sin(i+loop*12))*clamp((4.45-loop)*3,0,1);
        c.fillStyle=`rgba(238,255,210,${alpha})`;c.beginPath();c.moveTo(x-4,y);c.lineTo(x,y-8);c.lineTo(x+4,y);c.lineTo(x,y+8);c.fill();
      }
      if(loop>=3.88){
        for(let pile=0;pile<4;pile++)card(16+pile*89,72,pile*13,false,60);
        for(const item of cascade){
          const age=loop-item.launch;if(age<0)continue;
          for(let step=0;step<=Math.floor(age/.075);step++){
            const pose=cascadePose(item,step*.075);
            if(pose.x>-60&&pose.x<384)card(pose.x,pose.y,item.rank,false,60);
          }
          const pose=cascadePose(item,age);
          if(pose.x>-60&&pose.x<384)card(pose.x,pose.y,item.rank,false,60);
        }
      }
      c.globalAlpha=1;
    }
    texture.needsUpdate=true;
  }
  draw(0); return {texture,draw};
}
async function createPhone() {
  const group=new T.Group(),silver=new T.MeshPhongMaterial({color:0x28302c,specular:0x617071,shininess:65}),black=new T.MeshPhongMaterial({color:0x07090b,specular:0x303544,shininess:45});
  const chassis=slab(222,442,32,15,silver);chassis.position.y=-3;group.add(chassis);await yieldMain();
  const bezel=slab(215,438,29,3,black);bezel.position.set(0,-3,8);group.add(bezel);await yieldMain();
  const screen=solitaireTexture();await yieldMain();const geometry=new T.ShapeGeometry(roundRect(201,430,24),20);
  const pos=geometry.attributes.position,uv=geometry.attributes.uv;for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+100.5)/201,(pos.getY(i)+215)/430);
  const display=new T.Mesh(geometry,new T.MeshBasicMaterial({map:screen.texture,toneMapped:false}));display.position.z=11;group.add(display);
  const island=slab(64,17,8,1,black);island.position.set(0,198,12);group.add(island);
  const lens=new T.Mesh(new T.CircleGeometry(3.2,20),new T.MeshPhongMaterial({color:0x151b30,specular:0x8199cb,shininess:90}));lens.position.set(23,198,13.5);group.add(lens);
  for(const [x,y,h] of [[-112,100,36],[-112,48,36],[112,56,60]]){const b=new T.Mesh(new RoundedBoxGeometry(3,h,5,2,1),silver);b.position.set(x,y,0);group.add(b);}
  group.rotation.set(.25,.2,-.14);return {group,screen};
}

export async function createArtwork(canvas, kind) {
  if(!['hero','footer'].includes(kind))throw new Error('Unknown artwork');
  const initialization={},started=performance.now();
  const measure=async(name,fn)=>{const begin=performance.now(),value=await fn();initialization[name]=performance.now()-begin;return value;};
  const renderer=await measure('context',()=>new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'}));
  renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const world=new T.Scene(), camera=new T.OrthographicCamera(-450,450,300,-300,.1,3000);camera.position.z=1200;
  let bloom;renderer.info.autoReset=false;
  try {
  await yieldMain();
  const markGeometry=await measure('coinMark',coinMarkGeometry);
  await yieldMain();
  world.add(new T.HemisphereLight(0xfff1e3,0x706090,1));
  const key=new T.DirectionalLight(0xfff0d7,2);key.position.set(-300,600,700);world.add(key);
  const fill=new T.DirectionalLight(0xe3dfd0,.7);fill.position.set(400,-50,500);world.add(fill);
  let phone, screen, heroCoin, heroMount, blocksMount;const falling=[],crystals=[];let centerCoin,centerMount;
  if(kind==='hero') {
    const p=await measure('phoneAndCards',createPhone);await yieldMain();phone=p.group;screen=p.screen;phone.position.set(-140,17,40);phone.scale.set(1.25,1.03,1);world.add(phone);
    const g1=createCrystal(145,200);g1.position.set(-312,67,180);g1.rotation.set(-.1,.1,.18);world.add(g1);crystals.push({gem:g1,base:.1,phase:0});
    const g2=createCrystal(75,106);g2.position.set(-212,188,200);g2.rotation.set(.15,.2,-.76);world.add(g2);crystals.push({gem:g2,base:.2,phase:.8});
    const g3=createCrystal(93,106);g3.position.set(19,190,180);g3.rotation.set(.15,-.25,-.75);world.add(g3);crystals.push({gem:g3,base:-.25,phase:1.6});
    blocksMount=new T.Group();blocksMount.add(await measure('wood',createBlocks));await yieldMain();blocksMount.position.set(100,-32,-70);world.add(blocksMount);
    heroCoin=await measure('coins',()=>createCoin(86,markGeometry,.36));heroMount=new T.Group();heroMount.position.set(228,95,40);heroMount.scale.y=.86;heroMount.add(heroCoin);world.add(heroMount);
  } else {
    centerCoin=await measure('centerCoin',()=>createCoin(116.5,markGeometry,.27));centerMount=new T.Group();centerMount.position.set(0,76,100);centerMount.scale.y=.70;centerMount.add(centerCoin);world.add(centerMount);
    // Authored key poses fitted to rendered reference samples (seconds, x, y,
    // pitch, yaw, roll). This replaces frame-step-dependent gravity with a
    // deterministic recreation of the staggered bounce and late left-coin roll.
    const tracks=[
      [[0,-170,130,-.35,.5,.5],[1.24,-170,10,-.35,.5,.5],[1.83,-200,-74,-.25,.1,.4],[2.40,-253,-123,-.65,.1,.8],[2.97,-290,-235,-.8,.5,1.1],[3.52,-300,-280,-1.2,.1,.15],[4.10,-295,-267,-1.1,.05,.1],[4.65,-295,-274,-1.3,0,-.08],[5.2,-295,-274,-1.3,0,-.08]],
      [[0,-200,-10,-.85,.65,1.2],[1.24,-200,-135,-.85,.65,1.2],[1.83,-188,-160,-.2,.1,3.1],[2.4,-167,-200,-.1,.05,3.0],[2.97,-180,-205,-.05,0,1.2],[3.52,-208,-220,-.05,0,1.8],[4.1,-252,-235,-.1,0,2.6],[4.65,-260,-264,-.6,0,3.2],[5.2,-245,-292,-Math.PI/2,0,TAU]],
      [[0,-170,-170,0,.96,-1.6],[1.24,-170,-235,0,.96,-1.6],[1.83,-150,-240,-.1,.7,-1.5],[2.4,-115,-265,-.9,.1,-.2],[2.97,-90,-280,-1.5,0,0],[3.52,-90,-292,-Math.PI/2,0,0]],
      [[0,160,-10,-.7,-.7,-.5],[1.24,160,-135,-.7,-.7,-.5],[1.83,180,-250,-.8,-.1,.6],[2.4,205,-292,-Math.PI/2,0,0],[2.97,205,-288,-1.48,0,.04],[3.52,205,-292,-Math.PI/2,0,0]],
      [[0,220,120,-.65,.65,1.0],[1.24,220,-10,-.65,.65,1.0],[1.83,230,-170,-1.05,.1,-.6],[2.4,278,-262,-1.45,0,0],[2.97,290,-263,-1.02,0,-.2],[3.52,278,-270,-1.48,0,0],[4.1,278,-270,-Math.PI/2,0,0]]
    ];
    tracks.forEach((keys,i)=>{const coin=createCoin(94,markGeometry,.24),holder=new T.Group();holder.add(coin);holder.scale.y=.75;world.add(holder);const end=keys.at(-1);falling.push({coin,holder,keys,x:end[1],startX:keys[0][1],factor:1,floor:end[2],baseFloor:end[2],y:keys[0][2],settled:false,index:i});});

  }
  let compact=false;
  // The narrow reference briefly holds the opening arrangement before the fall.
  const footerTime=()=>compact?(elapsed<.55?0:elapsed<1.55?(elapsed-.55)*1.8:elapsed<3.0?1.8+(elapsed-1.55)*1.2/1.45:elapsed):elapsed;
  let renderedFrames=0,screenUpdates=0;
  let playing=false,frame=0,last=0,elapsed=0,lastScreen=-1,disposed=false,contextLost=false;
  function animate(dt) {
    elapsed+=dt;
    for(const {gem,base,phase} of crystals)gem.rotation.y=base+Math.sin(elapsed*TAU/7.5+phase)*.24;
    if(heroCoin){
      // The rendered reference reverses its turn: it does not spin continuously.
      const turn=.5-.5*Math.cos((elapsed+.28)*TAU/14.2);
      heroCoin.rotation.set(0,4.175*turn,6.0*turn);
    }
    // Refresh the in-phone game at display cadence. The old 30 Hz cap made
    // card movement visibly step while the surrounding 3D scene ran at 60 Hz.
    if(screen&&elapsed-lastScreen>=1/60-.002){screen.draw(elapsed);lastScreen=elapsed;screenUpdates++;}
    if(centerCoin) {
      centerCoin.rotation.set(0,easedHalfTurn(elapsed-.52,6.60),0);
      for(const item of falling) {
        const time=footerTime(),pose=samplePose(item.keys,time),progress=clamp(time/item.keys.at(-1)[0],0,1);
        item.y=pose[2]+(item.floor-item.baseFloor)*progress;
        item.holder.position.set(pose[1]*item.factor,item.y,-item.index*5);
        item.holder.rotation.z=item.index===0?.10*clamp((time-3.4)/1.3,0,1):0;
        item.coin.rotation.set(pose[3],pose[4],pose[5]);item.settled=progress===1;
      }
    }
  }
  function render(){if(disposed||contextLost)return;
    renderer.info.reset();renderer.render(world,camera);bloom?.render(world,camera);renderedFrames++;
  }
  function tick(now){frame=0;if(!playing||disposed||contextLost)return;const dt=last?Math.min((now-last)/1000,.05):0;last=now;animate(dt);render();frame=requestAnimationFrame(tick);}
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h||disposed)return;// The original artwork stretches with its viewport on narrow screens.
    // Keep the authored desktop projection, allowing the canvas to scale each axis.
    const aspect=w/h,height=600,worldWidth=kind==='hero'?600*847/530:1100;compact=aspect<1.3;
    camera.left=-worldWidth/2;camera.right=worldWidth/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();renderer.setSize(w,h,false);bloom?.resize(w,h);
    // The narrow reference uses a slightly warmer, darker gold face.
    world.traverse(o=>{if(o.material?.uniforms?.narrow)o.material.uniforms.narrow.value=compact?1:0;});
    if(phone){const mobile=aspect<1.5;phone.position.set(mobile?-125:-140,17,40);phone.scale.set(mobile?1.18:1.25,1.03,1);}
    for(const item of falling){item.factor=1;item.holder.scale.set(1,.75,1);item.floor=item.baseFloor;const pose=samplePose(item.keys,footerTime());item.y=pose[2];item.holder.position.set(pose[1],item.y,-item.index*5);item.holder.rotation.z=item.index===0?.10*clamp((footerTime()-3.4)/1.3,0,1):0;item.coin.rotation.set(pose[3],pose[4],pose[5]);}
    render();}
  const observer=new ResizeObserver(resize);
  function lost(event){event.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;canvas.dispatchEvent(new CustomEvent('artwork-unavailable'));}
  canvas.addEventListener('webglcontextlost',lost);
  const app={canvas,phone,play(){if(disposed||playing||contextLost)return;playing=true;last=0;frame=requestAnimationFrame(tick);},stop(){playing=false;cancelAnimationFrame(frame);frame=0;last=0;},resize,
    snapshot(){return {initialization,kind,elapsed,playing,frames:renderedFrames,screenUpdates,bloom:bloom?.snapshot(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,width:canvas.width,height:canvas.height,phoneYaw:phone?.rotation.y,coinRotation:(heroCoin||centerCoin)?.rotation.y,falling:falling.map(x=>({x:x.holder.position.x,y:x.y,settled:x.settled}))};},
    capture(){render();return canvas.toDataURL('image/webp',.94);},
    dispose(){if(disposed)return;app.stop();disposed=true;observer.disconnect();canvas.removeEventListener('webglcontextlost',lost);bloom?.dispose();disposeWorld(world);renderer.dispose();instances.delete(canvas);}
  };
  await yieldMain();
  await measure('shaderCompilation',()=>renderer.compileAsync(world,camera));await yieldMain();
  await measure('textureUpload',async()=>{const textures=new Set();world.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m?.map)textures.add(m.map);});for(const texture of textures){renderer.initTexture(texture);await yieldMain();}});
  bloom=createBloom(renderer,kind);bloom.resize(canvas.clientWidth,canvas.clientHeight);await measure('bloomPreparation',()=>bloom.prepare(world,camera));
  instances.set(canvas,app);animate(0);await measure('firstFrame',resize);observer.observe(canvas);initialization.total=performance.now()-started;return app;
  } catch(error){bloom?.dispose();disposeWorld(world);renderer.dispose();throw error;}
}
