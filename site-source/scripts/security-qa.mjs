import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const root=new URL('../dist/',import.meta.url);
const browser=await chromium.launch({headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader','--unsafely-disable-devtools-self-xss-warnings'],...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const reports=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition}));});
 const p=await context.newPage();const requests=[],errors=[];p.on('request',r=>requests.push(r.url()));p.on('pageerror',e=>errors.push(e.message));
 await p.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+'/');await p.locator('.hero-scene.loaded').waitFor({timeout:45000});await p.locator('.footer-scene').scrollIntoViewIfNeeded();await p.locator('.footer-scene.loaded').waitFor({timeout:45000});await p.waitForTimeout(500);
 reports.push({case:'Both native artwork scenes',violations:await p.evaluate(()=>window.__violations),errors,external:requests.filter(x=>!x.startsWith('http://127.0.0.1')&&!x.startsWith('blob:'))});await context.close();
 const staticContext=await browser.newContext({reducedMotion:'reduce'});await staticContext.addInitScript(()=>{window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition}));});
 for(const route of ['/games/','/games/spider-solitaire/','/blog/','/privacy-policy/','/terms-of-use/','/games/minesweeper/','/guides/minesweeper-3bv-and-stats/']){
  const page=await staticContext.newPage();await page.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+route,{waitUntil:'networkidle'});reports.push({case:route,violations:await page.evaluate(()=>window.__violations)});await page.close();
 }await staticContext.close();
 // Execute the real production-host analytics path with its outgoing requests intercepted.
 const production=await browser.newContext({reducedMotion:'reduce'});await production.addInitScript(()=>{window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition}));});
 const analyticsRequests=[];
 await production.route('https://www.puzzlecats.com/**',async route=>{
  const url=new URL(route.request().url());let path=decodeURIComponent(url.pathname).replace(/^\//,'');if(!path||path.endsWith('/'))path+='index.html';const file=new URL(path,root);if(!file.href.startsWith(root.href))return route.abort();
  try{const type=path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':undefined;await route.fulfill({body:await fs.readFile(file),contentType:type});}catch{await route.fulfill({status:404,body:'Not found'});}
 });
 await production.route(/https:\/\/.*(?:google-analytics\.com|analytics\.google\.com)\//,async route=>{analyticsRequests.push(route.request().url());await route.fulfill({status:204,body:''});});
 await production.route('https://www.googletagmanager.com/**',async route=>{analyticsRequests.push(route.request().url());await route.fulfill({contentType:'application/javascript',body:'/* Analytics loader intercepted: no test events transmitted. */'});});
 const page=await production.newPage();await page.goto('https://www.puzzlecats.com/',{waitUntil:'networkidle'});reports.push({case:'Production analytics config, intercepted',violations:await page.evaluate(()=>window.__violations),requests:analyticsRequests,dataLayer:await page.evaluate(()=>Array.from(window.dataLayer||[],x=>Array.from(x).map(v=>v instanceof Date?'DATE':v)))});await production.close();
} finally {await browser.close();await fs.writeFile('evidence/security-qa.json',JSON.stringify(reports,null,2));}
console.log(JSON.stringify(reports,null,2));if(reports.some(r=>r.violations.length||r.errors?.length))process.exitCode=1;
