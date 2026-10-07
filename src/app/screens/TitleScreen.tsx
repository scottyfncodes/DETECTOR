import { enterLocation, game, go, markIntroSeen, notice } from '@/core/gameState';
import { audio } from '@/engine/audio';
import { haptics } from '@/engine/haptics';
import { Btn } from '../components/ui';

export function TitleScreen() {
  const save = game.get().save;
  const returning = save.discoveries.length > 0;

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
    <div className="title-screen">
      <h1 className="title-screen__logo">DETECTOR</h1>
      <div className="title-screen__rule" />
      <p className="title-screen__tag">
        Most of what the ground gives up is rubbish.
        <br />
        Some of it is the first piece of something much bigger.
      </p>
      <Btn variant="primary" onClick={begin} sound="open">
        {returning ? 'Continue' : 'Begin'}
      </Btn>
      {returning ? (
        <p className="tiny" style={{ marginTop: 18 }}>
          Your journal is where you left it.
        </p>
      ) : (
        <p className="tiny" style={{ marginTop: 18 }}>
          Headphones recommended. Sound is how you find things.
        </p>
      )}
    </div>
  );
}
