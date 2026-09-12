/* global console, document */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
await mkdir('artifacts/redesign',{recursive:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1431/?theme=dark');
 await page.getByRole('heading',{name:'Aklında ne var?'}).waitFor();
 assert(!/Truth Mode|Trust Mode/.test(await page.locator('body').innerText()));
 assert.equal(await page.locator('.line-ai-starter-card').count(),3);
 await page.screenshot({path:'artifacts/redesign/desktop.png'});
 await page.locator('.line-ai-starter-card').first().click();
 assert((await page.getByRole('textbox',{name:"Line AI'ya mesaj gönder"}).inputValue()).length>10);
 await page.getByRole('button',{name:'Ayarları aç',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'Line AI ayarları'});
 await settings.getByRole('button',{name:'Yapay zekâ',exact:true}).click();
 const content=await settings.innerText();
 assert(content.includes('Line AI Engine'));
 assert(!/Yerel model|Ollama|LM Studio|Truth Mode/.test(content));
 await page.screenshot({path:'artifacts/redesign/engine-settings.png'});
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'artifacts/redesign/mobile.png'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
 assert.deepEqual(errors,[]);
 console.log('PASS: new workspace, starter actions, Engine settings, no local model/Truth controls, mobile width, no browser errors.');
 await context.close();
}finally{await browser.close();}
