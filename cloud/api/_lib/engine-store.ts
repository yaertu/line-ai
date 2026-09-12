import type { VercelRequest } from '@vercel/node';
import { getDatabase, sha256 } from './database.js';
import { ApiError } from './http.js';
import { digestKey, idempotency } from './engine-core.js';
export const pepper = () => process.env.LINE_AI_ENGINE_PEPPER ?? '';
export const dbCheck = <T>(r:{data:T;error:unknown}):T => {
 if(r.error) {
  const raw=typeof r.error==='object'&&r.error!==null&&'code' in r.error ? String(r.error.code) : '';
  console.warn('line_engine_database_unavailable',{code:/^[A-Z0-9]{3,12}$/.test(raw)?raw:'gateway'});
  throw new ApiError(503,'database_unavailable','Bulut veritabanı şu anda yanıt veremiyor. Biraz sonra yeniden deneyin.');
 }
 return r.data;
};
export const uuid = (value:unknown) => {
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiError(400,'invalid_id','Kayıt kimliği geçersiz.');
 return value;
};
export async function requireEngine(request:VercelRequest,scope?:string) {
 const auth=request.headers.authorization;
 const secret=typeof auth==='string'&&auth.startsWith('Bearer ')?auth.slice(7):'';
 const digest=digestKey(secret,pepper());
 const db=getDatabase();
 const key=dbCheck(await db.from('line_engine_keys').select('id,project_id,scopes,revoked_at,expires_at').eq('digest',digest).maybeSingle());
 if(!key||key.revoked_at||(key.expires_at&&new Date(key.expires_at).getTime()<=Date.now())) throw new ApiError(401,'invalid_key','Engine anahtarı geçersiz veya iptal edilmiş.');
 if(scope&&!key.scopes.includes(scope)) throw new ApiError(403,'scope_denied','Anahtarın bu işlem için yetkisi yok.');
 const project=dbCheck(await db.from('line_engine_projects').select('*').eq('id',key.project_id).single());
 if(!project.enabled) throw new ApiError(403,'project_disabled','Proje duraklatıldı.');
 return {key,project,db};
}
export async function activePolicy() {
 const policy=dbCheck(await getDatabase().from('line_engine_policies').select('id,version,instructions').eq('status','published').single());
 if(!policy) throw new ApiError(503,'policy_unavailable','Davranış sürümü hazır değil.');
 return policy;
}
export async function reserve(identity:Awaited<ReturnType<typeof requireEngine>>,request:VercelRequest,body:unknown,kind:string,task:string,policy:string,model:string,units:number,cost:number) {
 const result=dbCheck(await identity.db.rpc('line_engine_reserve',{p_key:identity.key.id,p_operation:idempotency(request.headers['idempotency-key']),p_hash:sha256(JSON.stringify({kind,body})),p_kind:kind,p_task:task,p_policy:policy,p_model:model,p_units:units,p_cost:cost}));
 if(result.error) {
   const status=result.error==='idempotency_conflict'?409:result.error==='invalid_key'?401:/denied|disabled/.test(result.error)?403:429;
   throw new ApiError(status,result.error,'İstek başlatılamadı: '+result.error+'. Kullanım ve proje sınırlarını kontrol edin.');
 }
 return result as {existing:boolean;request:{id:string;status:string;result:Record<string,unknown>|null;created_at:string;error_code:string|null}};
}
export function replay(r:Awaited<ReturnType<typeof reserve>>) {
 if(!r.existing) return null;
 if(r.request.status==='completed'&&r.request.result&&Date.now()-Date.parse(r.request.created_at)<86400000) return r.request.result;
 if(r.request.status==='completed') throw new ApiError(410,'result_expired','Yanıtın 24 saatlik tekrar alma süresi doldu.');
 throw new ApiError(409,r.request.status==='processing'?'request_in_progress':'request_uncertain','Bu işlem daha önce başlatıldı. Yeniden üretim yapılmadı; istek durumu: '+r.request.status);
}
export async function finish(id:string,status:string,result:unknown,usage:{input:number|null;output:number|null;cost:number|null},error:string|null=null) {
 const done=dbCheck(await getDatabase().rpc('line_engine_finish',{p_id:id,p_status:status,p_result:result,p_input:usage.input,p_output:usage.output,p_cost:usage.cost,p_error:error}));
 if(!done) throw new Error('request_finalization_failed');
}
export async function usage(projectId:string) {
 const from=new Date();from.setUTCDate(1);from.setUTCHours(0,0,0,0);
 const today=new Date();today.setUTCHours(0,0,0,0);
 // Paginate: Supabase's default 1000-row limit must never under-report usage.
 const totals={daily:0,monthly:0,dailyImages:0,monthlyImages:0,dailyCostMicros:0,monthlyCostMicros:0,requests:0};
 for(let offset=0;;offset+=1000) {
  const rows=dbCheck(await getDatabase().from('line_engine_requests').select('units,images,cost_micros,created_at').eq('project_id',projectId).gte('created_at',from.toISOString()).order('id').range(offset,offset+999)) ?? [];
  for(const row of rows) {totals.monthly+=Number(row.units);totals.monthlyImages+=row.images;totals.monthlyCostMicros+=Number(row.cost_micros);totals.requests++; if(Date.parse(row.created_at)>=today.getTime()){totals.daily+=Number(row.units);totals.dailyImages+=row.images;totals.dailyCostMicros+=Number(row.cost_micros);}}
  if(rows.length<1000) break;
 }
 return totals;
}
