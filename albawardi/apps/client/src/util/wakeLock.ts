// Wake Lock — keep the screen on during duels (doc §7). Re-acquired when the
// page becomes visible again after being hidden.

export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private listening = false;

  async acquire(): Promise<void> {
    this.wanted = true;
    await this.reacquire();
    if (!this.listening) {
      document.addEventListener('visibilitychange', this.onVisible);
      this.listening = true;
    }
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible' && this.wanted) void this.reacquire();
  };

  private async reacquire(): Promise<void> {
    try {
      const wl = (navigator as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }).wakeLock;
      if (!wl) return;
      this.sentinel = await wl.request('screen');
      this.sentinel.addEventListener?.('release', () => {
        this.sentinel = null;
      });
    } catch {
      // older browsers / denied — play on without it
    }
  }

  release(): void {
    this.wanted = false;
    if (this.listening) {
      document.removeEventListener('visibilitychange', this.onVisible);
      this.listening = false;
    }
    this.sentinel?.release();
    this.sentinel = null;
  }
}

interface WakeLockSentinel {
  release(): Promise<void>;
  addEventListener?(type: string, fn: () => void): void;
}
