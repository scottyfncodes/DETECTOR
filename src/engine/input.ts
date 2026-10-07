/**
 * Touch input. The movement control is a "stick anywhere" pad: wherever the
 * thumb lands becomes the centre, so the game is genuinely one-handed and
 * never demands that the player look at a fixed control.
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Pointer capture throws for an id the browser does not recognise (which
 * happens with synthetic events, and on some mobile browsers mid-gesture).
 * It is an optimisation, never a requirement — losing it must not break input.
 */
export function capturePointer(el: Element | null | undefined, pointerId: number): void {
  try {
    (el as HTMLElement | null)?.setPointerCapture?.(pointerId);
  } catch {
    /* capture is best-effort */
  }
}

const STICK_RADIUS = 64;
const DEAD_ZONE = 5;

export class MoveController {
  vector: Vec2 = { x: 0, y: 0 };
  active = false;
  origin: Vec2 = { x: 0, y: 0 };
  current: Vec2 = { x: 0, y: 0 };
  /** 0..1 how far the stick is pushed. */
  magnitude = 0;

  private pointerId: number | null = null;
  private keys = new Set<string>();

  attach(el: HTMLElement): () => void {
    const down = (e: PointerEvent) => {
      if (this.pointerId !== null) return;
      const target = e.target as HTMLElement | null;
      // Anything marked as UI keeps its own taps.
      if (target?.closest('[data-ui="true"]')) return;
      this.pointerId = e.pointerId;
      this.active = true;
      const rect = el.getBoundingClientRect();
      this.origin = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.current = { ...this.origin };
      this.vector = { x: 0, y: 0 };
      this.magnitude = 0;
      capturePointer(el, e.pointerId);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      const rect = el.getBoundingClientRect();
      this.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const dx = this.current.x - this.origin.x;
      const dy = this.current.y - this.origin.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= DEAD_ZONE) {
        this.vector = { x: 0, y: 0 };
        this.magnitude = 0;
        return;
      }
      const clamped = Math.min(dist, STICK_RADIUS);
      this.magnitude = clamped / STICK_RADIUS;
      this.vector = { x: (dx / dist) * this.magnitude, y: (dy / dist) * this.magnitude };
      // Let the stick drift if the thumb travels a long way.
      if (dist > STICK_RADIUS * 1.6) {
        this.origin = {
          x: this.current.x - (dx / dist) * STICK_RADIUS * 1.6,
          y: this.current.y - (dy / dist) * STICK_RADIUS * 1.6,
        };
      }
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.active = false;
      this.vector = { x: 0, y: 0 };
      this.magnitude = 0;
    };

    const keyDown = (e: KeyboardEvent) => {
      this.keys.add(e.key.toLowerCase());
      this.applyKeys();
    };
    const keyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
      this.applyKeys();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }

  /** Keyboard fallback so the game is playable (and testable) on a desktop. */
  private applyKeys(): void {
    let x = 0;
    let y = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) x -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) x += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) y -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) y += 1;
    if (x === 0 && y === 0) {
      if (this.pointerId === null) {
        this.vector = { x: 0, y: 0 };
        this.magnitude = 0;
      }
      return;
    }
    const len = Math.hypot(x, y) || 1;
    this.vector = { x: x / len, y: y / len };
    this.magnitude = 1;
    this.active = true;
  }
}

/**
 * Drag-to-look. Attach to a screen region separate from the move stick (e.g.
 * the right half of the world) so both thumbs can act at once. Reports
 * accumulated yaw/pitch deltas since the last `consume()` call rather than an
 * absolute angle, so the render loop stays the single owner of camera state.
 */
export class LookController {
  /** True while a pointer is actively dragging — for touchpad-style visual feedback. */
  active = false;
  private yawDelta = 0;
  private pitchDelta = 0;
  private pointerId: number | null = null;
  private last: Vec2 = { x: 0, y: 0 };
  private keys = new Set<string>();
  sensitivity = 0.0034;
  /** Radians/sec for the desktop-only Q/E turn keys (keyboard has no pitch). */
  keyTurnRate = 1.9;

  attach(el: HTMLElement): () => void {
    const down = (e: PointerEvent) => {
      if (this.pointerId !== null) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-ui="true"]')) return;
      this.pointerId = e.pointerId;
      this.active = true;
      this.last = { x: e.clientX, y: e.clientY };
      capturePointer(el, e.pointerId);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last = { x: e.clientX, y: e.clientY };
      // Yaw is a clockwise compass bearing (see systems/survey.ts): dragging
      // right turns right, which is a larger bearing.
      this.yawDelta += dx * this.sensitivity;
      this.pitchDelta -= dy * this.sensitivity;
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.active = false;
    };

    // Q/E turn left/right — a keyboard fallback so a mouse-less desktop (and
    // the e2e suite) can still reorient, matching MoveController's WASD one.
    const keyDown = (e: KeyboardEvent) => this.keys.add(e.key.toLowerCase());
    const keyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }

  /** Call once per frame with the frame's dt; returns and clears the accumulated look delta. */
  consume(dt = 0): { yaw: number; pitch: number } {
    let yaw = this.yawDelta;
    this.yawDelta = 0;
    const pitch = this.pitchDelta;
    this.pitchDelta = 0;
    if (this.keys.has('q')) yaw -= this.keyTurnRate * dt;
    if (this.keys.has('e')) yaw += this.keyTurnRate * dt;
    return { yaw, pitch };
  }
}

/** Pointer drag in normalised element coordinates — used by the pit. */
export class DragController {
  down = false;
  /** 0..1 within the element. */
  pos: Vec2 = { x: 0.5, y: 0.5 };
  prev: Vec2 = { x: 0.5, y: 0.5 };
  /** Units per second of pointer travel, normalised. */
  speed = 0;
  /** Set to true on the frame the pointer went down. */
  justPressed = false;

  private pointerId: number | null = null;
  private lastMove = 0;

  attach(el: HTMLElement): () => void {
    const toLocal = (e: PointerEvent): Vec2 => {
      const rect = el.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };

    const down = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-ui="true"]')) return;
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.down = true;
      this.justPressed = true;
      this.pos = toLocal(e);
      this.prev = { ...this.pos };
      this.lastMove = performance.now();
      capturePointer(el, e.pointerId);
      e.preventDefault();
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      const next = toLocal(e);
      const now = performance.now();
      const dt = Math.max(0.008, (now - this.lastMove) / 1000);
      this.speed = Math.hypot(next.x - this.pos.x, next.y - this.pos.y) / dt;
      this.lastMove = now;
      this.prev = this.pos;
      this.pos = next;
      e.preventDefault();
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.down = false;
      this.speed = 0;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);

    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
    };
  }

  consumePress(): boolean {
    const was = this.justPressed;
    this.justPressed = false;
    return was;
  }
}

/** Sizes a canvas to its CSS box at device pixel ratio. Returns CSS size. */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): { w: number; h: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  return { w, h, dpr };
}
