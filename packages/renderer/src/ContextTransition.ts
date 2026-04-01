import type { Vec3, CameraState } from '@qualia/core';

/**
 * Animates transitions between context states:
 * - Node positions lerp
 * - Edge cross-fade
 * - Camera animation
 */
export class ContextTransition {
  private _active = false;
  private _progress = 0;
  private _duration = 0.8; // seconds

  private _fromPositions: Record<string, [number, number, number]> = {};
  private _toPositions: Record<string, [number, number, number]> = {};
  private _currentPositions: Record<string, [number, number, number]> = {};

  private _fromEdgeOpacity = 0.6;
  private _toEdgeOpacity = 0.6;
  private _currentEdgeOpacity = 0.6;

  get isActive(): boolean { return this._active; }
  get positions(): Record<string, [number, number, number]> { return this._currentPositions; }
  get edgeOpacity(): number { return this._currentEdgeOpacity; }
  get progress(): number { return this._progress; }

  /**
   * Start a transition from one context state to another.
   */
  start(
    fromPositions: Record<string, [number, number, number]>,
    toPositions: Record<string, [number, number, number]>,
    duration: number = 0.8,
    isSuperposition: boolean = false,
  ): void {
    this._fromPositions = { ...fromPositions };
    this._toPositions = { ...toPositions };
    this._duration = duration;
    this._progress = 0;
    this._active = true;

    // During transition: fade edges out then in
    this._fromEdgeOpacity = 0.6;
    this._toEdgeOpacity = isSuperposition ? 0.15 : 0.6;
  }

  /**
   * Call every frame with delta time.
   */
  update(dt: number): void {
    if (!this._active) return;

    this._progress += dt / this._duration;
    if (this._progress >= 1) {
      this._progress = 1;
      this._active = false;
    }

    // Cubic ease-in-out
    const t = this._progress < 0.5
      ? 4 * this._progress * this._progress * this._progress
      : 1 - Math.pow(-2 * this._progress + 2, 3) / 2;

    // Interpolate positions
    this._currentPositions = {};
    const allIds = new Set([
      ...Object.keys(this._fromPositions),
      ...Object.keys(this._toPositions),
    ]);

    for (const id of allIds) {
      const from = this._fromPositions[id] ?? [0, 0, 0] as Vec3;
      const to = this._toPositions[id] ?? [0, 0, 0] as Vec3;
      this._currentPositions[id] = [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ];
    }

    // Cross-fade edge opacity
    this._currentEdgeOpacity = this._fromEdgeOpacity +
      (this._toEdgeOpacity - this._fromEdgeOpacity) * t;
  }
}
