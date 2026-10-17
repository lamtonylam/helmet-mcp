interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Small in-memory LRU + TTL cache. Keeps values until their TTL elapses, evicting the
 * least-recently-used entry once `maxEntries` is exceeded.
 */
export class TtlCache<V = unknown> {
  private readonly store = new Map<string, CacheEntry<V>>();

  constructor(private readonly maxEntries = 500) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU order.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value as string | undefined;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async wrap<T extends V>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit as T;
    const value = await fn();
    this.set(key, value as V, ttlMs);
    return value;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
