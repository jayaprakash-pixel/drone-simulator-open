// Smooths the drone between DroneStates (25 a second) for drawing at the frame rate (P2A.4.1). Each frame moves the drawn
// pose toward the latest state by 1 - e^(-dt/TAU): no overshoot, and 99 percent of any jump is closed after 5 TAU (200 ms).
// Angles take the short way round (359 to 1 goes through 0, not through 180).

export const TAU_MS = 40;

export type Pose = { lat: number; lon: number; alt: number; heading: number; pitch: number; roll: number };

/** Signed shortest difference b - a in degrees, in -180..180. */
export const angleDiff = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;

export class Smoother {
  private cur: Pose | null = null;
  private target: Pose | null = null;

  set(p: Pose): void {
    this.target = { ...p };
    this.cur ??= { ...p }; // the first state is drawn where it is
  }

  /** Advances by dt milliseconds and returns the pose to draw (null before the first state). */
  step(dtMs: number): Pose | null {
    const c = this.cur;
    const t = this.target;
    if (!c || !t) return null;
    const k = 1 - Math.exp(-Math.max(0, dtMs) / TAU_MS);
    c.lat += (t.lat - c.lat) * k;
    c.lon += (t.lon - c.lon) * k;
    c.alt += (t.alt - c.alt) * k;
    c.heading = (c.heading + angleDiff(c.heading, t.heading) * k + 360) % 360;
    c.pitch += angleDiff(c.pitch, t.pitch) * k;
    c.roll += angleDiff(c.roll, t.roll) * k;
    return { ...c };
  }

  /** True while the drawn pose is still moving toward the target (render on demand needs frames until then). */
  moving(): boolean {
    const c = this.cur;
    const t = this.target;
    if (!c || !t) return false;
    return Math.abs(t.lat - c.lat) > 1e-8 || Math.abs(t.lon - c.lon) > 1e-8 || Math.abs(t.alt - c.alt) > 0.005 || Math.abs(angleDiff(c.heading, t.heading)) > 0.05 || Math.abs(t.pitch - c.pitch) > 0.05 || Math.abs(t.roll - c.roll) > 0.05;
  }
}
