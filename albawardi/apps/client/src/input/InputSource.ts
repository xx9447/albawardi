// Unified input (task Phase 1): one interface, three implementations
// (motion, touch, mouse). The rest of the game never knows the source.

export type InputMode = 'motion' | 'touch' | 'mouse';

export interface InputSourceCallbacks {
  /** Filtered pose for the state machine (tilt deg + pitch rate deg/s). */
  pose(t: number, tiltDeg: number, rateDeg: number): void;
  /** Live normalized reticle position (x,y ∈ [-1,1]) for rendering. */
  aim(t: number, x: number, y: number): void;
  /** Fire request — the manager supplies the current aim. */
  fire(t: number): void;
  reloadOpen(t: number): void;
  reloadRound(t: number): void;
  reloadClose(t: number): void;
}

export interface InputSource {
  readonly mode: InputMode;
  attach(cb: InputSourceCallbacks, el: HTMLElement): void;
  detach(): void;
  /** Reset per-round state (integrators, gesture trackers). */
  resetRound(): void;
}

/** iOS 13+ motion permission — must be called inside a live tap handler. */
export function motionPermissionSupported(): boolean {
  return (
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function'
  );
}

export async function requestMotionPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!motionPermissionSupported()) {
    // Android/older iOS: no prompt, sensors (if any) just fire.
    return typeof DeviceMotionEvent !== 'undefined' ? 'granted' : 'unsupported';
  }
  const dm = (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> })
    .requestPermission;
  const orient = (
    DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
  ).requestPermission;
  const results = await Promise.all([
    dm.call(DeviceMotionEvent),
    orient ? orient.call(DeviceOrientationEvent) : Promise.resolve('granted'),
  ]);
  return results.every((r) => r === 'granted') ? 'granted' : 'denied';
}
