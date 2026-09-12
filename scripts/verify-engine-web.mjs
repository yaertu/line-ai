/* global console, document */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const exec=promisify(execFile),origin='https://lineaicloud.vercel.app';
const access=JSON.parse(await readFile(join(homedir(),'.lineai','engine-operator.json'),'utf8'));
const sessionFile=join(homedir(),'.lineai','engine-web-state.json');
let savedState;try{savedState=JSON.parse(await readFile(sessionFile,'utf8'));}catch{/* Fresh verification session. */}
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
await mkdir('artifacts/engine-web',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},storageState:savedState});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/admin');await page.waitForTimeout(1500);
 if(!await page.locator('#app-view').isVisible()){
 await page.locator('#login-form input[name=email]').fill(access.email);await page.locator('#login-form input[name=password]').fill(access.password);
 await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
 try{await page.locator('#app-view').waitFor({state:'visible',timeout:15000});}
 catch{throw new Error('Admin login UI: '+await page.locator('#login-message').innerText()+'; script errors: '+errors.join(', '));}
 }
 await context.storageState({path:sessionFile});
 assert.equal(await page.locator('#login-form input[name=password]').inputValue(),'');
 await page.screenshot({path:'artifacts/engine-web/admin-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Projeler',exact:true}).click();await page.locator('.project-card').first().waitFor();
 await page.getByRole('button',{name:'Proje oluştur',exact:true}).click();await page.locator('#project-dialog').waitFor({state:'visible'});
 await page.locator('#project-dialog button[aria-label=Kapat]').click();await page.locator('#project-dialog').waitFor({state:'hidden'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Genel bakış',exact:true}).click();
 await page.screenshot({path:'artifacts/engine-web/admin-mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,className:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(e=>e.right>document.documentElement.clientWidth+1&&e.left>=0).slice(0,12));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'Mobile admin overflow: '+JSON.stringify(overflow));
 await page.goto(origin);await page.locator('h1').waitFor();assert(await page.getByRole('link',{name:/yönetim/i}).count()>0);
 await page.screenshot({path:'artifacts/engine-web/site-mobile.png',fullPage:true});
 const siteOverflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,id:e.id,className:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(e=>e.right>document.documentElement.clientWidth+1&&e.left>=0).slice(0,12));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'Mobile site overflow: '+JSON.stringify(siteOverflow));
 // Start recording only after authentication; credentials never enter the recorded context.
 const recorded=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:'artifacts/engine-web/raw',size:{width:1440,height:900}}});
 await recorded.addCookies(await context.cookies());const tour=await recorded.newPage();await tour.goto(origin+'/admin');await tour.locator('#app-view').waitFor({state:'visible'});
 await tour.screenshot({path:'cloud/media/line-ai-engine-yonetim-poster.png'});
 await tour.waitForTimeout(1800);await tour.getByRole('button',{name:'Projeler',exact:true}).click();await tour.waitForTimeout(1800);
 await tour.getByRole('button',{name:'Politikalar',exact:true}).click();await tour.waitForTimeout(1800);
 const video=tour.video();await recorded.close();const raw=await video.path();
 await exec('ffmpeg',['-y','-i',raw,'-vf','scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2','-c:v','libx264','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart','-an','cloud/media/line-ai-engine-yonetim.mp4'],{windowsHide:true});
 const bytes=await readFile('cloud/media/line-ai-engine-yonetim.mp4');
 await writeFile('cloud/media/line-ai-engine-yonetim.evidence.json',JSON.stringify({capturedAt:new Date().toISOString(),source:{kind:'live-production-admin',url:origin+'/admin'},credentialsRecorded:false,shows:['usage','project quotas','evaluated policies'],doesNotShow:['successful image generation'],sha256:createHash('sha256').update(bytes).digest('hex')},null,2));
 assert.deepEqual(errors,[]);console.log('PASS: real admin login, password clear, dialog close, mobile admin/site, recorded live management tour.');
 await context.close();
}finally{await browser.close();}
