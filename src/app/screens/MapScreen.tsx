import { useMemo } from 'react';
import { LOCATIONS, getLocation } from '@/content/locations';
import { CHAINS, getChain, getClue } from '@/content/clues';
import { TARGETS } from '@/content/targets';
import { chainProgress } from '@/systems/mystery';
import { enterAdventure, enterLocation, game, go, knownCachesAt } from '@/core/gameState';
import type { LocationDef, SaveData } from '@/core/types';
import { useGameState } from '../useGame';
import { Btn, TopBar } from '../components/ui';
import { Nav } from '../components/Nav';

/**
 * The survey sheet. Not a list of cards: a drawn map of the ground, where
 * places sit where they are, lines appear between them as the mysteries
 * tie them together, and a place you cannot enter yet is only drawn once
 * something you hold points at it. The map is the one screen where
 * "everything is connected" is literally visible.
 */
const SHEET_W = 390;
const SHEET_H = 400;

interface Pointer {
  from: LocationDef | null;
  to: LocationDef;
  clueTitle: string;
}

/** Where a clue was found: the location of the journal record that granted it. */
function clueOrigin(save: SaveData, clueId: string): LocationDef | null {
  const granters = TARGETS.filter((t) => t.clueId === clueId).map((t) => t.id);
  const record = save.discoveries.find((d) => granters.includes(d.targetId));
  return record ? (getLocation(record.locationId) ?? null) : null;
}

function isUnlocked(loc: LocationDef, save: SaveData): boolean {
  return !loc.lockedBy || save.unlockedLocations.includes(loc.id);
}

