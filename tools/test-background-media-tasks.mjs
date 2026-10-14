import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const values={};
const storage={async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,values[key]]));},
  async set(input){Object.assign(values,input);},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}};
const context={globalThis:null};context.globalThis=context;
vm.runInNewContext(fs.readFileSync(new URL('../src/background/media-task-manager.js',import.meta.url),'utf8'),context);
const tasks=context.lexihaloCreateBackgroundMediaTasks(storage),sender={tab:{id:7},frameId:2,documentId:'doc'};
const task=tasks.begin('download','request',{tabId:7});
assert.equal(tasks.hasTab('download',7),true);assert.equal(tasks.get('download','request'),task);tasks.remove('download','request');
assert.equal(tasks.hasTab('download',7),false);
await tasks.bindUpload('a'.repeat(32),sender,{state:'uploading'});
assert.equal(await tasks.readOwner(sender),'a'.repeat(32));assert.equal((await tasks.readUpload('a'.repeat(32))).state,'uploading');
await tasks.removeUpload('a'.repeat(32),sender);assert.equal(await tasks.readOwner(sender),null);
values[tasks.legacyOwnerKey(sender)]='b'.repeat(32);values[tasks.legacyUploadKey('b'.repeat(32))]={state:'legacy'};
assert.equal(await tasks.readOwner(sender),'b'.repeat(32));assert.equal((await tasks.readUpload('b'.repeat(32))).state,'legacy');
await tasks.removeUpload('b'.repeat(32),sender);assert.equal(values[tasks.legacyUploadKey('b'.repeat(32))],undefined);
console.log('Background media task manager tests passed');
