import type {VercelRequest,VercelResponse} from '@vercel/node';
import {allowMethods,ApiError,readObjectBody,sendJson,sendError} from './_lib/http.js';
import {adminIdentity,login,audit,cookieToken,sessionHash,sessionCookie,requireOrigin} from './_lib/engine-admin.js';
import {createEngineKey,stringField} from './_lib/engine-core.js';
import {dbCheck,pepper,uuid,usage} from './_lib/engine-store.js';
import {evaluatePolicy,proposeImprovement} from './_lib/engine-learning.js';
import {textReady,imagesReady,TEXT_MODEL,IMAGE_MODEL} from './_lib/engine-runtime.js';
export const config={maxDuration:300};
function integer(v:unknown,min:number,max:number){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw new ApiError(400,'invalid_limit','Limit geçersiz.');return v;}
export default async function handler(req:VercelRequest,res:VercelResponse) {
 try {
  if(!allowMethods(req,res,['GET','POST']))return;
  if(req.method==='GET'){
   const admin=await adminIdentity(req);const db=admin.db;
   const results=await Promise.all([
    db.from('line_engine_projects').select('*').order('created_at'),
    db.from('line_engine_keys').select('id,project_id,name,prefix,scopes,revoked_at,expires_at,created_at').not('name','eq','Dahili kalite testi').order('created_at',{ascending:false}).limit(200),
    db.from('line_engine_policies').select('*').order('created_at',{ascending:false}).limit(30),
    db.from('line_engine_requests').select('id,project_id,kind,task,model,status,units,input_tokens,output_tokens,cost_micros,cost_estimated,error_code,created_at').order('created_at',{ascending:false}).limit(100),
    db.from('line_engine_audit').select('action,target,created_at').order('created_at',{ascending:false}).limit(30),
    db.from('line_engine_automation').select('*').eq('id',1).maybeSingle()
   ]);
   const [projects,keys,policies,requests,logs,automation]=results.map(dbCheck);
   const projectList=projects as unknown as {id:string}[];
   const totals=await Promise.all(projectList.map(async p=>({projectId:p.id,...await usage(p.id)})));
   sendJson(res,200,{role:admin.role,projects,keys,policies,requests,logs,automation,totals,
    engine:{text:textReady(),images:imagesReady(),textModel:TEXT_MODEL,imageModel:IMAGE_MODEL}});return;
  }
  const body=readObjectBody(req);const action=stringField(body.action,40,'İşlem',true);
  if(action==='login'){sendJson(res,200,await login(req,res,stringField(body.email,254,'E-posta',true),stringField(body.password,200,'Parola',true)));return;}
  requireOrigin(req);
  const admin=await adminIdentity(req,!['logout','password'].includes(action),['publish_policy','update_project','create_project','revoke_key','create_key','automation'].includes(action));
  const db=admin.db;let result:Record<string,unknown>={ok:true};let target:string|undefined;
  if(action==='logout'){
   dbCheck(await db.from('line_engine_sessions').delete().eq('digest',sessionHash(cookieToken(req))));sessionCookie(res,'',0);
  }else if(action==='password'){
   const password=stringField(body.password,200,'Yeni parola',true);
   if(password.length<14)throw new ApiError(400,'weak_password','En az 14 karakter gerekli.');
   if((await db.auth.admin.updateUserById(admin.userId,{password})).error)throw new Error('password_update_failed');
   dbCheck(await db.from('line_engine_sessions').delete().eq('user_id',admin.userId));sessionCookie(res,'',0);
  }else if(action==='create_project'){
   const project=dbCheck(await db.from('line_engine_projects').insert({name:stringField(body.name,80,'Proje adı',true)}).select('id').single());target=project?.id;result={project};
  }else if(action==='update_project'){
   target=uuid(body.id);const fields:Record<string,unknown>={};
   const limits:Record<string,number>={daily_units:100000000,monthly_units:1000000000,daily_images:10000,monthly_images:100000,daily_cost_micros:1000000000,monthly_cost_micros:10000000000,rpm:600,concurrency:20};
   for(const [key,max]of Object.entries(limits))if(body[key]!==undefined)fields[key]=integer(body[key],['rpm','concurrency'].includes(key)?1:0,max);
   for(const key of ['enabled','images_enabled'])if(body[key]!==undefined){if(typeof body[key]!=='boolean')throw new ApiError(400,'invalid_input','Açık/kapalı değeri gerekli.');fields[key]=body[key];}
   if(body.name!==undefined)fields.name=stringField(body.name,80,'Proje adı',true);
   dbCheck(await db.from('line_engine_projects').update(fields).eq('id',target));
  }else if(action==='create_key'){
   target=uuid(body.projectId);const scopes=body.scopes;
   if(!Array.isArray(scopes)||!scopes.length||scopes.length>3||!scopes.every(x=>['text','images','feedback'].includes(x)))throw new ApiError(400,'invalid_scope','En az bir geçerli yetki seçin.');
   const days=integer(body.days??90,1,365);const generated=createEngineKey(pepper());
   const key=dbCheck(await db.from('line_engine_keys').insert({project_id:target,name:stringField(body.name,80,'Anahtar adı',true),digest:generated.digest,prefix:generated.prefix,scopes:[...new Set(scopes)],expires_at:new Date(Date.now()+days*86400000).toISOString()}).select('id,prefix').single());
   result={key,secret:generated.secret};
  }else if(action==='revoke_key'){
   target=uuid(body.id);dbCheck(await db.from('line_engine_keys').update({revoked_at:new Date().toISOString()}).eq('id',target));
  }else if(action==='create_policy'){
   const policy=dbCheck(await db.from('line_engine_policies').insert({version:stringField(body.version,80,'Sürüm',true),instructions:stringField(body.instructions,8000,'Davranış talimatı',true)}).select('id,version').single());result={policy};target=policy?.id;
  }else if(action==='evaluate'){
   target=uuid(body.id);result={evaluation:await evaluatePolicy(target,uuid(body.projectId),admin.userId)};
  }else if(action==='improve'){
   const policy=await proposeImprovement(uuid(body.projectId),admin.userId);result={policy};target=policy.id;
  }else if(action==='publish_policy'){
   target=uuid(body.id);if(!dbCheck(await db.rpc('line_engine_publish',{p_id:target})))throw new ApiError(409,'evaluation_required','Sürüm yayın koşullarını karşılamıyor. Güncel temel sürüme karşı test edin.');
  }else if(action==='automation'){
   if(typeof body.enabled!=='boolean')throw new ApiError(400,'invalid_input','Açık/kapalı değeri gerekli.');
   target=uuid(body.projectId);dbCheck(await db.from('line_engine_automation').upsert({id:1,enabled:body.enabled,project_id:target}));
  }else throw new ApiError(400,'unknown_action','Yönetim işlemi tanınmadı.');
  await audit(admin.userId,action,target);sendJson(res,200,result);
 } catch(error){if(error instanceof ApiError){const requested=req.method==='POST'&&typeof req.body==='object'&&req.body&&!Array.isArray(req.body)&&typeof req.body.action==='string'?req.body.action:'';const action=['login','logout','password','update_project','create_project','revoke_key','create_key','evaluate','improve','publish_policy','automation'].includes(requested)?requested:'unknown';console.warn('line_engine_admin_action_failed',{action,code:error.code});}sendError(res,error);}
}
