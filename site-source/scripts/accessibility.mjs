import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader','--unsafely-disable-devtools-self-xss-warnings'],...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const reports=[];
try{for(const [route,width]of [['/',1440],['/',390],['/privacy-policy',390],['/terms-of-use',390],['/blog',390],['/games/',390],['/games/spider-solitaire/',390],['/games/car-games/',390],['/games/block-puzzle/',390],['/games/word-hunt/',390],['/games/merge-clash/',390],['/games/sudoku/',390]]){
const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();await page.goto((process.env.PREVIEW_URL||'http://127.0.0.1:8794')+route,{waitUntil:'networkidle'});const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();reports.push({route,width,violations:report.violations.map(x=>({id:x.id,impact:x.impact,description:x.description,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:report.incomplete.map(x=>({id:x.id,nodes:x.nodes.length,targets:x.nodes.map(n=>n.target)})),passes:report.passes.length});await context.close();}}finally{await browser.close();await writeFile('evidence/accessibility.json',JSON.stringify(reports,null,2));}
console.log(JSON.stringify(reports,null,2));if(reports.some(r=>r.violations.length))process.exitCode=1;
