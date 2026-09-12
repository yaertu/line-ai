import type {VercelRequest,VercelResponse} from '@vercel/node';
import {randomUUID} from 'node:crypto';
import {allowMethods,ApiError,readObjectBody,sendJson,sendError} from '../_lib/http.js';
import {parseText,parseImage,safeError,stringField} from '../_lib/engine-core.js';
import {requireEngine,activePolicy,reserve,replay,finish,usage,uuid,dbCheck} from '../_lib/engine-store.js';
import {generateText,generateImage,textEnvelope,textCost,MAX_OUTPUT,TEXT_MODEL,IMAGE_MODEL,IMAGE_RESERVE,textReady,imagesReady,engineEnabled,RejectedRequest} from '../_lib/engine-provider.js';

export const config = {maxDuration:240};
export default async function handler(req:VercelRequest,res:VercelResponse) {
 let requestId:string|undefined;
 let settledUsage:{input:number|null;output:number|null;cost:number|null}|undefined;
 try {
  const route=req.query.route;
  const methods=route==='capabilities'||route==='asset'||route==='request'?['GET']:route==='image'?['GET','DELETE']:['POST'];
  if(!allowMethods(req,res,methods)) return;
  if(!['capabilities','generate','images','image','asset','feedback','request'].includes(String(route))) throw new ApiError(404,'not_found','API yolu bulunamadı.');
  const scope=route==='generate'?'text':['images','image','asset'].includes(String(route))?'images':route==='feedback'?'feedback':undefined;
  const who=await requireEngine(req,scope);
  if(route==='capabilities') {
   const [totals,policy]=await Promise.all([usage(who.project.id),activePolicy()]);
   sendJson(res,200,{enabled:engineEnabled(),text:textReady()&&who.key.scopes.includes('text'),images:imagesReady()&&who.project.images_enabled&&who.key.scopes.includes('images'),
    project:{id:who.project.id,name:who.project.name},policyVersion:policy.version,
    quota:{dailyUnits:who.project.daily_units,monthlyUnits:who.project.monthly_units,usedDaily:totals.daily,usedMonthly:totals.monthly,
     dailyImages:who.project.daily_images,monthlyImages:who.project.monthly_images,usedDailyImages:totals.dailyImages,usedMonthlyImages:totals.monthlyImages,
     dailyCostMicros:who.project.daily_cost_micros,monthlyCostMicros:who.project.monthly_cost_micros,usedDailyCostMicros:totals.dailyCostMicros,usedMonthlyCostMicros:totals.monthlyCostMicros},
    imageUnavailableReason:imagesReady()?null:'Görsel sağlayıcısının kredisi yenilenene kadar üretim kapalı.',
    models:{text:TEXT_MODEL,image:IMAGE_MODEL},privacy:{promptsStored:false,replayHours:24,feedbackOptIn:true}});return;
  }
  if(route==='generate'||route==='images') {
   const raw=readObjectBody(req);
   const policy=await activePolicy();
   if(route==='generate') {
    const input=parseText(raw); if(!textReady()) throw new ApiError(503,'text_not_configured','Metin üretimi etkin değil.');
    const envelope=textEnvelope(input,policy.instructions);
    const held=await reserve(who,req,input,'text',input.task,policy.version,TEXT_MODEL,envelope.upperInput+MAX_OUTPUT,textCost(envelope.upperInput,MAX_OUTPUT));
    const cached=replay(held);if(cached){sendJson(res,200,cached);return;} requestId=held.request.id;
    const generated=await generateText(input,policy.instructions);
    settledUsage=generated.usage;
    const result={message:generated.message,model:TEXT_MODEL,provider:'lineai',sources:[],requestId,policyVersion:policy.version,
      usage:{units:generated.usage.input!==null&&generated.usage.output!==null?generated.usage.input+generated.usage.output:envelope.upperInput+MAX_OUTPUT,estimated:generated.usage.input===null||generated.usage.output===null,inputTokens:generated.usage.input,outputTokens:generated.usage.output,costMicros:generated.usage.cost}};
    await finish(requestId,'completed',result,generated.usage);requestId=undefined;sendJson(res,200,result);return;
   }
   const input=parseImage(raw);if(!imagesReady()) throw new ApiError(503,'images_not_configured','Görsel üretimi etkin değil.');
   const held=await reserve(who,req,input,'image','image',policy.version,IMAGE_MODEL,Buffer.byteLength(input.prompt)+9000,IMAGE_RESERVE);
   const cached=replay(held);if(cached){sendJson(res,200,cached);return;}requestId=held.request.id;
   const generated=await generateImage(input);settledUsage=generated.usage;const assetId=randomUUID();
   const path=who.project.id+'/'+assetId+'.webp';
   dbCheck(await who.db.storage.from('line-engine-assets').upload(path,generated.bytes,{contentType:'image/webp',upsert:false,cacheControl:'0'}));
   try {dbCheck(await who.db.from('line_engine_assets').insert({id:assetId,request_id:requestId,project_id:who.project.id,storage_path:path}));}
   catch(error) {await who.db.storage.from('line-engine-assets').remove([path]);throw error;}
   const result={id:requestId,status:'completed',assetId,model:IMAGE_MODEL,createdAt:new Date().toISOString()};
   await finish(requestId,'completed',result,generated.usage);requestId=undefined;sendJson(res,200,result);return;
  }
  if(route==='asset') {
   const asset=dbCheck(await who.db.from('line_engine_assets').select('storage_path').eq('id',uuid(req.query.id)).eq('project_id',who.project.id).is('deleted_at',null).maybeSingle());
   if(!asset) throw new ApiError(404,'asset_not_found','Görsel bulunamadı.');
   const signed=dbCheck(await who.db.storage.from('line-engine-assets').createSignedUrl(asset.storage_path,600));
   if(!signed) throw new Error('asset_sign_failed');
   sendJson(res,200,{url:signed.signedUrl,expiresIn:600});return;
  }
  if(route==='image'||route==='request') {
   const query=who.db.from('line_engine_requests').select('id,status,kind,model,created_at,result,error_code').eq('id',uuid(req.query.id)).eq('project_id',who.project.id);
   if(route==='image')query.eq('kind','image');
   const row=dbCheck(await query.maybeSingle());
   if(!row) throw new ApiError(404,'request_not_found','İstek bulunamadı.');
   if(req.method==='DELETE') {
    if(row.status==='processing')throw new ApiError(409,'request_in_progress','Üretim sürerken silinemez. İşlem durumunu tekrar kontrol edin.');
    const asset=dbCheck(await who.db.from('line_engine_assets').select('id,storage_path').eq('request_id',row.id).is('deleted_at',null).maybeSingle());
    if(asset){dbCheck(await who.db.storage.from('line-engine-assets').remove([asset.storage_path]));dbCheck(await who.db.from('line_engine_assets').update({deleted_at:new Date().toISOString()}).eq('id',asset.id));}
    dbCheck(await who.db.from('line_engine_requests').update({result:null}).eq('id',row.id));
    sendJson(res,200,{id:row.id,deleted:true});return;
   }
   const storedAsset=route==='image'?dbCheck(await who.db.from('line_engine_assets').select('id').eq('request_id',row.id).eq('project_id',who.project.id).is('deleted_at',null).maybeSingle()):null;
   sendJson(res,200,{id:row.id,status:row.status,model:row.model,createdAt:row.created_at,assetId:storedAsset?.id??null,errorCode:row.error_code});return;
  }
  const body=readObjectBody(req);const id=uuid(body.requestId);
  if(!['up','down'].includes(String(body.rating))||typeof body.trainingOptIn!=='boolean') throw new ApiError(400,'invalid_feedback','Puan ve paylaşım tercihi gerekli.');
  const row=dbCheck(await who.db.from('line_engine_requests').select('id').eq('id',id).eq('project_id',who.project.id).eq('status','completed').maybeSingle());
  if(!row) throw new ApiError(404,'request_not_found','Tamamlanmış istek bulunamadı.');
  const note=stringField(body.note,2000,'Geri bildirim');
  dbCheck(await who.db.from('line_engine_feedback').upsert({request_id:id,key_id:who.key.id,rating:body.rating,training_opt_in:body.trainingOptIn,note:body.trainingOptIn?note||null:null},{onConflict:'request_id,key_id'}));
  sendJson(res,200,{saved:true,trainingOptIn:body.trainingOptIn});
 } catch(error) {
  if(requestId) {
   const safe=safeError(error);const rejected=error instanceof RejectedRequest;
   await finish(requestId,rejected||settledUsage?'failed':'uncertain',null,rejected?{input:0,output:0,cost:0}:settledUsage??{input:null,output:null,cost:null},safe.code).catch(()=>{});
   sendJson(res,safe.status,{error:{code:safe.code,message:safe.message},requestId});return;
  }
  sendError(res,error);
 }
}
