import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import type {VercelRequest,VercelResponse} from '@vercel/node';
const f=vi.hoisted(()=>({finish:vi.fn(),reserve:vi.fn(),requireEngine:vi.fn(),policy:vi.fn(),usage:vi.fn()}));
vi.mock('./engine-store.js',async(importOriginal)=>({...await importOriginal<typeof import('./engine-store.js')>(),finish:f.finish,reserve:f.reserve,requireEngine:f.requireEngine,activePolicy:f.policy,usage:f.usage}));
import handler from '../v1/engine.js';
import {generateImage} from './engine-runtime.js';
import {parseImage} from './engine-core.js';
function response(){
 const body:{status:number;json:Record<string,unknown>}={status:0,json:{}};
 const res={setHeader:vi.fn(),status:(s:number)=>{body.status=s;return res;},json:(j:Record<string,unknown>)=>{body.json=j;return res;}};
 return {res:res as unknown as VercelResponse,body};
}
const req=(route:string,body:unknown={})=>({method:route==='capabilities'?'GET':'POST',query:{route},headers:{'idempotency-key':'operation-123456'},body}) as unknown as VercelRequest;
beforeEach(()=>{
	vi.stubEnv('LINE_AI_ENGINE_ENABLED','true');vi.stubEnv('LINE_AI_TEXT_RUNTIME_URL','https://runtime.lineai.test/v1/text');vi.stubEnv('LINE_AI_TEXT_RUNTIME_KEY','runtime-test');vi.stubEnv('LINE_AI_IMAGE_RUNTIME_URL','https://runtime.lineai.test/v1/images');vi.stubEnv('LINE_AI_IMAGE_RUNTIME_KEY','runtime-test');
 f.finish.mockReset().mockResolvedValue(undefined);f.reserve.mockReset().mockResolvedValue({existing:false,request:{id:'request-1'}});
 f.requireEngine.mockReset().mockResolvedValue({key:{id:'key-1',scopes:['text','images'],expires_at:'2026-12-01T00:00:00.000Z'},project:{id:'project-1',name:'Test',images_enabled:true,daily_units:100000,monthly_units:1000000,daily_images:10,monthly_images:100,daily_cost_micros:500000,monthly_cost_micros:5000000},db:{}});
 f.policy.mockResolvedValue({version:'test-1',instructions:'Doğru cevap ver.'});
 f.usage.mockResolvedValue({daily:0,monthly:0});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Engine request accounting and desktop contract',()=>{
	it('exposes only the Line AI Engine identity to clients',async()=>{
		const r=response();await handler(req('capabilities'),r.res);
		expect(r.body.status).toBe(200);
		expect(r.body.json.models).toEqual({text:'line-ai-neural-v1',image:'line-ai-vision-v1'});
		expect(JSON.stringify(r.body.json)).not.toMatch(/gemini|openai|provider/i);
	});
	it('reports safe key health, reset times and remaining budget',async()=>{
		f.usage.mockResolvedValue({daily:1250,monthly:9200,dailyImages:2,monthlyImages:11,dailyCostMicros:1200,monthlyCostMicros:8900,requests:17});
		const r=response();await handler(req('capabilities'),r.res);
		expect(r.body.status).toBe(200);
		expect(r.body.json.key).toEqual({state:'active',scopes:['text','images'],expiresAt:'2026-12-01T00:00:00.000Z'});
		expect(r.body.json.usage).toEqual({requestCountThisMonth:17});
		expect(r.body.json.quota).toEqual(expect.objectContaining({remainingDailyUnits:98750,remainingMonthlyUnits:990800,remainingDailyCostMicros:498800,remainingMonthlyCostMicros:4991100}));
		expect(r.body.json.periods).toEqual({dailyResetsAt:expect.any(String),monthlyResetsAt:expect.any(String)});
		expect(JSON.stringify(r.body.json)).not.toContain('key-1');
	});
	it('accepts native nullable preferences and emits numeric estimated units without provider usage',async()=>{
		vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'Merhaba',usage:{input:null,output:null}}))));
		const r=response();await handler(req('generate',{prompt:'Merhaba',customInstructions:null,responseStyle:null,reasoning:'high',truthMode:true}),r.res);
  expect(r.body.status).toBe(200);expect((r.body.json.usage as {units:number;estimated:boolean}).units).toBeGreaterThan(0);
  expect((r.body.json.usage as {estimated:boolean}).estimated).toBe(true);
		const sent=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://runtime.lineai.test/v1/text');
		expect(sent.reasoning).toBe('high');
		expect(sent.system).toContain('Doğruluk modu açık');
	});
	it('settles real provider tokens and cost',async()=>{
		vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'42',usage:{input:100,output:30}}))));
  const r=response();await handler(req('generate',{prompt:'6*7'}),r.res);
  expect(r.body.status).toBe(200);expect(f.finish).toHaveBeenCalledWith('request-1','completed',expect.anything(),{input:100,output:30,cost:105});
 });
	it('uses structured output when explicitly asked for JSON without formatting',async()=>{
		vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'{"ok":true}',usage:{input:null,output:null}}))));
		const r=response();await handler(req('generate',{prompt:'Yalnızca geçerli JSON yaz: ok true. Kod bloğu kullanma.'}),r.res);
		const sent=JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
		expect(sent.responseFormat).toBe('json');
  expect(r.body.status).toBe(200);
 });
 it('refunds a rejected provider request and never returns upstream secrets',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('sk-secret-private',{status:429})));
  const r=response();await handler(req('generate',{prompt:'Merhaba'}),r.res);
		expect(r.body.status).toBe(503);expect(f.finish).toHaveBeenCalledWith('request-1','failed',null,{input:0,output:0,cost:0},'engine_capacity');
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
		vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:Buffer.from('<script>bad</script>').toString('base64'),mimeType:'image/webp',usage:{input:null,output:null}}))));
  await expect(generateImage(parseImage({prompt:'image'}))).rejects.toThrow();
 });
});