export function MapScreen() {
  const { save } = useGameState();
  const progress = chainProgress(save.clues);

  const pointers = useMemo<Pointer[]>(() => {
    const out: Pointer[] = [];
    for (const clueId of save.clues) {
      const clue = getClue(clueId);
      if (!clue?.pointsTo) continue;
      const to = getLocation(clue.pointsTo);
      if (!to) continue;
      out.push({ from: clueOrigin(save, clueId), to, clueTitle: clue.title });
    }
    return out;
  }, [save]);

  const links = useMemo(() => {
    const out: { from: LocationDef; to: LocationDef; chainId: string }[] = [];
    for (const chain of CHAINS) {
      if (!save.chainsComplete.includes(chain.id) || !chain.links) continue;
      for (let i = 1; i < chain.links.length; i++) {
        const a = getLocation(chain.links[i - 1]!);
        const b = getLocation(chain.links[i]!);
        if (a && b) out.push({ from: a, to: b, chainId: chain.id });
      }
    }
    return out;
  }, [save.chainsComplete]);

  // A locked place is drawn only when something the player holds names it.
  const pointedAt = new Set(pointers.map((p) => p.to.id));
  const drawn = LOCATIONS.filter((loc) => isUnlocked(loc, save) || pointedAt.has(loc.id));
  const findsTotal = save.discoveries.length;

  return (
    <div className="screen">
      <TopBar
        title="Field Map"
        subtitle={findsTotal === 0 ? 'Nothing in the journal yet' : 'Pencil for what you suspect, ink for what you know'}
      />

      <div className="scroll" style={{ paddingTop: 2 }}>
        <div className="sheet-map" data-testid="survey-map">
          <svg className="sheet-map__paper" viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <filter id="paperGrain" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
                <feColorMatrix type="matrix" values="0 0 0 0 0.93 0 0 0 0 0.88 0 0 0 0 0.74 0 0 0 0.18 0" />
              </filter>
              <radialGradient id="paperFade" cx="50%" cy="45%" r="70%">
                <stop offset="0%" stopColor="#e6d9b5" />
                <stop offset="70%" stopColor="#d6c69c" />
                <stop offset="100%" stopColor="#b9a67c" />
              </radialGradient>
            </defs>
            <rect width={SHEET_W} height={SHEET_H} fill="url(#paperFade)" />
            <rect width={SHEET_W} height={SHEET_H} filter="url(#paperGrain)" opacity="0.9" />
            <Contours />
            {/* Pencil lines: a held clue naming a place, from where it was found. */}
            {pointers.map((p, i) => {
              const to = { x: p.to.map.x * SHEET_W, y: p.to.map.y * SHEET_H };
              const from = p.from ? { x: p.from.map.x * SHEET_W, y: p.from.map.y * SHEET_H } : null;
              if (!from || p.from!.id === p.to.id) return null;
              return (
                <line
                  key={`ptr-${i}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#4a3b2a"
                  strokeWidth="1"
                  strokeDasharray="3 5"
                  opacity="0.55"
                />
              );
            })}
            {/* Ink lines: a completed chain, tying places together for good. */}
            {links.map((l, i) => (
              <line
                key={`link-${i}`}
                x1={l.from.map.x * SHEET_W}
                y1={l.from.map.y * SHEET_H}
                x2={l.to.map.x * SHEET_W}
                y2={l.to.map.y * SHEET_H}
                className="sheet-map__link"
                stroke="#8a5a1c"
                strokeWidth="1.6"
              />
            ))}
            <g transform={`translate(${SHEET_W - 46}, 48)`} opacity="0.7">
              <circle r="22" fill="none" stroke="#4a3b2a" strokeWidth="0.8" />
              <path d="M0 -20 L5 0 L0 20 L-5 0 Z" fill="#4a3b2a" />
              <path d="M-20 0 L0 -4 L20 0 L0 4 Z" fill="#8a7256" />
              <text x="0" y="-26" textAnchor="middle" fontFamily="Georgia, serif" fontSize="9" fill="#4a3b2a">
                N
              </text>
            </g>
            <text x="14" y={SHEET_H - 12} fontFamily="Georgia, serif" fontStyle="italic" fontSize="9" fill="#5a4a36" opacity="0.8">
              Field survey · scale approximate · bearings true
            </text>
          </svg>

          {drawn.map((loc) => {
            const unlocked = isUnlocked(loc, save);
            const findsHere = save.discoveries.filter((d) => d.locationId === loc.id).length;
            const caches = knownCachesAt(loc.id);
            const isAdventure = !!loc.adventureId;
            const done = isAdventure && save.adventures[loc.adventureId!] === 'complete';
            const style = { left: `${loc.map.x * 100}%`, top: `${loc.map.y * 100}%` };
            if (!unlocked) {
              return (
                <div key={loc.id} className="marker marker--unknown" style={style} data-testid={`marker-${loc.id}`}>
                  <span className="marker__ring" />
                  <span className="marker__label">?</span>
                </div>
              );
            }
            return (
              <button
                key={loc.id}
                className={`marker ${caches > 0 ? 'marker--pull' : ''} ${isAdventure ? 'marker--adventure' : ''}`}
                style={style}
                data-ui="true"
                data-testid={`location-${loc.id}`}
                onClick={() => {
                  if (isAdventure) enterAdventure(loc.adventureId!);
                  else enterLocation(loc.id);
                }}
              >
                <span className="marker__dot" />
                <span className="marker__label">{loc.name}</span>
                <span className="marker__meta">
                  {isAdventure ? (done ? 'revisit' : 'enter') : caches > 0 ? 'a page points here' : findsHere > 0 ? 'searched before' : 'walk in'}
                </span>
              </button>
            );
          })}
        </div>

        <p className="tiny" style={{ textAlign: 'center', margin: '6px 0 0' }}>
          Tap a place to walk in. The map only shows what you have reason to believe is there.
        </p>

        <div className="group-heading">Open questions</div>
        {progress.filter((p) => p.held.length > 0).length === 0 ? (
          <p className="empty" style={{ padding: '16px 0' }}>
            Nothing yet. Some finds carry more than they appear to.
          </p>
        ) : (
          progress
            .filter((p) => p.held.length > 0)
            .map((p) => (
              <div key={p.chain.id} className="panel" style={{ marginBottom: 10 }}>
                <div className="row row--between">
                  <strong className="serif">{p.chain.name}</strong>
                  <span className="label" style={{ color: p.complete ? 'var(--gold)' : undefined }}>
                    {p.complete ? 'Resolved' : 'Open'}
                  </span>
                </div>
                <p className="card__sub" style={{ marginTop: 6 }}>
                  {p.complete ? p.chain.completeText : p.chain.hint}
                </p>
                {!p.complete ? <PointsTo chainId={p.chain.id} save={save} /> : null}
              </div>
            ))
        )}

        <div style={{ marginTop: 18 }}>
          <Btn variant="ghost" wide onClick={() => go('journal')}>
            Open Field Journal
          </Btn>
        </div>
        {game.get().loadOutcome === 'recovered' ? (
          <p className="tiny" style={{ marginTop: 14 }}>
            A previous save could not be read and was set aside. This one started clean.
          </p>
        ) : null}
      </div>

      <Nav active="map" />
    </div>
  );
}

/** What a chain's held clues say about where to go next, in words. */
function PointsTo({ chainId, save }: { chainId: string; save: SaveData }) {
  const chain = getChain(chainId);
  if (!chain) return null;
  const targets = chain.clueIds
    .filter((id) => save.clues.includes(id))
    .map((id) => getClue(id)?.pointsTo)
    .filter((id): id is string => !!id)
    .map((id) => getLocation(id))
    .filter((l): l is LocationDef => !!l);
  const last = targets[targets.length - 1];
  if (!last) return null;
  const open = isUnlocked(last, save);
  return (
    <p className="tiny" style={{ marginTop: 8, color: 'var(--gold)' }}>
      {open ? `The latest page points at ${last.name}.` : 'The latest page points somewhere you cannot get to yet. It is on the map now.'}
    </p>
  );
}

/** Hand-drawn contour lines. Static: the ground does not move. */
function Contours() {
  const paths = [
    'M-10 70 C 60 40, 120 95, 190 70 S 320 30, 400 60',
    'M-10 120 C 70 100, 130 150, 200 125 S 330 90, 400 115',
    'M-10 180 C 60 160, 110 210, 180 190 S 300 150, 400 180',
    'M-10 250 C 80 230, 140 280, 210 255 S 320 220, 400 245',
    'M-10 320 C 60 300, 120 350, 190 325 S 310 290, 400 320',
    'M-10 380 C 80 365, 130 395, 200 375 S 330 350, 400 372',
    'M40 -10 C 60 60, 20 120, 50 190 S 30 300, 60 410',
    'M300 -10 C 330 70, 290 130, 320 200 S 290 320, 330 410',
  ];
  return (
    <g fill="none" stroke="#6a5a42" strokeWidth="0.7" opacity="0.32">
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );
}
