import { ApiError } from './http.js';
import { systemPolicy, type ImageInput, type TextInput } from './engine-core.js';

export const TEXT_MODEL = 'line-ai-neural-v1';
export const IMAGE_MODEL = 'line-ai-vision-v1';
export const MAX_OUTPUT = 4096;

// Line AI meters upstream compute in micro-USD so project budgets remain exact.
export const TEXT_INPUT_RATE = 0.3;
export const TEXT_OUTPUT_RATE = 2.5;
export const IMAGE_INPUT_RATE = 5;
export const IMAGE_OUTPUT_RATE = 40;
export const IMAGE_RESERVE = 350000;

export const engineEnabled = () => process.env.LINE_AI_ENGINE_ENABLED === 'true';
const runtimeUrl = (kind: 'text' | 'image') => process.env[kind === 'text' ? 'LINE_AI_TEXT_RUNTIME_URL' : 'LINE_AI_IMAGE_RUNTIME_URL']?.trim();
const runtimeKey = (kind: 'text' | 'image') => process.env[kind === 'text' ? 'LINE_AI_TEXT_RUNTIME_KEY' : 'LINE_AI_IMAGE_RUNTIME_KEY']?.trim();
export const textReady = () => engineEnabled() && Boolean(runtimeUrl('text') && runtimeKey('text'));
export const imagesReady = () => engineEnabled() && process.env.LINE_AI_IMAGES_ENABLED !== 'false' && Boolean(runtimeUrl('image') && runtimeKey('image'));

export class RejectedRequest extends ApiError {}
type Usage = { input: number | null; output: number | null; cost: number | null };

function tokens(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function textCost(input: number, output: number) {
  return Math.ceil(input * TEXT_INPUT_RATE + output * TEXT_OUTPUT_RATE);
}

export function textEnvelope(input: TextInput, policy: string) {
  const system = systemPolicy(input.task, policy) + (input.truthMode ? '\nDoğruluk modu açık: doğrulanmış bilgi, çıkarım ve belirsizliği ayır. Sağlanmayan kaynak için atıf uydurma; internet aracı bağlı değil, güncel veriyi doğruladığını söyleme.' : '');
  const preference = [input.customInstructions, input.responseStyle ? `Yanıt biçimi tercihi: ${input.responseStyle}` : ''].filter(Boolean).join('\n');
  const turns = [...input.transcript, { role: 'user' as const, content: input.prompt + (preference ? `\n\nKullanıcı tercihleri:\n${preference}` : '') }];
  const messages = turns.map((message) => ({ role: message.role, content: message.content }));
  return { system, messages, upperInput: Buffer.byteLength(JSON.stringify({ system, messages })) + 512 };
}

async function runtimeJson(url: string, key: string, body: unknown, timeout: number) {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    // Runtime bodies may contain prompts or secrets; never forward or log them.
    if (response.status === 429) throw new RejectedRequest(503, 'engine_capacity', 'Line AI Engine kapasitesi şu anda dolu. Ayrılan kota iade edildi.');
    if ([400, 401, 403, 404, 422].includes(response.status)) throw new RejectedRequest(502, 'engine_runtime_rejected', 'Line AI Engine isteği işleyemedi. Ayrılan kota iade edildi.');
    throw new ApiError(502, 'engine_runtime_unavailable', 'Line AI Engine çalışma katmanı isteği tamamlayamadı.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing_response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 12_000_000) throw new Error('response_limit');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function generateText(input: TextInput, policy: string, timeoutMs = 110000): Promise<{ message: string; usage: Usage }> {
  const url = runtimeUrl('text');
  const key = runtimeKey('text');
  if (!engineEnabled() || !url || !key) throw new ApiError(503, 'engine_disabled', 'Line AI Engine metin üretimi henüz etkin değil.');
  const envelope = textEnvelope(input, policy);
  const responseFormat = /(?:yalnızca|sadece).{0,80}(?:geçerli\s+)?json|json.{0,80}(?:formatında|olarak).{0,40}(?:yalnızca|sadece)|kod bloğu kullanma.{0,80}json/i.test(input.prompt) ? 'json' : 'text';
  const result = await runtimeJson(url, key, {
    system: envelope.system,
    messages: envelope.messages,
    reasoning: input.reasoning ?? 'medium',
    responseFormat,
    maxOutputTokens: MAX_OUTPUT,
  }, timeoutMs);
  const message = typeof result.message === 'string' ? result.message.trim() : '';
  if (!message) throw new Error('empty_response');
  const inputTokens = tokens(result.usage?.input);
  const outputTokens = tokens(result.usage?.output);
  return {
    message,
    usage: {
      input: inputTokens,
      output: outputTokens,
      cost: inputTokens !== null && outputTokens !== null ? textCost(inputTokens, outputTokens) : null,
    },
  };
}

export async function generateImage(input: ImageInput): Promise<{ bytes: Buffer; usage: Usage }> {
  const url = runtimeUrl('image');
  const key = runtimeKey('image');
  if (!imagesReady() || !url || !key) throw new ApiError(503, 'images_disabled', 'Line AI görsel üretimi henüz etkin değil.');
  const result = await runtimeJson(url, key, input, 170000);
  const encoded = typeof result.data === 'string' ? result.data : '';
  const bytes = Buffer.from(encoded, 'base64');
  if (result.mimeType !== 'image/webp' || bytes.length < 16 || bytes.length > 8_388_608 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error('invalid_image');
  const inputTokens = tokens(result.usage?.input);
  const outputTokens = tokens(result.usage?.output);
  return {
    bytes,
    usage: {
      input: inputTokens,
      output: outputTokens,
      cost: inputTokens !== null && outputTokens !== null ? Math.ceil(inputTokens * IMAGE_INPUT_RATE + outputTokens * IMAGE_OUTPUT_RATE) : null,
    },
  };
}
