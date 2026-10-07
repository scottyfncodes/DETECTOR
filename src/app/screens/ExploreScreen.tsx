import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getSite } from '@/content/sites';
import type { DetectorDig, SiteInteractable } from '@/content/sites/types';
import { LOCATIONS, getLocation } from '@/content/locations';
import { getTarget } from '@/content/targets';
import {
  addSiteFlag,
  beginDig,
  bumpStat,
  completeObservation,
  currentDetector,
  enterLocation,
  game,
  hasEquipment,
  leaveSite,
  notice,
  savePlayerPosition,
} from '@/core/gameState';
import type { PlacedTarget, SceneryClue, TargetDef } from '@/core/types';
import { clamp, clamp01, lerp } from '@/core/rng';
import { beepInterval, digTolerance, readout, sampleField, targetSignal, toneOf } from '@/systems/detection';
import {
  buildColliders,
  isInteractableAvailable,
  nearestInteractable,
  sweepCoilPosition,
  type Collider,
  type PlayerState,
  stepPlayer,
} from '@/systems/explore';
import { nearestLandmarkNotice, nearestNamedLandmark } from '@/systems/landmarks';
import { bearingFromYaw, compassPoint, yawFromBearing } from '@/systems/survey';
import { discoveryTier, resolveObservation } from '@/systems/discovery';
import { buildDetectorProp, buildSiteScene } from '@/engine/scene3d/build';
import { buildFieldScene, fieldToWorld, worldToField } from '@/engine/scene3d/buildField';
import { audio } from '@/engine/audio';
import { music } from '@/engine/music';
import { haptics } from '@/engine/haptics';
import { capturePointer, LookController, MoveController } from '@/engine/input';
import { startLoop } from '@/engine/loop';
import { publishDetectorFrame, publishExploreFrame } from '@/core/debug';
import { useGameState } from '../useGame';
import { Btn } from '../components/ui';

// One pace, one detector, everywhere — a field and an authored site should
// never feel like different games wearing the same UI.
const WALK_SPEED = 2.15; // m/s
const EYE_HEIGHT = 1.66;
const SWEEP_RATE = 2.35; // rad/s
const SWEEP_WIDTH = 0.46; // metres either side at full amplitude
const COIL_FORWARD = 0.62; // metres ahead of the player
const MARK_LIFETIME = 6; // seconds a pinpoint mark stays diggable after release
const FOV = 72;

interface Dominant {
  dig: DetectorDig;
  def: TargetDef;
  strength: number;
  distCm: number;
}

interface Prompt {
  label: string;
  act: () => void;
}

interface FieldActions {
  setPinpoint(on: boolean): void;
  dig(): void;
}

/**
 * The held breath before a discovery: the camera eases onto the thing, the
 * frame narrows and darkens at the edges, and only then does the card come.
 * Ordinary finds skip it entirely — the contrast is the point.
 */
interface Focus {
  fromYaw: number;
  fromPitch: number;
  toYaw: number;
  toPitch: number;
  t: number;
  dur: number;
  then: () => void;
  fired: boolean;
}

/** Max knob travel inside a touchpad ring, in pixels — matches the CSS pad size. */
const TOUCHPAD_KNOB_MAX = 30;

/** Fields whose title card has already played this session — coming back from a dig is not an arrival. */
const titledThisSession = new Set<string>();

function updateTouchpadVisuals(
  els: { movePad: HTMLDivElement | null; moveKnob: HTMLDivElement | null; lookPad: HTMLDivElement | null; lookKnob: HTMLDivElement | null },
  moveActive: boolean,
  moveX: number,
  moveY: number,
  lookActive: boolean,
  lookX: number,
  lookY: number,
): void {
  if (els.movePad && els.moveKnob) {
    els.movePad.classList.toggle('touchpad--active', moveActive);
    els.moveKnob.style.transform = `translate(${moveX * TOUCHPAD_KNOB_MAX}px, ${moveY * TOUCHPAD_KNOB_MAX}px)`;
  }
  if (els.lookPad && els.lookKnob) {
    els.lookPad.classList.toggle('touchpad--active', lookActive);
    const nx = clamp(lookX, -TOUCHPAD_KNOB_MAX, TOUCHPAD_KNOB_MAX);
    const ny = clamp(lookY, -TOUCHPAD_KNOB_MAX, TOUCHPAD_KNOB_MAX);
    els.lookKnob.style.transform = `translate(${nx}px, ${ny}px)`;
  }
}

