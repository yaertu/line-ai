import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import type {VercelRequest,VercelResponse} from '@vercel/node';
const f=vi.hoisted(()=>({finish:vi.fn(),reserve:vi.fn(),requireEngine:vi.fn(),policy:vi.fn(),usage:vi.fn()}));
vi.mock('./engine-store.js',async(importOriginal)=>({...await importOriginal<typeof import('./engine-store.js')>(),finish:f.finish,reserve:f.reserve,requireEngine:f.requireEngine,activePolicy:f.policy,usage:f.usage}));
import handler from '../v1/engine.js';
import {generateImage} from './engine-provider.js';
import {parseImage} from './engine-core.js';
function response(){
 const body:{status:number;json:Record<string,unknown>}={status:0,json:{}};
 const res={setHeader:vi.fn(),status:(s:number)=>{body.status=s;return res;},json:(j:Record<string,unknown>)=>{body.json=j;return res;}};
 return {res:res as unknown as VercelResponse,body};
}
const req=(route:string,body:unknown={})=>({method:route==='capabilities'?'GET':'POST',query:{route},headers:{'idempotency-key':'operation-123456'},body}) as unknown as VercelRequest;
beforeEach(()=>{
 vi.stubEnv('LINE_AI_ENGINE_ENABLED','true');vi.stubEnv('LINE_AI_GEMINI_KEY','test');vi.stubEnv('LINE_AI_OPENAI_KEY','test');
 f.finish.mockReset().mockResolvedValue(undefined);f.reserve.mockReset().mockResolvedValue({existing:false,request:{id:'request-1'}});
 f.requireEngine.mockReset().mockResolvedValue({key:{id:'key-1',scopes:['text','images']},project:{id:'project-1',name:'Test',images_enabled:true,daily_units:100000,monthly_units:1000000},db:{}});
 f.policy.mockResolvedValue({version:'test-1',instructions:'Doğru cevap ver.'});
 f.usage.mockResolvedValue({daily:0,monthly:0});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Engine request accounting and desktop contract',()=>{
 it('accepts native nullable preferences and emits numeric estimated units without provider usage',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Merhaba'}]}}]}))));
  const r=response();await handler(req('generate',{prompt:'Merhaba',customInstructions:null,responseStyle:null,reasoning:'high',truthMode:true}),r.res);
  expect(r.body.status).toBe(200);expect((r.body.json.usage as {units:number;estimated:boolean}).units).toBeGreaterThan(0);
  expect((r.body.json.usage as {estimated:boolean}).estimated).toBe(true);
  const sent=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(sent.generationConfig.thinkingConfig.thinkingBudget).toBe(2048);
  expect(sent.systemInstruction.parts[0].text).toContain('Doğruluk modu açık');
 });
 it('settles real provider tokens and cost',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'42'}]}}],usageMetadata:{promptTokenCount:100,totalTokenCount:130}}))));
  const r=response();await handler(req('generate',{prompt:'6*7'}),r.res);
  expect(r.body.status).toBe(200);expect(f.finish).toHaveBeenCalledWith('request-1','completed',expect.anything(),{input:100,output:30,cost:105});
 });
 it('uses structured output when explicitly asked for JSON without formatting',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]}))));
  const r=response();await handler(req('generate',{prompt:'Yalnızca geçerli JSON yaz: ok true. Kod bloğu kullanma.'}),r.res);
  const sent=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(sent.generationConfig.responseMimeType).toBe('application/json');
  expect(r.body.status).toBe(200);
 });
 it('refunds a rejected provider request and never returns upstream secrets',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('sk-secret-private',{status:429})));
  const r=response();await handler(req('generate',{prompt:'Merhaba'}),r.res);
  expect(r.body.status).toBe(503);expect(f.finish).toHaveBeenCalledWith('request-1','failed',null,{input:0,output:0,cost:0},'provider_busy');
  expect(JSON.stringify(r.body)).not.toContain('sk-secret');
 });
 it('retains reservation on ambiguous network failure',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('network secret')));
  const r=response();await handler(req('generate',{prompt:'Merhaba'}),r.res);
  expect(f.finish).toHaveBeenCalledWith('request-1','uncertain',null,{input:null,output:null,cost:null},'engine_error');
 });
 it('replays completed operations without calling the provider twice',async()=>{
  f.reserve.mockResolvedValue({existing:true,request:{id:'request-1',status:'completed',created_at:new Date().toISOString(),result:{message:'saved'}}});
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const r=response();await handler(req('generate',{prompt:'Merhaba'}),r.res);
  expect(r.body.json.message).toBe('saved');expect(fetcher).not.toHaveBeenCalled();
 });
 it('disables generation and reports rollout state',async()=>{
  vi.stubEnv('LINE_AI_ENGINE_ENABLED','false');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const r=response();await handler(req('generate',{prompt:'Merhaba'}),r.res);expect(r.body.status).toBe(503);expect(f.reserve).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
  const c=response();await handler(req('capabilities'),c.res);expect(c.body.json.enabled).toBe(false);expect(c.body.json.text).toBe(false);
 });
 it('rejects mislabeled image bytes',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:Buffer.from('<script>bad</script>').toString('base64')}]}))));
  await expect(generateImage(parseImage({prompt:'image'}))).rejects.toThrow();
 });
});
