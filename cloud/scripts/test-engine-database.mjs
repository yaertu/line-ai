import postgres from 'postgres';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
const sql=postgres(process.env.POSTGRES_URL_NON_POOLING??process.env.POSTGRES_URL,{max:8,prepare:false,ssl:'require',onnotice:()=>{}});
let project;
try {
 const tables=await sql`select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'line_engine_%'`;
 assert.equal(tables.length,11);assert(tables.every(t=>t.relrowsecurity));
 const functions=await sql`select oid::regprocedure::text as name,has_function_privilege('anon',oid,'EXECUTE') as anon,has_function_privilege('authenticated',oid,'EXECUTE') as auth from pg_proc where pronamespace='public'::regnamespace and proname like 'line_engine_%'`;
 assert(functions.length>=5);assert(functions.every(f=>!f.anon&&!f.auth));
 const bucket=await sql`select public from storage.buckets where id='line-engine-assets'`;assert.equal(bucket[0].public,false);
 [project]=await sql`insert into line_engine_projects(name,daily_units,monthly_units,daily_cost_micros,monthly_cost_micros,rpm,concurrency,images_enabled) values('Automated isolation test',100,100,1000,1000,100,20,true) returning id`;
 const [key]=await sql`insert into line_engine_keys(project_id,name,prefix,digest,scopes) values(${project.id},'test','test',${randomBytes(32).toString('hex')},array['text']) returning id`;
 const reserve=(operation,hash='hash',kind='text',units=60,cost=50)=>sql`select line_engine_reserve(${key.id},${operation},${hash},${kind},'chat','test','test',${units},${cost}) as r`.then(r=>r[0].r);
 const operations=Array.from({length:8},()=>randomUUID());
 const attempts=await Promise.all(operations.map(op=>reserve(op)));
 assert.equal(attempts.filter(r=>!r.error).length,1,'Concurrent reservations must not exceed quota');
 assert.equal(attempts.filter(r=>r.error==='token_quota_exceeded').length,7);
 const index=attempts.findIndex(r=>!r.error),request=attempts[index].request;
 assert.equal((await reserve(operations[index])).request.id,request.id,'Retry must return original request');
 assert.equal((await reserve(operations[index],'different')).error,'idempotency_conflict');
 assert.equal((await reserve(randomUUID(),'hash','image',0,0)).error,'scope_denied');
 await sql`select line_engine_finish(${request.id},'completed','{}'::jsonb,10,10,20,null)`;
 assert(!(await reserve(randomUUID(),'hash','text',60,50)).error,'Unused reservation must be returned after settlement');
 await sql`update line_engine_keys set revoked_at=now() where id=${key.id}`;
 assert.equal((await reserve(randomUUID())).error,'invalid_key');
 const [draft]=await sql`insert into line_engine_policies(version,instructions) values(${'test-'+randomUUID()},'Test only') returning id`;
 try {const [r]=await sql`select line_engine_publish(${draft.id}) as ok`;assert.equal(r.ok,false,'Untested policy must never publish');}
 finally{await sql`delete from line_engine_policies where id=${draft.id}`;}
 console.log('PASS: RLS, private storage, RPC grants, concurrent quota, idempotency, scope, settlement, revocation, untested policy rejection');
}catch(error){console.error('Engine database test failed:',error instanceof assert.AssertionError?error.message:error.code??'database_error');process.exitCode=1;}
finally{
 if(project){await sql`delete from line_engine_requests where project_id=${project.id}`;await sql`delete from line_engine_keys where project_id=${project.id}`;await sql`delete from line_engine_projects where id=${project.id}`;}
 await sql.end();
}
