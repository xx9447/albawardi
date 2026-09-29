// Timestamp-ordered event queue. Sensor events arrive in ~event order, not
// frame order; the sim drains them strictly by `event.timeStamp` (doc §7).

export interface Timed {
  t: number;
}

export class Timeline<T extends Timed> {
  private items: T[] = [];

  /** Insert keeping ascending t; equal timestamps keep push order. */
  push(item: T): void {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.items[mid].t <= item.t) lo = mid + 1;
      else hi = mid;
    }
    this.items.splice(lo, 0, item);
  }

  /** Remove and return everything with t <= now, in t order. */
  drain(now: number): T[] {
    let i = 0;
    while (i < this.items.length && this.items[i].t <= now) i++;
    return this.items.splice(0, i);
  }

  peek(): T | undefined {
    return this.items[0];
  }

  get length(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}
