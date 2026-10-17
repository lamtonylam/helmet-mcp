/**
 * Politeness limiter: enforces a maximum number of concurrent executions and a minimum
 * interval between the start of consecutive executions. Used to keep requests to the
 * shared Finna API gentle.
 */
export class RateLimiter {
  private active = 0;
  private lastStart = 0;
  private readonly queue: Array<() => void> = [];
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly concurrency = 2,
    private readonly minIntervalMs = 200,
  ) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.active -= 1;
            this.pump();
          });
      });
      this.pump();
    });
  }

  private pump(): void {
    if (this.timer || this.queue.length === 0) return;
    if (this.active >= this.concurrency) return;

    const wait = Math.max(0, this.lastStart + this.minIntervalMs - Date.now());
    if (wait > 0) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, wait);
      return;
    }

    const next = this.queue.shift();
    if (!next) return;
    this.active += 1;
    this.lastStart = Date.now();
    next();
    // Try to start another slot immediately (subject to concurrency/interval).
    this.pump();
  }
}
