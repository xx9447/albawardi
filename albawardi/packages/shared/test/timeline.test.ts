import { describe, expect, it } from 'vitest';
import { Timeline } from '../src/timeline.js';

describe('Timeline', () => {
  it('drains strictly in timestamp order even when pushed out of order', () => {
    const q = new Timeline<{ t: number; id: string }>();
    q.push({ t: 300, id: 'c' });
    q.push({ t: 100, id: 'a' });
    q.push({ t: 200, id: 'b' });
    const out = q.drain(1000);
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps future events queued', () => {
    const q = new Timeline<{ t: number }>();
    q.push({ t: 100 });
    q.push({ t: 500 });
    const out = q.drain(200);
    expect(out).toEqual([{ t: 100 }]);
    expect(q.length).toBe(1);
    expect(q.drain(1000)).toEqual([{ t: 500 }]);
  });

  it('equal timestamps keep push order', () => {
    const q = new Timeline<{ t: number; n: number }>();
    q.push({ t: 5, n: 1 });
    q.push({ t: 5, n: 2 });
    q.push({ t: 5, n: 3 });
    expect(q.drain(5).map((e) => e.n)).toEqual([1, 2, 3]);
  });

  it('clear empties the queue', () => {
    const q = new Timeline<{ t: number }>();
    q.push({ t: 1 });
    q.clear();
    expect(q.length).toBe(0);
  });
});
