import { useEffect, useMemo, useRef, useState } from 'react';
import { getLocation } from '@/content/locations';
import { getTarget } from '@/content/targets';
import { getTool } from '@/content/equipment';
import {
  abandonDig,
  completeExtraction,
  game,
  hasEquipment,
  markTargetDug,
  notice,
  recordHole,
} from '@/core/gameState';
import type { TargetDef, ToolDef } from '@/core/types';
import { clamp01 } from '@/core/rng';
import {
  applyTool,
  canExtract,
  createExcavation,
  drainEvents,
  extract,
  heatAt,
  pitCleared,
  type ExcavationState,
} from '@/systems/excavation';
import { audio } from '@/engine/audio';
import { haptics } from '@/engine/haptics';
import { DragController, fitCanvas } from '@/engine/input';
import { startLoop } from '@/engine/loop';
import { PitRenderer, spawnParticles, stepParticles, type PitParticle } from '@/engine/render/pit';
import { Btn, Meter } from '../components/ui';
import { conditionLabel } from '@/systems/discovery';

/** Stand-in definition for a hole with nothing in it — still real dirt. */
function soilOnlyDef(hardness: number): TargetDef {
  return {
    id: '__soil__',
    name: 'Soil',
    category: 'junk',
    material: 'unknown',
    materialName: 'Soil',
    rarity: 'common',
    depth: [0, 0],
    size: 0.4,
    value: 0,
    significance: 'none',
    fragility: 0,
    excavationDifficulty: hardness,
    description: '',
    discoveryText: '',
    silhouette: 'oddity',
  };
}

