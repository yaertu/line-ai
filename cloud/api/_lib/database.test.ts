import {afterEach,expect,it,vi} from 'vitest';
import {databaseFetch} from './database.js';
afterEach(()=>vi.unstubAllGlobals());
it('retries one transient gateway failure on a read',async()=>{
 const upstream=vi.fn().mockResolvedValueOnce(new Response('',{status:504})).mockResolvedValueOnce(new Response('{}'));
 vi.stubGlobal('fetch',upstream);
 expect((await databaseFetch('https://database.example/rest/v1/records')).status).toBe(200);
 expect(upstream).toHaveBeenCalledTimes(2);
});
it('never retries an uncertain write',async()=>{
 const upstream=vi.fn().mockRejectedValue(new Error('network'));
 vi.stubGlobal('fetch',upstream);
 await expect(databaseFetch('https://database.example/rest/v1/records',{method:'POST',body:'{}'})).rejects.toThrow('network');
 expect(upstream).toHaveBeenCalledTimes(1);
});
