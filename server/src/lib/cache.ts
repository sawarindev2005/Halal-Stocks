interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Small in-memory cache with a per-instance TTL.
 * `getOrSet` also de-duplicates concurrent loads of the same key, so a burst of
 * requests for one symbol triggers only one upstream call.
 */
export class TTLCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.pending.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** Returns the cached value or loads, caches and returns it. Failed loads are not cached. */
  async getOrSet(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const promise = load()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }
}
