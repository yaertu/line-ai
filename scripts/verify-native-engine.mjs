/* global console, window, localStorage */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9225');
try{
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>/tauri\.localhost|127\.0\.0\.1/.test(p.url()));
 assert(page,'Line AI native WebView required');
 const status=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_engine_status'));
 assert(status.configured&&status.capabilities?.enabled&&status.capabilities?.text,'Credential Manager and live capabilities');
 console.log('PASS: native Credential Manager and live Engine capabilities');
 await page.evaluate(()=>{const key='line-ai.preferences.v1';const prior=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...prior,provider:'auto',reasoning:'low',theme:'dark'}));});
 await page.reload();await page.getByTestId('line-ai-chat-workspace').waitFor();await page.setViewportSize({width:1440,height:900});
 const newChat=page.getByRole('button',{name:/Yeni sohbet/i}).first();if(await newChat.count())await newChat.click();
 await page.getByRole('textbox',{name:"Line AI'ya mesaj gönder"}).fill('Line AI Engine bağlantı kontrolü: 6 ile 7 çarpımı nedir? Yalnızca sayıyı yaz.');
 await page.getByRole('button',{name:'Mesajı gönder',exact:true}).click();
 await page.getByRole('form',{name:'Line AI yanıt geri bildirimi'}).waitFor({timeout:120000});
 console.log('PASS: automatic provider returned a real Engine response with feedback controls');
 assert((await page.locator('body').innerText()).includes('42'));
 await mkdir('artifacts/native-engine',{recursive:true});
 await page.screenshot({path:'artifacts/native-engine/chat.png'});
 await page.getByRole('button',{name:'Image Studio',exact:true}).click();
 const studio=page.getByRole('dialog',{name:'Line AI Image Studio'});await studio.waitFor();
 await page.screenshot({path:'artifacts/native-engine/studio.png'});
 assert((await studio.innerText()).includes('kredisi'),'Image credit limitation must be visible');
 await writeFile('artifacts/native-engine/result.json',JSON.stringify({verifiedAt:new Date().toISOString(),native:true,credentialManager:true,endpoint:status.endpoint,realText:true,imageAvailability:status.capabilities.images,requestFeedbackUi:true},null,2));
 console.log('PASS: native Credential Manager, real Engine text, feedback UI and honest Image Studio availability.');
}finally{await browser.close();}
