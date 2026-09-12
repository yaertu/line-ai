import {randomBytes,createHmac} from 'node:crypto';
import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getDatabase,requestFingerprint} from './database.js';
import {ApiError} from './http.js';
import {dbCheck,pepper} from './engine-store.js';
const COOKIE='__Host-lineai_admin';
export function sessionHash(token:string) {
 if(pepper().length<32) throw new ApiError(503,'engine_not_configured','Yönetim güvenlik ayarı eksik.');
 return createHmac('sha256',pepper()).update('admin:'+token).digest('hex');
}
export function requireOrigin(req:VercelRequest) {
 const allowed=process.env.LINE_AI_ADMIN_ORIGIN||'https://lineaicloud.vercel.app';
 if(req.headers.origin!==allowed) throw new ApiError(403,'origin_denied','Bu kaynaktan yönetim işlemi kabul edilmiyor.');
}
export function cookieToken(req:VercelRequest) {
 const cookie=req.headers.cookie||'';
 return cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
}
export async function adminIdentity(req:VercelRequest,write=false,owner=false) {
 if(write) requireOrigin(req);
 const token=cookieToken(req);
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401,'admin_login_required','Yönetici girişi gerekli.');
 const db=getDatabase();
 const session=dbCheck(await db.from('line_engine_sessions').select('user_id,expires_at').eq('digest',sessionHash(token)).maybeSingle());
 if(!session||Date.parse(session.expires_at)<=Date.now()) throw new ApiError(401,'session_expired','Yönetici oturumu sona erdi.');
 const admin=dbCheck(await db.from('line_engine_admins').select('role').eq('user_id',session.user_id).single());
 if(!admin||(write&&admin.role==='viewer')||(owner&&admin.role!=='owner')) throw new ApiError(403,'admin_forbidden','Bu işlem için yönetici yetkisi yeterli değil.');
 return {userId:session.user_id,role:admin.role,db};
}
export function sessionCookie(res:VercelResponse,token:string,maxAge:number) {
 res.setHeader('Set-Cookie',COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge);
}
export async function login(req:VercelRequest,res:VercelResponse,email:string,password:string) {
 requireOrigin(req);const db=getDatabase();
 const fingerprint=requestFingerprint(req).ipHash;
 const allowed=dbCheck(await db.rpc('line_engine_login_attempt',{p_fingerprint:fingerprint}));
 if(!allowed) throw new ApiError(429,'login_rate_limited','Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.');
 const signed=await db.auth.signInWithPassword({email,password});
 if(signed.error||!signed.data.user) throw new ApiError(401,'login_failed','Giriş bilgileri doğrulanamadı.');
 // A fresh service client: signInWithPassword replaces the auth client's bearer token.
 const service=getDatabase();
 const admin=dbCheck(await service.from('line_engine_admins').select('role').eq('user_id',signed.data.user.id).maybeSingle());
 if(!admin) throw new ApiError(401,'login_failed','Giriş bilgileri doğrulanamadı.');
 const secret=randomBytes(32).toString('base64url');
 dbCheck(await service.from('line_engine_sessions').delete().lt('expires_at',new Date().toISOString()));
 dbCheck(await service.from('line_engine_sessions').insert({digest:sessionHash(secret),user_id:signed.data.user.id,expires_at:new Date(Date.now()+8*3600000).toISOString()}));
 sessionCookie(res,secret,8*3600);
 return {signedIn:true,role:admin.role};
}
export async function audit(userId:string|null,action:string,target?:string) {
 dbCheck(await getDatabase().from('line_engine_audit').insert({user_id:userId,action,target:target||null}));
}
