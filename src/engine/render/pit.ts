/**
 * The excavation pit.
 *
 * Dirt is drawn by masking a real soil texture with the excavation grid, so
 * removing dirt removes *texture*, not a progress bar. Debris is a second
 * masked layer of stone. The object underneath is the same renderer the
 * journal uses.
 */
import type { ExcavationState } from '@/systems/excavation';
import { drawFind } from './object';
import type { GroundPalette } from '@/core/types';
import { groundTile, hexA, makeCanvas, soilTile, stoneTile } from './textures';

export interface PitParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: 'dirt' | 'dust' | 'spark';
}

export interface PitView {
  state: ExcavationState;
  /** Tool position in normalised pit space, or null when not touching. */
  toolX: number | null;
  toolY: number | null;
  toolRadius: number;
  toolKind: 'scoop' | 'brush' | 'pick' | 'pinpointer';
  particles: PitParticle[];
  time: number;
  /** 0..1 red flash after a strike. */
  damageFlash: number;
  /** Pinpointer heat reading 0..1, or null when not owned/off. */
  heat: number | null;
  shake: number;
  /** The ground this hole is cut into — drawn around the pit so it is a hole in *this* field. */
  ground: GroundPalette;
  /** Direction the finger is travelling, normalised pit units/sec, for tool orientation. */
  toolVX: number;
  toolVY: number;
  /** 0 = in the ground, 1 = lifted clear. Drives the extraction moment. */
  lift: number;
}

export class PitRenderer {
  private soil = makeCanvas(1, 1);
  private stone = makeCanvas(1, 1);
  private soilReady = false;
  private mask: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private layer: HTMLCanvasElement | null = null;
  private layerSize = 0;
  private turf: HTMLCanvasElement | null = null;
  private turfKey = '';
  private rimPath: Path2D | null = null;
  private rimKey = '';

  private ensure(state: ExcavationState, size: number): void {
    if (!this.soilReady) {
      this.soil = soilTile(256, 21, '#4a3527');
      this.stone = stoneTile(192, 55);
      this.soilReady = true;
    }
    if (!this.mask || this.mask.width !== state.cols) {
      this.mask = makeCanvas(state.cols, state.rows);
      this.maskCtx = this.mask.getContext('2d');
    }
    const target = Math.max(64, Math.round(size));
    if (!this.layer || this.layerSize !== target) {
      this.layer = makeCanvas(target, target);
      this.layerSize = target;
    }
  }

