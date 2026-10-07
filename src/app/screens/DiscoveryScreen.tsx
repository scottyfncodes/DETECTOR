import { useEffect } from 'react';
import { getLocation } from '@/content/locations';
import { getClue } from '@/content/clues';
import { dismissDiscovery, focusJournal, game } from '@/core/gameState';
import { conditionLabel, discoveryTier, type DiscoveryTier } from '@/systems/discovery';
import { music } from '@/engine/music';
import { haptics } from '@/engine/haptics';
import { Btn, FindArt, RarityTag } from '../components/ui';

/**
 * The discovery card, in four sizes. A bottle cap gets a glance and a single
 * button. A clue gets a held frame and the motif. A completed chain gets the
 * constellation: every symbol in the chain drawn and joined, because that is
 * the moment the player is meant to see the shape of the whole thing.
 */
const KICKER: Record<DiscoveryTier, string> = {
  minor: 'Found',
  notable: 'Discovery',
  major: 'Discovery',
  event: 'Everything connects',
};

export function DiscoveryScreen() {
  const pending = game.get().pending;
  const tier: DiscoveryTier = pending ? discoveryTier(pending) : 'minor';

  useEffect(() => {
    if (!pending) return;
    const delay = tier === 'event' ? 900 : tier === 'major' ? 650 : 250;
    const timer = setTimeout(() => {
      music.motif(tier);
      if (tier === 'event') haptics.reveal();
    }, delay);
    return () => clearTimeout(timer);
  }, [pending, tier]);

  if (!pending) {
    dismissDiscovery();
    return null;
  }

  const { record, def, clue, connections, chains, unlockedLocations, equipmentGained } = pending;
  const location = getLocation(record.locationId);
  const unknown = def.significance === 'unknown';
  // Discovery shows what you can tell at a glance — the full identification
  // comes later, the first time you open this find in the journal.
  const shownName = def.unidentifiedName ?? def.name;
  // After an adventure there is no field to go back to — offer the map instead.
  const field = game.get().save.field;
  const canResumeField = !!field && field.targets.some((t) => !t.dug);
  // A find made inside a first-person site returns to that site, not the
  // (possibly unrelated, possibly nonexistent) 2D field.
  const activeSite = game.get().activeSite;
  const kicker = def.rarity === 'legendary' ? 'Extraordinary discovery' : unlockedLocations.length && tier === 'event' && !chains.length ? 'New ground' : KICKER[tier];

  const back = (
    <Btn
      variant="primary"
      wide
      data-testid="keep-searching"
      onClick={() => dismissDiscovery(activeSite || canResumeField ? 'explore3d' : 'map')}
    >
      {activeSite ? 'Keep exploring' : canResumeField ? 'Keep searching' : 'Back to the map'}
    </Btn>
  );
  const journal = (
    <Btn
      variant="ghost"
      wide
      onClick={() => {
        dismissDiscovery('journal');
        focusJournal(def.id);
      }}
    >
      View in journal
    </Btn>
  );

  if (tier === 'minor') {
    return (
      <div className="discovery discovery--minor" data-testid="discovery-screen" data-tier="minor">
        <div className="discovery__kicker">{kicker}</div>
        <div className="discovery__art discovery__art--small reveal-in">
          <FindArt silhouette={def.silhouette} condition={record.condition} />
        </div>
        <h1 className="discovery__name" data-testid="discovery-name">
          {shownName}
        </h1>
        <p className="discovery__flavour">“{def.discoveryText}”</p>
        <p className="tiny" style={{ textAlign: 'center', margin: '14px 0 0' }}>
          {def.materialName} · {record.condition}% · {record.depthCm > 0 ? `${record.depthCm} cm` : 'surface'} · logged
        </p>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px 28px' }}>
          {back}
          {journal}
        </div>
      </div>
    );
  }

  return (
    <div className={`discovery discovery--${tier}`} data-testid="discovery-screen" data-tier={tier}>
      {tier !== 'notable' ? <div className="discovery__rays" aria-hidden="true" /> : null}
      <div className="discovery__kicker">{kicker}</div>
      <div className="discovery__art reveal-in">
        <FindArt silhouette={def.silhouette} condition={record.condition} animate />
      </div>
      <h1 className="discovery__name" data-testid="discovery-name">
        {shownName}
      </h1>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
        <RarityTag rarity={def.rarity} />
      </div>

      <p className="discovery__flavour">“{def.discoveryText}”</p>

      <div style={{ padding: '22px 20px 0' }}>
        <div className="panel grid2">
          <div>
            <div className="stat__label">Material</div>
            <div className="stat__value">{def.materialName}</div>
          </div>
          <div>
            <div className="stat__label">Estimated era</div>
            <div className="stat__value">{unknown ? 'Unknown' : def.era ?? 'Unknown'}</div>
          </div>
          <div>
            <div className="stat__label">Condition</div>
            <div className="stat__value">
              {record.condition}% · {conditionLabel(record.condition)}
            </div>
          </div>
          <div>
            <div className="stat__label">Depth</div>
            <div className="stat__value">{record.depthCm > 0 ? `${record.depthCm} cm` : '—'}</div>
          </div>
          <div>
            <div className="stat__label">Found</div>
            <div className="stat__value">{location?.name ?? 'Unknown'}</div>
          </div>
          <div>
            <div className="stat__label">Field value</div>
            {/* A page of someone's field book is not merchandise. */}
            <div className="stat__value">{def.clueId ? 'Not for sale' : record.value > 0 ? `${record.value} funds` : '—'}</div>
          </div>
        </div>

        <div className="stagger">
          {pending.firstOfKind && def.rarity !== 'common' ? (
            <div className="banner">
              <div className="banner__kicker">New to your collection</div>
              <p style={{ margin: '6px 0 0', fontFamily: 'var(--serif)' }}>{def.description}</p>
            </div>
          ) : null}

          {equipmentGained ? (
            <div className="banner" data-testid="equipment-banner">
              <div className="banner__kicker">Now carrying</div>
              <p style={{ margin: '6px 0 4px', fontFamily: 'var(--serif)', fontSize: 17 }}>{equipmentGained.name}</p>
              <p className="card__sub" style={{ margin: 0 }}>
                {equipmentGained.reveals ?? equipmentGained.tagline}
              </p>
            </div>
          ) : null}

          {clue ? (
            <div className="banner banner--mystery" data-testid="clue-banner">
              <div className="banner__kicker">New clue discovered</div>
              <p style={{ margin: '6px 0 4px', fontFamily: 'var(--serif)', fontSize: 17 }}>{clue.title}</p>
              <p className="card__sub" style={{ margin: 0 }}>
                {clue.text}
              </p>
              {clue.pointsTo ? (
                <p className="tiny" style={{ margin: '8px 0 0', color: 'var(--odd)' }}>
                  It names a place. The map has it now.
                </p>
              ) : null}
            </div>
          ) : null}

          {connections.length > 0 ? (
            <div className="banner banner--mystery" data-testid="connection-banner">
              <div className="banner__kicker">Wait — that matches something</div>
              <p style={{ margin: '6px 0 4px', fontFamily: 'var(--serif)', fontSize: 17 }}>
                {clue?.symbol}
              </p>
              <p className="card__sub" style={{ margin: 0 }}>
                The same mark is on {connections.length === 1 ? '"' + connections[0]!.title + '"' : `${connections.length} other finds`} already in your journal. Check the Links tab.
              </p>
            </div>
          ) : null}

          {chains.map((chain) => (
            <div key={chain.id} className="banner banner--mystery banner--event" data-testid="chain-banner">
              <div className="banner__kicker">Clue chain complete</div>
              <p style={{ margin: '6px 0 4px', fontFamily: 'var(--serif)', fontSize: 18 }}>
                {chain.completeTitle}
              </p>
              <Constellation clueIds={chain.clueIds} />
              <p className="card__sub" style={{ margin: 0 }}>
                {chain.completeText}
              </p>
            </div>
          ))}

          {unlockedLocations.map((loc) => (
            <div key={loc.id} className="banner" data-testid="unlock-banner">
              <div className="banner__kicker">New location discovered</div>
              <p style={{ margin: '6px 0 4px', fontFamily: 'var(--serif)', fontSize: 20 }}>
                {loc.name.toUpperCase()}
              </p>
              <p className="card__sub" style={{ margin: 0 }}>
                {loc.description}
              </p>
            </div>
          ))}
        </div>

        <p className="tiny" style={{ textAlign: 'center', margin: '20px 0 10px' }}>
          Added to your field journal.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 28 }}>
          {back}
          {journal}
        </div>
      </div>
    </div>
  );
}

/**
 * The chain's symbols, drawn as a small constellation and joined one line
 * at a time. It is deliberately abstract: the player already knows what the
 * marks are; what they are seeing for the first time is that they connect.
 */
function Constellation({ clueIds }: { clueIds: string[] }) {
  const symbols = clueIds.map((id) => getClue(id)?.symbol ?? '?');
  const n = symbols.length;
  const w = 300;
  const h = 86;
  const pts = symbols.map((_, i) => ({
    x: 30 + ((w - 60) * i) / Math.max(1, n - 1),
    y: h / 2 + (i % 2 === 0 ? -16 : 16),
  }));
  return (
    <svg className="constellation" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden="true">
      {pts.slice(1).map((p, i) => {
        const a = pts[i]!;
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={p.x}
            y2={p.y}
            className="constellation__line"
            style={{ animationDelay: `${0.9 + i * 0.45}s` }}
          />
        );
      })}
      {pts.map((p, i) => (
        <g key={i} className="constellation__node" style={{ animationDelay: `${0.4 + i * 0.3}s` }}>
          <circle cx={p.x} cy={p.y} r="5" />
          <text x={p.x} y={p.y + (i % 2 === 0 ? -12 : 20)} textAnchor="middle">
            {symbols[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}
