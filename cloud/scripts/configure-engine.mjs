import {randomBytes} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
const path=new URL('../.env.engine',import.meta.url);
const prior=existsSync(path)?parseEnv(readFileSync(path,'utf8')):{};
const values={
 LINE_AI_ENGINE_PEPPER:prior.LINE_AI_ENGINE_PEPPER||randomBytes(48).toString('base64url'),
 CRON_SECRET:prior.CRON_SECRET||randomBytes(48).toString('base64url'),
 LINE_AI_ENGINE_ENABLED:'true',
 LINE_AI_IMAGES_ENABLED:prior.LINE_AI_IMAGES_ENABLED||'false',
 LINE_AI_ADMIN_ORIGIN:'https://lineaicloud.vercel.app',
 LINE_AI_TEXT_RUNTIME_URL:prior.LINE_AI_TEXT_RUNTIME_URL||process.env.LINE_AI_TEXT_RUNTIME_URL,
 LINE_AI_TEXT_RUNTIME_KEY:prior.LINE_AI_TEXT_RUNTIME_KEY||process.env.LINE_AI_TEXT_RUNTIME_KEY,
 LINE_AI_IMAGE_RUNTIME_URL:prior.LINE_AI_IMAGE_RUNTIME_URL||process.env.LINE_AI_IMAGE_RUNTIME_URL,
 LINE_AI_IMAGE_RUNTIME_KEY:prior.LINE_AI_IMAGE_RUNTIME_KEY||process.env.LINE_AI_IMAGE_RUNTIME_KEY
};
if(!values.LINE_AI_TEXT_RUNTIME_URL||!values.LINE_AI_TEXT_RUNTIME_KEY)throw new Error('Line AI text runtime configuration must exist in the environment.');
writeFileSync(path,Object.entries(values).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600});
for(const [name,value]of Object.entries(values)){
 if(value===undefined||value==='')continue;
 const secret=name.endsWith('_KEY')||name.endsWith('_PEPPER')||name==='CRON_SECRET';
 const result=spawnSync(process.platform==='win32'?'vercel.cmd':'vercel',['env','add',name,'production','--force','--yes',secret?'--sensitive':'--no-sensitive','--scope','nice-c013'],{input:value,encoding:'utf8',shell:process.platform==='win32',windowsHide:true,cwd:new URL('..',import.meta.url)});
 if(result.status!==0){console.error('Environment update failed:',name,'exit',result.status);process.exit(1);}
 console.log('Configured:',name);
}
