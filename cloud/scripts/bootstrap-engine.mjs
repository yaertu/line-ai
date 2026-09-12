import {createClient} from '@supabase/supabase-js';
import {randomBytes,createHmac} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const check=r=>{if(r.error)throw new Error('Bootstrap database operation failed');return r.data;};
const directory=join(homedir(),'.lineai');await mkdir(directory,{recursive:true,mode:0o700});
const file=join(directory,'engine-operator.json');
let stored;try{stored=JSON.parse(await readFile(file,'utf8'));}catch{/* First bootstrap has no access file. */}
const admins=check(await db.from('line_engine_admins').select('user_id').limit(1));
if(admins.length&&!stored)throw new Error('An administrator already exists; use the existing account.');
if(stored){console.log('Operator access already configured:',file);process.exit(0);}
const email='owner-'+randomBytes(5).toString('hex')+'@lineai.local';
const password=randomBytes(24).toString('base64url')+'!a9';
const result=await db.auth.admin.createUser({email,password,email_confirm:true});
if(result.error||!result.data.user)throw new Error('Operator account creation failed.');
const user=result.data.user;
check(await db.from('line_engine_admins').insert({user_id:user.id,role:'owner'}));
const project=check(await db.from('line_engine_projects').insert({name:'Line AI',images_enabled:true}).select('id').single());
const learning=check(await db.from('line_engine_projects').insert({name:'Line AI Kalite',daily_units:300000,monthly_units:3000000,daily_cost_micros:500000,monthly_cost_micros:5000000,rpm:30,concurrency:2}).select('id').single());
const secret='lai_sk_live_'+randomBytes(32).toString('base64url');
if((process.env.LINE_AI_ENGINE_PEPPER||'').length<32)throw new Error('Engine pepper required.');
const digest=createHmac('sha256',process.env.LINE_AI_ENGINE_PEPPER).update(secret).digest('hex');
const key=check(await db.from('line_engine_keys').insert({project_id:project.id,name:'Masaüstü anahtarım',prefix:secret.slice(0,19),digest,scopes:['text','images','feedback'],expires_at:new Date(Date.now()+90*86400000).toISOString()}).select('id').single());
check(await db.from('line_engine_automation').insert({id:1,enabled:true,project_id:learning.id}));
await writeFile(file,JSON.stringify({adminUrl:'https://lineaicloud.vercel.app/admin',email,password,engineKey:secret,projectId:project.id,learningProjectId:learning.id,keyId:key.id},null,2),{mode:0o600});
console.log('Operator access configured. Private file:',file);
