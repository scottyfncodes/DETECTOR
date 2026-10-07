import { useEffect, useMemo, useState } from 'react';
import { getLocation } from '@/content/locations';
import { getTargetOrPlaceholder } from '@/content/targets';
import { getClue } from '@/content/clues';
import { activeAssemblies, type AssemblyProgress } from '@/systems/assembly';
import {
  focusJournal,
  game,
  isExamined,
  markExamined,
  performAssembly,
} from '@/core/gameState';
import { RARITY_LABEL, type DiscoveryRecord, type Rarity, type TargetDef } from '@/core/types';
import { chainProgress, symbolConnections } from '@/systems/mystery';
import { conditionLabel } from '@/systems/discovery';
import { useGameState } from '../useGame';
import { Btn, FindArt, RarityTag, TopBar } from '../components/ui';
import { Nav } from '../components/Nav';

type Tab = 'finds' | 'mysteries' | 'connections' | 'assemble';
type GroupMode = 'location' | 'category' | 'rarity' | 'era';
const GROUPS: { id: GroupMode; label: string }[] = [
  { id: 'location', label: 'Place' },
  { id: 'category', label: 'Type' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'era', label: 'Era' },
];

const CATEGORY_LABEL: Record<string, string> = {
  junk: 'Rubbish',
  coin: 'Coins',
  tool: 'Tools & hardware',
  personal: 'Personal effects',
  jewelry: 'Jewellery',
  military: 'Military',
  relic: 'Relics',
  artifact: 'Artifacts',
};

/** What the journal calls a find right now — the mystery name until examined. */
export function displayName(def: TargetDef, examined: boolean): string {
  if (def.unidentifiedName && !examined) return def.unidentifiedName;
  return def.name;
}

