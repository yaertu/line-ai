// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {CASES,evaluationFailure,freshBaselineEvaluation} from './engine-learning.js';

describe('Engine policy evaluation diagnostics',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('converts an upstream timeout to a stable, secret-free operator error',()=>{
  const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const failure=evaluationFailure(new DOMException('provider body with a secret','TimeoutError'),'provider');
  expect(failure.status).toBe(503);
  expect(failure.code).toBe('evaluation_provider_timeout');
  expect(failure.message).not.toContain('secret');
  expect(warning).toHaveBeenCalledWith('line_engine_evaluation_failure',{code:'evaluation_provider_timeout',phase:'provider'});
 });
 it('replaces a stale failed baseline result with the current suite measurement',()=>{
  const fresh=freshBaselineEvaluation(CASES.length,'2026-09-12T00:00:00.000Z');
  expect(fresh).toMatchObject({passed:true,score:CASES.length,total:CASES.length,source:'fresh_baseline_measurement'});
 });
});
