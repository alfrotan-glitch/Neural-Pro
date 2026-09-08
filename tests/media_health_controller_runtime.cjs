const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '..', '..')] }));
const root = path.resolve(__dirname, '..');
global.window = { setTimeout, clearTimeout };
global.MediaError = { MEDIA_ERR_ABORTED: 1, MEDIA_ERR_NETWORK: 2, MEDIA_ERR_DECODE: 3, MEDIA_ERR_SRC_NOT_SUPPORTED: 4 };
const controllerSource = fs.readFileSync(path.join(root, 'src/features/video-studio/playback/services/mediaHealthController.ts'), 'utf8');
const controllerModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(controllerSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, fileName: 'mediaHealthController.ts' }).outputText, { module: controllerModule, exports: controllerModule.exports, window: global.window, MediaError: global.MediaError, console });
const { createMediaHealthController } = controllerModule.exports;
class FakeMedia {
  constructor(){this.listeners={};this.readyState=4;this.error=null;this.loadCount=0;}
  addEventListener(t,fn){(this.listeners[t]??=[]).push(fn)}
  removeEventListener(t,fn){this.listeners[t]=(this.listeners[t]??[]).filter(x=>x!==fn)}
  emit(t){for(const fn of (this.listeners[t]??[])) fn()}
  load(){this.loadCount++;}
}
(async()=>{
 const media=new FakeMedia(); const states=[];
 const c=createMediaHealthController(media,{onChange:s=>states.push(s)}); c.attach();
 media.emit('loadstart'); assert.equal(states.at(-1).status,'loading');
 media.error={code:4}; media.emit('error'); assert.equal(states.at(-1).status,'error');
 c.retry(); assert.equal(media.loadCount,1); assert.equal(states.at(-1).status,'loading');
 media.emit('canplay'); assert.equal(states.at(-1).status,'ready');
 c.detach(); media.emit('error'); assert.equal(states.at(-1).status,'ready');
 console.log('MEDIA_HEALTH_RUNTIME_BEHAVIOR=PASS');
})().catch(e=>{console.error(e);process.exit(1)});
