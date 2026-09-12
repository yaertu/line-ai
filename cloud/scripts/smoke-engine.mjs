import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const access=JSON.parse(await readFile(join(homedir(),'.lineai','engine-operator.json'),'utf8'));
const origin=process.env.LINE_AI_SMOKE_ORIGIN||'https://lineaicloud.vercel.app';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
let cookie='',otherProject,otherKey,textKey,imageJob;
async function call(path,{method='GET',body,key,operation,admin=false,expected=200}={}){
 const r=await fetch(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(key?{Authorization:'Bearer '+key}:{}),...(operation?{'Idempotency-Key':operation}:{}),...(admin?{Origin:origin,Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(260000)});
 const j=await r.json();assert.equal(r.status,expected,'HTTP '+path+': '+(j.error?.code??r.status));return {r,j};
}
const action=async(body)=>(await call('/api/admin',{method:'POST',body,admin:true})).j;
try {
 await call('/api/v1/capabilities',{expected:401});
 const denied=await fetch(origin+'/api/admin',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({action:'login',email:access.email,password:access.password})});
 assert.equal(denied.status,403);
 const login=await call('/api/admin',{method:'POST',body:{action:'login',email:access.email,password:access.password},admin:true});
 const setCookie=login.r.headers.get('set-cookie');assert(setCookie.includes('HttpOnly')&&setCookie.includes('Secure')&&setCookie.includes('SameSite=Strict'));
 cookie=setCookie.split(';')[0];const dashboard=(await call('/api/admin',{admin:true})).j;assert.equal(dashboard.role,'owner');assert(dashboard.projects.length>=2);
 console.log('PASS: admin login, secure cookie, CSRF rejection, live dashboard');
 const capabilities=(await call('/api/v1/capabilities',{key:access.engineKey})).j;assert(capabilities.text);
 otherProject=(await action({action:'create_project',name:'Engine smoke isolation'})).project.id;
 otherKey=(await action({action:'create_key',projectId:otherProject,name:'Smoke other',scopes:['text','images'],days:1})).secret;
 textKey=(await action({action:'create_key',projectId:access.projectId,name:'Smoke text',scopes:['text'],days:1}));
 await call('/api/v1/images/generations',{method:'POST',key:textKey.secret,operation:randomUUID(),body:{prompt:'denied'},expected:403});
 const operation=randomUUID(),body={prompt:'6 ile 7 çarpımı? Yalnızca sonucu yaz.',reasoning:'low',truthMode:true,transcript:[]};
 const first=(await call('/api/v1/generate',{method:'POST',key:access.engineKey,operation,body})).j;
 assert(first.message.includes('42'));assert(Number.isInteger(first.usage.units));assert(first.usage.inputTokens>0);
 const repeated=(await call('/api/v1/generate',{method:'POST',key:access.engineKey,operation,body})).j;
 assert.equal(first.requestId,repeated.requestId);assert.equal(first.message,repeated.message);
 await call('/api/v1/generate',{method:'POST',key:access.engineKey,operation,body:{...body,prompt:'different'},expected:409});
 await call('/api/v1/requests/'+first.requestId,{key:otherKey,expected:404});
 await call('/api/v1/feedback',{method:'POST',key:access.engineKey,body:{requestId:first.requestId,rating:'up',note:'must not be stored without opt-in',trainingOptIn:false}});
 const feedback=await db.from('line_engine_feedback').select('note,training_opt_in').eq('request_id',first.requestId).single();
 assert.equal(feedback.data.note,null);assert.equal(feedback.data.training_opt_in,false);
 console.log('PASS: real cloud text, exact token usage, idempotency, project isolation, scope, opt-in privacy');
 let image;let fixture=false;
 if(capabilities.images){
  image=(await call('/api/v1/images/generations',{method:'POST',key:access.engineKey,operation:randomUUID(),body:{prompt:'A premium abstract blue and cyan ribbon shaped like the letter L, on a dark navy background. Soft studio light, minimal 3D form, no text.',aspectRatio:'1:1',quality:'low',style:'product'}})).j;
 }else{
  fixture=true;
  await call('/api/v1/images/generations',{method:'POST',key:access.engineKey,operation:randomUUID(),body:{prompt:'disabled'},expected:503});
  const id=randomUUID(),assetId=randomUUID(),path=access.projectId+'/'+assetId+'.png';
  const bytes=await readFile(new URL('../media/line-ai-baslangic-turu-poster.png',import.meta.url));
  const created=await db.from('line_engine_requests').insert({id,project_id:access.projectId,key_id:access.keyId,operation_key:randomUUID(),body_hash:'fixture',kind:'image',model:'storage-contract-fixture',status:'completed',units:0,cost_micros:0,result:{assetId}});
  assert.equal(created.error,null);assert.equal((await db.storage.from('line-engine-assets').upload(path,bytes,{contentType:'image/png'})).error,null);
  assert.equal((await db.from('line_engine_assets').insert({id:assetId,request_id:id,project_id:access.projectId,storage_path:path})).error,null);
  image={id,assetId,status:'completed',model:'storage-contract-fixture'};
  console.log('BLOCKED: Line AI image runtime is disabled; asset tests below use an explicit existing screenshot fixture.');
 }
 imageJob=image.id;assert.equal(image.status,'completed');
 await call('/api/v1/assets/'+image.assetId,{key:otherKey,expected:404});
 const asset=(await call('/api/v1/assets/'+image.assetId,{key:access.engineKey})).j;assert.equal(asset.expiresIn,600);
 const assetResponse=await fetch(asset.url);assert.equal(assetResponse.status,200);const bytes=Buffer.from(await assetResponse.arrayBuffer());assert(bytes.length>100);
 if(!fixture){assert.equal(bytes.toString('ascii',8,12),'WEBP');const evidence=new URL('../media/line-ai-engine-generated.webp',import.meta.url);await writeFile(evidence,bytes);}
 await call('/api/v1/images/'+image.id,{key:access.engineKey});await call('/api/v1/images/'+image.id,{key:otherKey,method:'DELETE',expected:404});
 await call('/api/v1/images/'+image.id,{key:access.engineKey,method:'DELETE'});imageJob=undefined;
 await call('/api/v1/assets/'+image.assetId,{key:access.engineKey,expected:404});
 console.log('PASS: private signed asset, cross-project denial, deletion'+(fixture?' (fixture)':' (generated image)'));
 await action({action:'revoke_key',id:textKey.key.id});await call('/api/v1/capabilities',{key:textKey.secret,expected:401});
 await action({action:'logout'});await call('/api/admin',{admin:true,expected:401});
 await mkdir(new URL('../../artifacts/',import.meta.url),{recursive:true});
 await writeFile(new URL('../../artifacts/engine-smoke.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),origin,checks:'admin,CSRF,scopes,text,idempotency,isolation,privacy,assets,deletion,revocation',textModel:first.model,textTokens:first.usage.units,imageGeneration:fixture?'runtime_disabled':'verified',imageModel:image.model},null,2));
 console.log('PASS: revocation and logout. Live smoke completed; image generation status is recorded separately.');
}catch(error){console.error('Engine smoke failed:',error.message);process.exitCode=1;}
finally{
 if(imageJob)await call('/api/v1/images/'+imageJob,{key:access.engineKey,method:'DELETE'}).catch(()=>{});
 if(otherProject){await db.from('line_engine_audit').delete().eq('target',otherProject);await db.from('line_engine_keys').delete().eq('project_id',otherProject);await db.from('line_engine_projects').delete().eq('id',otherProject);}
 if(textKey?.key?.id){await db.from('line_engine_audit').delete().eq('target',textKey.key.id);await db.from('line_engine_keys').delete().eq('id',textKey.key.id);}
}
