import { DETECTORS, TOOLS } from '@/content/equipment';
import {
  buyEquipment,
  equipDetector,
  resetProgress,
  setSetting,
} from '@/core/gameState';
import { audio } from '@/engine/audio';
import { haptics } from '@/engine/haptics';
import { useGameState } from '../useGame';
import { Btn, Meter, TopBar } from '../components/ui';
import { Nav } from '../components/Nav';
import { useState } from 'react';

export function EquipmentScreen() {
  const { save } = useGameState();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="screen">
      <TopBar title="Kit" subtitle={`${save.money} funds`} />

      <div className="scroll">
        <div className="group-heading">Detectors</div>
        {DETECTORS.map((det) => {
          const owned = save.ownedEquipment.includes(det.id);
          const equipped = save.detectorId === det.id;
          const affordable = save.money >= det.price;
          return (
            <div key={det.id} className="card">
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <h3 className="card__title">{det.name}</h3>
                  <p className="card__sub">{det.tagline}</p>
                </div>
                {equipped ? <span className="label" style={{ color: 'var(--gold)' }}>In use</span> : null}
              </div>

              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <Spec label="Depth" value={det.depthCapacity / 50} text={`${det.depthCapacity} cm`} />
                <Spec label="Reach" value={det.reach / 110} text={`${det.reach} cm`} />
                <Spec
                  label="Discrimination"
                  value={det.discrimination}
                  text={`${Math.round(det.discrimination * 100)}%`}
                />
                <Spec label="Stability" value={det.stability} text={`${Math.round(det.stability * 100)}%`} />
              </div>

              <div style={{ marginTop: 14 }}>
                {equipped ? null : owned ? (
                  <Btn small wide onClick={() => equipDetector(det.id)}>
                    Use this
                  </Btn>
                ) : (
                  <Btn
                    small
                    wide
                    variant={affordable ? 'primary' : 'ghost'}
                    disabled={!affordable}
                    onClick={() => {
                      if (buyEquipment(det.id, det.price)) equipDetector(det.id);
                      else audio.ui('deny');
                    }}
                  >
                    {affordable ? `Buy · ${det.price} funds` : `${det.price} funds`}
                  </Btn>
                )}
              </div>
            </div>
          );
        })}

        <div className="group-heading">Tools</div>
        {TOOLS.filter((tool) => !tool.found || save.ownedEquipment.includes(tool.id)).map((tool) => {
          const owned = save.ownedEquipment.includes(tool.id);
          const affordable = save.money >= tool.price;
          return (
            <div key={tool.id} className="card" data-testid={`tool-${tool.id}`}>
              <div className="row row--between">
                <div style={{ minWidth: 0 }}>
                  <h3 className="card__title">{tool.name}</h3>
                  <p className="card__sub">{tool.tagline}</p>
                  {tool.found && tool.reveals ? (
                    <p className="tiny" style={{ marginTop: 6, color: 'var(--gold)' }}>
                      {tool.reveals}
                    </p>
                  ) : null}
                </div>
                {owned ? <span className="label" style={tool.found ? { color: 'var(--gold)' } : undefined}>{tool.found ? 'Found' : 'Owned'}</span> : null}
              </div>
              {!owned ? (
                <div style={{ marginTop: 12 }}>
                  <Btn
                    small
                    wide
                    variant={affordable ? 'primary' : 'ghost'}
                    disabled={!affordable}
                    onClick={() => {
                      if (!buyEquipment(tool.id, tool.price)) audio.ui('deny');
                    }}
                  >
                    {affordable ? `Buy · ${tool.price} funds` : `${tool.price} funds`}
                  </Btn>
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="group-heading">Field notes</div>
        <div className="panel grid2">
          <Note label="Finds" value={save.stats.finds} />
          <Note label="Holes dug" value={save.stats.holesDug} />
          <Note label="Empty holes" value={save.stats.emptyHoles} />
          <Note label="Best condition" value={`${save.stats.bestCondition}%`} />
          <Note label="Signals worked" value={save.stats.signalsFound} />
          <Note label="Sweeps" value={save.stats.sweeps} />
        </div>

        <div className="group-heading">Settings</div>
        <div className="panel">
          <Toggle
            label="Sound"
            value={save.settings.sound}
            onChange={(v) => {
              setSetting('sound', v);
              audio.unlock();
              audio.setEnabled(v);
            }}
          />
          <Toggle
            label="Haptics"
            value={save.settings.haptics}
            onChange={(v) => {
              setSetting('haptics', v);
              haptics.setEnabled(v);
              if (v) haptics.tap();
            }}
          />
        </div>

        <div style={{ marginTop: 18, paddingBottom: 10 }}>
          {confirmReset ? (
            <div className="panel">
              <p className="card__sub" style={{ marginTop: 0 }}>
                This erases your journal, clues, funds and equipment permanently.
              </p>
              <div className="row" style={{ gap: 10 }}>
                <Btn small variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Btn>
                <Btn small variant="danger" onClick={() => resetProgress()}>
                  Erase everything
                </Btn>
              </div>
            </div>
          ) : (
            <Btn variant="ghost" small wide onClick={() => setConfirmReset(true)}>
              Reset progress
            </Btn>
          )}
        </div>
      </div>

      <Nav active="equipment" />
    </div>
  );
}

function Spec({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div>
      <div className="row row--between">
        <span className="stat__label">{label}</span>
        <span className="tiny mono">{text}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        <Meter value={value} color="var(--muted)" />
      </div>
    </div>
  );
}

function Note({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="stat__label">{label}</div>
      <div className="stat__value mono">{value}</div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      className="row row--between"
      style={{ width: '100%', padding: '10px 0' }}
      onClick={() => onChange(!value)}
    >
      <span>{label}</span>
      <span
        style={{
          width: 46,
          height: 26,
          borderRadius: 999,
          border: '1px solid var(--line-strong)',
          background: value ? 'var(--gold-dim)' : 'transparent',
          position: 'relative',
          transition: 'background 0.2s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: value ? '#f6e3b4' : 'var(--faint)',
            transition: 'left 0.18s ease',
          }}
        />
      </span>
    </button>
  );
}
