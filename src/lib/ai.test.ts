import {afterEach,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:native.invoke,Channel:class {onmessage:unknown;}}));
import {readEngineStatus} from './ai';
afterEach(()=>{vi.unstubAllGlobals();vi.resetAllMocks();});
it('shows the safe native error explanation instead of losing a string rejection',async()=>{
 vi.stubGlobal('__TAURI_INTERNALS__',{});
 native.invoke.mockRejectedValue('Line AI yanıtı başarısız oldu: Proje kotası doldu.');
 await expect(readEngineStatus()).rejects.toThrow('Proje kotası doldu.');
});