  /** The organic outline of the hole, deterministic per pit, in unit space (-1..1). */
  private ensureRim(seedKey: string): Path2D {
    if (this.rimPath && this.rimKey === seedKey) return this.rimPath;
    let h = 2166136261;
    for (let i = 0; i < seedKey.length; i++) h = Math.imul(h ^ seedKey.charCodeAt(i), 16777619);
    const rand = () => {
      h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff;
      return h / 0x7fffffff;
    };
    const pts: [number, number][] = [];
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.93 + (rand() - 0.5) * 0.12;
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.96]);
    }
    const path = new Path2D();
    for (let i = 0; i < n; i++) {
      const p0 = pts[i]!;
      const p1 = pts[(i + 1) % n]!;
      const mx = (p0[0] + p1[0]) / 2;
      const my = (p0[1] + p1[1]) / 2;
      if (i === 0) path.moveTo(mx, my);
      const p2 = pts[(i + 2) % n]!;
      path.quadraticCurveTo(p1[0], p1[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
    }
    path.closePath();
    this.rimPath = path;
    this.rimKey = seedKey;
    return path;
  }

  private ensureTurf(palette: GroundPalette): HTMLCanvasElement {
    const key = `${palette.base}|${palette.scatter}`;
    if (this.turf && this.turfKey === key) return this.turf;
    const lift = (hex: string, amt: number) => {
      const n = parseInt(hex.replace('#', ''), 16);
      const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * amt));
      return `#${(((1 << 24) + (mix((n >> 16) & 255) << 16) + (mix((n >> 8) & 255) << 8) + mix(n & 255)) >>> 0).toString(16).slice(1)}`;
    };
    this.turf = groundTile(
      { ...palette, base: lift(palette.base, 0.14), mid: lift(palette.mid, 0.12), light: lift(palette.light, 0.1) },
      256,
      31,
    );
    this.turfKey = key;
    return this.turf;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, view: PitView): void {
    const state = view.state;
    const size = Math.min(w - 24, h - 24);
    this.ensure(state, size * 2);
    const rim = this.ensureRim(state.silhouetteId + state.cols + Math.round(state.centerX * 100));
    const turf = this.ensureTurf(view.ground);

    const px = (w - size) / 2 + (view.shake ? (Math.random() - 0.5) * view.shake : 0);
    const py = (h - size) / 2 + (view.shake ? (Math.random() - 0.5) * view.shake : 0);
    const cxp = px + size / 2;
    const cyp = py + size / 2;

    ctx.clearRect(0, 0, w, h);

    // ── the ground around the hole: this field's own turf, lit from above ──
    const turfPattern = ctx.createPattern(turf, 'repeat');
    ctx.fillStyle = turfPattern ?? view.ground.base;
    ctx.fillRect(0, 0, w, h);
    const turfLight = ctx.createRadialGradient(cxp, cyp - size * 0.3, size * 0.2, cxp, cyp, size * 1.1);
    turfLight.addColorStop(0, 'rgba(255,245,220,0.12)');
    turfLight.addColorStop(0.5, 'rgba(0,0,0,0.0)');
    turfLight.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = turfLight;
    ctx.fillRect(0, 0, w, h);

    // ── spoil heap: the dirt that came out, piled around the rim ─────────
    const spoil = Math.min(1, state.totalRemoved / Math.max(1, state.dirt.length * 0.35));
    if (spoil > 0.02) {
      ctx.save();
      ctx.translate(cxp, cyp);
      ctx.scale(size / 2, size / 2);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hexA('#4a3527', 0.5 + spoil * 0.4);
      ctx.lineWidth = 0.1 + spoil * 0.22;
      ctx.stroke(rim);
      ctx.strokeStyle = hexA('#7a5a41', 0.25 * spoil);
      ctx.lineWidth = 0.05 + spoil * 0.1;
      ctx.stroke(rim);
      ctx.restore();
    }

    // ── broken-turf edge and the dark drop into the hole ─────────────────
    ctx.save();
    ctx.translate(cxp, cyp);
    ctx.scale(size / 2, size / 2);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.08;
    ctx.stroke(rim);
    ctx.restore();

    // ── pit floor ────────────────────────────────────────────────────────
    ctx.save();
    const clip = new Path2D();
    const m = new DOMMatrix().translate(cxp, cyp).scale(size / 2, size / 2);
    clip.addPath(rim, m);
    ctx.clip(clip);

    // Bare floor beneath everything: darker, damper soil.
    ctx.fillStyle = '#241a12';
    ctx.fillRect(px, py, size, size);
    const floorPattern = ctx.createPattern(this.soil, 'repeat');
    if (floorPattern) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = floorPattern;
      ctx.fillRect(px, py, size, size);
      ctx.globalAlpha = 1;
    }
    // Damp shading towards the middle so the hole has depth, and a hard
    // shadow under the near rim so the wall reads as a wall.
    const depthShade = ctx.createRadialGradient(cxp, cyp, size * 0.05, cxp, cyp, size * 0.62);
    depthShade.addColorStop(0, 'rgba(0,0,0,0.45)');
    depthShade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = depthShade;
    ctx.fillRect(px, py, size, size);
    const wallShade = ctx.createLinearGradient(0, py, 0, py + size * 0.35);
    wallShade.addColorStop(0, 'rgba(0,0,0,0.6)');
    wallShade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wallShade;
    ctx.fillRect(px, py, size, size);

    // ── the object ───────────────────────────────────────────────────────
    if (state.hasObject && view.lift < 0.999) {
      const cx = px + state.centerX * size;
      const cy = py + state.centerY * size;
      const radius = state.scale * size;
      // Still-buried objects are muddier; exposure cleans them up.
      const soiling = Math.max(0, 0.55 - state.exposed * 0.55) * (1 - view.lift);
      drawFind(ctx, state.silhouetteId, cx, cy, radius, {
        soiling,
        condition: state.condition,
        time: view.time,
      });

      // An edge catching the light is the game's "you're close" tell.
      if (state.exposed > 0.08 && state.exposed < 0.95) {
        const pulse = 0.35 + 0.65 * Math.abs(Math.sin(view.time * 2.2));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.5);
        g.addColorStop(0, hexA('#ffe3a8', 0.1 * pulse * state.exposed));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px, py, size, size);
        ctx.restore();
      }
    }

    // ── dirt layer ───────────────────────────────────────────────────────
    this.drawMaskedLayer(ctx, state.dirt, 1.3, this.soil, px, py, size, 0.98);
    // ── debris layer ─────────────────────────────────────────────────────
    this.drawMaskedLayer(ctx, state.debris, 1, this.stone, px, py, size, 0.95);

    // ── particles ────────────────────────────────────────────────────────
    for (const p of view.particles) {
      const t = 1 - p.life / p.maxLife;
      const x = px + p.x * size;
      const y = py + p.y * size;
      ctx.globalAlpha = Math.max(0, 1 - t) * (p.kind === 'dust' ? 0.4 : 0.85);
      ctx.fillStyle =
        p.kind === 'spark' ? '#ffe9b0' : p.kind === 'dust' ? '#a08a70' : '#4b3524';
      ctx.beginPath();
      ctx.arc(x, y, p.size * size * 0.01 * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── tool cursor: the tool itself, not a circle ───────────────────────
    if (view.toolX !== null && view.toolY !== null) {
      const tx = px + view.toolX * size;
      const ty = py + view.toolY * size;
      const r = (view.toolRadius / 320) * size;
      const speed = Math.hypot(view.toolVX, view.toolVY);
      const ang = speed > 0.05 ? Math.atan2(view.toolVY, view.toolVX) : -Math.PI / 2;
      ctx.save();
      ctx.translate(tx, ty);
      // Soft contact shadow where the tool meets the dirt.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.15, r * 1.05, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(ang + Math.PI / 2);
      if (view.toolKind === 'brush') {
        // Ferrule + a fan of bristles pointing along the stroke.
        ctx.fillStyle = '#2b2622';
        ctx.fillRect(-r * 0.22, -r * 0.1, r * 0.44, r * 1.1);
        ctx.fillStyle = '#9a8b74';
        ctx.fillRect(-r * 0.2, r * 0.95, r * 0.4, r * 0.25);
        ctx.strokeStyle = 'rgba(214,200,170,0.85)';
        ctx.lineWidth = Math.max(1, r * 0.06);
        for (let i = -5; i <= 5; i++) {
          ctx.beginPath();
          ctx.moveTo(i * r * 0.07, -r * 0.1);
          ctx.quadraticCurveTo(i * r * 0.16, -r * 0.6, i * r * 0.22, -r * 1.05);
          ctx.stroke();
        }
      } else if (view.toolKind === 'pick') {
        ctx.fillStyle = '#4a3a2c';
        ctx.fillRect(-r * 0.12, -r * 0.2, r * 0.24, r * 1.5);
        ctx.fillStyle = '#9ea4a8';
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.2);
        ctx.lineTo(r * 0.7, -r * 0.2);
        ctx.lineTo(r * 0.2, r * 0.05);
        ctx.lineTo(-r * 0.2, r * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.2);
        ctx.lineTo(-r * 0.95, -r * 0.9);
        ctx.lineTo(-r * 0.4, -r * 0.3);
        ctx.closePath();
        ctx.fill();
      } else {
        // Scoop: a cupped blade with a short handle trailing the stroke.
        ctx.fillStyle = '#3d3f43';
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.95, r * 0.75, 0, Math.PI, Math.PI * 2);
        ctx.lineTo(r * 0.95, r * 0.2);
        ctx.quadraticCurveTo(0, r * 0.95, -r * 0.95, r * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.1, r * 0.5, r * 0.28, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a4330';
        ctx.fillRect(-r * 0.14, r * 0.5, r * 0.28, r * 1.3);
      }
      ctx.restore();
    }

    // ── pinpointer heat ──────────────────────────────────────────────────
    if (view.heat !== null && view.toolX !== null && view.toolY !== null && view.heat > 0.02) {
      const tx = px + view.toolX * size;
      const ty = py + view.toolY * size;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 46);
      g.addColorStop(0, hexA('#ff9d4d', 0.28 * view.heat));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tx, ty, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // ── the object lifting clear of the hole ─────────────────────────────
    if (state.hasObject && view.lift > 0) {
      const t = view.lift;
      const ease = 1 - Math.pow(1 - t, 3);
      const cx = px + state.centerX * size + (cxp - (px + state.centerX * size)) * ease;
      const cy = py + state.centerY * size - ease * size * 0.22;
      const radius = state.scale * size * (1 + ease * 0.55);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bloom = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 3.2);
      bloom.addColorStop(0, hexA('#ffe3a8', 0.45 * ease));
      bloom.addColorStop(0.4, hexA('#ffd27a', 0.16 * ease));
      bloom.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      drawFind(ctx, state.silhouetteId, cx, cy, radius, {
        soiling: 0,
        condition: state.condition,
        time: view.time,
        rotation: Math.sin(view.time * 1.6) * 0.08 * ease,
      });
      // Falling crumbs shaken loose on the way up.
      ctx.fillStyle = hexA('#4b3524', 0.8 * (1 - ease));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + view.time;
        const d = radius * (0.9 + ease * 1.4) + Math.sin(view.time * 3 + i) * 4;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5 + ease * size * 0.3, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── damage flash ─────────────────────────────────────────────────────
    if (view.damageFlash > 0.01) {
      ctx.fillStyle = hexA('#c0392b', view.damageFlash * 0.3);
      ctx.fillRect(0, 0, w, h);
    }

    // Vignette to keep attention in the hole.
    const vig = ctx.createRadialGradient(w / 2, h / 2, size * 0.42, w / 2, h / 2, size * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * Paints `texture` through a mask built from a cell grid. The grid is drawn
   * at cell resolution and scaled up with smoothing, which gives soft organic
   * edges for free.
   */
  private drawMaskedLayer(
    ctx: CanvasRenderingContext2D,
    grid: Float32Array,
    fullValue: number,
    texture: HTMLCanvasElement,
    px: number,
    py: number,
    size: number,
    maxAlpha: number,
  ): void {
    if (!this.mask || !this.maskCtx || !this.layer) return;
    const cols = this.mask.width;
    const rows = this.mask.height;
    const img = this.maskCtx.createImageData(cols, rows);
    let any = false;
    for (let i = 0; i < grid.length; i++) {
      const v = Math.min(1, Math.max(0, grid[i]! / fullValue));
      const alpha = v <= 0.001 ? 0 : Math.min(255, Math.round(Math.pow(v, 0.7) * 255 * maxAlpha));
      if (alpha > 0) any = true;
      const o = i * 4;
      // Thicker dirt is lighter here; used as a shading hint below.
      const shade = Math.round(120 + v * 135);
      img.data[o] = shade;
      img.data[o + 1] = shade;
      img.data[o + 2] = shade;
      img.data[o + 3] = alpha;
    }
    if (!any) return;
    this.maskCtx.putImageData(img, 0, 0);

    const layerCtx = this.layer.getContext('2d');
    if (!layerCtx) return;
    const ls = this.layer.width;
    layerCtx.clearRect(0, 0, ls, ls);
    const pattern = layerCtx.createPattern(texture, 'repeat');
    if (pattern) {
      layerCtx.fillStyle = pattern;
      layerCtx.fillRect(0, 0, ls, ls);
    }
    // Shade the texture by mask brightness so mounded dirt reads as thicker.
    layerCtx.globalCompositeOperation = 'multiply';
    layerCtx.imageSmoothingEnabled = true;
    layerCtx.drawImage(this.mask, 0, 0, ls, ls);
    layerCtx.globalCompositeOperation = 'destination-in';
    layerCtx.drawImage(this.mask, 0, 0, ls, ls);
    layerCtx.globalCompositeOperation = 'source-over';

    ctx.drawImage(this.layer, px, py, size, size);
  }
}

export function spawnParticles(
  list: PitParticle[],
  x: number,
  y: number,
  count: number,
  kind: PitParticle['kind'],
  biasX = 0,
  biasY = 0,
): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = kind === 'spark' ? 0.28 + Math.random() * 0.4 : 0.08 + Math.random() * 0.3;
    list.push({
      x,
      y,
      // Dirt flies the way the tool is moving, not in every direction at once.
      vx: Math.cos(a) * speed + biasX * 0.35,
      vy: Math.sin(a) * speed - 0.06 + biasY * 0.35,
      life: 0,
      maxLife: kind === 'dust' ? 0.7 : 0.45,
      size: kind === 'dust' ? 2 + Math.random() * 3 : 1 + Math.random() * 2.2,
      kind,
    });
  }
  if (list.length > 200) list.splice(0, list.length - 200);
}

export function stepParticles(list: PitParticle[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!;
    p.life += dt;
    if (p.life >= p.maxLife) {
      list.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += dt * 0.55;
    p.vx *= 0.92;
  }
}
