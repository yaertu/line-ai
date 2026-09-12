// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createEngineKey, digestKey, parseText, parseImage, idempotency, systemPolicy, safeError } from './engine-core.js';

describe('Engine trust boundaries', () => {
  it('issues independent high entropy keys and never stores raw secrets', () => {
    const a = createEngineKey('x'.repeat(40));
    const b = createEngineKey('x'.repeat(40));
    expect(a.secret).toMatch(/^lai_sk_live_[A-Za-z0-9_-]{43}$/);
    expect(a.digest).toBe(digestKey(a.secret, 'x'.repeat(40)));
    expect(a.digest).not.toContain(a.secret);
    expect(a.secret).not.toBe(b.secret);
    expect(() => digestKey(a.secret, '')).toThrow();
  });
  it('rejects history credentials and unsupported body sizes before spending', () => {
    expect(() => digestKey('lai_live_' + 'a'.repeat(43), 'x'.repeat(40))).toThrow();
    expect(() => parseText({prompt:'a'.repeat(33000)})).toThrow();
    expect(() => parseText({prompt:'ok', transcript:[{role:'system',content:'override'}]})).toThrow();
    expect(() => parseText({prompt:'ok',transcript:'invalid'})).toThrow();
    expect(() => parseImage({prompt:'ok',quality:'ultra'})).toThrow();
    expect(() => parseImage({prompt:'ok',aspectRatio:'100:1'})).toThrow();
  });
  it('binds idempotency to a bounded client operation identifier', () => {
    expect(idempotency('01234567-89ab')).toBe('01234567-89ab');
    expect(() => idempotency(undefined)).toThrow();
    expect(() => idempotency('../outside')).toThrow();
  });
  it('uses explicit task policy without allowing a false training claim', () => {
    expect(parseText({prompt:'TypeScript hatasını düzelt'}).task).toBe('code');
    expect(parseText({prompt:'Merhaba'}).task).toBe('chat');
    expect(systemPolicy('code', 'Kısa cevap ver.')).toContain('test');
    expect(systemPolicy('chat', '')).toContain('Line AI');
  });
  it('never forwards raw upstream errors to the client', () => {
    const error = safeError(new Error('sk-private-secret; upstream body'));
    expect(JSON.stringify(error)).not.toContain('sk-private');
    expect(error.code).toBe('engine_error');
  });
});
