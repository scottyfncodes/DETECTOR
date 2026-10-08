/**
 * The title screen's living backdrop: the real Old Park, built by the same
 * buildFieldScene the game walks, seen from where a new player arrives, with
 * the carried detector sweeping in front of you. Each time the coil passes
 * one spot in the turf a ring pulses out from it — the visual half of a
 * beep, since audio may not start before the player taps.
 *
 * Lazy-loaded by TitleScreen so Three.js stays out of the main bundle; it
 * doubles as a warm-up for the first real field.
 */
import * as THREE from 'three';
import { getLocation } from '@/content/locations';
import { game } from '@/core/gameState';
import { yawFromBearing } from '@/systems/survey';
import { startLoop } from '@/engine/loop';
import { QualityGovernor } from '@/engine/quality';
import { buildDetectorProp } from './build';
import { buildFieldScene, fieldToWorld } from './buildField';

const LOCATION_ID = 'loc_old_park';
const SEED = 0x7e7ec7;
const EYE_HEIGHT = 1.66;
const FOV = 72;
/** Slower than the game's sweep: a stroll, not a search. */
const SWEEP_RATE = 1.5;
/** Where in the sweep the buried "something" sits (sin of the sweep phase). */
const PING_AT = 0.3;
const RING_LIFE = 1.15;

export interface TitleView {
  stop(): void;
}

export interface TitleViewOptions {
  /** Draw one still frame and stop — prefers-reduced-motion. */
  still: boolean;
  /** Fired the first time a frame reaches the canvas. */
  onReady(): void;
  /** Fired on each pass over the spot, for the HUD to echo. */
  onPing(): void;
}

export function startTitleView(canvas: HTMLCanvasElement, host: HTMLElement, opts: TitleViewOptions): TitleView | null {
  const location = getLocation(LOCATION_ID);
  if (!location) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    // No WebGL: the title's own dusk gradient stands in.
    return null;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // A touch under the game's exposure: the park late in the day.
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const built = buildFieldScene(location, SEED);
  built.refreshStates(game.get().save);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 400);
  camera.rotation.order = 'YXZ';
  const detector = buildDetectorProp();
  // Reached further out than in play: tipped up about the eye, the far coil
  // rises into the open middle of the frame while the grip stays out of it,
  // so the sweep happens above the button rather than under it.
  detector.root.rotation.x = 0.4;
  // The forearm and grip sit right against the lens; at title framing they
  // only block the field, so just the sweeping shaft and coil are drawn.
  for (const part of detector.root.children) part.visible = part === detector.coilSwing;
  camera.add(detector.root);
  built.scene.add(camera);

  const px = fieldToWorld(location.bounds.w / 2, built.halfWidth);
  const pz = fieldToWorld(location.bounds.h / 2, built.halfHeight);
  const baseYaw = yawFromBearing(location.arrivalBearing ?? 0);
  const eyeY = EYE_HEIGHT + built.groundAt(px, pz);

  // The ping: two thin rings that ripple out of the coil, in its own plane,
  // each time it passes over the spot.
  const coil = detector.coilSwing.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.TorusGeometry);
  const ringGeometry = new THREE.RingGeometry(0.15, 0.17, 48);
  const rings = [0, 1].map((i) => {
    const mesh = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xf2c46a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    if (coil) {
      mesh.position.copy(coil.position);
      mesh.rotation.copy(coil.rotation);
    }
    mesh.renderOrder = 5;
    mesh.visible = false;
    detector.coilSwing.add(mesh);
    return { mesh, t: RING_LIFE, delay: i * 0.22 };
  });

  const governor = new QualityGovernor((level) => {
    if (level >= 1) renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    if (level >= 2) {
      built.scene.traverse((obj) => {
        if ((obj as THREE.Light).isLight) obj.castShadow = false;
      });
    }
  });

  let lastW = 0;
  let lastH = 0;
  const fit = () => {
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // A portrait phone gets a touch more sky and ground than play does.
    camera.fov = w < h ? FOV + 6 : FOV;
    camera.updateProjectionMatrix();
  };

  /** Starts both rings off the coil, `age` seconds in. */
  const ping = (age: number) => {
    for (const r of rings) r.t = age - r.delay;
  };

  let sweepPhase = 0.6;
  let lastSin = Math.sin(sweepPhase);
  let ready = false;

  const frame = (dt: number, elapsed: number) => {
    fit();
    governor.sample(dt);

    // Standing still, breathing: the view drifts a hair, the coil does the work.
    const yaw = baseYaw + Math.sin(elapsed * 0.13) * 0.05;
    camera.position.set(px, eyeY + Math.sin(elapsed * 1.1) * 0.006, pz);
    camera.rotation.y = -yaw;
    camera.rotation.x = -0.2 + Math.sin(elapsed * 0.21) * 0.01;

    sweepPhase += dt * SWEEP_RATE;
    const s = Math.sin(sweepPhase);
    detector.coilSwing.rotation.y = s * 0.5;

    // Over the spot, either direction.
    if ((lastSin - PING_AT) * (s - PING_AT) <= 0 && dt > 0) {
      ping(0);
      opts.onPing();
    }
    lastSin = s;

    for (const r of rings) {
      r.t += dt;
      const k = r.t / RING_LIFE;
      const live = k >= 0 && k < 1;
      r.mesh.visible = live;
      if (!live) continue;
      const scale = 1 + k * 2.4;
      r.mesh.scale.set(scale, scale, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k) * 0.95;
    }

    built.update(dt, elapsed);
    renderer.render(built.scene, camera);
    if (!ready) {
      ready = true;
      opts.onReady();
    }
  };

  let loop: { stop(): void } | null = null;
  if (opts.still) {
    // One composed frame: the coil over the spot, the ring just leaving it.
    // Redrawn only when the window changes shape.
    sweepPhase = Math.asin(PING_AT);
    lastSin = Math.sin(sweepPhase);
    ping(RING_LIFE * 0.4);
    const redraw = () => frame(0, 0);
    redraw();
    window.addEventListener('resize', redraw);
    loop = { stop: () => window.removeEventListener('resize', redraw) };
  } else {
    loop = startLoop(frame);
  }

  return {
    stop() {
      loop?.stop();
      // The camera, and the detector and rings on it, are in the scene.
      built.dispose();
      renderer.dispose();
      // Hand the GPU straight to the field: phones cap live WebGL contexts,
      // and the game builds its own the moment the title goes.
      renderer.forceContextLoss();
    },
  };
}
