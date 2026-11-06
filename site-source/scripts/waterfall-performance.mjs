import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';

const base=process.env.PREVIEW_URL||'http://127.0.0.1:8794';
const output=process.env.PERFORMANCE_OUTPUT||'evidence/waterfall-review/performance-local.json';
const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const results=[];
try {
  for(let run=1;run<=3;run++){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
    const page=await context.newPage(),cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.goto(base);
    await page.locator('.hero-scene').scrollIntoViewIfNeeded();
    await page.locator('.hero-scene.loaded').waitFor();
    const sample=await page.evaluate(async()=>{
      const {getArtwork}=await import('/assets/native-artwork.js');
      const app=getArtwork(document.querySelector('.hero-scene canvas'));
      const intervals=[],start=performance.now();let previous;
      await new Promise(resolve=>{
        function tick(now){
          const phase=app.snapshot().elapsed%6.67;
          if(previous!==undefined&&phase>=4.2&&phase<=6.5)intervals.push(now-previous);
          previous=now;
          if(now-start<9500)requestAnimationFrame(tick);else resolve();
        }
        requestAnimationFrame(tick);
      });
      intervals.sort((a,b)=>a-b);
      return {samples:intervals.length,medianMs:intervals[Math.floor(intervals.length*.5)],p95Ms:intervals[Math.floor(intervals.length*.95)],maxMs:intervals.at(-1),screenUpdates:app.snapshot().screenUpdates};
    });
    if(sample.samples<30)throw new Error(`Insufficient cascade frames: ${sample.samples}`);
    results.push({run,...sample});
    await context.close();
  }
}finally{await browser.close();await fs.mkdir('evidence/waterfall-review',{recursive:true});await fs.writeFile(output,JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify(results,null,2));
