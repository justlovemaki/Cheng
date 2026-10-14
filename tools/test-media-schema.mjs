import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={URL,globalThis:null};context.globalThis=context;
context.lexihaloSites={};
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-contract.js',import.meta.url),'utf8'),context);
vm.runInNewContext(fs.readFileSync(new URL('../src/shared/media-message-schema.js',import.meta.url),'utf8'),context);
const schema=context.lexihaloMediaSchema;
const request=schema.request({type:'lexihalo:subtitle-ai:video-download',requestId:'request',
  mediaPageUrl:'https://example.com/watch',browserSource:{captureId:'opaque',ext:'m3u8',isAudio:false}});
assert.equal(request.mediaSource.transport,'capture');
assert.equal(request.mediaSource.kind,'video');
assert.equal(request.browserSource,request.mediaSource);
assert.throws(()=>schema.request({type:'other',requestId:'x'}),/媒体消息无效/);
assert.throws(()=>schema.request({type:'lexihalo:subtitle-ai:video-download',requestId:'x',
  browserSource:{transport:'direct'}}),/媒体消息无效/);
assert.throws(()=>schema.segments([{start:2,end:1,text:'bad'}]),/媒体消息无效/);
assert.equal(schema.segments([{start:0,end:1,text:'ok'}])[0].text,'ok');
console.log('Media message schema tests passed');