export function JournalScreen() {
  const { save, journalFocus } = useGameState();
  const [tab, setTab] = useState<Tab>('finds');
  const [group, setGroup] = useState<GroupMode>('location');
  const [openUid, setOpenUid] = useState<string | null>(null);

  const focused = useMemo(() => {
    if (!journalFocus) return null;
    return save.discoveries.find((d) => d.targetId === journalFocus) ?? null;
  }, [journalFocus, save.discoveries]);

  const openRecord =
    save.discoveries.find((d) => d.uid === openUid) ?? (openUid === null ? focused : null);

  const grouped = useMemo(() => groupFinds(save.discoveries, group), [save.discoveries, group]);
  const progress = chainProgress(save.clues);
  const connections = useMemo(() => symbolConnections(save.clues), [save.clues]);
  const assemblies = useMemo(() => activeAssemblies(save), [save]);

  return (
    <div className="screen">
      <TopBar
        title="Field Journal"
        subtitle={save.clues.length > 0 ? 'What you have found, and what it might mean' : 'What you have found'}
      />

      <div className="tabs">
        <button className={`tab ${tab === 'finds' ? 'tab--active' : ''}`} onClick={() => setTab('finds')}>
          Finds
        </button>
        <button
          className={`tab ${tab === 'mysteries' ? 'tab--active' : ''}`}
          onClick={() => setTab('mysteries')}
        >
          Mysteries
        </button>
        <button
          className={`tab ${tab === 'connections' ? 'tab--active' : ''}`}
          onClick={() => setTab('connections')}
          data-testid="tab-connections"
        >
          Links
        </button>
        <button
          className={`tab ${tab === 'assemble' ? 'tab--active' : ''}`}
          onClick={() => setTab('assemble')}
          data-testid="tab-assemble"
        >
          Assemble
        </button>
      </div>

      <div className="scroll">
        {tab === 'finds' ? (
          save.discoveries.length === 0 ? (
            <p className="empty">
              Empty. Everything in here will be something you actually pulled out of the ground.
            </p>
          ) : (
            <>
              <div className="tabs" style={{ padding: '0 0 12px' }}>
                {GROUPS.map((g) => (
                  <button
                    key={g.id}
                    className={`tab ${group === g.id ? 'tab--active' : ''}`}
                    onClick={() => setGroup(g.id)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {grouped.map(([heading, records]) => (
                <div key={heading}>
                  <div className="group-heading">
                    {heading}
                  </div>
                  {records.map((record) => {
                    const def = getTargetOrPlaceholder(record.targetId);
                    const examined = isExamined(def.id);
                    return (
                      <button
                        key={record.uid}
                        className="entry"
                        data-testid="journal-entry"
                        onClick={() => {
                          focusJournal(null);
                          setOpenUid(record.uid);
                        }}
                      >
                        <FindArt
                          silhouette={def.silhouette}
                          condition={record.condition}
                          className="entry__art"
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 className="entry__name">{displayName(def, examined)}</h3>
                          <p className="entry__meta">
                            {def.significance === 'unknown' || (!examined && def.unidentifiedName)
                              ? 'Unidentified'
                              : def.materialName}{' '}
                            · {record.condition}% · {record.depthCm > 0 ? `${record.depthCm} cm` : 'assembled'}
                          </p>
                        </div>
                        <RarityTag rarity={def.rarity} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )
        ) : tab === 'mysteries' ? (
          <>
            {progress.filter((p) => p.held.length > 0).map((p) => (
              <div key={p.chain.id} className="panel" style={{ marginBottom: 12 }}>
                <div className="row row--between">
                  <strong className="serif" style={{ fontSize: 17 }}>
                    {p.held.length === 0 ? 'Unidentified pattern' : p.chain.name}
                  </strong>
                  <span className="label" style={{ color: p.complete ? 'var(--gold)' : undefined }}>
                    {p.complete ? 'Resolved' : p.held.length ? 'Open' : ''}
                  </span>
                </div>
                <p className="card__sub" style={{ marginTop: 6 }}>
                  {p.complete ? p.chain.completeText : p.held.length ? p.chain.hint : 'No clues yet.'}
                </p>
                {p.held.map((clue) => (
                  <div
                    key={clue.id}
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: '1px solid var(--line)',
                    }}
                  >
                    <div className="label">{clue.symbol}</div>
                    <strong className="serif">{clue.title}</strong>
                    <p className="card__sub" style={{ margin: '4px 0 0' }}>
                      {clue.text}
                    </p>
                    {clue.pointsTo ? (
                      <p className="tiny" style={{ margin: '6px 0 0', color: 'var(--gold)' }}>
                        Names a place: {save.unlockedLocations.includes(clue.pointsTo) || !getLocation(clue.pointsTo)?.lockedBy ? getLocation(clue.pointsTo)?.name : 'somewhere you have not reached'}
                      </p>
                    ) : null}
                  </div>
                ))}
                {!p.complete && p.held.length > 0 ? (
                  <p className="tiny" style={{ marginTop: 10, fontStyle: 'italic' }}>
                    Something is still missing.
                  </p>
                ) : null}
              </div>
            ))}
            {save.clues.length === 0 ? (
              <p className="empty">
                Some finds carry markings that mean nothing on their own.
                <br />
                They will end up here.
              </p>
            ) : null}
          </>
        ) : tab === 'connections' ? (
          <ConnectionsTab connections={connections} />
        ) : (
          <AssembleTab
            assemblies={assemblies}
            onOpenPiece={(targetId) => {
              const pieceRecord = save.discoveries.find((d) => d.targetId === targetId);
              if (pieceRecord) setOpenUid(pieceRecord.uid);
            }}
          />
        )}
      </div>

      {openRecord ? <FindSheet record={openRecord} onClose={() => setOpenUid(null)} /> : null}

      <Nav active="journal" />
    </div>
  );
}

function ConnectionsTab({ connections }: { connections: ReturnType<typeof symbolConnections> }) {
  if (connections.length === 0) {
    return (
      <p className="empty">
        Nothing lines up yet.
        <br />
        The same mark on two different finds is worth a second look.
      </p>
    );
  }
  return (
    <>
      {connections.map((group) => (
        <div key={group.symbol} className="panel banner--mystery" style={{ marginBottom: 12 }}>
          <div className="row row--between">
            <strong className="serif" style={{ fontSize: 17 }}>
              {group.symbol}
            </strong>
            <span className="label">Recurring mark</span>
          </div>
          <p className="card__sub" style={{ marginTop: 6 }}>
            This mark shows up on {group.clues.length} separate finds. That is not a coincidence.
          </p>
          {group.clues.map((clue) => (
            <div
              key={clue.id}
              style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}
            >
              <strong className="serif">{clue.title}</strong>
              <p className="card__sub" style={{ margin: '4px 0 0' }}>
                {clue.text}
              </p>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function AssembleTab({
  assemblies,
  onOpenPiece,
}: {
  assemblies: AssemblyProgress[];
  onOpenPiece: (targetId: string) => void;
}) {
  if (assemblies.length === 0) {
    return (
      <p className="empty">
        Nothing to put together yet.
        <br />
        Some finds are only part of something.
      </p>
    );
  }
  return (
    <>
      {assemblies.map((progress) => (
        <div key={progress.composite.id} className="panel" style={{ marginBottom: 14 }} data-testid="assembly-row">
          <div className="row row--between">
            <strong className="serif" style={{ fontSize: 17 }}>
              {progress.done ? progress.composite.name : '??? — pieces found'}
            </strong>
            <span className="label">
              {progress.heldCount}/{progress.totalCount}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              flexWrap: 'wrap',
            }}
          >
            {progress.pieces.map(({ def, held, record }) => (
              <button
                key={def.id}
                disabled={!held}
                onClick={() => held && onOpenPiece(def.id)}
                data-testid={`piece-${def.id}`}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  border: `1px solid ${held ? 'var(--line-strong)' : 'var(--line)'}`,
                  background: held ? '#1b1512' : 'rgba(255,255,255,0.02)',
                  opacity: held ? 1 : 0.4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {held ? (
                  <FindArt silhouette={def.silhouette} condition={record?.condition ?? 100} size={44} />
                ) : (
                  <span className="tiny" style={{ opacity: 0.6 }}>
                    ?
                  </span>
                )}
              </button>
            ))}
          </div>

          {progress.done ? (
            <p className="tiny" style={{ marginTop: 12 }}>
              Assembled. See it in your Finds.
            </p>
          ) : progress.ready ? (
            <Btn
              small
              wide
              variant="primary"
              style={{ marginTop: 14 }}
              data-testid={`assemble-${progress.composite.id}`}
              onClick={() => performAssembly(progress.composite.id)}
            >
              Fit the pieces together
            </Btn>
          ) : (
            <p className="tiny" style={{ marginTop: 12, fontStyle: 'italic' }}>
              {progress.totalCount - progress.heldCount === 1 ? 'One edge still does not meet anything.' : 'The outline does not close yet.'}
            </p>
          )}
        </div>
      ))}
    </>
  );
}

function FindSheet({ record, onClose }: { record: DiscoveryRecord; onClose: () => void }) {
  const def = getTargetOrPlaceholder(record.targetId);
  const location = getLocation(record.locationId);
  const unknown = def.significance === 'unknown';
  const clue = def.clueId ? getClue(def.clueId) : undefined;
  const held = game.get().save.clues.includes(def.clueId ?? '');

  // Capture identification state BEFORE marking examined, so a first-time
  // open can show the "just identified" beat instead of the already-known one.
  const [wasUnidentified] = useState(() => !!def.unidentifiedName && !isExamined(def.id));
  useEffect(() => {
    markExamined(def.id);
    // Runs once per mounted sheet (a fresh FindSheet mounts per record.uid via
    // React's key-less remount-on-prop-identity here is fine since `record`
    // only changes by the parent swapping which record is open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);
  const examined = true; // always true from here on down — opening the sheet examines it

  const composite = def.pieceOf ? getTargetOrPlaceholder(def.pieceOf) : null;
  const compositeAssembled = composite ? game.get().save.assembled.includes(composite.id) : false;

  return (
    <div
      className="sheet"
      onClick={() => {
        focusJournal(null);
        onClose();
      }}
    >
      <div className="sheet__body" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <FindArt silhouette={def.silhouette} condition={record.condition} size={140} animate />
        </div>

        {wasUnidentified ? (
          <p
            className="label"
            style={{ textAlign: 'center', color: 'var(--gold)', marginTop: 4 }}
            data-testid="newly-identified"
          >
            Newly identified
          </p>
        ) : null}

        <h2 className="serif" style={{ textAlign: 'center', fontSize: 23, margin: '4px 0 8px' }}>
          {displayName(def, examined)}
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <RarityTag rarity={def.rarity} />
        </div>

        <div className="grid2">
          <div>
            <div className="stat__label">Material</div>
            <div className="stat__value">{unknown ? 'Unknown' : def.materialName}</div>
          </div>
          <div>
            <div className="stat__label">Origin</div>
            <div className="stat__value">{unknown ? 'Unknown' : (location?.name ?? 'Unknown')}</div>
          </div>
          <div>
            <div className="stat__label">Date</div>
            <div className="stat__value">{unknown ? 'Unknown' : (def.era ?? 'Unknown')}</div>
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
            <div className="stat__label">Significance</div>
            <div className="stat__value" style={{ textTransform: 'capitalize' }}>
              {def.significance === 'none' ? '—' : def.significance}
            </div>
          </div>
        </div>

        <p style={{ fontFamily: 'var(--serif)', marginTop: 18, color: '#cfc7b2' }}>{def.description}</p>
        {def.examineText ? (
          <p style={{ fontFamily: 'var(--serif)', marginTop: 10, color: '#cfc7b2', fontStyle: 'italic' }}>
            {def.examineText}
          </p>
        ) : null}

        {composite ? (
          <div className="banner" style={{ marginTop: 16 }}>
            <div className="banner__kicker">{compositeAssembled ? 'Part of' : 'Piece of something'}</div>
            <strong className="serif">{compositeAssembled ? composite.name : '???'}</strong>
            <p className="card__sub" style={{ margin: '4px 0 0' }}>
              {compositeAssembled
                ? 'Already assembled — see it in your Finds.'
                : 'Find the other pieces, then put them together from the Assemble tab.'}
            </p>
          </div>
        ) : null}

        {clue && held ? (
          <div className="banner banner--mystery">
            <div className="banner__kicker">Clue</div>
            <strong className="serif">{clue.title}</strong>
            <p className="card__sub" style={{ margin: '4px 0 0' }}>
              {clue.text}
            </p>
          </div>
        ) : null}

        {record.tutorial ? (
          <p className="tiny" style={{ marginTop: 14 }}>
            Your first find. Logged like any other.
          </p>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <Btn
            variant="ghost"
            wide
            sound="back"
            onClick={() => {
              focusJournal(null);
              onClose();
            }}
          >
            Close
          </Btn>
        </div>
      </div>
    </div>
  );
}

function groupFinds(records: DiscoveryRecord[], mode: GroupMode): [string, DiscoveryRecord[]][] {
  const map = new Map<string, DiscoveryRecord[]>();
  for (const record of records) {
    const def = getTargetOrPlaceholder(record.targetId);
    let key: string;
    switch (mode) {
      case 'location':
        key = getLocation(record.locationId)?.name ?? 'Unknown ground';
        break;
      case 'category':
        key = CATEGORY_LABEL[def.category] ?? def.category;
        break;
      case 'rarity':
        key = RARITY_LABEL[def.rarity as Rarity];
        break;
      case 'era':
        key = def.significance === 'unknown' ? 'Unknown era' : (def.era ?? 'Unknown era');
        break;
    }
    const list = map.get(key);
    if (list) list.push(record);
    else map.set(key, [record]);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}
