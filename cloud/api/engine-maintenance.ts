import {timingSafeEqual} from 'node:crypto';
import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getDatabase} from './_lib/database.js';
import {allowMethods,ApiError,sendError,sendJson} from './_lib/http.js';
import {dbCheck} from './_lib/engine-store.js';
import {proposeImprovement,evaluatePolicy} from './_lib/engine-learning.js';
import {audit} from './_lib/engine-admin.js';
export const config={maxDuration:300};
export default async function handler(req:VercelRequest,res:VercelResponse) {
 try {
  if(!allowMethods(req,res,['GET']))return;
  const expected='Bearer '+(process.env.CRON_SECRET||'');
  const provided=req.headers.authorization||'';
  if(expected.length<40||provided.length!==expected.length||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))throw new ApiError(401,'unauthorized','Yetkisiz istek.');
  const db=getDatabase();
  dbCheck(await db.from('line_engine_requests').update({result:null}).lt('created_at',new Date(Date.now()-86400000).toISOString()).not('result','is',null));
  dbCheck(await db.from('line_engine_sessions').delete().lt('expires_at',new Date().toISOString()));
  dbCheck(await db.from('line_engine_feedback').delete().lt('created_at',new Date(Date.now()-90*86400000).toISOString()));
  const claim=dbCheck(await db.rpc('line_engine_claim_automation'));
  if(!claim){sendJson(res,200,{status:'no_new_feedback',maintenance:true});return;}
  try {
   const policy=await proposeImprovement(claim.projectId,null);
   const evaluation=await evaluatePolicy(policy.id,claim.projectId,null);
   let published=false;
   // Strict improvement, all regression cases pass, and RPC validates current baseline.
   if(evaluation.passed&&evaluation.score>evaluation.baseScore)published=Boolean(dbCheck(await db.rpc('line_engine_publish',{p_id:policy.id})));
   dbCheck(await db.from('line_engine_automation').update({last_completed:new Date().toISOString(),last_feedback_at:claim.feedbackAt,last_status:published?'published':evaluation.passed?'tested_no_regression':'regression_detected',last_policy_id:policy.id}).eq('id',1));
   await audit(null,'automation.'+(published?'published':'evaluated'),policy.id);
   sendJson(res,200,{status:published?'published':'evaluated',policyVersion:policy.version,evaluationPassed:evaluation.passed});
  }catch(error){dbCheck(await db.from('line_engine_automation').update({last_status:'failed',last_completed:new Date().toISOString()}).eq('id',1));throw error;}
 }catch(error){sendError(res,error);}
}
