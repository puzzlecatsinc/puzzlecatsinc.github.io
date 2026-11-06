import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:8794';
const browser=await chromium.launch({headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader','--unsafely-disable-devtools-self-xss-warnings'],...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const reports=[];
const state=(p,kind)=>p.evaluate(async kind=>{const {getArtwork}=await import('/assets/native-artwork.js');return getArtwork(document.querySelector(`.${kind}-scene canvas`)).snapshot()},kind);
const waitState=(p,kind,expected)=>p.waitForFunction(([k,s])=>document.querySelector(`.${k}-scene`).dataset.playback===s,[kind,expected]);
try {
 for(const [width,height,mobile]of [[1440,1000,false],[390,844,true],[375,812,true]]) {
  const c=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile});
  await c.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await c.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.effectiveDirective));});
  const p=await c.newPage(),errors=[],external=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text());});p.on('request',r=>{if(new URL(r.url()).origin!==base)external.push(r.url());});
  await p.goto(base);await p.locator('.hero-scene').scrollIntoViewIfNeeded();await waitState(p,'hero','playing');await p.waitForTimeout(1900);
  const start=await state(p,'hero');await p.waitForTimeout(350);const moving=await state(p,'hero');assert(moving.coinRotation>start.coinRotation);assert(moving.elapsed>start.elapsed);
  const screenCadence=(moving.screenUpdates-start.screenUpdates)/(moving.frames-start.frames);
  assert(screenCadence>.7,`Phone screen refreshed on only ${(screenCadence*100).toFixed(0)}% of rendered frames`);
  await p.locator('.hero-scene button').click();await waitState(p,'hero','paused');const paused=await state(p,'hero');await p.waitForTimeout(350);const still=await state(p,'hero');assert.equal(still.elapsed,paused.elapsed);assert.equal(still.frames,paused.frames);assert.equal(still.coinRotation,paused.coinRotation);
  await p.mouse.move(width-5,300);await p.waitForTimeout(200);assert.equal((await state(p,'hero')).phoneYaw,paused.phoneYaw);
  await p.locator('.hero-scene button').click();await waitState(p,'hero','playing');
  let pointer;
  if(!mobile){await p.mouse.move(60,300);await p.waitForTimeout(350);const left=await state(p,'hero');await p.mouse.move(width-60,300);await p.waitForTimeout(350);const right=await state(p,'hero');assert(right.phoneYaw-left.phoneYaw>.9);pointer={left:left.phoneYaw,right:right.phoneYaw};}
  else {const before=(await state(p,'hero')).phoneYaw;await p.touchscreen.tap(30,300);assert.equal((await state(p,'hero')).phoneYaw,before);const box=await p.locator('.hero-scene canvas').boundingBox(),startY=await p.evaluate(()=>scrollY),cdp=await c.newCDPSession(p);const x=width/2,y=Math.min(height-20,box.y+box.height*.8);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*14}]});await p.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(350);pointer={touchScroll:await p.evaluate(y=>scrollY-y,startY)};assert(pointer.touchScroll>40);}
  if(!mobile){
    await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));await waitState(p,'hero','paused');const hidden=await state(p,'hero');await p.waitForTimeout(200);assert.equal((await state(p,'hero')).elapsed,hidden.elapsed);
    await p.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));await waitState(p,'hero','playing');
  }
  if(!mobile){await p.waitForTimeout(Math.max(0,8500-(await state(p,'hero')).elapsed*1000));const turn=await state(p,'hero');await p.waitForTimeout(350);assert((await state(p,'hero')).coinRotation<turn.coinRotation,'Hero turn reverses instead of spinning continuously');}
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
  const css=await p.locator('.hero-scene canvas').boundingBox();assert(start.width<=Math.ceil(css.width*2));
  await p.locator('.footer-scene').scrollIntoViewIfNeeded();await waitState(p,'footer','playing');await waitState(p,'hero','paused');const offscreen=await state(p,'hero');await p.waitForTimeout(300);assert.equal((await state(p,'hero')).elapsed,offscreen.elapsed);
  const falling=await state(p,'footer');
  if(!mobile){await p.waitForTimeout(1800);await p.locator('.footer-scene button').click();const midflight=await state(p,'footer');await p.setViewportSize({width:1100,height:1000});await p.waitForTimeout(150);const resized=await state(p,'footer');assert.equal(resized.elapsed,midflight.elapsed);assert.deepEqual(resized.falling.map(x=>x.x),midflight.falling.map(x=>x.x));await p.setViewportSize({width,height});await p.locator('.footer-scene button').click();}
  await p.waitForTimeout(6500);const landed=await state(p,'footer');assert(landed.falling.every(x=>x.settled));assert(landed.falling.some((x,i)=>x.y<falling.falling[i].y));
  await p.locator('.footer-scene button').click();const footPaused=await state(p,'footer');await p.waitForTimeout(250);assert.equal((await state(p,'footer')).elapsed,footPaused.elapsed);
  await p.locator('.footer-scene').screenshot({path:`evidence/native/qa-footer-${width}.png`});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(await p.evaluate(()=>window.__csp),[]);
  reports.push({case:`motion-${width}`,start,pauseFreezesRendering:true,heroReversalChecked:!mobile,offscreenFreezesTime:true,footerLanded:landed.falling,pointer,noExternalRequests:true,noCspViolations:true,noPageErrors:true,noOverflow:true});await c.close();
 }
 for(const preference of ['reduce','data-saver']) {
  const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:preference==='reduce'?'reduce':'no-preference'}),p=await c.newPage();
  if(preference==='data-saver')await p.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true,effectiveType:'4g'}}));
  const req=[];p.on('request',r=>req.push(r.url()));await p.goto(base,{waitUntil:'networkidle'});await p.locator('.footer-scene').scrollIntoViewIfNeeded();await p.waitForTimeout(300);assert.equal(await p.locator('.scene.loaded').count(),0);assert(!req.some(x=>/native-artwork/.test(x)));await p.locator('.hero-scene').scrollIntoViewIfNeeded();await p.locator('.hero-scene button').click();await waitState(p,'hero','playing');reports.push({case:preference,noAutomaticRendererDownload:true,explicitOptIn:true});await c.close();
 }
 const c=await browser.newContext({reducedMotion:'reduce'}),p=await c.newPage();await p.goto(base);await p.locator('.hero-scene button').click();await waitState(p,'hero','playing');
 await p.evaluate(()=>{document.querySelector('.hero-scene canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()});await waitState(p,'hero','unavailable');assert(await p.locator('.hero-scene .poster').isVisible());await p.locator('.hero-scene button').click();await waitState(p,'hero','playing');reports.push({case:'WebGL context loss',posterVisible:true,freshCanvasRetry:true});await c.close();
 const failure=await browser.newContext({reducedMotion:'reduce'}),f=await failure.newPage();await f.route('**/assets/native-artwork.js',r=>r.abort());await f.goto(base);await f.locator('.hero-scene button').click();await waitState(f,'hero','unavailable');assert(await f.locator('.hero-scene .poster').isVisible());reports.push({case:'Renderer download failure',posterVisible:true});await failure.close();
 const duringLoad=await browser.newContext({reducedMotion:'reduce'}),loadingPage=await duringLoad.newPage();
 let releaseRenderer;const rendererGate=new Promise(resolve=>releaseRenderer=resolve);
 await loadingPage.route('**/assets/native-artwork.js',async route=>{await rendererGate;await route.continue();});
 await loadingPage.goto(base);await loadingPage.locator('.hero-scene button').click();await waitState(loadingPage,'hero','loading');
 await loadingPage.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));releaseRenderer();
 await loadingPage.locator('.hero-scene.loaded').waitFor();await waitState(loadingPage,'hero','paused');await loadingPage.waitForTimeout(100);
 const suspended=await state(loadingPage,'hero');await loadingPage.waitForTimeout(200);assert.equal((await state(loadingPage,'hero')).elapsed,0);assert.equal((await state(loadingPage,'hero')).frames,suspended.frames);
 await loadingPage.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));await waitState(loadingPage,'hero','playing');
 reports.push({case:'Page suspended during asynchronous initialization',finishesPaused:true,noBackgroundAnimation:true,resumesOnReturn:true});await duringLoad.close();
 const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await nojs.goto(base);assert(await nojs.locator('.hero-scene .poster').isVisible());assert.equal(await nojs.locator('.scene-control:visible').count(),0);assert((await nojs.locator('.store-links a').count())>0);reports.push({case:'No JavaScript',nativePosterVisible:true,contentAndStoreLinksUsable:true});await nojs.close();
}finally{await browser.close();await fs.writeFile('evidence/native/qa.json',JSON.stringify(reports,null,2));}
console.log(JSON.stringify(reports,null,2));
