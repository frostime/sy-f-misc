export default class PromiseLimitPool<T> {
    private maxConcurrent: number;
    private currentRunning = 0;
    private queue: (() => void)[] = [];
    private promises: Promise<T>[] = [];

    constructor(maxConcurrent: number) {
        this.maxConcurrent = maxConcurrent;
    }

    add(fn: () => Promise<T>): void {
        const promise = new Promise<T>((resolve, reject) => {
            const run = async () => {
                try {
                    this.currentRunning++;
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    this.currentRunning--;
                    this.next();
                }
            };

            if (this.currentRunning < this.maxConcurrent) {
                run();
            } else {
                this.queue.push(run);
            }
        });
        this.promises.push(promise);
    }

    async awaitAll(): Promise<T[]> {
        return Promise.all(this.promises);
    }

    /**
     * Handles the next task in the queue.
     */
    private next(): void {
        if (this.queue.length > 0 && this.currentRunning < this.maxConcurrent) {
            const nextRun = this.queue.shift()!;
            nextRun();
        }
    }
}
/*
const pool = new PromiseLimitPool<string>(2); // Allow 2 concurrent promises

const asyncTask = (time: number, value: string): Promise<string> => {
    return new Promise<string>((resolve) => setTimeout(() => resolve(value), time));
};

pool.add(() => asyncTask(1000, 'Task 1'));
pool.add(() => asyncTask(2000, 'Task 2'));
pool.add(() => asyncTask(500, 'Task 3'));
pool.add(() => asyncTask(300, 'Task 4'));

pool.awaitAll().then(results => {
    console.log('All tasks completed:', results);
}).catch(error => {
    console.error('Error completing tasks:', error);
});
*/
