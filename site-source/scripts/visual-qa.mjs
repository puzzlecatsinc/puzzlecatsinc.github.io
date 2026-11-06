import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader','--unsafely-disable-devtools-self-xss-warnings'],...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const results=[];
try {
for (const [label,width,height] of [['desktop',1440,1000],['mobile',390,844],['small-mobile',320,700],['tablet',768,1024]]) {
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+'/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`evidence/preview-${label}-hero.png`});
 await page.getByRole('link',{name:'Explore games',exact:true}).click();await page.screenshot({path:`evidence/preview-${label}-games.png`});
 for(let y=0;y<await page.evaluate(()=>document.body.scrollHeight);y+=1000){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(70);}
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`evidence/preview-${label}.png`,fullPage:true});
 const data=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,brokenImages:[...document.images].filter(x=>!x.complete||!x.naturalWidth).map(x=>x.src),h1:document.querySelectorAll('h1').length,headingCount:document.querySelectorAll('h2').length,canvasLoaded:!!document.querySelector('.scene.loaded'),research:document.querySelector('#research-title').innerText}));
 results.push({label,...data,pageErrors:errors,thirdPartyRequests:requests.filter(x=>!x.startsWith('http://127.0.0.1'))});
 await page.close();
}
// Functional desktop Spline, explicit pause/resume, and failed scene fallback.
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+'/');let artworkLoaded=false;
try {await page.locator('.hero-scene.loaded').waitFor({timeout:45000});artworkLoaded=true;await page.locator('.hero-scene button').click();await page.getByRole('button',{name:'Resume 3D'}).first().waitFor();await page.locator('.hero-scene button').click();await page.waitForTimeout(2500);await page.screenshot({path:'evidence/native/desktop-overview.png'});}catch(e){errors.push(String(e));}
results.push({label:'native',loaded:artworkLoaded,pageErrors:errors});await page.close();
const failure=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
await failure.route('**/assets/native-artwork.js',r=>r.abort());await failure.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+'/');await failure.locator('.hero-scene button').click();await failure.getByRole('button',{name:'Try 3D again'}).waitFor({timeout:45000});results.push({label:'failureFallback',posterVisible:await failure.locator('.hero-scene .poster').isVisible(),status:await failure.locator('.hero-scene [role=status]').textContent()});await failure.close();
const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await noJS.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+'/');results.push({label:'noJavaScript',heading:await noJS.locator('h1').innerText(),stores:await noJS.locator('.store-links a').count()});await noJS.close();
for(const route of ['privacy-policy','terms-of-use','blog','app-ads.txt','app-ads-txt','robots.txt','sitemap.xml','llms.txt','404.html','missing-page','games/','games/spider-solitaire/','games/car-games/','games/block-puzzle/','games/word-hunt/','games/merge-clash/','games/sudoku/']){
 const page=await browser.newPage();const r=await page.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+'/'+route);results.push({label:route,status:r.status(),contentType:r.headers()['content-type']});await page.close();
}
for(const slug of ['spider-solitaire','car-games','block-puzzle','word-hunt','merge-clash','sudoku']){const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});await page.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+'/games/'+slug+'/');for(let y=0;y<await page.evaluate(()=>document.body.scrollHeight);y+=800){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(80);}await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'evidence/game-'+slug+'-mobile.png',fullPage:true});results.push({label:'game-layout-'+slug,...await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,storeLinks:document.querySelectorAll('.store-links a').length,brokenImages:[...document.images].filter(x=>!x.complete||!x.naturalWidth).map(x=>x.src)}))});await page.close();}
} finally {await fs.writeFile('evidence/visual-qa.json',JSON.stringify(results,null,2));await browser.close();}
console.log(JSON.stringify(results,null,2));
if(results.some(x=>typeof x.status==='number' && x.status!==(x.label==='missing-page'?404:200) || x.pageErrors?.length||x.scrollWidth>x.width||x.brokenImages?.length||x.label==='native'&&!x.loaded||x.thirdPartyRequests?.length))process.exitCode=1;
