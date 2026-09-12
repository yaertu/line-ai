import { ApiError } from './http.js';
import { systemPolicy, type TextInput, type ImageInput } from './engine-core.js';
export const TEXT_MODEL = process.env.LINE_AI_TEXT_MODEL === 'gemini-2.5-flash-lite' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
export const IMAGE_MODEL = 'gpt-image-1';
export const MAX_OUTPUT = 4096;
// USD / million tokens = micro-USD / token. Verified provider rate cards, 2026-09-12.
export const TEXT_INPUT_RATE = TEXT_MODEL==='gemini-2.5-flash-lite'?0.10:0.30;
export const TEXT_OUTPUT_RATE = TEXT_MODEL==='gemini-2.5-flash-lite'?0.40:2.50;
export const IMAGE_INPUT_RATE = 5;
export const IMAGE_OUTPUT_RATE = 40;
export const IMAGE_RESERVE = 350000; // max high/portrait output + bounded text input, USD 0.35
export const engineEnabled = () => process.env.LINE_AI_ENGINE_ENABLED==='true';
export const textReady = () => engineEnabled() && Boolean(process.env.LINE_AI_GEMINI_KEY);
export const imagesReady = () => engineEnabled() && process.env.LINE_AI_IMAGES_ENABLED!=='false' && Boolean(process.env.LINE_AI_OPENAI_KEY);
export class RejectedRequest extends ApiError {}
type Usage = { input:number|null; output:number|null; cost:number|null };
function tokens(value:unknown):number|null { return typeof value==='number' && Number.isSafeInteger(value) && value>=0 ? value : null; }
export function textCost(input:number,output:number) { return Math.ceil(input*TEXT_INPUT_RATE+output*TEXT_OUTPUT_RATE); }
export function textEnvelope(input:TextInput, policy:string) {
  const system = systemPolicy(input.task,policy) + (input.truthMode ? '\nDoğruluk modu açık: doğrulanmış bilgi, çıkarım ve belirsizliği ayır. Sağlanmayan kaynak için atıf uydurma; internet aracı bağlı değil, güncel veriyi doğruladığını söyleme.' : '');
  const preference = [input.customInstructions,input.responseStyle ? 'Yanıt biçimi tercihi: '+input.responseStyle : ''].filter(Boolean).join('\n');
  const turns = [...input.transcript,{role:'user' as const,content:input.prompt + (preference ? '\n\nKullanıcı tercihleri:\n'+preference : '')}];
  const contents = turns.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  return {system,contents,upperInput:Buffer.byteLength(JSON.stringify({system,contents}))+512};
}
async function providerJson(url:string, headers:Record<string,string>, body:unknown, timeout:number) {
  const response = await fetch(url,{method:'POST',redirect:'error',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  if (!response.ok) {
    // Provider bodies can contain prompts or credentials. Never forward or log them.
    if (response.status===429) {
      const detail=await response.json().catch(()=>({}));
      const code=detail.error?.code,type=detail.error?.type;
      if(['insufficient_quota','credit_balance_exhausted','billing_hard_limit_reached'].includes(code)||type==='insufficient_quota')
        throw new RejectedRequest(503,'provider_credit_exhausted','Görsel sağlayıcısının kredisi tükendi. Yönetici sağlayıcı bakiyesini yenilemeli. Ayrılan kota iade edildi.');
      throw new RejectedRequest(503,'provider_busy','Bulut kapasitesi şu anda dolu. Ayrılan kota iade edildi.');
    }
    if ([400,401,403,404,422].includes(response.status)) throw new RejectedRequest(502,'provider_rejected','Sağlayıcı isteği kabul etmedi. Ayrılan kota iade edildi.');
    throw new ApiError(502,'provider_unavailable','Bulut sağlayıcısı isteği tamamlayamadı.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing_response');
  const chunks:Uint8Array[]=[]; let size=0;
  try { while(true) {const part=await reader.read(); if(part.done) break; size+=part.value.byteLength; if(size>12000000) throw new Error('response_limit'); chunks.push(part.value);} }
  finally {await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function generateText(input:TextInput,policy:string,timeoutMs=110000):Promise<{message:string;usage:Usage}> {
  if (!textReady()) throw new ApiError(503,'text_not_configured','Metin üretimi henüz etkinleştirilmedi.');
  const env=textEnvelope(input,policy);
  const result=await providerJson('https://generativelanguage.googleapis.com/v1beta/models/'+TEXT_MODEL+':generateContent',{'x-goog-api-key':process.env.LINE_AI_GEMINI_KEY!},{
    systemInstruction:{parts:[{text:env.system}]},contents:env.contents,
    generationConfig:{maxOutputTokens:MAX_OUTPUT,temperature:0.5,thinkingConfig:{thinkingBudget:input.reasoning==='high'?2048:input.reasoning==='medium'?1024:0},
      ...(/(?:yalnızca|sadece|only)\s+(?:geçerli\s+|valid\s+)?json\b/i.test(input.prompt)?{responseMimeType:'application/json'}:{})}
  },timeoutMs);
  const parts=result.candidates?.[0]?.content?.parts;
  const message=Array.isArray(parts) ? parts.filter((p:{text?:string;thought?:boolean})=>typeof p.text==='string'&&!p.thought).map((p:{text:string})=>p.text).join('') : '';
  if (!message.trim() || message.length>150000) throw new ApiError(502,'empty_response','Model kullanılabilir bir yanıt üretmedi.');
  const meta=result.usageMetadata; const inputTokens=tokens(meta?.promptTokenCount);
  const total=tokens(meta?.totalTokenCount); const output=inputTokens!==null&&total!==null&&total>=inputTokens?total-inputTokens:null;
  return {message,usage:{input:inputTokens,output,cost:inputTokens!==null&&output!==null?textCost(inputTokens,output):null}};
}
export async function generateImage(input:ImageInput):Promise<{bytes:Buffer;usage:Usage}> {
  if (!imagesReady()) throw new ApiError(503,'images_not_configured','Görsel üretimi henüz etkinleştirilmedi.');
  const sizes={'1:1':'1024x1024','3:2':'1536x1024','2:3':'1024x1536'};
  const result=await providerJson('https://api.openai.com/v1/images/generations',{Authorization:'Bearer '+process.env.LINE_AI_OPENAI_KEY},{
    model:IMAGE_MODEL,prompt:input.prompt+'\nVisual style: '+input.style,size:sizes[input.aspectRatio],quality:input.quality,n:1,output_format:'webp'
  },170000);
  const base64=result.data?.[0]?.b64_json;
  if (typeof base64!=='string'||base64.length>11200000) throw new Error('invalid_image');
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<16||bytes.length>8388608||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP') throw new Error('invalid_image');
  const inputTokens=tokens(result.usage?.input_tokens), output=tokens(result.usage?.output_tokens);
  return {bytes,usage:{input:inputTokens,output,cost:inputTokens!==null&&output!==null?Math.ceil(inputTokens*IMAGE_INPUT_RATE+output*IMAGE_OUTPUT_RATE):null}};
}