export function ExcavateScreen() {
  const dig = game.get().dig;
  const save = game.get().save;
  const location = dig ? getLocation(dig.locationId) : undefined;
  const def = dig?.targetId ? getTarget(dig.targetId) : undefined;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(new DragController());
  const rendererRef = useRef(new PitRenderer());
  const stateRef = useRef<ExcavationState | null>(null);
  const particlesRef = useRef<PitParticle[]>([]);
  const flashRef = useRef(0);
  const shakeRef = useRef(0);
  const liftRef = useRef(0);
  const liftDoneRef = useRef(false);
  const onLiftDoneRef = useRef<(() => void) | null>(null);

  const tools = useMemo(() => {
    const owned = ['tool_scoop', 'tool_brush', 'tool_pick', 'tool_fine_brush']
      .filter((id) => hasEquipment(id))
      .map((id) => getTool(id))
      .filter((t): t is ToolDef => !!t);
    return owned;
  }, [save.ownedEquipment]);

  const [toolId, setToolId] = useState(tools[0]?.id ?? 'tool_scoop');
  const toolRef = useRef<ToolDef>(getTool(toolId) ?? tools[0]!);
  const [hud, setHud] = useState({ condition: 100, exposed: 0, ready: false, cleared: 0, hasObject: true, lifting: false });
  const firstDig = save.stats.holesDug === 0;

  const hasPinpointer = hasEquipment('tool_pinpointer');

  useEffect(() => {
    const next = getTool(toolId);
    if (next) toolRef.current = next;
  }, [toolId]);

  useEffect(() => {
    if (!dig || !location) return;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    liftRef.current = 0;
    liftDoneRef.current = false;
    const state = createExcavation({
      def: def ?? soilOnlyDef(location.hardness),
      location,
      accuracy: dig.accuracy,
      offsetAngle: dig.offsetAngle,
      baseCondition: dig.baseCondition,
      seed: dig.seed,
    });
    stateRef.current = state;
    particlesRef.current = [];

    const detach = dragRef.current.attach(host);
    audio.unlock();
    audio.ambience(null);

    let hudTick = 0;
    const loop = startLoop((dt, elapsed) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h, dpr } = fitCanvas(canvas);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const drag = dragRef.current;
      const tool = toolRef.current;

      const lifting = liftRef.current > 0;
      // Finger direction, for the tool glyph and for which way the dirt flies.
      const ddx = drag.pos.x - drag.prev.x;
      const ddy = drag.pos.y - drag.prev.y;
      const dlen = Math.hypot(ddx, ddy) || 1;
      const toolVX = drag.down ? (ddx / dlen) * Math.min(1.5, drag.speed) : 0;
      const toolVY = drag.down ? (ddy / dlen) * Math.min(1.5, drag.speed) : 0;

      // ── tool application ────────────────────────────────────────────
      if (drag.down && tool.power > 0 && !lifting) {
        const result = applyTool(state, tool, drag.pos.x, drag.pos.y, dt, performance.now());
        if (result.removed > 0.02 || result.debrisRemoved > 0.02) {
          spawnParticles(
            particlesRef.current,
            drag.pos.x,
            drag.pos.y,
            tool.kind === 'brush' ? 2 : 3,
            tool.kind === 'brush' ? 'dust' : 'dirt',
            toolVX,
            toolVY,
          );
        }
        if (result.strike) {
          spawnParticles(particlesRef.current, drag.pos.x, drag.pos.y, 10, 'spark');
          flashRef.current = 1;
          shakeRef.current = 7;
        }
      }

      // ── feedback from the pit's own event feed ──────────────────────
      for (const event of drainEvents(state)) {
        switch (event.kind) {
          case 'dig':
            audio.dig(event.intensity);
            break;
          case 'debris':
            audio.dig(0.7 + event.intensity * 0.3);
            break;
          case 'contact':
            if (toolRef.current.kind === 'brush') audio.brush(0.6 + event.intensity);
            else audio.contact();
            haptics.contact();
            break;
          case 'strike':
            audio.strike();
            haptics.strike();
            break;
          case 'expose':
            audio.brush(0.8);
            break;
        }
      }
      if (dragRef.current.down && toolRef.current.kind === 'brush') {
        audio.brush(clamp01(dragRef.current.speed * 0.6));
      }

      stepParticles(particlesRef.current, dt);
      flashRef.current = Math.max(0, flashRef.current - dt * 2.2);
      shakeRef.current = Math.max(0, shakeRef.current - dt * 26);

      // ── the lift: ~a second of the object rising clear, then the ceremony ──
      if (lifting && !liftDoneRef.current) {
        liftRef.current = Math.min(1, liftRef.current + dt / 1.05);
        if (liftRef.current >= 1) {
          liftDoneRef.current = true;
          onLiftDoneRef.current?.();
        }
      }

      rendererRef.current.draw(ctx, w, h, {
        state,
        toolX: drag.down && !lifting ? drag.pos.x : null,
        toolY: drag.down && !lifting ? drag.pos.y : null,
        toolRadius: tool.radius,
        toolKind: tool.kind as 'scoop' | 'brush' | 'pick' | 'pinpointer',
        toolVX,
        toolVY,
        particles: particlesRef.current,
        time: elapsed,
        damageFlash: flashRef.current,
        heat: hasPinpointer && drag.down ? heatAt(state, drag.pos.x, drag.pos.y) : null,
        shake: shakeRef.current,
        ground: location.ground,
        lift: liftRef.current,
      });

      hudTick += dt;
      if (hudTick > 0.12) {
        hudTick = 0;
        const ready = canExtract(state);
        const cleared = state.hasObject ? 0 : pitCleared(state);
        setHud((prev) => {
          const condition = Math.round(state.condition);
          const exposed = Math.round(state.exposed * 50) / 50;
          if (
            prev.condition === condition &&
            prev.exposed === exposed &&
            prev.ready === ready &&
            Math.abs(prev.cleared - cleared) < 0.02 &&
            prev.hasObject === state.hasObject
          ) {
            return prev;
          }
          return { condition, exposed, ready, cleared, hasObject: state.hasObject, lifting: prev.lifting };
        });
      }
    });

    return () => {
      loop.stop();
      detach();
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dig?.seed]);

  if (!dig || !location) return null;

  const onExtract = () => {
    const state = stateRef.current;
    if (!state || !def || !canExtract(state) || liftRef.current > 0) return;
    const condition = extract(state);
    const big = def.rarity === 'rare' || def.rarity === 'veryRare' || def.rarity === 'legendary';
    audio.lift();
    haptics.reveal();
    setHud((prev) => ({ ...prev, lifting: true }));
    // The object rises out of the hole first; the reveal chord lands as it
    // comes clear. Nothing is committed until then, so a lift cut short
    // leaves the find in the ground rather than losing it.
    onLiftDoneRef.current = () => {
      if (dig.targetUid) markTargetDug(dig.targetUid);
      recordHole(dig.digX, dig.digY, true);
      audio.reveal(big);
      completeExtraction({
        def,
        condition,
        depthCm: dig.depthCm,
        locationId: dig.locationId,
        ...(dig.tutorial ? { tutorial: true } : {}),
      });
    };
    liftRef.current = 0.0001;
  };

  const onGiveUp = () => {
    recordHole(dig.digX, dig.digY, false);
    notice(hud.hasObject ? 'You filled the hole back in.' : 'Nothing in that hole.');
    abandonDig();
  };

  const emptyAndCleared = !hud.hasObject && hud.cleared > 0.5;
  const conditionValue = hud.condition / 100;
  const tool = getTool(toolId);

  return (
    <div className={`screen screen--world screen--pit ${hud.lifting ? 'screen--lifting' : ''}`} ref={hostRef}>
      <canvas ref={canvasRef} className="world" data-testid="pit-canvas" />

      <div className="world-ui">
        <div className="world-top">
          <div className="chip">{location.name} · dig</div>
          <div style={{ flex: 1 }} />
          <Btn small variant="ghost" sound="back" onClick={onGiveUp} disabled={hud.lifting} data-testid="leave-dig">
            {hud.hasObject ? 'Fill in' : 'Give up'}
          </Btn>
        </div>

        <div style={{ padding: '10px 16px 0' }}>
          {hud.hasObject ? (
            <div className="readout" data-testid="dig-readout">
              <div className="row row--between">
                <span className="label">Condition</span>
                <span className="mono tiny" data-testid="condition">
                  {hud.condition}% · {conditionLabel(hud.condition)}
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                <Meter value={conditionValue} />
              </div>
              <div className="row row--between" style={{ marginTop: 10 }}>
                <span className="label">Uncovered</span>
                <span className="mono tiny">{Math.round(hud.exposed * 100)}%</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <Meter value={hud.exposed} color="var(--silverish)" />
              </div>
            </div>
          ) : (
            <div className="readout">
              <div className="label">Nothing yet</div>
              <p className="card__sub" style={{ margin: '4px 0 0' }}>
                {emptyAndCleared
                  ? 'This hole is empty. The signal was off to one side.'
                  : 'Keep moving dirt. Something should be here.'}
              </p>
            </div>
          )}
        </div>

        <div className="world-bottom">
          {hud.lifting ? (
            <div className="notice">Gently…</div>
          ) : hud.hasObject && hud.exposed > 0.18 && hud.exposed < 0.7 ? (
            <div className="notice">An edge. Use the brush from here.</div>
          ) : firstDig && hud.exposed < 0.05 && hud.cleared < 0.08 ? (
            <div className="notice">Drag across the dirt to scoop it away.</div>
          ) : null}

          <div className="row" data-ui="true" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {tools.map((t) => (
              <button
                key={t.id}
                className={`tab ${toolId === t.id ? 'tab--active' : ''}`}
                data-ui="true"
                data-testid={`tool-${t.id}`}
                style={{ flex: '0 1 auto', padding: '9px 14px' }}
                onClick={() => {
                  audio.ui('tap');
                  haptics.tap();
                  setToolId(t.id);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          {tool ? (
            <p className="tiny" style={{ textAlign: 'center', margin: 0 }}>
              {tool.tagline}
            </p>
          ) : null}

          <div className="controls">
            {emptyAndCleared ? (
              <Btn variant="primary" wide onClick={onGiveUp} data-testid="empty-hole">
                Back to the surface
              </Btn>
            ) : (
              <Btn
                variant="primary"
                wide
                disabled={!hud.ready || hud.lifting}
                onClick={onExtract}
                data-testid="extract"
                sound="none"
              >
                {hud.lifting ? 'Lifting…' : hud.ready ? 'Lift it out' : `Uncover it (${Math.round(hud.exposed * 100)}%)`}
              </Btn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
