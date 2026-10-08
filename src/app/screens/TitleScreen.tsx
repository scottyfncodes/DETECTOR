import { useEffect, useRef, useState } from 'react';
import { enterLocation, game, go, markIntroSeen, notice } from '@/core/gameState';
import { audio } from '@/engine/audio';
import { haptics } from '@/engine/haptics';
import { Btn } from '../components/ui';

/**
 * The opening frame is the game: the real Old Park behind the title, the
 * detector sweeping, a ring rising out of the turf each time the coil passes
 * something. Sound waits for the tap; the headphones cue pulses in its place.
 */
export function TitleScreen() {
  const save = game.get().save;
  const returning = save.discoveries.length > 0;

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const [worldReady, setWorldReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    let view: { stop(): void } | null = null;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Three.js is a lazy chunk: the title's dusk gradient holds the frame
    // until the field is drawn, then the field fades up behind the words.
    import('@/engine/scene3d/titleView')
      .then(({ startTitleView }) => {
        if (cancelled) return;
        view = startTitleView(canvas, host, {
          still,
          onReady: () => setWorldReady(true),
          onPing: () => {
            const cue = cueRef.current;
            if (!cue) return;
            cue.classList.remove('title-sound--ping');
            // Restart the pulse animation on every pass.
            void cue.offsetWidth;
            cue.classList.add('title-sound--ping');
          },
        });
      })
      .catch(() => {
        // Offline mid-load or no WebGL: the gradient title still works.
      });

    return () => {
      cancelled = true;
      view?.stop();
    };
  }, []);

  const begin = () => {
    // Audio has to be created inside the gesture that starts the game.
    audio.unlock();
    audio.setEnabled(save.settings.sound);
    haptics.setEnabled(save.settings.haptics);
    markIntroSeen();
    if (returning) {
      go('map');
    } else {
      enterLocation('loc_old_park');
      notice('Your detector is picking something up.');
    }
  };

  return (
    <div className="title-screen" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className={`title-screen__world ${worldReady ? 'title-screen__world--ready' : ''}`}
        data-testid="title-world"
        aria-hidden="true"
      />
      <div className="title-screen__shade" aria-hidden="true" />

      <header className="title-screen__head">
        <h1 className="title-screen__logo">DETECTOR</h1>
        <p className="title-screen__premise">
          Sweep the field. Listen for the signal. Dig up what connects.
        </p>
      </header>

      <div className="title-screen__foot">
        <div ref={cueRef} className="title-sound" data-testid="sound-cue">
          <HeadphonesGlyph />
          <span>Play with sound on — the detector talks through your ears.</span>
        </div>
        <Btn variant="primary" wide className="title-screen__cta" onClick={begin} sound="open">
          {returning ? 'Keep sweeping' : 'Start sweeping'}
        </Btn>
        {returning ? <p className="title-screen__resume">Your journal is where you left it.</p> : null}
      </div>
    </div>
  );
}

function HeadphonesGlyph() {
  return (
    <svg className="title-sound__icon" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 19v-3a10 10 0 0 1 20 0v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="18" width="6" height="9" rx="2" fill="currentColor" />
      <rect x="22" y="18" width="6" height="9" rx="2" fill="currentColor" />
    </svg>
  );
}
