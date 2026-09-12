import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
const access=JSON.parse(await readFile(join(homedir(),'.lineai','engine-operator.json'),'utf8'));
const origin='https://lineaicloud.vercel.app';let cookie='';
async function action(body){
 const r=await fetch(origin+'/api/admin',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(290000)});
 const j=await r.json().catch(()=>({}));if(!r.ok){const error=new Error(j.error?.code||'admin_failed');error.code=j.error?.code||'admin_failed';error.status=r.status;throw error;}return {r,j};
}
try{
 const session=await action({action:'login',email:access.email,password:access.password});cookie=session.r.headers.get('set-cookie').split(';')[0];
 const snapshot=await (await fetch(origin+'/api/admin',{headers:{Cookie:cookie}})).json();
 let policy=snapshot.policies.find(p=>p.version==='1.1.0');
 if(!policy)policy=(await action({action:'create_policy',version:'1.1.0',instructions:'Kullanıcının diline, bilgi düzeyine ve asıl amacına uyum sağla. Basit soruda önce net cevap ver. Karmaşık işi kısa uygulanabilir adımlara böl. Kodlama görevinde mevcut davranışı ve hatanın kök nedenini açıkla; güvenli, eksiksiz kod ile kenar durumları için anlamlı test öner. Testi çalıştırmadıysan çalıştırdığını söyleme. Dosya analizinde yalnızca paylaşılan bölümleri kullan; bulunmayan içeriği uydurma. Güncel veya belirsiz bilgi için kesinlik iddiasından kaçın. Kullanıcının özel verilerini gereksiz yere tekrarlama.'})).j.policy;
 const evaluation=(await action({action:'evaluate',id:policy.id,projectId:access.learningProjectId})).j.evaluation;
 await mkdir(new URL('../../artifacts/',import.meta.url),{recursive:true});
 await writeFile(new URL('../../artifacts/engine-policy-evaluation.json',import.meta.url),JSON.stringify(evaluation,null,2));
 console.log('Evaluation:',{version:policy.version,passed:evaluation.passed,score:evaluation.score,baseline:evaluation.baseScore,total:evaluation.total});
 if(evaluation.passed){await action({action:'publish_policy',id:policy.id});console.log('Published verified policy:',policy.version);}
 else console.log('Candidate retained as draft; current policy preserved.');
 await action({action:'logout'});
}catch(error){console.error('Policy release check:',{code:error?.code||'unknown_error',status:error?.status||0});process.exitCode=1;}
