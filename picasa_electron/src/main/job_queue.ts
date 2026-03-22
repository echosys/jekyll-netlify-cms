// @ts-nocheck
import { Worker } from 'worker_threads';

export class JobQueue {
  private queue: Array<{ id: number; fn: (progress: any, isCancelled: any) => Promise<any> }> = [];
  private concurrency = 4;
  private runningCount = 0;
  private idCounter = 1;
  private cancelMap: Record<number, boolean> = {};

  enqueue(fn: (progress: (p: any)=>void, isCancelled: ()=>boolean) => Promise<any>) {
    const id = this.idCounter++;
    this.cancelMap[id] = false;
    this.queue.push({ id, fn });
    this.runNext();
    return id;
  }

  cancel(jobId: number) {
    this.cancelMap[jobId] = true;
  }

  enqueueWorker(workerPath: string, workerData: any, onMessage: (m: any) => void) {
    const id = this.idCounter++;
    this.queue.push({ 
       id, 
       fn: async (progress, isCancelled) => {
          return new Promise((resolve, reject) => {
            if (isCancelled()) return resolve(null);
            const worker = new Worker(workerPath, { workerData });
            worker.on('message', onMessage);
            worker.on('error', (err) => { console.error('Worker error', err); reject(err); });
            worker.on('exit', (code) => {
              if (code !== 0) console.error('Worker stopped with exit code', code);
              resolve(code);
            });
          });
       }
    });
    this.runNext();
    return id;
  }

  private async runNext() {
    if (this.runningCount >= this.concurrency) return;
    const item = this.queue.shift();
    if (!item) return;
    this.runningCount++;
    try {
      await item.fn((p: any) => {
        // no-op: in real app we'd forward progress via IPC
      }, () => !!this.cancelMap[item.id]);
    } catch (err) {
      console.error('Job failed', err);
    }
    this.runningCount--;
    setImmediate(() => this.runNext());
  }
}