/** Pure DOM writes for the heading strip — nothing React needs to know per frame. */
function updateCompass(
  els: { strip: HTMLDivElement | null; tape: HTMLDivElement | null; heading: HTMLDivElement | null },
  yaw: number,
): void {
  if (!els.strip || !els.tape || !els.heading) return;
  const bearing = bearingFromYaw(yaw);
  const width = els.strip.clientWidth || 1;
  const pxPerDeg = width / 120;
  els.strip.style.setProperty('--px-per-deg', `${pxPerDeg}px`);
  els.tape.style.transform = `translateX(${-bearing * pxPerDeg}px)`;
  const rounded = Math.round(bearing) % 360;
  els.heading.textContent = `${rounded.toString().padStart(3, '0')}° ${compassPoint(rounded)}`;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

interface Hud {
  /** The single contextual button: a find (observe/pickup), a note (landmark), or a dig. */
  promptLabel: string | null;
  promptKind: 'find' | 'note' | 'dig' | null;
  /** Named landmark the player is standing at, for the place chip. */
  nearName: string | null;
  showIntro: boolean;
  titleCard: boolean;
  pinpointing: boolean;
  marked: boolean;
  remaining: number;
  hint: string | null;
  compass: boolean;
}

function ExploreScreenImpl() {
  const { save } = useGameState(); // subscribe so notice()/save changes re-render the overlay
  const activeSiteId = game.get().activeSite;
  const site = activeSiteId ? getSite(activeSiteId) : undefined;
  const field = !site ? save.field : null;
  const location = field ? getLocation(field.locationId) : undefined;
  const mode: 'site' | 'field' | null = site ? 'site' : field && location ? 'field' : null;
  const teaching = !save.flags.tutorialFound;

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moveZoneRef = useRef<HTMLDivElement>(null);
  const lookZoneRef = useRef<HTMLDivElement>(null);
  const movePadRef = useRef<HTMLDivElement>(null);
  const moveKnobRef = useRef<HTMLDivElement>(null);
  const lookPadRef = useRef<HTMLDivElement>(null);
  const lookKnobRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef(new MoveController());
  const lookRef = useRef(new LookController());
  const promptRef = useRef<Prompt | null>(null);
  const fieldActionsRef = useRef<FieldActions | null>(null);

  const [hud, setHud] = useState<Hud>({
    promptLabel: null,
    promptKind: null,
    nearName: null,
    showIntro: true,
    titleCard: false,
    pinpointing: false,
    marked: false,
    remaining: 0,
    hint: null,
    compass: hasEquipment('tool_compass'),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    const moveZone = moveZoneRef.current;
    const lookZone = lookZoneRef.current;
    if (!canvas || !host || !moveZone || !lookZone) return;
    if (mode === null) {
      leaveSite();
      return;
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Far plane comfortably past the sky dome (built at a fixed radius of 320)
    // so it never gets near-clipped away, even though fog hides real geometry
    // long before that distance.
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 400);
    camera.rotation.order = 'YXZ';

    // The detector is carried everywhere — same model, same audio, whether
    // you're sweeping open ground or standing in an authored ruin.
    const detectorProp = buildDetectorProp();
    camera.add(detectorProp.root);

    const detachMove = moveRef.current.attach(moveZone);
    const detachLook = lookRef.current.attach(lookZone);
    const touchpadEls = {
      movePad: movePadRef.current,
      moveKnob: moveKnobRef.current,
      lookPad: lookPadRef.current,
      lookKnob: lookKnobRef.current,
    };
    const compassEls = { strip: compassRef.current, tape: tapeRef.current, heading: headingRef.current };
    const vignette = vignetteRef.current;
    audio.unlock();

    let lastW = 0;
    let lastH = 0;
    let loop: { stop(): void };
    let disposeScene: () => void;
    let focus: Focus | null = null;
    let shake = 0;
    // The arrival card waits for the first rendered frame: building the scene
    // can take a real moment on a phone, and the card should play over the
    // place it names, not over a blank canvas.
    let titlePending = mode === 'field' && !!field && !titledThisSession.has(`${field.locationId}:${field.seed}`);
    if (mode === 'field' && field) titledThisSession.add(`${field.locationId}:${field.seed}`);
    let titleTimer: ReturnType<typeof setTimeout> | undefined;
    const arrive = () => {
      if (!titlePending) return;
      titlePending = false;
      setHud((prev) => ({ ...prev, titleCard: true }));
      titleTimer = setTimeout(() => setHud((prev) => ({ ...prev, titleCard: false })), 3600);
    };

    const fit = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w !== lastW || h !== lastH) {
        lastW = w;
        lastH = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    };

    /** Runs the focus beat for a frame. Returns true while it owns the camera. */
    const runFocus = (player: PlayerState, dt: number): boolean => {
      if (!focus) {
        // Let the frame breathe back out after a beat that stayed in the world.
        if (Math.abs(camera.fov - FOV) > 0.01) {
          camera.fov = lerp(camera.fov, FOV, clamp01(dt * 4));
          camera.updateProjectionMatrix();
        }
        if (Math.abs(renderer.toneMappingExposure - 1.15) > 0.001) {
          renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, 1.15, clamp01(dt * 4));
        }
        if (vignette && vignette.style.opacity !== '0') {
          const current = parseFloat(vignette.style.opacity || '0');
          vignette.style.opacity = current < 0.02 ? '0' : `${lerp(current, 0, clamp01(dt * 4))}`;
        }
        return false;
      }
      focus.t += dt;
      const k = easeInOut(clamp01(focus.t / focus.dur));
      player.yaw = lerpAngle(focus.fromYaw, focus.toYaw, k);
      player.pitch = lerp(focus.fromPitch, focus.toPitch, k);
      camera.fov = lerp(FOV, 58, k);
      camera.updateProjectionMatrix();
      renderer.toneMappingExposure = lerp(1.15, 0.8, k);
      if (vignette) vignette.style.opacity = `${k * 0.85}`;
      if (focus.t >= focus.dur && !focus.fired) {
        focus.fired = true;
        const then = focus.then;
        setTimeout(then, 60);
      }
      return true;
    };

    /**
     * Begins a focus beat toward a world position. The commit (navigating to
     * the discovery card) fires when the beat lands.
     */
    const startFocus = (player: PlayerState, target: { x: number; y: number; z: number }, dur: number, then: () => void) => {
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const dy = target.y - camera.position.y;
      const horizontal = Math.max(0.2, Math.hypot(dx, dz));
      focus = {
        fromYaw: player.yaw,
        fromPitch: player.pitch,
        toYaw: Math.atan2(dx, -dz),
        toPitch: clamp(Math.atan2(dy - EYE_HEIGHT * 0.15, horizontal), -1.0, 0.8),
        t: 0,
        dur,
        then,
        fired: false,
      };
      setHud((prev) => ({ ...prev, promptLabel: null, promptKind: null }));
    };

    /**
     * Looking at (or picking up) something: a dry run of the discovery
     * decides how big the moment is, and the beat is sized to match.
     */
    const observe = (
      player: PlayerState,
      def: TargetDef,
      locationId: string,
      at: { x: number; y: number; z: number },
      grantsEquipment?: string,
    ) => {
      const input = { def, locationId, grantsEquipment };
      const tier = discoveryTier(resolveObservation(game.get().save, input).outcome);
      const commit = () => completeObservation(input);
      audio.ui('tap');
      haptics.tap();
      if (tier === 'minor') {
        commit();
        return;
      }
      const dur = tier === 'notable' ? 0.75 : 1.3;
      audio.swell(dur);
      if (tier !== 'notable') haptics.contact();
      startFocus(player, at, dur, commit);
    };

    if (mode === 'site' && site) {
      const hostLocation = LOCATIONS.find((l) => l.siteId === site.id);
      const hostLocationId = hostLocation?.id ?? site.id;

      const built = buildSiteScene(site);
      built.scene.add(camera);
      disposeScene = built.dispose;
      const colliders: Collider[] = buildColliders(site.props);
      const player: PlayerState = { x: site.spawn.x, z: site.spawn.z, yaw: site.spawnYaw, pitch: 0 };

      const refreshVisibility = () => {
        const s = game.get().save;
        const state = { siteProgress: s.siteProgress, discovered: s.discoveries.map((d) => d.targetId) };
        for (const it of site.interactables) {
          const mesh = built.interactableMeshes.get(it.id);
          if (mesh) mesh.visible = isInteractableAvailable(it, state);
        }
      };
      refreshVisibility();

      const interact = (it: SiteInteractable) => {
        if (it.kind === 'observe' || it.kind === 'pickup') {
          const def = it.targetId ? getTarget(it.targetId) : undefined;
          if (it.setsFlagOnUse) addSiteFlag(it.setsFlagOnUse);
          if (def) {
            observe(player, def, hostLocationId, { x: it.position.x, y: it.position.y + 0.8, z: it.position.z }, it.grantsEquipment);
          }
          return;
        }
        audio.ui('tap');
        haptics.tap();
        if (it.kind === 'notice') {
          if (it.flavor) notice(it.flavor, 6500);
          if (it.setsFlagOnUse) addSiteFlag(it.setsFlagOnUse);
          audio.note();
          refreshVisibility();
          return;
        }
        if (it.kind === 'fit') {
          const ready = it.requiresTargetId
            ? game.get().save.discoveries.some((d) => d.targetId === it.requiresTargetId)
            : true;
          if (ready) {
            if (it.setsFlagOnUse) addSiteFlag(it.setsFlagOnUse);
            if (it.flavor) notice(it.flavor, 6500);
            refreshVisibility();
            // Whatever this unlocks comes up out of the ground, slowly, with
            // the sound of stone on stone — the court was hiding it all along.
            const risers = site.interactables.filter((o) => o.requiresFlag && o.requiresFlag === it.setsFlagOnUse);
            if (risers.length) {
              audio.grind(2.8);
              haptics.danger();
              shake = 1;
              // The camera turns to watch it happen, then is handed back.
              const r0 = risers[0]!;
              startFocus(player, { x: r0.position.x, y: r0.position.y + 0.9, z: r0.position.z }, 1.1, () => {
                focus = null;
              });
              setTimeout(() => {
                Promise.all(risers.map((r) => built.rise(r.id, 1.9, 2.8))).then(() => {
                  audio.reveal(true);
                  haptics.reveal();
                  music.motif('major');
                });
              }, 500);
            } else {
              audio.mechanism();
              haptics.contact();
            }
          } else {
            notice('Nothing to fit here yet.');
            audio.ui('deny');
          }
          refreshVisibility();
        }
      };

      const digHere = (d: Dominant) => {
        audio.unlock();
        const tol = digTolerance(d.def, currentDetector());
        beginDig({
          locationId: hostLocationId,
          targetUid: `site_${d.dig.id}`,
          targetId: d.dig.targetId,
          accuracy: clamp01(1 - d.distCm / tol) * 0.9 + 0.1,
          offsetAngle: Math.atan2(
            d.dig.position.z * 100 - player.z * 100,
            d.dig.position.x * 100 - player.x * 100,
          ),
          baseCondition: d.dig.baseCondition,
          depthCm: d.dig.depthCm,
          digX: player.x * 100,
          digY: player.z * 100,
          seed: `${site.id}_${d.dig.id}`,
        });
      };

      audio.ambience(site.ambience);
      music.setScene(site.ambience);

      let lastBeep = 0;
      let bobPhase = 0;
      let lastHazardWarnAt = -10;
      let lastPromptLabel: string | null = null;
      let lookNudgeX = 0;
      let lookNudgeY = 0;
      let tensionTick = 0;

      loop = startLoop((dt, elapsed) => {
        fit();
        const currentSave = game.get().save;
        const discovered = currentSave.discoveries.map((d) => d.targetId);

        const move = moveRef.current;
        const look = lookRef.current.consume(dt);
        const focusing = runFocus(player, dt);

        const result = stepPlayer(player, {
          dt,
          moveX: !focusing && move.magnitude > 0.02 ? move.vector.x : 0,
          moveY: !focusing && move.magnitude > 0.02 ? -move.vector.y : 0,
          yawDelta: focusing ? 0 : look.yaw,
          pitchDelta: focusing ? 0 : look.pitch,
          speed: WALK_SPEED,
          colliders,
          bounds: site.radius,
          hazards: site.hazards,
          siteProgress: currentSave.siteProgress,
        });

        if (result.hazard && elapsed - lastHazardWarnAt > 3.2) {
          lastHazardWarnAt = elapsed;
          notice(result.hazard.warning);
          haptics.danger();
        }

        bobPhase += dt * (move.magnitude > 0.05 && !focusing ? 7.2 : 0);
        const bob = move.magnitude > 0.05 && !focusing ? Math.sin(bobPhase) * 0.028 : 0;
        shake = Math.max(0, shake - dt * 0.55);
        const sx = shake > 0 ? (Math.sin(elapsed * 41) * 0.02 + Math.sin(elapsed * 67) * 0.012) * shake : 0;
        const sy = shake > 0 ? Math.sin(elapsed * 53) * 0.016 * shake : 0;

        camera.position.set(player.x + sx, EYE_HEIGHT + bob + sy, player.z);
        camera.rotation.y = -player.yaw;
        camera.rotation.x = player.pitch;
        detectorProp.coilSwing.rotation.y = Math.sin(bobPhase * 0.5) * 0.08;

        lookNudgeX = lerp(lookNudgeX + look.yaw * 240, 0, clamp01(dt * 6));
        lookNudgeY = lerp(lookNudgeY - look.pitch * 240, 0, clamp01(dt * 6));
        updateTouchpadVisuals(touchpadEls, move.magnitude > 0.03, move.vector.x, move.vector.y, lookRef.current.active, lookNudgeX, lookNudgeY);
        updateCompass(compassEls, player.yaw);

        const state = { siteProgress: currentSave.siteProgress, discovered };
        const target = focusing ? null : nearestInteractable(player.x, player.z, player.yaw, site.interactables, state);

        const detector = currentDetector();
        let dominant: Dominant | null = null;
        for (const dig of site.detectorDigs) {
          if (discovered.includes(dig.targetId)) continue;
          const def = getTarget(dig.targetId);
          if (!def) continue;
          const placed: PlacedTarget = {
            uid: dig.id,
            targetId: dig.targetId,
            x: dig.position.x * 100,
            y: dig.position.z * 100,
            depth: dig.depthCm,
            baseCondition: dig.baseCondition,
            dug: false,
          };
          const strength = targetSignal(player.x * 100, player.z * 100, placed, def, detector);
          const distCm = Math.hypot(dig.position.x * 100 - player.x * 100, dig.position.z * 100 - player.z * 100);
          if (!dominant || strength > dominant.strength) dominant = { dig, def, strength, distCm };
        }

        if (dominant && dominant.strength > 0.02) {
          const interval = beepInterval(dominant.strength);
          const nowMs = elapsed * 1000;
          if (Number.isFinite(interval) && nowMs - lastBeep >= interval) {
            lastBeep = nowMs;
            audio.beep(toneOf(dominant.def.material), dominant.strength);
            haptics.signal(dominant.strength);
          }
        }
        tensionTick += dt;
        if (tensionTick > 0.15) {
          tensionTick = 0;
          music.setTension(dominant ? dominant.strength * 0.8 : 0);
        }
        music.tick(dt);

        const canDig =
          !!dominant && dominant.strength > 0.3 && dominant.distCm <= digTolerance(dominant.def, detector) * 1.1;

        let promptLabel: string | null = null;
        let promptKind: Hud['promptKind'] = null;
        if (target) {
          promptLabel = target.prompt;
          promptKind = target.kind === 'notice' ? 'note' : 'find';
          promptRef.current = { label: target.prompt, act: () => interact(target) };
        } else if (canDig && dominant && !focusing) {
          promptLabel = 'Dig here';
          promptKind = 'dig';
          const snapshot = dominant;
          promptRef.current = { label: 'Dig here', act: () => digHere(snapshot) };
        } else {
          promptRef.current = null;
        }

        if (promptLabel !== lastPromptLabel) {
          lastPromptLabel = promptLabel;
          setHud((prev) => (prev.promptLabel === promptLabel ? prev : { ...prev, promptLabel, promptKind }));
        }

        publishExploreFrame({ x: player.x, z: player.z, yaw: player.yaw, promptLabel });

        built.update(dt, elapsed);
        renderer.render(built.scene, camera);
      });
    } else if (location && field) {
      const built = buildFieldScene(location, field.seed);
      built.scene.add(camera);
      disposeScene = built.dispose;
      built.refreshStates(game.get().save);
      // A return from a dig faces the way the player was facing. A fresh
      // arrival faces the place's composed opening view, eyes a touch below
      // the horizon, so the first frame is the ground and what stands on it.
      const arrivalYaw = yawFromBearing(location.arrivalBearing ?? 0);
      const player: PlayerState = {
        x: fieldToWorld(field.playerX, built.halfWidth),
        z: fieldToWorld(field.playerY, built.halfHeight),
        yaw: field.playerYaw ?? arrivalYaw,
        pitch: field.playerYaw === undefined ? -0.07 : 0,
      };

      let sweepPhase = 0;
      let sweepAmp = 1;
      let lastSweepSign = 1;
      let signal = 0;
      let pinpointing = false;
      let mark: { x: number; y: number; at: number } | null = null;
      let coilXcm = field.playerX;
      let coilYcm = field.playerY;
      let dominantUid: string | null = null;
      const loudTargets = new Set<string>();

      const setPinpoint = (on: boolean) => {
        pinpointing = on;
        if (on) {
          audio.unlock();
          haptics.tap();
        }
        setHud((prev) => ({ ...prev, pinpointing: on, marked: on ? true : prev.marked }));
      };

      const digHere = () => {
        const detector = currentDetector();
        const digXcm = mark ? mark.x : coilXcm;
        const digYcm = mark ? mark.y : coilYcm;

        let best: { uid: string; targetId: string; dist: number; tolerance: number } | null = null;
        for (const t of field.targets) {
          if (t.dug) continue;
          const def = getTarget(t.targetId);
          if (!def) continue;
          const dist = Math.hypot(t.x - digXcm, t.y - digYcm);
          const tolerance = digTolerance(def, detector);
          if (dist > tolerance) continue;
          if (!best || dist < best.dist) best = { uid: t.uid, targetId: t.targetId, dist, tolerance };
        }

        audio.unlock();
        if (!best) {
          beginDig({
            locationId: field.locationId,
            targetUid: null,
            targetId: null,
            accuracy: 0,
            offsetAngle: 0,
            baseCondition: 100,
            depthCm: 0,
            digX: digXcm,
            digY: digYcm,
            seed: `${field.seed}_${Math.round(digXcm)}_${Math.round(digYcm)}`,
          });
          return;
        }

        const placed = field.targets.find((t) => t.uid === best!.uid)!;
        beginDig({
          locationId: field.locationId,
          targetUid: placed.uid,
          targetId: placed.targetId,
          accuracy: clamp01(1 - best.dist / best.tolerance) * 0.9 + 0.1,
          offsetAngle: Math.atan2(placed.y - digYcm, placed.x - digXcm),
          baseCondition: placed.baseCondition,
          depthCm: placed.depth,
          digX: digXcm,
          digY: digYcm,
          seed: `${placed.uid}_${Math.round(digXcm)}`,
          ...(placed.tutorial ? { tutorial: true } : {}),
        });
      };

      fieldActionsRef.current = { setPinpoint, dig: digHere };

      audio.ambience(location.ambience);
      music.setScene(location.ambience);

      let lastBeep = 0;
      let bobPhase = 0;
      let lastSave = 0;
      let lastPromptLabel: string | null = null;
      let hudAccumulator = 0;
      let lookNudgeX = 0;
      let lookNudgeY = 0;
      let tensionTick = 0;
      let eyeY = EYE_HEIGHT + built.groundAt(player.x, player.z);

      loop = startLoop((dt, elapsed) => {
        fit();

        const move = moveRef.current;
        const look = lookRef.current.consume(dt);
        const focusing = runFocus(player, dt);
        const speed = WALK_SPEED * (pinpointing ? 0.42 : 1);

        stepPlayer(player, {
          dt,
          moveX: !focusing && move.magnitude > 0.02 ? move.vector.x : 0,
          moveY: !focusing && move.magnitude > 0.02 ? -move.vector.y : 0,
          yawDelta: focusing ? 0 : look.yaw,
          pitchDelta: focusing ? 0 : look.pitch,
          speed,
          colliders: built.colliders,
          bounds: { halfWidth: built.halfWidth, halfHeight: built.halfHeight },
          hazards: [],
          siteProgress: [],
        });

        // ── sweep ─────────────────────────────────────────────────────
        sweepAmp = lerp(sweepAmp, pinpointing ? 0.06 : 1, dt * 6);
        sweepPhase += dt * SWEEP_RATE * (pinpointing ? 0.3 : 1);
        const sign = Math.sign(Math.cos(sweepPhase)) || 1;
        if (sign !== lastSweepSign) {
          lastSweepSign = sign;
          if (!pinpointing) bumpStat('sweeps');
        }

        const coilWorld = sweepCoilPosition(player.x, player.z, player.yaw, sweepPhase, {
          forward: COIL_FORWARD,
          width: SWEEP_WIDTH,
          amp: sweepAmp,
        });
        coilXcm = worldToField(coilWorld.x, built.halfWidth);
        coilYcm = worldToField(coilWorld.z, built.halfHeight);

        if (pinpointing) {
          mark = { x: coilXcm, y: coilYcm, at: elapsed };
        } else if (mark) {
          const stale = elapsed - mark.at > MARK_LIFETIME;
          const walkedOff = Math.hypot(coilXcm - mark.x, coilYcm - mark.y) > 180;
          if (stale || walkedOff) mark = null;
        }

        // ── signal ────────────────────────────────────────────────────
        const detector = currentDetector();
        const sample = sampleField(field, coilXcm, coilYcm, detector, elapsed, { pinpointing });
        signal = lerp(signal, sample.noisy, clamp01(dt * 14));
        const read = sample.dominant ? readout(sample.dominant, detector, signal) : null;
        const tone = read?.tone ?? 'iron';

        const interval = beepInterval(signal);
        const nowMs = elapsed * 1000;
        if (Number.isFinite(interval) && nowMs - lastBeep >= interval) {
          lastBeep = nowMs;
          audio.beep(tone, signal);
          haptics.signal(signal);
        }

        if (sample.dominant && signal > 0.55 && !loudTargets.has(sample.dominant.target.uid)) {
          loudTargets.add(sample.dominant.target.uid);
          bumpStat('signalsFound');
        }
        dominantUid = sample.dominant?.target.uid ?? null;

        tensionTick += dt;
        if (tensionTick > 0.15) {
          tensionTick = 0;
          music.setTension(signal * 0.85 + (tone === 'odd' && signal > 0.2 ? 0.35 : 0));
        }
        music.tick(dt);

        // ── camera + carried detector ────────────────────────────────
        bobPhase += dt * (move.magnitude > 0.05 && !focusing ? 7.2 : 0);
        const bob = move.magnitude > 0.05 && !focusing ? Math.sin(bobPhase) * 0.028 : 0;
        const groundY = built.groundAt(player.x, player.z);
        eyeY = lerp(eyeY, EYE_HEIGHT + groundY, clamp01(dt * 9));
        camera.position.set(player.x, eyeY + bob, player.z);
        camera.rotation.y = -player.yaw;
        camera.rotation.x = player.pitch;
        detectorProp.coilSwing.rotation.y = Math.sin(sweepPhase) * 0.5 * sweepAmp;

        lookNudgeX = lerp(lookNudgeX + look.yaw * 240, 0, clamp01(dt * 6));
        lookNudgeY = lerp(lookNudgeY - look.pitch * 240, 0, clamp01(dt * 6));
        updateTouchpadVisuals(touchpadEls, move.magnitude > 0.03, move.vector.x, move.vector.y, lookRef.current.active, lookNudgeX, lookNudgeY);
        updateCompass(compassEls, player.yaw);

        // ── scenery clues and landmark notes: the OBSERVE half of the field ──
        const currentSave = game.get().save;
        const discoveredIds = currentSave.discoveries.map((d) => d.targetId);
        const playerXcm = worldToField(player.x, built.halfWidth);
        const playerYcm = worldToField(player.z, built.halfHeight);
        let nearestClue: SceneryClue | null = null;
        let nearestDist = Infinity;
        for (const clue of location.sceneryClues ?? []) {
          const known = !clue.requiresClue || currentSave.clues.includes(clue.requiresClue);
          const mesh = built.sceneryMeshes.get(clue.id);
          if (mesh) mesh.visible = known;
          if (!known || discoveredIds.includes(clue.targetId)) continue;
          const wx = fieldToWorld(clue.x, built.halfWidth);
          const wz = fieldToWorld(clue.y, built.halfHeight);
          const dx = wx - player.x;
          const dz = wz - player.z;
          const dist = Math.hypot(dx, dz);
          if (dist > clue.range) continue;
          if (dist > 0.6) {
            const angleToTarget = Math.atan2(dx, -dz);
            let diff = Math.abs(angleToTarget - player.yaw);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff > 0.95) continue;
          }
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestClue = clue;
          }
        }
        const note = nearestClue || focusing ? null : nearestLandmarkNotice(playerXcm, playerYcm, player.yaw, location, currentSave);

        let promptLabel: string | null = null;
        let promptKind: Hud['promptKind'] = null;
        if (nearestClue && !focusing) {
          promptLabel = nearestClue.prompt;
          promptKind = 'find';
          const clue = nearestClue;
          promptRef.current = {
            label: clue.prompt,
            act: () => {
              const def = getTarget(clue.targetId);
              if (!def) return;
              const wx = fieldToWorld(clue.x, built.halfWidth);
              const wz = fieldToWorld(clue.y, built.halfHeight);
              observe(player, def, location.id, { x: wx, y: built.groundAt(wx, wz) + 0.9, z: wz });
            },
          };
        } else if (note) {
          promptLabel = note.prompt;
          promptKind = 'note';
          promptRef.current = {
            label: note.prompt,
            act: () => {
              audio.note();
              haptics.tap();
              notice(note.text, 7500);
              addSiteFlag(note.flag);
              built.refreshStates(game.get().save);
            },
          };
        } else {
          promptRef.current = null;
        }
        if (promptLabel !== lastPromptLabel) {
          lastPromptLabel = promptLabel;
          setHud((prev) => (prev.promptLabel === promptLabel ? prev : { ...prev, promptLabel, promptKind }));
        }

        publishExploreFrame({ x: player.x, z: player.z, yaw: player.yaw, promptLabel });
        publishDetectorFrame({
          x: playerXcm,
          y: playerYcm,
          coilX: coilXcm,
          coilY: coilYcm,
          facing: player.yaw,
          signal,
          pinpointing,
          dominant: dominantUid,
        });

        // ── throttled HUD + persistence ──────────────────────────────
        hudAccumulator += dt;
        if (hudAccumulator > 0.12) {
          hudAccumulator = 0;
          const remaining = field.targets.filter((t) => !t.dug).length;
          const marked = !!mark;
          const hint = teaching ? teachingHint(signal, pinpointing, !!note) : null;
          const nearName = nearestNamedLandmark(playerXcm, playerYcm, location)?.name ?? null;
          setHud((prev) =>
            prev.remaining === remaining && prev.marked === marked && prev.hint === hint && prev.nearName === nearName
              ? prev
              : { ...prev, remaining, marked, hint, nearName },
          );
        }

        if (elapsed - lastSave > 2) {
          lastSave = elapsed;
          savePlayerPosition(playerXcm, playerYcm, player.yaw);
        }

        built.update(dt, elapsed);
        renderer.render(built.scene, camera);
        arrive();
      });

      return () => {
        clearTimeout(titleTimer);
        loop.stop();
        detachMove();
        detachLook();
        renderer.dispose();
        disposeScene();
        savePlayerPosition(worldToField(player.x, built.halfWidth), worldToField(player.z, built.halfHeight), player.yaw);
        audio.ambience(null);
        music.setScene(null);
        promptRef.current = null;
        fieldActionsRef.current = null;
      };
    } else {
      // Neither branch could actually build a scene (e.g. field/location
      // mismatch) — bail out to the map rather than render a blank canvas.
      leaveSite();
      return;
    }

    return () => {
      clearTimeout(titleTimer);
      loop.stop();
      detachMove();
      detachLook();
      renderer.dispose();
      disposeScene();
      audio.ambience(null);
      music.setScene(null);
      promptRef.current = null;
    };
    // The loop owns its own state; it must not be torn down on every store tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, site?.id, field?.locationId, field?.seed]);

  if (mode === null) return null;

  const worldName = mode === 'site' ? site!.name : location!.name;
  const worldSub = mode === 'site' ? site!.subtitle : location!.subtitle;
  const showCompass = hud.compass || hasEquipment('tool_compass');

  return (
    <div className="screen screen--world" ref={hostRef}>
      <canvas ref={canvasRef} className="world" data-testid="explore-canvas" />
      <div ref={vignetteRef} className="vignette" aria-hidden="true" />
      <div ref={moveZoneRef} style={{ position: 'absolute', inset: 0, width: '44%', touchAction: 'none' }} />
      <div ref={lookZoneRef} style={{ position: 'absolute', inset: 0, left: '44%', touchAction: 'none' }} />

      <div ref={movePadRef} className="touchpad touchpad--left" aria-hidden="true">
        <div className="touchpad__glyph">
          <MoveGlyph />
        </div>
        <div ref={moveKnobRef} className="touchpad__knob" />
      </div>
      <div ref={lookPadRef} className="touchpad touchpad--right" aria-hidden="true">
        <div className="touchpad__glyph">
          <LookGlyph />
        </div>
        <div ref={lookKnobRef} className="touchpad__knob" />
      </div>

      <div className="world-ui">
        <div className="world-top">
          <div className="chip" data-testid="place-chip">
            {worldName}
            {hud.nearName ? <span className="chip__near">· {hud.nearName}</span> : null}
          </div>
          <div style={{ flex: 1 }} />
          <Btn small variant="ghost" sound="back" onClick={() => leaveSite()}>
            Leave
          </Btn>
        </div>

        <div ref={compassRef} className={`compass ${showCompass ? '' : 'compass--hidden'}`} data-testid="compass" aria-hidden={!showCompass}>
          <div ref={tapeRef} className="compass__tape">
            <CompassTicks />
          </div>
          <div className="compass__needle" />
          <div ref={headingRef} className="compass__heading">
            000° N
          </div>
        </div>

        {mode === 'field' && hud.titleCard ? (
          <div className="title-card" aria-hidden="true">
            <div className="title-card__name">{worldName}</div>
            <div className="title-card__sub">{worldSub}</div>
          </div>
        ) : null}

        {game.get().notice ? (
          <div style={{ padding: '14px 16px 0', display: 'flex', justifyContent: 'center' }}>
            <div className="notice" data-testid="notice">
              {game.get().notice}
            </div>
          </div>
        ) : null}

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div className={`reticle ${hud.promptLabel ? 'reticle--live' : ''} ${hud.promptKind === 'note' ? 'reticle--note' : ''}`} />
        </div>

        <div className="world-bottom">
          {mode === 'field' && hud.remaining === 0 ? (
            <div className="readout" data-ui="true">
              <div className="label">Ground cleared</div>
              <p className="card__sub" style={{ margin: '4px 0 10px' }}>
                Nothing left down there that this coil can hear.
              </p>
              <Btn
                small
                variant="primary"
                wide
                onClick={() => {
                  enterLocation(location!.id, true);
                  notice('Fresh ground.');
                }}
              >
                Search fresh ground
              </Btn>
            </div>
          ) : null}

          {hud.promptLabel ? (
            <Btn
              variant={hud.promptKind === 'note' ? 'default' : 'primary'}
              wide
              sound="none"
              className={hud.promptKind === 'note' ? 'btn--note' : ''}
              onClick={() => promptRef.current?.act()}
              data-testid="site-interact"
            >
              {hud.promptLabel}
            </Btn>
          ) : mode === 'field' && hud.hint ? (
            <div className="notice" data-testid="hint">
              {hud.hint}
            </div>
          ) : null}

          {mode === 'field' ? (
            <div className="controls">
              <button
                className="btn hold"
                data-ui="true"
                data-testid="pinpoint"
                onPointerDown={(e) => {
                  fieldActionsRef.current?.setPinpoint(true);
                  capturePointer(e.currentTarget, e.pointerId);
                }}
                onPointerUp={() => fieldActionsRef.current?.setPinpoint(false)}
                onPointerCancel={() => fieldActionsRef.current?.setPinpoint(false)}
                onPointerLeave={() => fieldActionsRef.current?.setPinpoint(false)}
              >
                {hud.pinpointing ? 'Holding' : 'Pinpoint'}
              </button>
              <Btn
                variant={hud.marked ? 'primary' : 'default'}
                onClick={() => fieldActionsRef.current?.dig()}
                sound="none"
                data-testid="dig"
              >
                {hud.marked ? 'Dig the mark' : 'Dig here'}
              </Btn>
            </div>
          ) : null}
        </div>

        {mode === 'site' && hud.showIntro ? (
          <div className="site-intro">
            {site!.intro.map((line, i) => (
              <p
                key={i}
                className="serif"
                style={{
                  color: '#cfc7b2',
                  fontSize: i === 0 ? 22 : 16,
                  textAlign: i === 0 ? 'center' : 'left',
                  letterSpacing: i === 0 ? '0.08em' : 'normal',
                  animationDelay: `${0.2 + i * 0.35}s`,
                }}
              >
                {line}
              </p>
            ))}
            <div style={{ marginTop: 20 }}>
              <Btn
                variant="primary"
                wide
                data-testid="explore-begin"
                onClick={() => setHud((prev) => ({ ...prev, showIntro: false }))}
              >
                Begin
              </Btn>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Ticks every 15° from -60° to 420°, so the strip can scroll through north without a seam. */
function CompassTicks() {
  const ticks: { deg: number; major: boolean; label: string | null }[] = [];
  for (let deg = -60; deg <= 420; deg += 15) {
    const norm = ((deg % 360) + 360) % 360;
    const major = norm % 45 === 0;
    ticks.push({ deg, major, label: major ? compassPoint(norm) : null });
  }
  return (
    <>
      {ticks.map((t) => (
        <div
          key={t.deg}
          className={`compass__tick ${t.major ? 'compass__tick--major' : ''}`}
          style={{ ['--deg' as string]: t.deg }}
        >
          {t.label ? <span>{t.label}</span> : null}
        </div>
      ))}
    </>
  );
}

/** Four outward chevrons — a compact "you can move" glyph. */
function MoveGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2 L15.2 7.2 L8.8 7.2 Z" />
      <path d="M12 22 L15.2 16.8 L8.8 16.8 Z" />
      <path d="M2 12 L7.2 8.8 L7.2 15.2 Z" />
      <path d="M22 12 L16.8 8.8 L16.8 15.2 Z" />
    </svg>
  );
}

/** A simple eye — "you can look around" glyph. */
function LookGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 12C4.5 7 8 4.5 12 4.5S19.5 7 22 12C19.5 17 16 19.5 12 19.5S4.5 17 2 12Z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function teachingHint(signal: number, pinpointing: boolean, noteNearby: boolean): string | null {
  if (signal < 0.18) return noteNearby ? 'Something here is worth a closer look.' : 'Walk. Listen for the beeps to quicken.';
  if (signal < 0.45) return "Something's down there. Keep going.";
  if (!pinpointing) return 'Hold PINPOINT to stop the sweep and narrow it down.';
  return 'Strongest point wins. DIG HERE.';
}

// Default export so this screen — and the Three.js it pulls in — can be code-split
// with React.lazy: nobody pays for the 3D engine until they actually walk into a site.
export default ExploreScreenImpl;
