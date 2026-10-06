// Real JSON persistence, archive actions and residue workflow; only platform I/O/UI are simulated.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
await mkdir('tmp/gpt-archive-tests', { recursive: true });
const mocks = {
    '@/libs/download': 'export const downloadBlob=()=>{};',
    '@/libs/vfs/vfs-siyuan-adapter': `export const siyuanVfs={SIYUAN_DIR:{THIS_STORAGE:'data/storage/petal/mock'},join:(...p)=>p.join('/'),writeFile:async(path,blob)=>{const io=globalThis.archiveIO;io.bodyWrites++;if(io.failWrite)return {ok:false,error:'Save Error'};io.files.set(path,JSON.parse(await blob.text()));return {ok:true,error:null};}};`,
    '@frostime/siyuan-plugin-kits': `
        export const thisPlugin=()=>({name:'mock',saveData:async(name,data)=>{const io=globalThis.archiveIO;io.indexWrites++;if(io.failIndex)throw new Error('index failure');io.files.set('data/storage/petal/mock/'+name,structuredClone(data));}});
        export const api={getFileBlob:async(path)=>{const io=globalThis.archiveIO;const data=io.files.get(path);return data&&!io.blockedReads.has(path)?new Blob([JSON.stringify(data)]):null;}};
        export const matchIDFormat=()=>true, formatDateTime=()=>'';
        export const confirmDialog=args=>{const io=globalThis.archiveIO;io.dialogs.push(args);queueMicrotask(()=>{io.beforeConsent?.();if(io.consent==='confirm')args.confirm?.();else if(io.consent==='close')args.destroyCallback?.();else args.cancel?.();});return {dialog:{element:{querySelector:()=>({textContent:''})}}};};
    `,
    '@frostime/siyuan-plugin-kits/api': `export const request=async(url,body)=>{const io=globalThis.archiveIO;if(io.failDirectory)return {code:-1};const prefix=body.path;return {code:0,data:[...io.files.keys()].filter(path=>path.startsWith(prefix)).map(path=>({name:path.slice(prefix.length),isDir:false}))};};`,
    '@gpt/chat-utils': `export const extractMessageContent=content=>({text:typeof content==='string'?content:''}),getMessageProp=(node,key)=>node.versions[node.currentVersionId]?.message?.[key],getPayload=(node,key)=>node.versions[node.currentVersionId]?.[key];`,
    '@gpt/model/msg_migration': `export const needsMigration=()=>false,migrateHistory=x=>x,isV1History=()=>false,isV2History=()=>true;`,
    'siyuan': 'export const showMessage=(...args)=>globalThis.archiveIO.messages.push(args);',
};
await build({entryPoints:['tests/gpt-archive.test.ts'],outfile:'tmp/gpt-archive-tests/gpt-archive.test.mjs',bundle:true,platform:'node',format:'esm',logLevel:'warning',plugins:[{name:'platform-boundaries',setup(b){b.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'platform'}:null);b.onLoad({filter:/.*/,namespace:'platform'},args=>({contents:mocks[args.path],loader:'js'}));}}]});
const result=spawnSync(process.execPath,['--test',resolve('tmp/gpt-archive-tests/gpt-archive.test.mjs')],{stdio:'inherit'});
process.exit(result.status ?? 1);
