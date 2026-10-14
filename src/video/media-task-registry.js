/* One page-side lifecycle for browser media transcription and download tasks. */
(() => {
  "use strict";

  class MediaTaskRegistry {
    constructor() { this.tasks = new Map(); }
    begin(requestId, purpose) {
      if (!requestId || this.tasks.has(requestId)) throw new Error("媒体任务标识重复");
      const task = { requestId, purpose, controller: new AbortController(), uploadId: null, state: "starting" };
      this.tasks.set(requestId, task);
      return task;
    }
    get(requestId) { return this.tasks.get(requestId) || null; }
    attachUpload(requestId, uploadId) {
      const task = this.get(requestId);
      if (!task) throw new Error("媒体任务已经结束");
      task.uploadId = uploadId;
      task.state = "transferring";
      return task;
    }
    processing(requestId) {
      const task = this.get(requestId);
      if (task) task.state = "processing";
      return task;
    }
    cancel(requestId) {
      const task = this.get(requestId);
      if (!task) return null;
      task.state = "cancelling";
      task.controller.abort();
      return task;
    }
    finish(requestId) {
      const task = this.get(requestId);
      if (task) task.state = task.controller.signal.aborted ? "cancelled" : "finished";
      this.tasks.delete(requestId);
      return task || null;
    }
    cancelAll() {
      for (const task of this.tasks.values()) {
        task.state = "cancelling";
        task.controller.abort();
      }
    }
  }

  globalThis.lexihaloMediaTasks = new MediaTaskRegistry();
})();
