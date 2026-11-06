import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.PREVIEW_URL||'http://127.0.0.1:8794';
const out='evidence/waterfall-review';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const results=[];
try {
  for(const [label,width,height,mobile] of [['desktop',1440,1000,false],['mobile',390,844,true]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?3:1,isMobile:mobile,hasTouch:mobile});
    await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
    const page=await context.newPage();
    await page.goto(base);
    await page.locator('.hero-scene').scrollIntoViewIfNeeded();
    await page.locator('.hero-scene.loaded').waitFor();
    for(const target of [4.15,4.8,5.5,6.3]){
      let found=false;
      for(let attempt=0;attempt<250;attempt++){
        const elapsed=await page.evaluate(async()=>{
          const {getArtwork}=await import('/assets/native-artwork.js');
          return getArtwork(document.querySelector('.hero-scene canvas'))?.snapshot().elapsed;
        });
        const phase=elapsed%6.67;
        if(phase>=target&&phase<target+.12){found=true;break;}
        await page.waitForTimeout(50);
      }
      if(!found)throw new Error(`Could not capture loop phase ${target}`);
      const {data,elapsed,screenUpdates,lowerWhitePixels}=await page.evaluate(async()=>{
        const {getArtwork}=await import('/assets/native-artwork.js');
        const artwork=getArtwork(document.querySelector('.hero-scene canvas'));
        let image;
        artwork.phone.traverse(o=>{if(o.material?.map?.image?.toDataURL)image=o.material.map.image;});
        const {elapsed,screenUpdates}=artwork.snapshot();
        const pixels=image.getContext('2d').getImageData(0,450,384,220).data;
        let lowerWhitePixels=0;
        for(let i=0;i<pixels.length;i+=4){
          const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
          if(r>190&&g>190&&b>180&&Math.max(r,g,b)-Math.min(r,g,b)<70)lowerWhitePixels++;
        }
        return {data:image.toDataURL('image/png'),elapsed,screenUpdates,lowerWhitePixels};
      });
      await fs.writeFile(`${out}/${label}-phone-${target.toFixed(2)}.png`,Buffer.from(data.split(',')[1],'base64'));
      await page.locator('.hero-scene canvas').screenshot({path:`${out}/${label}-scene-${target.toFixed(2)}.png`});
      results.push({device:label,target,phase:elapsed%6.67,screenUpdates,lowerWhitePixels});
      console.log(label,target,'captured at',elapsed.toFixed(2),'phase',(elapsed%6.67).toFixed(2),'screen updates',screenUpdates);
    }
    const samples=results.filter(r=>r.device===label);
    assert(samples[0].lowerWhitePixels<1000,'Opening cards should remain near the foundation piles');
    assert(samples[2].lowerWhitePixels>30000,'The cascade should reach the bottom after its first bounce');
    assert(samples[3].lowerWhitePixels>samples[2].lowerWhitePixels,'The card trail should continue to accumulate');
    await context.close();
  }
}finally{await browser.close();await fs.writeFile(`${out}/measurements.json`,JSON.stringify(results,null,2)+'\n');}
console.log(`Captured desktop and mobile phone motion in ${out}`);
