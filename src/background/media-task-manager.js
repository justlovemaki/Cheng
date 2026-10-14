/* Authoritative Background task/owner registry for media transfer, transcription, and download. */
(() => {
  "use strict";
  class BackgroundMediaTaskManager {
    constructor(storage) {
      this.storage = storage;
      this.groups = new Map([['transcription', new Map()], ['download', new Map()], ['transfer', new Map()]]);
    }
    group(name) { const group = this.groups.get(name); if (!group) throw new Error(`未知媒体任务组：${name}`); return group; }
    begin(name, requestId, task) {
      const group = this.group(name);
      if (!requestId || group.has(requestId)) throw new Error("媒体任务已经存在");
      const value = Object.assign(task || {}, { requestId, kind: name, state: task?.state || 'starting' });
      group.set(requestId, value); return value;
    }
    get(name, requestId) { return this.group(name).get(requestId) || null; }
    remove(name, requestId) { const task = this.get(name, requestId); this.group(name).delete(requestId); return task; }
    hasTab(name, tabId) { return [...this.group(name).values()].some(task => task.tabId === tabId); }
    startTransfer(uploadId, task) { return this.begin('transfer', uploadId, { ...task, state: 'transferring' }); }
    finishTransfer(uploadId) { return this.remove('transfer', uploadId); }
    ownerKey(sender) { return `lexihalo_media_owner:${sender?.tab?.id}:${sender?.frameId ?? 0}`; }
    uploadKey(id) { return `lexihalo_media_upload:${id}`; }
    legacyOwnerKey(sender) { return `lexihalo_browser_audio_owner:${sender?.tab?.id}:${sender?.frameId ?? 0}`; }
    legacyUploadKey(id) { return `lexihalo_browser_audio_upload:${id}`; }
    owner(sender, identity) {
      return { tabId: sender?.tab?.id, frameId: sender?.frameId ?? 0,
        documentId: String(sender?.documentId || ''), identity };
    }
    async readOwner(sender) {
      const keys = [this.ownerKey(sender), this.legacyOwnerKey(sender)], stored = await this.storage.get(keys);
      return stored[keys[0]] || stored[keys[1]] || null;
    }
    async readUpload(id) {
      const keys = [this.uploadKey(id), this.legacyUploadKey(id)], stored = await this.storage.get(keys);
      return stored[keys[0]] || stored[keys[1]] || null;
    }
    async writeUpload(id, task) { await this.storage.set({ [this.uploadKey(id)]: task }); }
    async bindUpload(id, sender, task) {
      await this.storage.set({ [this.ownerKey(sender)]: id, [this.uploadKey(id)]: task });
    }
    async removeUpload(id, sender) {
      await this.storage.remove([this.uploadKey(id), this.legacyUploadKey(id)]);
      const ownerKeys = [this.ownerKey(sender), this.legacyOwnerKey(sender)], stored = await this.storage.get(ownerKeys);
      await this.storage.remove(ownerKeys.filter(key => stored[key] === id));
    }
  }
  globalThis.lexihaloCreateBackgroundMediaTasks = storage => new BackgroundMediaTaskManager(storage);
})();
