// 3D Racing Game - Toon Shaded City Racer
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ============ LEVEL SYSTEM ============
let currentLevel = 0; // 0 = not selected
const LEVELS = {
  1: { name: 'EASY', desc: 'No traffic — just you and the track', color: '#44ff88', opponents: 0, boxes: false },
  2: { name: 'MEDIUM', desc: 'Dodge opponent cars on the circuit', color: '#ffaa00', opponents: 3, boxes: false },
  3: { name: 'HARD', desc: 'Cars + crate obstacles everywhere', color: '#ff4444', opponents: 3, boxes: true },
};

const PROFILE_KEY = 'driftArcadeV1Profile';
const VEHICLES = {
  taxi:     { name: 'City Pod',   color: 0x00e5cc, cost: 0,    topSpeed: 0.40, acceleration: 0.0062, handling: 0.028, drift: 1.0,  boost: 1.0,  crash: 1.0,  combo: 1.0,  coinBonus: 1.10, missionBonus: 1.15 },
  sports:   { name: 'Volt X',    color: 0xff2266, cost: 1200,  topSpeed: 0.50, acceleration: 0.0075, handling: 0.025, drift: 0.90, boost: 1.15, crash: 0.80, combo: 0.95, coinBonus: 1.0,  missionBonus: 1.0  },
  police:   { name: 'Patrol E',  color: 0x4488ff, cost: 1600,  topSpeed: 0.43, acceleration: 0.0068, handling: 0.030, drift: 0.95, boost: 1.30, crash: 1.0,  combo: 1.0,  coinBonus: 1.0,  missionBonus: 1.0  },
  bus:      { name: 'E-Transit', color: 0x22cc66, cost: 1800,  topSpeed: 0.37, acceleration: 0.0058, handling: 0.026, drift: 0.90, boost: 0.95, crash: 1.35, combo: 1.0,  coinBonus: 1.0,  missionBonus: 1.0  },
  drift:    { name: 'Arc Racer', color: 0xaa44ff, cost: 2200,  topSpeed: 0.42, acceleration: 0.0065, handling: 0.032, drift: 1.40, boost: 1.05, crash: 0.9,  combo: 1.25, coinBonus: 1.0,  missionBonus: 1.0  },
  delivery: { name: 'E-Cargo',   color: 0xff6600, cost: 1400,  topSpeed: 0.39, acceleration: 0.0060, handling: 0.029, drift: 1.0,  boost: 1.0,  crash: 1.1,  combo: 1.0,  coinBonus: 1.0,  missionBonus: 1.30 },
};
const UPGRADE_KEYS = ['topSpeed', 'acceleration', 'handling', 'driftControl', 'boostCapacity', 'crashResistance', 'comboDuration'];

function defaultProfile() {
  return {
    coins: 0, xp: 0, level: 1, selectedVehicle: 'taxi', unlockedVehicles: ['taxi'],
    upgrades: Object.fromEntries(UPGRADE_KEYS.map(k => [k, 0])),
    bestScore: 0, bestCombo: 1, bestNearMiss: 0,
    cosmetics: { boostTrail: '#00eeff', smoke: '#8844ff' },
    dailyRewardDate: '', missionSeed: new Date().toISOString().slice(0, 10), achievements: {},
  };
}

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    const base = defaultProfile();
    return {
      ...base,
      ...(saved || {}),
      unlockedVehicles: Array.isArray(saved?.unlockedVehicles) ? saved.unlockedVehicles : base.unlockedVehicles,
      upgrades: { ...base.upgrades, ...(saved?.upgrades || {}) },
      achievements: { ...base.achievements, ...(saved?.achievements || {}) },
      cosmetics: { ...base.cosmetics, ...(saved?.cosmetics || {}) },
    };
  } catch (e) {
    return defaultProfile();
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

const profile = loadProfile();

function claimDailyRewardIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (profile.dailyRewardDate === today) return 0;
  profile.dailyRewardDate = today;
  profile.coins += 250;
  profile.xp += 120;
  saveProfile();
  return 250;
}

// ============ GAME STATE ============
const state = {
  speed: 0,
  maxSpeed: 0.40,       // slightly lower top speed for big bus
  acceleration: 0.006,  // slower spin-up
  braking: 0.015,       // longer braking distance
  friction: 0.003,
  turnSpeed: 0.028,     // wider turning radius for bus
  carAngle: Math.PI / 2,
  carPos: { x: -3, z: 25 },
  lap: 0,
  lapTime: 0,
  bestLap: Infinity,
  totalTime: 0,
  maxTime: 60,
  timeRemaining: 60,
  gameOver: false,
  started: false,
  countdown: 3,
  keys: {},
  checkpoints: [false, false, false, false],
  lastCheckpoint: -1,
  opponents: [],
  particles: [],
  carCrashCooldown: 0,
  wallCrashCooldown: 0,
  screenShake: 0,
  screenShakeIntensity: 0,
  crashFlash: 0,
  crashFlashIntensity: 0,
  wrongWay: false,
  wrongWayTimer: 0,
  wrongWayCooldown: 0,
  pointsFlash: 0,
  pointsFlashIntensity: 0,
  boxes: [],
  turnInput: 0,
  turnHoldTime: 0,
  lastTurnDir: 0,
  drifting: false,
  driftAngle: 0,
  driftMomentum: 0,
  velocityAngle: Math.PI / 2,
  driftSparks: [],
  driftBoost: 0,
  driftBoostActive: false,
  driftBoostTimer: 0,
  skidMarks: [],
  skidMarkIndex: 0,
  maxSkidMarks: 300,
  driftGracePeriod: 0,
  driftPoints: 0,
  totalPoints: 0,
  pointsMultiplier: 1,
  showPointsBanked: 0,
  bankedAmount: 0,
  pointsLog: [],
  combo: 1,
  comboValue: 0,
  comboTimer: 0,
  maxCombo: 1,
  boost: 0,
  boostCapacity: 100,
  boosting: false,
  boostCooldown: 0,
  boostPulse: 0,
  eventPopups: [],
  nearMisses: new Map(),
  nearMissCount: 0,
  closeCallCount: 0,
  weaveCount: 0,
  lastWeaveSide: 0,
  lastWeaveTime: -99,
  threadNeedleCooldown: 0,
  closestNearMiss: Infinity,
  crashes: 0,
  missionsCompleted: 0,
  coinsEarned: 0,
  perfectLapActive: true,
  activeVehicle: 'taxi',
  activeVehicleStats: null,
  dynamicEvent: null,
  nextDynamicEventTime: 9,
  eventWarning: null,
  eventTimer: 0,
  finalCountdownPulse: 0,
  weatherGrip: 1,
  joystick: {
    active: false,
    pointerId: null,
    centerX: 0,
    centerY: 0,
    x: 0,
    y: 0,
    magnitude: 0,
    angle: 0,
    pressure: 0,
  },
  cameraStick: {
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
  },
  gamepad: {
    connected: false,
    id: '',
    x: 0,
    y: 0,
    accelerate: 0,
    brake: 0,
    drift: false,
    boost: false,
    restartHeld: false,
  },
};

const DAILY_MISSIONS = [
  { id: 'near_miss_10', label: '10 near misses', event: 'near_miss', target: 10, reward: 180 },
  { id: 'drift_5s', label: 'Score 500 drift points', stat: 'driftScore', target: 500, reward: 220 },
  { id: 'combo_5', label: 'Reach x5 combo', stat: 'maxCombo', target: 5, reward: 260 },
  { id: 'no_crash_lap', label: 'Complete a clean lap', event: 'perfect_lap', target: 1, reward: 240 },
  { id: 'thread_2', label: 'Thread the needle twice', event: 'thread_needle', target: 2, reward: 260 },
];

const runMissions = DAILY_MISSIONS.slice(0, 3).map(m => ({ ...m, progress: 0, complete: false }));

function vehicleStats() {
  const vehicle = VEHICLES[profile.selectedVehicle] || VEHICLES.taxi;
  const up = profile.upgrades;
  return {
    ...vehicle,
    topSpeed: vehicle.topSpeed + up.topSpeed * 0.015,
    acceleration: vehicle.acceleration + up.acceleration * 0.00045,
    handling: vehicle.handling + up.handling * 0.0014,
    drift: vehicle.drift + up.driftControl * 0.08,
    boost: vehicle.boost + up.boostCapacity * 0.05,
    crash: vehicle.crash + up.crashResistance * 0.08,
    combo: vehicle.combo + up.comboDuration * 0.08,
  };
}

function addPopup(label, amount, color = '#44ff88') {
  state.eventPopups.push({ label, amount, color, life: 1.25, age: 0 });
  if (state.eventPopups.length > 5) state.eventPopups.shift();
}

function bumpCombo(strength = 1) {
  const stats = state.activeVehicleStats || vehicleStats();
  state.comboValue += strength;
  state.combo = Math.min(8, 1 + state.comboValue * 0.18);
  state.comboTimer = 3.0 + Math.min(1.6, stats.combo * 0.45);
  state.maxCombo = Math.max(state.maxCombo, state.combo);
}

function breakCombo() {
  state.combo = 1;
  state.comboValue = 0;
  state.comboTimer = 0;
}

function awardEvent(type, baseAmount, label, opts = {}) {
  const comboTypes = new Set(['near_miss', 'close_call', 'thread_needle', 'traffic_weave', 'drift', 'boost', 'event_survive']);
  if (comboTypes.has(type)) bumpCombo(opts.comboStrength ?? 1);
  const multiplier = opts.noCombo ? 1 : state.combo;
  const eventMult = state.dynamicEvent?.type === 'night' ? 1.25 : 1;
  const amount = Math.max(0, Math.round(baseAmount * multiplier * eventMult));
  if (amount > 0) state.totalPoints += amount;
  const boostGain = opts.boost ?? 0;
  if (boostGain > 0 && !state.boosting) {
    state.boost = Math.min(state.boostCapacity, state.boost + boostGain * (state.activeVehicleStats?.boost || 1));
  }
  state.bankedAmount = amount;
  state.showPointsBanked = Math.max(state.showPointsBanked, 1.1);
  state.pointsFlash = 0.35;
  state.pointsFlashIntensity = Math.min(0.75, 0.25 + amount / 1600);
  state.pointsLog.push({ type, amount, time: state.totalTime, label, multiplier, lap: opts.lap });
  addPopup(label, amount, opts.color || '#44ff88');
  updateMissionProgress(type, opts);
  playSfx(type);
  return amount;
}

function updateMissionProgress(type, opts = {}) {
  runMissions.forEach(m => {
    if (m.complete) return;
    if (m.event === type) m.progress += 1;
    if (m.stat === 'maxCombo') m.progress = Math.max(m.progress, Math.floor(state.maxCombo));
    if (m.stat === 'driftScore' && type === 'drift') m.progress += opts.rawDrift || 0;
    if (m.progress >= m.target) {
      m.complete = true;
      state.missionsCompleted++;
      const reward = Math.round(m.reward * (state.activeVehicleStats?.missionBonus || 1));
      profile.coins += reward;
      profile.xp += Math.round(reward * 0.7);
      state.coinsEarned += reward;
      saveProfile();
      addPopup(`MISSION: ${m.label}`, reward, '#ffdd44');
      state.pointsLog.push({ type: 'mission', amount: reward, time: state.totalTime, label: m.label, multiplier: 1 });
      playSfx('mission');
    }
  });
}

function updateCombo(dt) {
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.comboValue = Math.max(0, state.comboValue - dt * 12);
      state.combo = Math.max(1, state.combo - dt * 2.5);
      if (state.combo <= 1.02) breakCombo();
    }
  }
}

function getUpgradeCost(key) {
  const level = profile.upgrades[key] || 0;
  return 220 + level * 180;
}

// ============ TOON SHADING HELPERS ============
// Create a gradient map texture for toon shading (3 steps)
function createToonGradientMap(steps = 4) {
  const colors = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    colors[i] = Math.round((i / (steps - 1)) * 255);
  }
  const tex = new THREE.DataTexture(colors, steps, 1, THREE.RedFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const toonGradient3 = createToonGradientMap(3);
const toonGradient4 = createToonGradientMap(4);
const toonGradient5 = createToonGradientMap(5);

// Outline shader for cel-shading edge detection
const OutlineShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    resolution: { value: new THREE.Vector2() },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 500 },
    outlineColor: { value: new THREE.Color(0x1a1008) },
    outlineStrength: { value: 1.8 },
    depthThreshold: { value: 0.0015 },
    normalThreshold: { value: 0.35 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec3 outlineColor;
    uniform float outlineStrength;
    uniform float depthThreshold;
    uniform float normalThreshold;
    varying vec2 vUv;

    float getLinearDepth(vec2 uv) {
      float fragCoordZ = texture2D(tDepth, uv).x;
      float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
      return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
    }

    vec3 getNormal(vec2 uv) {
      return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);

      // Sobel-like depth edge detection
      float d  = getLinearDepth(vUv);
      float dU = getLinearDepth(vUv + vec2(0.0, texel.y));
      float dD = getLinearDepth(vUv - vec2(0.0, texel.y));
      float dL = getLinearDepth(vUv - vec2(texel.x, 0.0));
      float dR = getLinearDepth(vUv + vec2(texel.x, 0.0));

      float depthEdge = abs(dU - d) + abs(dD - d) + abs(dL - d) + abs(dR - d);
      depthEdge = smoothstep(depthThreshold, depthThreshold * 4.0, depthEdge);

      // Normal edge detection
      vec3 n  = getNormal(vUv);
      vec3 nU = getNormal(vUv + vec2(0.0, texel.y));
      vec3 nD = getNormal(vUv - vec2(0.0, texel.y));
      vec3 nL = getNormal(vUv - vec2(texel.x, 0.0));
      vec3 nR = getNormal(vUv + vec2(texel.x, 0.0));

      float normalEdge = 0.0;
      normalEdge += 1.0 - dot(n, nU);
      normalEdge += 1.0 - dot(n, nD);
      normalEdge += 1.0 - dot(n, nL);
      normalEdge += 1.0 - dot(n, nR);
      normalEdge = smoothstep(normalThreshold, normalThreshold * 2.5, normalEdge * 0.25);

      float edge = max(depthEdge, normalEdge) * outlineStrength;
      edge = clamp(edge, 0.0, 1.0);

      gl_FragColor = vec4(mix(color.rgb, outlineColor, edge * 0.85), color.a);
    }
  `
};

// ============ SCENE SETUP ============
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd4956b);
scene.fog = new THREE.FogExp2(0xd4956b, 0.012);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
const root = document.getElementById('game-root') ?? document.body;
root.appendChild(renderer.domElement);

// ============ DEPTH & NORMAL RENDER TARGETS ============
const depthTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
});
depthTarget.depthTexture = new THREE.DepthTexture();
depthTarget.depthTexture.format = THREE.DepthFormat;
depthTarget.depthTexture.type = THREE.UnsignedIntType;

const normalTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
});
const normalMat = new THREE.MeshNormalMaterial();

// ============ POST-PROCESSING ============
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const outlinePass = new ShaderPass(OutlineShader);
outlinePass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
outlinePass.uniforms.cameraNear.value = camera.near;
outlinePass.uniforms.cameraFar.value = camera.far;
composer.addPass(outlinePass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.15, 0.4, 0.85);
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// ============ LIGHTING ============
const ambientLight = new THREE.AmbientLight(0x8899bb, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 1.8);
sunLight.position.set(40, 60, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -120;
sunLight.shadow.camera.right = 120;
sunLight.shadow.camera.top = 120;
sunLight.shadow.camera.bottom = -120;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 300;
sunLight.shadow.bias = -0.001;
sunLight.shadow.normalBias = 0.05;
scene.add(sunLight);
scene.add(sunLight.target);

const fillLight = new THREE.DirectionalLight(0x6688cc, 0.4);
fillLight.position.set(-30, 20, -20);
scene.add(fillLight);

const nightVisibilityLight = new THREE.HemisphereLight(0xa8c8ff, 0x32324d, 0);
scene.add(nightVisibilityLight);

// ============ WARM TOON LIGHTING SETUP ============
{
  const fogColor = 0xd4956b;
  scene.background = new THREE.Color(fogColor);
  sunLight.color.set(0xffeedd);
  sunLight.intensity = 1.8;
  fillLight.color.set(0xff9966);
  fillLight.intensity = 0.7;
  ambientLight.color.set(0x8899bb);
  ambientLight.intensity = 1.1;
  scene.fog = new THREE.FogExp2(new THREE.Color(fogColor), 0.012);
  renderer.toneMappingExposure = 0.95;
}

// ============ TOON MATERIALS ============
function toon(color, gradientMap = toonGradient4) {
  return new THREE.MeshToonMaterial({ color, gradientMap });
}

const mat = {
  road: toon(0x999999, toonGradient3),
  sidewalk: toon(0xccbb99, toonGradient3),
  brick: toon(0xB86B3E, toonGradient4),
  brickDark: toon(0x9B5527, toonGradient4),
  brickLight: toon(0xD4886A, toonGradient4),
  roof: toon(0x4A4A5E, toonGradient3),
  roofDark: toon(0x3A3A4E, toonGradient3),
  window: toon(0xBBDDEE, toonGradient5),
  grass: toon(0x77BB55, toonGradient3),
  tree: toon(0x66994A, toonGradient3),
  treeDark: toon(0x558844, toonGradient3),
  trunk: toon(0x776644, toonGradient3),
  carRed: toon(0xEE3333, toonGradient5),
  carBlue: toon(0x3366EE, toonGradient5),
  carGreen: toon(0x33BB55, toonGradient5),
  carYellow: toon(0xEEBB33, toonGradient5),
  carWhite: toon(0xF5F5F5, toonGradient5),
  white: toon(0xFFFFFF, toonGradient3),
  stripe: toon(0xEEEEDD, toonGradient3),
  curb: toon(0xDD5555, toonGradient3),
  metal: toon(0x999999, toonGradient4),
  lampLight: new THREE.MeshToonMaterial({ color: 0xFFEEAA, emissive: 0xFFDD88, emissiveIntensity: 1.5, gradientMap: toonGradient3 }),
  glass: new THREE.MeshToonMaterial({ color: 0x99DDFF, gradientMap: toonGradient5, transparent: true, opacity: 0.65 }),
  tire: toon(0x333333, toonGradient3),
};

// ============ TRACK DEFINITION ============
const TRACK_WIDTH = 10;
const trackPoints = [
  { x: 0, z: 25 },
  { x: 25, z: 25 },
  { x: 35, z: 20 },
  { x: 40, z: 10 },
  { x: 40, z: -10 },
  { x: 35, z: -20 },
  { x: 25, z: -25 },
  { x: 0, z: -25 },
  { x: -25, z: -25 },
  { x: -35, z: -20 },
  { x: -40, z: -10 },
  { x: -40, z: 10 },
  { x: -35, z: 20 },
  { x: -25, z: 25 },
];

function getTrackPoint(t) {
  const n = trackPoints.length;
  const i = Math.floor(t * n) % n;
  const next = (i + 1) % n;
  const prev = (i - 1 + n) % n;
  const next2 = (i + 2) % n;
  const f = (t * n) % 1;
  
  const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  
  return {
    x: catmull(trackPoints[prev].x, trackPoints[i].x, trackPoints[next].x, trackPoints[next2].x, f),
    z: catmull(trackPoints[prev].z, trackPoints[i].z, trackPoints[next].z, trackPoints[next2].z, f)
  };
}

function getTrackTangent(t) {
  const dt = 0.001;
  const p1 = getTrackPoint(t);
  const p2 = getTrackPoint(t + dt);
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  return { x: dx / len, z: dz / len };
}

function getClosestTrackT(px, pz) {
  let bestT = 0, bestDist = Infinity;
  for (let t = 0; t < 1; t += 0.005) {
    const p = getTrackPoint(t);
    const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
    if (d < bestDist) { bestDist = d; bestT = t; }
  }
  for (let t = bestT - 0.005; t < bestT + 0.005; t += 0.0005) {
    const tt = ((t % 1) + 1) % 1;
    const p = getTrackPoint(tt);
    const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
    if (d < bestDist) { bestDist = d; bestT = tt; }
  }
  return { t: bestT, dist: Math.sqrt(bestDist) };
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// ============ BUILD TRACK ============
function buildTrack() {
  const group = new THREE.Group();
  
  const groundGeo = new THREE.PlaneGeometry(800, 800, 64, 64);
  // Fade ground vertex colors to fog color at edges
  const fogCol = new THREE.Color(0xd4956b);
  const grassCol = new THREE.Color(0x66AA44);
  const gPositions = groundGeo.attributes.position;
  const colors = new Float32Array(gPositions.count * 3);
  for (let i = 0; i < gPositions.count; i++) {
    const x = gPositions.getX(i);
    const z = gPositions.getY(i); // PlaneGeometry uses x,y before rotation
    const dist = Math.sqrt(x * x + z * z);
    // Start fading at 50 units, fully fog-colored by 130 (matches fog density)
    const t = THREE.MathUtils.smoothstep(dist, 50, 130);
    const c = grassCol.clone().lerp(fogCol, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const groundMat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonGradient3,
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 4,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'groundPlane';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // Fog-colored horizon ring to hide any remaining edge
  const horizonGeo = new THREE.RingGeometry(120, 500, 64);
  const horizonMat = new THREE.MeshBasicMaterial({
    color: fogCol,
    side: THREE.DoubleSide,
    fog: false,
    transparent: true,
    opacity: 1.0,
  });
  const horizon = new THREE.Mesh(horizonGeo, horizonMat);
  horizon.name = 'horizonRing';
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = -0.01;
  group.add(horizon);
  
  const segments = 200;
  
  const outerPts = [], innerPts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = getTrackPoint(t);
    const tan = getTrackTangent(t);
    const nx = -tan.z, nz = tan.x;
    outerPts.push({ x: p.x + nx * TRACK_WIDTH / 2, z: p.z + nz * TRACK_WIDTH / 2 });
    innerPts.push({ x: p.x - nx * TRACK_WIDTH / 2, z: p.z - nz * TRACK_WIDTH / 2 });
  }
  
  const roadGeo = new THREE.BufferGeometry();
  const roadVerts = [], roadIndices = [], roadUvs = [];
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = getTrackPoint(t);
    const tan = getTrackTangent(t);
    const nx = -tan.z, nz = tan.x;
    
    roadVerts.push(p.x + nx * (TRACK_WIDTH / 2 + 1), 0.01, p.z + nz * (TRACK_WIDTH / 2 + 1));
    roadVerts.push(p.x - nx * (TRACK_WIDTH / 2 + 1), 0.01, p.z - nz * (TRACK_WIDTH / 2 + 1));
    roadUvs.push(0, t * 20);
    roadUvs.push(1, t * 20);
    
    if (i < segments) {
      const base = i * 2;
      roadIndices.push(base, base + 1, base + 2);
      roadIndices.push(base + 1, base + 3, base + 2);
    }
  }
  
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();
  
  const roadNormals = new Float32Array((segments + 1) * 2 * 3);
  for (let i = 0; i < (segments + 1) * 2; i++) {
    roadNormals[i * 3] = 0;
    roadNormals[i * 3 + 1] = 1;
    roadNormals[i * 3 + 2] = 0;
  }
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
  
  const road = new THREE.Mesh(roadGeo, mat.road);
  road.name = 'roadSurface';
  road.receiveShadow = true;
  road.renderOrder = 1;
  mat.road.side = THREE.DoubleSide;
  mat.road.depthWrite = true;
  group.add(road);
  
  for (let side = -1; side <= 1; side += 2) {
    const curbGeo = new THREE.BufferGeometry();
    const cVerts = [], cIdx = [], cUvs = [];
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = getTrackPoint(t);
      const tan = getTrackTangent(t);
      const nx = -tan.z, nz = tan.x;
      const innerOff = side * (TRACK_WIDTH / 2 + 1);
      const outerOff = side * (TRACK_WIDTH / 2 + 2.2);
      
      cVerts.push(p.x + nx * innerOff, 0.06, p.z + nz * innerOff);
      cVerts.push(p.x + nx * outerOff, 0.06, p.z + nz * outerOff);
      cUvs.push(0, t * 40);
      cUvs.push(1, t * 40);
      
      if (i < segments) {
        const base = i * 2;
        cIdx.push(base, base + 1, base + 2);
        cIdx.push(base + 1, base + 3, base + 2);
      }
    }
    
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(cVerts, 3));
    curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cUvs, 2));
    curbGeo.setIndex(cIdx);
    curbGeo.computeVertexNormals();
    
    const curbMat = new THREE.MeshToonMaterial({ color: 0xDD5555, gradientMap: toonGradient3, side: THREE.DoubleSide });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.name = `curb_${side === -1 ? 'left' : 'right'}`;
    curb.receiveShadow = true;
    group.add(curb);
  }
  
  for (let side = -1; side <= 1; side += 2) {
    const swGeo = new THREE.BufferGeometry();
    const sVerts = [], sIdx = [], sUvs = [];
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = getTrackPoint(t);
      const tan = getTrackTangent(t);
      const nx = -tan.z, nz = tan.x;
      const innerOff = side * (TRACK_WIDTH / 2 + 2.2);
      const outerOff = side * (TRACK_WIDTH / 2 + 5.5);
      
      sVerts.push(p.x + nx * innerOff, 0.15, p.z + nz * innerOff);
      sVerts.push(p.x + nx * outerOff, 0.15, p.z + nz * outerOff);
      sUvs.push(0, t * 20);
      sUvs.push(1, t * 20);
      
      if (i < segments) {
        const base = i * 2;
        sIdx.push(base, base + 1, base + 2);
        sIdx.push(base + 1, base + 3, base + 2);
      }
    }
    
    swGeo.setAttribute('position', new THREE.Float32BufferAttribute(sVerts, 3));
    swGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUvs, 2));
    swGeo.setIndex(sIdx);
    swGeo.computeVertexNormals();
    
    const swMat = new THREE.MeshToonMaterial({ color: 0xccbb99, gradientMap: toonGradient3, side: THREE.DoubleSide });
    const sw = new THREE.Mesh(swGeo, swMat);
    sw.name = `sidewalk_${side === -1 ? 'left' : 'right'}`;
    sw.receiveShadow = true;
    group.add(sw);

    const curbEdgeGeo = new THREE.BufferGeometry();
    const ceVerts = [], ceIdx = [], ceUvs = [];
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = getTrackPoint(t);
      const tan = getTrackTangent(t);
      const nx = -tan.z, nz = tan.x;
      const off = side * (TRACK_WIDTH / 2 + 2.2);
      
      ceVerts.push(p.x + nx * off, 0.0, p.z + nz * off);
      ceVerts.push(p.x + nx * off, 0.15, p.z + nz * off);
      ceUvs.push(0, t * 40);
      ceUvs.push(1, t * 40);
      
      if (i < segments) {
        const base = i * 2;
        if (side === 1) {
          ceIdx.push(base, base + 2, base + 1);
          ceIdx.push(base + 1, base + 2, base + 3);
        } else {
          ceIdx.push(base, base + 1, base + 2);
          ceIdx.push(base + 1, base + 3, base + 2);
        }
      }
    }
    
    curbEdgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ceVerts, 3));
    curbEdgeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ceUvs, 2));
    curbEdgeGeo.setIndex(ceIdx);
    curbEdgeGeo.computeVertexNormals();
    
    const curbEdgeMat = new THREE.MeshToonMaterial({ color: 0xAAAA99, gradientMap: toonGradient3, side: THREE.DoubleSide });
    const curbEdge = new THREE.Mesh(curbEdgeGeo, curbEdgeMat);
    curbEdge.name = `curbEdge_${side === -1 ? 'left' : 'right'}`;
    curbEdge.receiveShadow = true;
    group.add(curbEdge);
  }
  
  {
    // Pre-compute arc-length table for equal spacing
    const arcSamples = 1000;
    const arcLengths = [0];
    let prevP = getTrackPoint(0);
    for (let i = 1; i <= arcSamples; i++) {
      const t = i / arcSamples;
      const p = getTrackPoint(t);
      const dx = p.x - prevP.x, dz = p.z - prevP.z;
      arcLengths.push(arcLengths[i - 1] + Math.sqrt(dx * dx + dz * dz));
      prevP = p;
    }
    const totalLength = arcLengths[arcSamples];

    // Map arc-length distance to parameter t
    function arcToT(targetLen) {
      let lo = 0, hi = arcSamples;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arcLengths[mid] < targetLen) lo = mid + 1;
        else hi = mid;
      }
      if (lo === 0) return 0;
      const segLen = arcLengths[lo] - arcLengths[lo - 1];
      const frac = segLen > 0 ? (targetLen - arcLengths[lo - 1]) / segLen : 0;
      return ((lo - 1) + frac) / arcSamples;
    }

    const stripeGeo = new THREE.BoxGeometry(0.3, 0.02, 1.5);
    const stripeGeos = [];
    const stripeSpacing = 4.0; // equal spacing in world units
    const numStripes = Math.floor(totalLength / stripeSpacing);
    for (let i = 0; i < numStripes; i++) {
      // Alternate: skip every other for dashed look
      if (i % 2 === 1) continue;
      const dist = i * stripeSpacing;
      const t = arcToT(dist);
      const p = getTrackPoint(t);
      const tan = getTrackTangent(t);
      const angle = Math.atan2(tan.x, tan.z);
      const m = new THREE.Matrix4();
      m.makeRotationY(angle);
      m.setPosition(p.x, 0.02, p.z);
      const g = stripeGeo.clone().applyMatrix4(m);
      stripeGeos.push(g);
    }
    const mergedStripeGeo = mergeGeometries(stripeGeos);
    mergedStripeGeo.computeBoundingSphere();
    const stripeMat = new THREE.MeshToonMaterial({
      color: 0xEEEEDD, gradientMap: toonGradient3, fog: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const stripesMesh = new THREE.Mesh(mergedStripeGeo, stripeMat);
    stripesMesh.name = 'roadMarkings';
    stripesMesh.frustumCulled = false;
    stripesMesh.renderOrder = 0;
    group.add(stripesMesh);
    stripeGeos.forEach(g => g.dispose());
    stripeGeo.dispose();
  }
  
  return group;
}

// ============ BUILDING CREATION ============
function createBuilding(width, height, depth, brickMat) {
  const group = new THREE.Group();
  
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    brickMat
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  const roofHeight = height * 0.35;
  const hw = width / 2, hd = depth / 2;
  const roofOverhang = 0.3;
  const rhw = hw + roofOverhang;
  const rhd = hd + roofOverhang;
  const roofVerts2 = new Float32Array([
    -rhw, height, -rhd,   -rhw, height, rhd,   0, height + roofHeight, -rhd,
    0, height + roofHeight, -rhd,   -rhw, height, rhd,   0, height + roofHeight, rhd,
    rhw, height, -rhd,   0, height + roofHeight, -rhd,   rhw, height, rhd,
    0, height + roofHeight, -rhd,   0, height + roofHeight, rhd,   rhw, height, rhd,
    -rhw, height, -rhd,   0, height + roofHeight, -rhd,   rhw, height, -rhd,
    rhw, height, rhd,   0, height + roofHeight, rhd,   -rhw, height, rhd,
    -rhw, height, -rhd,   rhw, height, -rhd,   rhw, height, rhd,
    -rhw, height, -rhd,   rhw, height, rhd,   -rhw, height, rhd,
  ]);
  const roofGeo2 = new THREE.BufferGeometry();
  roofGeo2.setAttribute('position', new THREE.Float32BufferAttribute(roofVerts2, 3));
  roofGeo2.computeVertexNormals();
  const roofMesh = new THREE.Mesh(roofGeo2, mat.roofDark);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = false;
  group.add(roofMesh);
  
  const windowRows = Math.floor(height / 2.5);
  const windowCols = Math.max(1, Math.floor(width / 2.5));
  const wSize = 0.8;
  
  const windowGeos = [];
  const winGeoFB = new THREE.BoxGeometry(wSize, wSize * 1.3, 0.1);
  const winGeoSide = new THREE.BoxGeometry(0.1, wSize * 1.3, wSize);
  const wMatrix = new THREE.Matrix4();
  
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < windowCols; col++) {
      const wx = -width / 2 + (col + 0.5) * (width / windowCols);
      const wy = 1.5 + row * 2.5;
      
      const gf = winGeoFB.clone();
      wMatrix.makeTranslation(wx, wy, depth / 2 + 0.05);
      gf.applyMatrix4(wMatrix);
      windowGeos.push(gf);
      
      const gb = winGeoFB.clone();
      wMatrix.makeTranslation(wx, wy, -depth / 2 - 0.05);
      gb.applyMatrix4(wMatrix);
      windowGeos.push(gb);
    }
  }
  
  const sideWindowCols = Math.max(1, Math.floor(depth / 2.5));
  for (let row = 0; row < windowRows; row++) {
    for (let col = 0; col < sideWindowCols; col++) {
      const wz = -depth / 2 + (col + 0.5) * (depth / sideWindowCols);
      const wy = 1.5 + row * 2.5;
      
      for (let side = -1; side <= 1; side += 2) {
        const gs = winGeoSide.clone();
        wMatrix.makeTranslation(side * (width / 2 + 0.05), wy, wz);
        gs.applyMatrix4(wMatrix);
        windowGeos.push(gs);
      }
    }
  }
  
  if (windowGeos.length > 0) {
    const mergedWindowGeo = mergeGeometries(windowGeos);
    const windowMesh = new THREE.Mesh(mergedWindowGeo, mat.window);
    windowMesh.name = 'buildingWindows';
    group.add(windowMesh);
    windowGeos.forEach(g => g.dispose());
  }
  winGeoFB.dispose();
  winGeoSide.dispose();
  
  return group;
}

// ============ TREE CREATION ============
function createTree(size = 1) {
  const group = new THREE.Group();
  
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15 * size, 0.25 * size, 2 * size, 6),
    mat.trunk
  );
  trunk.position.y = size;
  trunk.castShadow = true;
  group.add(trunk);
  
  const foliageMat = Math.random() > 0.5 ? mat.tree : mat.treeDark;
  const foliagePositions = [
    { x: 0, y: 2.5 * size, z: 0, r: 1.2 * size },
    { x: 0.5 * size, y: 2.2 * size, z: 0.3 * size, r: 0.8 * size },
    { x: -0.4 * size, y: 2.8 * size, z: -0.2 * size, r: 0.7 * size },
    { x: 0.2 * size, y: 3.1 * size, z: -0.3 * size, r: 0.6 * size },
  ];
  
  foliagePositions.forEach(fp => {
    const f = new THREE.Mesh(
      new THREE.SphereGeometry(fp.r, 6, 5),
      foliageMat
    );
    f.position.set(fp.x, fp.y, fp.z);
    f.castShadow = true;
    group.add(f);
  });
  
  return group;
}

// ============ LAMP POST ============
function createLampPost() {
  const group = new THREE.Group();
  
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 4, 6),
    mat.metal
  );
  pole.position.y = 2;
  pole.castShadow = true;
  group.add(pole);
  
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 1.2),
    mat.metal
  );
  arm.position.set(0, 4, 0.6);
  group.add(arm);
  
  const elbow = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 6, 4),
    mat.metal
  );
  elbow.position.set(0, 4, 0.05);
  group.add(elbow);
  
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.2, 0.4),
    mat.lampLight
  );
  lamp.position.set(0, 3.85, 1.15);
  group.add(lamp);

  const lampGlow = new THREE.PointLight(0xFFDD88, 2.0, 12, 1.5);
  lampGlow.position.set(0, 3.7, 1.15);
  group.add(lampGlow);
  
  return group;
}

// ============ BUS CREATION ============
// Bus dimensions: ~4.8 long, ~1.6 wide, ~2.0 tall (low-poly arcade style)
const BUS_LENGTH = 4.8;
const BUS_WIDTH = 1.6;
const BUS_HEIGHT_LOWER = 0.55; // lower chassis height
const BUS_HEIGHT_UPPER = 1.35; // cabin height above chassis
const BUS_WHEEL_Y = 0.28;

function createBus(bodyMat, isPlayer = false) {
  const group = new THREE.Group();
  group.userData.wheels = [];

  // ---- Main chassis (wide, long, flat) ----
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(BUS_WIDTH, BUS_HEIGHT_LOWER, BUS_LENGTH),
    bodyMat
  );
  chassis.position.y = BUS_HEIGHT_LOWER / 2 + 0.18;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  group.add(chassis);

  // ---- Upper cabin (full-length boxy bus body) ----
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(BUS_WIDTH, BUS_HEIGHT_UPPER, BUS_LENGTH - 0.25),
    bodyMat
  );
  cabin.position.y = BUS_HEIGHT_LOWER + 0.18 + BUS_HEIGHT_UPPER / 2;
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  group.add(cabin);

  // ---- Roof (slightly wider strip) ----
  const roofMat = new THREE.MeshToonMaterial({ color: 0xE8B800, gradientMap: toonGradient4 });
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(BUS_WIDTH + 0.05, 0.1, BUS_LENGTH - 0.2),
    roofMat
  );
  roof.position.y = BUS_HEIGHT_LOWER + 0.18 + BUS_HEIGHT_UPPER + 0.05;
  group.add(roof);

  // ---- Black bumper strips (front & rear) ----
  const bumperMat = new THREE.MeshToonMaterial({ color: 0x222222, gradientMap: toonGradient3 });
  const bumperGeo = new THREE.BoxGeometry(BUS_WIDTH + 0.05, 0.22, 0.12);
  const frontBumper = new THREE.Mesh(bumperGeo, bumperMat);
  frontBumper.position.set(0, 0.3, BUS_LENGTH / 2 + 0.04);
  group.add(frontBumper);
  const rearBumper = new THREE.Mesh(bumperGeo, bumperMat);
  rearBumper.position.set(0, 0.3, -BUS_LENGTH / 2 - 0.04);
  group.add(rearBumper);

  // ---- Black trim stripe along sides ----
  const trimMat = new THREE.MeshToonMaterial({ color: 0x1a1a1a, gradientMap: toonGradient3 });
  const sideTrimGeo = new THREE.BoxGeometry(0.04, 0.12, BUS_LENGTH + 0.1);
  const trimY = BUS_HEIGHT_LOWER + 0.18 + 0.04;
  const trimL = new THREE.Mesh(sideTrimGeo, trimMat);
  trimL.position.set(-BUS_WIDTH / 2 - 0.01, trimY, 0);
  group.add(trimL);
  const trimR = new THREE.Mesh(sideTrimGeo, trimMat);
  trimR.position.set(BUS_WIDTH / 2 + 0.01, trimY, 0);
  group.add(trimR);

  // ---- Windows: side rows ----
  const windowPaneMat = new THREE.MeshToonMaterial({ color: 0x99CCEE, gradientMap: toonGradient5, transparent: true, opacity: 0.75 });
  const windowFrameMat = new THREE.MeshToonMaterial({ color: 0x111111, gradientMap: toonGradient3 });
  const winW = 0.55, winH = 0.48;
  const winCount = 5;
  const winSpacing = (BUS_LENGTH - 1.0) / winCount;
  const winY = BUS_HEIGHT_LOWER + 0.18 + BUS_HEIGHT_UPPER * 0.55;

  for (let i = 0; i < winCount; i++) {
    const wz = -(BUS_LENGTH / 2 - 0.55) + i * winSpacing;
    for (let side = -1; side <= 1; side += 2) {
      // Frame
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, winH + 0.06, winW + 0.06),
        windowFrameMat
      );
      frame.position.set(side * (BUS_WIDTH / 2 + 0.02), winY, wz);
      group.add(frame);
      // Glass
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, winH, winW),
        windowPaneMat
      );
      pane.position.set(side * (BUS_WIDTH / 2 + 0.025), winY, wz);
      group.add(pane);
    }
  }

  // ---- Front windshield ----
  const windshieldMat = new THREE.MeshToonMaterial({ color: 0xAADDFF, gradientMap: toonGradient5, transparent: true, opacity: 0.7 });
  const frontWindshield = new THREE.Mesh(
    new THREE.BoxGeometry(BUS_WIDTH - 0.2, BUS_HEIGHT_UPPER * 0.6, 0.06),
    windshieldMat
  );
  frontWindshield.position.set(0, BUS_HEIGHT_LOWER + 0.18 + BUS_HEIGHT_UPPER * 0.55, BUS_LENGTH / 2 + 0.02);
  group.add(frontWindshield);

  // Front windshield frame
  const wsFrame = new THREE.Mesh(
    new THREE.BoxGeometry(BUS_WIDTH - 0.1, BUS_HEIGHT_UPPER * 0.65, 0.07),
    windowFrameMat
  );
  wsFrame.position.set(0, BUS_HEIGHT_LOWER + 0.18 + BUS_HEIGHT_UPPER * 0.55, BUS_LENGTH / 2 + 0.015);
  group.add(wsFrame);

  // ---- Rear window ----
  const rearWin = new THREE.Mesh(
    new THREE.BoxGeometry(BUS_WIDTH - 0.3, BUS_HEIGHT_UPPER * 0.5, 0.05),
    windshieldMat
  );
  rearWin.position.set(0, BUS_HEIGHT_LOWER + 0.18 + BUS_HEIGHT_UPPER * 0.55, -BUS_LENGTH / 2 - 0.015);
  group.add(rearWin);

  // ---- Headlights (square, front) ----
  const headlightMat = new THREE.MeshToonMaterial({ color: 0xFFFFBB, emissive: 0xFFFF88, emissiveIntensity: 0.9, gradientMap: toonGradient3 });
  const hlGeo = new THREE.BoxGeometry(0.28, 0.18, 0.07);
  for (let x = -0.5; x <= 0.5; x += 1.0) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(x, BUS_HEIGHT_LOWER + 0.05, BUS_LENGTH / 2 + 0.06);
    group.add(hl);
  }

  // ---- Taillights (red, rear) ----
  const taillightMat = new THREE.MeshToonMaterial({ color: 0xFF2222, emissive: 0xFF0000, emissiveIntensity: 0.6, gradientMap: toonGradient3 });
  const tlGeo = new THREE.BoxGeometry(0.28, 0.18, 0.07);
  for (let x = -0.5; x <= 0.5; x += 1.0) {
    const tl = new THREE.Mesh(tlGeo, taillightMat);
    tl.position.set(x, BUS_HEIGHT_LOWER + 0.05, -BUS_LENGTH / 2 - 0.06);
    group.add(tl);
  }

  // ---- Entry door (right side, near front) ----
  const doorMat = new THREE.MeshToonMaterial({ color: 0x222222, gradientMap: toonGradient3 });
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, BUS_HEIGHT_UPPER * 0.75, 0.42),
    doorMat
  );
  door.position.set(BUS_WIDTH / 2 + 0.02, BUS_HEIGHT_LOWER + 0.18 + BUS_HEIGHT_UPPER * 0.38, BUS_LENGTH / 2 - 0.55);
  group.add(door);

  // ---- Emergency exit sign on rear (player only) ----
  if (isPlayer) {
    const signMat = new THREE.MeshToonMaterial({ color: 0xFF4422, emissive: 0xFF2200, emissiveIntensity: 0.3, gradientMap: toonGradient3 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.04), signMat);
    sign.position.set(0, BUS_HEIGHT_LOWER + 0.18 + BUS_HEIGHT_UPPER * 0.88, -BUS_LENGTH / 2 - 0.03);
    group.add(sign);
  }

  // ---- Exhaust pipe (rear underside, right side) ----
  const pipeMat = new THREE.MeshToonMaterial({ color: 0x444444, gradientMap: toonGradient3 });
  const pipeGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.35, 8);
  const pipe = new THREE.Mesh(pipeGeo, pipeMat);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(BUS_WIDTH * 0.3, 0.18, -BUS_LENGTH / 2 - 0.16);
  group.add(pipe);
  // Pipe cap ring
  const capGeo = new THREE.TorusGeometry(0.065, 0.018, 6, 10);
  const cap = new THREE.Mesh(capGeo, pipeMat);
  cap.position.set(BUS_WIDTH * 0.3, 0.18, -BUS_LENGTH / 2 - 0.33);
  group.add(cap);
  // Store exhaust world-space emit point in userData (relative offset)
  group.userData.exhaustOffset = new THREE.Vector3(BUS_WIDTH * 0.3, 0.18, -BUS_LENGTH / 2 - 0.34);

  // ---- Underbody / skirt panels ----
  const skirtMat = new THREE.MeshToonMaterial({ color: 0x333333, gradientMap: toonGradient3 });
  const skirtGeo = new THREE.BoxGeometry(BUS_WIDTH + 0.06, 0.15, BUS_LENGTH - 0.5);
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.y = 0.1;
  group.add(skirt);

  // ---- WHEELS — 6 wheels (2 front axle, 4 rear dual wheels) ----
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 16);
  const hubcapGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.025, 12);
  const hubcapMat = new THREE.MeshToonMaterial({ color: 0xCCCCCC, gradientMap: toonGradient4 });
  const hubSpokeGeo = new THREE.BoxGeometry(0.28, 0.04, 0.025);
  const hubSpokeMat = new THREE.MeshToonMaterial({ color: 0x888888, gradientMap: toonGradient3 });

  // Front axle: 2 wheels
  // Rear axle: 4 wheels (dual on each side, slightly offset)
  const wheelDefs = [
    // Front
    { x: -(BUS_WIDTH / 2 + 0.06), z:  BUS_LENGTH * 0.35, dual: false },
    { x:  (BUS_WIDTH / 2 + 0.06), z:  BUS_LENGTH * 0.35, dual: false },
    // Rear outer
    { x: -(BUS_WIDTH / 2 + 0.06), z: -BUS_LENGTH * 0.28, dual: true },
    { x:  (BUS_WIDTH / 2 + 0.06), z: -BUS_LENGTH * 0.28, dual: true },
  ];

  wheelDefs.forEach((wd, wi) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wd.x, BUS_WHEEL_Y, wd.z);

    const wheel = new THREE.Mesh(wheelGeo, mat.tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    wheelGroup.add(wheel);

    // If dual rear wheels, add inner wheel offset slightly inward
    if (wd.dual) {
      const innerOff = Math.sign(wd.x) * -0.2;
      const wheel2 = new THREE.Mesh(wheelGeo, mat.tire);
      wheel2.rotation.z = Math.PI / 2;
      wheel2.position.x = innerOff;
      wheel2.castShadow = true;
      wheelGroup.add(wheel2);
    }

    const hubcapSide = Math.sign(wd.x);
    const hubcap = new THREE.Mesh(hubcapGeo, hubcapMat);
    hubcap.rotation.z = Math.PI / 2;
    hubcap.position.set(hubcapSide * 0.095, 0, 0);
    wheelGroup.add(hubcap);

    // Spokes (3 cross-spokes)
    for (let sp = 0; sp < 3; sp++) {
      const spoke = new THREE.Mesh(hubSpokeGeo, hubSpokeMat);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.x = (sp / 3) * Math.PI;
      spoke.position.set(hubcapSide * 0.096, 0, 0);
      wheelGroup.add(spoke);
    }

    group.add(wheelGroup);
    group.userData.wheels.push(wheelGroup);
  });

  return group;
}

// ============ POPULATE SCENE ============
const track = buildTrack();
scene.add(track);

// Player bus — yellow school bus color
const playerBusMat = new THREE.MeshToonMaterial({ color: 0xFFCC00, gradientMap: toonGradient5 });
const playerCar = createBus(playerBusMat, true);
playerCar.name = 'playerBus';
scene.add(playerCar);

const playerNightHeadlight = new THREE.SpotLight(0xffefc7, 0, 34, Math.PI / 4.6, 0.55, 1.15);
playerNightHeadlight.position.set(0, 1.05, BUS_LENGTH / 2 + 0.08);
playerNightHeadlight.target.position.set(0, 0.12, 16);
playerNightHeadlight.castShadow = false;
playerCar.add(playerNightHeadlight);
playerCar.add(playerNightHeadlight.target);

function applyVehiclePreset() {
  const stats = vehicleStats();
  state.activeVehicle = profile.selectedVehicle;
  state.activeVehicleStats = stats;
  state.maxSpeed = stats.topSpeed;
  state.acceleration = stats.acceleration;
  state.turnSpeed = stats.handling;
  state.boostCapacity = 100 + (profile.upgrades.boostCapacity || 0) * 12;
  playerBusMat.color.setHex(stats.color);
  playerCar.traverse(child => {
    if (child.isMesh && child.material === playerBusMat) child.material.color.setHex(stats.color);
  });
}

// Opponents — also buses, different colors (city bus style)
const opponentBusMats = [
  new THREE.MeshToonMaterial({ color: 0x2255CC, gradientMap: toonGradient5 }), // blue city bus
  new THREE.MeshToonMaterial({ color: 0x22AA44, gradientMap: toonGradient5 }), // green city bus
  new THREE.MeshToonMaterial({ color: 0xCC4422, gradientMap: toonGradient5 }), // red city bus
];
const allOpponentMeshes = [];
for (let i = 0; i < 3; i++) {
  const opp = createBus(opponentBusMats[i]);
  opp.name = `opponentBus_${i}`;
  opp.visible = false;
  scene.add(opp);
  allOpponentMeshes.push(opp);
  state.opponents.push({
    mesh: opp,
    t: 0.1 + i * 0.3,
    speed: 0.00022 + Math.random() * 0.00010, // slightly slower than cars to account for bus size
    offset: (Math.random() - 0.5) * 2.5,
    lap: 0,
    prevT: 0.1 + i * 0.3,
  });
}

// ============ ARCADE LANDMARKS ============
function addLandmarkCluster(t, side, kind) {
  const p = getTrackPoint(t);
  const tan = getTrackTangent(t);
  const nx = -tan.z, nz = tan.x;
  const x = p.x + nx * side * 15;
  const z = p.z + nz * side * 15;
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = Math.atan2(tan.x, tan.z);
  if (kind === 'gas') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 4), new THREE.MeshToonMaterial({ color: 0xff3344, gradientMap: toonGradient4 }));
    roof.position.y = 3.2;
    group.add(roof);
    for (let i = -1; i <= 1; i += 2) {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient3 }));
      pump.position.set(i * 1.5, 0.6, 0);
      group.add(pump);
    }
  } else if (kind === 'construction') {
    for (let i = 0; i < 7; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), new THREE.MeshToonMaterial({ color: 0xff7722, gradientMap: toonGradient4 }));
      cone.position.set((i - 3) * 1.0, 0.55, (Math.random() - 0.5) * 4);
      group.add(cone);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 1.3, 0.2), new THREE.MeshToonMaterial({ color: 0xffdd44, gradientMap: toonGradient3 }));
    sign.position.set(0, 2.2, -2.8);
    group.add(sign);
  } else if (kind === 'park') {
    for (let i = 0; i < 8; i++) {
      const tree = createTree(0.65 + Math.random() * 0.35);
      tree.position.set((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 7);
      group.add(tree);
    }
  } else if (kind === 'billboard') {
    const board = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 0.3), new THREE.MeshToonMaterial({ color: 0x332255, gradientMap: toonGradient4 }));
    board.position.y = 4;
    group.add(board);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.35, 0.34), new THREE.MeshBasicMaterial({ color: 0x44ccff }));
    stripe.position.set(0, 4.5, -0.02);
    group.add(stripe);
    for (let i = -1; i <= 1; i += 2) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), mat.metal);
      post.position.set(i * 2.5, 2, 0);
      group.add(post);
    }
  } else {
    const tunnel = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.22, 8, 20, Math.PI), new THREE.MeshBasicMaterial({ color: 0x99ddff }));
    tunnel.position.y = 2.8;
    tunnel.rotation.z = Math.PI;
    group.add(tunnel);
  }
  scene.add(group);
}

[
  [0.08, 1, 'gas'],
  [0.22, -1, 'park'],
  [0.38, 1, 'construction'],
  [0.56, -1, 'billboard'],
  [0.72, 1, 'tunnel'],
  [0.88, -1, 'park'],
].forEach(args => addLandmarkCluster(...args));

// ============ BOX OBSTACLES ============
const boxMat = new THREE.MeshToonMaterial({ color: 0xDD9944, gradientMap: toonGradient4 });
const boxBandMat = new THREE.MeshToonMaterial({ color: 0x886633, gradientMap: toonGradient3 });
const boxObstacles = [];

function createBoxObstacle() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), boxMat);
  body.position.y = 0.6;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // Bands
  const bandGeo = new THREE.BoxGeometry(1.25, 0.12, 1.25);
  const band1 = new THREE.Mesh(bandGeo, boxBandMat);
  band1.position.y = 0.35;
  group.add(band1);
  const band2 = new THREE.Mesh(bandGeo, boxBandMat);
  band2.position.y = 0.85;
  group.add(band2);
  return group;
}

function spawnBoxes() {
  // Clear existing
  boxObstacles.forEach(b => scene.remove(b.mesh));
  boxObstacles.length = 0;
  state.boxes = [];

  const boxCount = 8;
  const placed = [];
  for (let i = 0; i < boxCount; i++) {
    const t = (i / boxCount + 0.05) % 1;
    const p = getTrackPoint(t);
    const tan = getTrackTangent(t);
    const nx = -tan.z, nz = tan.x;
    const offset = (Math.random() - 0.5) * (TRACK_WIDTH - 2);
    const bx = p.x + nx * offset;
    const bz = p.z + nz * offset;
    // Avoid placing too close to start line
    if (Math.abs(bx - (-3)) < 5 && Math.abs(bz - 25) < 8) continue;
    // Avoid clustering
    let tooClose = false;
    for (const pp of placed) {
      if ((pp.x - bx) ** 2 + (pp.z - bz) ** 2 < 16) { tooClose = true; break; }
    }
    if (tooClose) continue;

    const box = createBoxObstacle();
    box.position.set(bx, 0, bz);
    box.rotation.y = Math.random() * Math.PI;
    box.name = `obstacle_box_${i}`;
    scene.add(box);
    const entry = { mesh: box, x: bx, z: bz, radius: 1.0 };
    boxObstacles.push(entry);
    state.boxes.push(entry);
    placed.push({ x: bx, z: bz });
  }
}

function clearBoxes() {
  boxObstacles.forEach(b => scene.remove(b.mesh));
  boxObstacles.length = 0;
  state.boxes = [];
}

// ============ LEVEL SELECTION SCREEN ============
const levelSelectOverlay = document.createElement('div');
levelSelectOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(12px);z-index:500;font-family:"Fredoka","Lilita One",sans-serif;';
document.body.appendChild(levelSelectOverlay);

const garageOverlay = document.createElement('div');
garageOverlay.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.78);backdrop-filter:blur(12px);z-index:520;font-family:"Fredoka","Lilita One",sans-serif;color:#fff;pointer-events:auto;';
document.body.appendChild(garageOverlay);

let garageMessage = '';

function renderGarage() {
  garageOverlay.style.display = 'flex';
  const vehicleCards = Object.entries(VEHICLES).map(([id, v]) => {
    const unlocked = profile.unlockedVehicles.includes(id);
    const selected = profile.selectedVehicle === id;
    const canAfford = profile.coins >= v.cost;
    const actionLabel = selected
      ? 'SELECTED'
      : unlocked
        ? 'SELECT'
        : canAfford
          ? `BUY - ${v.cost} COINS`
          : `LOCKED - ${v.cost - profile.coins} MORE`;
    return `<button class="garage-vehicle" data-vehicle="${id}" style="text-align:left;cursor:pointer;color:#fff;background:${selected ? 'rgba(255,221,68,0.18)' : 'rgba(255,255,255,0.08)'};border:2px solid ${selected ? '#ffdd44' : 'rgba(255,255,255,0.18)'};border-radius:14px;padding:12px;min-height:116px;font-family:inherit;">
      <div style="display:flex;align-items:center;gap:8px;"><span style="width:24px;height:16px;border-radius:4px;background:#${v.color.toString(16).padStart(6, '0')};display:inline-block;"></span><span style="font-size:20px;font-weight:900;">${v.name}</span></div>
      <div style="font-size:11px;color:rgba(255,255,255,0.62);margin-top:5px;line-height:1.35;">Speed ${v.topSpeed.toFixed(2)} | Handling ${v.handling.toFixed(3)}<br>Boost x${v.boost.toFixed(1)} | Drift x${v.drift.toFixed(1)}</div>
      <div style="font-size:12px;font-weight:800;margin-top:9px;color:${unlocked ? '#88ffaa' : '#ffdd44'};">${actionLabel}</div>
    </button>`;
  }).join('');
  const upgradeCards = UPGRADE_KEYS.map(key => {
    const level = profile.upgrades[key] || 0;
    const cost = getUpgradeCost(key);
    return `<button class="garage-upgrade" data-upgrade="${key}" style="cursor:pointer;color:#fff;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.16);border-radius:12px;padding:9px 10px;text-align:left;font-family:inherit;">
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:12px;"><span>${key.replace(/[A-Z]/g, m => ' ' + m).toUpperCase()}</span><span>Lv ${level}/5</span></div>
      <div style="font-size:11px;color:${level >= 5 ? '#88ffaa' : '#ffdd44'};margin-top:4px;">${level >= 5 ? 'MAXED' : `${cost} coins`}</div>
    </button>`;
  }).join('');
  garageOverlay.innerHTML = `<div style="width:min(960px,94vw);max-height:88vh;overflow:auto;background:rgba(12,12,18,0.92);border:3px solid rgba(255,255,255,0.25);border-radius:22px;padding:22px;box-shadow:0 8px 0 rgba(0,0,0,0.35);">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:18px;">
      <div><div style="font-size:38px;font-weight:900;">GARAGE</div><div style="font-size:13px;color:rgba(255,255,255,0.62);">Coins ${profile.coins} | Level ${profile.level} | Best ${profile.bestScore.toLocaleString()}</div></div>
      <button id="garage-close" style="cursor:pointer;background:rgba(255,255,255,0.12);border:2px solid rgba(255,255,255,0.2);color:#fff;border-radius:12px;padding:10px 16px;font-family:inherit;font-weight:800;">CLOSE</button>
    </div>
    <div style="font-size:13px;letter-spacing:1.5px;color:rgba(255,255,255,0.5);font-weight:800;margin-bottom:8px;">VEHICLES</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:18px;">${vehicleCards}</div>
    <div id="garage-message" aria-live="polite" style="display:${garageMessage ? 'block' : 'none'};margin:-8px 0 16px;padding:9px 12px;border-radius:10px;background:rgba(255,221,68,0.12);border:1px solid rgba(255,221,68,0.42);color:#ffdd44;font-size:13px;font-weight:800;">${garageMessage}</div>
    <div style="font-size:13px;letter-spacing:1.5px;color:rgba(255,255,255,0.5);font-weight:800;margin-bottom:8px;">UPGRADES</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:9px;">${upgradeCards}</div>
  </div>`;
  garageOverlay.querySelector('#garage-close').addEventListener('click', () => { garageOverlay.style.display = 'none'; buildLevelSelect(); });
  garageOverlay.querySelectorAll('.garage-vehicle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.vehicle;
      const v = VEHICLES[id];
      if (!profile.unlockedVehicles.includes(id)) {
        if (profile.coins < v.cost) {
          garageMessage = `You need ${v.cost - profile.coins} more coins to unlock ${v.name}.`;
          renderGarage();
          return;
        }
        profile.coins -= v.cost;
        profile.unlockedVehicles.push(id);
      }
      profile.selectedVehicle = id;
      saveProfile();
      applyVehiclePreset();
      garageMessage = `${v.name} selected.`;
      renderGarage();
    });
  });
  garageOverlay.querySelectorAll('.garage-upgrade').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.upgrade;
      const level = profile.upgrades[key] || 0;
      if (level >= 5) return;
      const cost = getUpgradeCost(key);
      if (profile.coins < cost) {
        garageMessage = `You need ${cost - profile.coins} more coins for this upgrade.`;
        renderGarage();
        return;
      }
      profile.coins -= cost;
      profile.upgrades[key] = level + 1;
      saveProfile();
      applyVehiclePreset();
      garageMessage = 'Upgrade purchased.';
      renderGarage();
    });
  });
}

function openGarage() {
  garageMessage = '';
  renderGarage();
}

window.openGarage = openGarage;

function buildLevelSelect() {
  const dailyCoins = claimDailyRewardIfNeeded();
  levelSelectOverlay.style.display = 'flex';
  levelSelectOverlay.innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:15px;letter-spacing:6px;color:rgba(255,255,255,0.5);margin-bottom:8px;font-weight:600;">SELECT</div>
      <div style="font-size:56px;font-weight:700;color:#fff;letter-spacing:1px;margin-bottom:40px;font-family:'Lilita One',sans-serif;-webkit-text-stroke:2px rgba(0,0,0,0.25);text-shadow:0 5px 0 rgba(0,0,0,0.35);">DIFFICULTY</div>
      ${dailyCoins ? `<div style="margin:-24px auto 22px;width:max-content;background:rgba(255,221,68,0.16);border:2px solid rgba(255,221,68,0.5);border-radius:14px;padding:8px 14px;color:#ffdd44;font-weight:900;">Daily reward +${dailyCoins} coins</div>` : ''}
      <div style="display:flex;gap:18px;justify-content:center;flex-wrap:wrap;">
        ${[1,2,3].map(lvl => {
          const l = LEVELS[lvl];
          return `<div class="level-btn" data-level="${lvl}" style="cursor:pointer;pointer-events:auto;width:200px;padding:28px 20px;border-radius:20px;background:rgba(255,255,255,0.08);border:3px solid rgba(255,255,255,0.25);transition:all 0.2s;text-align:center;box-shadow:0 5px 0 rgba(0,0,0,0.3);">
            <div style="font-size:38px;font-weight:700;color:${l.color};letter-spacing:1px;font-family:'Lilita One',sans-serif;-webkit-text-stroke:1px rgba(0,0,0,0.2);text-shadow:0 3px 0 rgba(0,0,0,0.3);">${l.name}</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:10px;line-height:1.5;font-weight:500;">${l.desc}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:10px;justify-content:center;align-items:center;margin-top:30px;">
        <button id="open-garage" style="cursor:pointer;pointer-events:auto;background:rgba(255,221,68,0.16);border:2px solid rgba(255,221,68,0.55);color:#ffdd44;border-radius:14px;padding:10px 18px;font-family:inherit;font-weight:900;">GARAGE</button>
        <div style="font-size:14px;color:rgba(255,255,255,0.4);font-weight:500;">Click a difficulty to start</div>
      </div>
    </div>`;

  levelSelectOverlay.querySelector('#open-garage').addEventListener('click', openGarage);

  levelSelectOverlay.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.borderColor = 'rgba(255,255,255,0.6)';
      btn.style.transform = 'translateY(-4px)';
      btn.style.boxShadow = '0 8px 0 rgba(0,0,0,0.3)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255,255,255,0.08)';
      btn.style.borderColor = 'rgba(255,255,255,0.25)';
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 5px 0 rgba(0,0,0,0.3)';
    });
    btn.addEventListener('click', () => {
      const lvl = parseInt(btn.dataset.level);
      startLevel(lvl);
    });
  });
}

function startLevel(lvl) {
  currentLevel = lvl;
  const cfg = LEVELS[lvl];
  applyVehiclePreset();
  levelSelectOverlay.style.display = 'none';

  // Configure opponents
  const activeCount = cfg.opponents;
  state.opponents.forEach((opp, i) => {
    opp.mesh.visible = i < activeCount;
    opp.t = 0.1 + i * 0.3;
    opp.prevT = opp.t;
    opp.lap = 0;
  });

  // Configure boxes
  clearBoxes();
  if (cfg.boxes) spawnBoxes();

  // Reset game state
  state.speed = 0;
  state.carAngle = Math.PI / 2;
  state.carPos = { x: -3, z: 25 };
  state.lap = 0;
  state.lapTime = 0;
  state.bestLap = Infinity;
  state.totalTime = 0;
  state.timeRemaining = state.maxTime;
  state.gameOver = false;
  state.checkpoints = [false, false, false, false];
  state.lastCheckpoint = -1;
  state.drifting = false;
  state.driftAngle = 0;
  state.driftMomentum = 0;
  state.driftBoost = 0;
  state.driftBoostActive = false;
  state.driftBoostTimer = 0;
  state.driftPoints = 0;
  state.totalPoints = 0;
  state.pointsMultiplier = 1;
  state.showPointsBanked = 0;
  state.bankedAmount = 0;
  state.driftGracePeriod = 0;
  state.carCrashCooldown = 0;
  state.wallCrashCooldown = 0;
  state.wrongWay = false;
  state.wrongWayTimer = 0;
  state.wrongWayCooldown = 0;
  state.screenShake = 0;
  state.screenShakeIntensity = 0;
  state.crashFlash = 0;
  state.crashFlashIntensity = 0;
  state.pointsFlash = 0;
  state.pointsFlashIntensity = 0;
  state.pendingPointsFlashIntensity = 0;
  state.pointsLog = [];
  state.combo = 1;
  state.comboValue = 0;
  state.comboTimer = 0;
  state.maxCombo = 1;
  state.boost = 25;
  state.boosting = false;
  state.boostCooldown = 0;
  state.boostPulse = 0;
  state.eventPopups = [];
  state.nearMisses = new Map();
  state.nearMissCount = 0;
  state.closeCallCount = 0;
  state.weaveCount = 0;
  state.lastWeaveSide = 0;
  state.lastWeaveTime = -99;
  state.threadNeedleCooldown = 0;
  state.closestNearMiss = Infinity;
  state.crashes = 0;
  state.missionsCompleted = 0;
  state.coinsEarned = 0;
  state.perfectLapActive = true;
  state.dynamicEvent = null;
  state.nextDynamicEventTime = 8 + Math.random() * 8;
  state.eventWarning = null;
  state.eventTimer = 0;
  state.finalCountdownPulse = 0;
  state.weatherGrip = 1;
  runMissions.forEach(m => { m.progress = 0; m.complete = false; });
  state.turnInput = 0;
  state.turnHoldTime = 0;
  state.lastTurnDir = 0;
  state.velocityAngle = Math.PI / 2;
  gameOverOverlay.style.display = 'none';
  countdownTimer = 3;
  raceStarted = false;
  countdownDisplay.style.opacity = '1';
  cameraOffset.set(state.carPos.x, 10, state.carPos.z - 18);
  cameraLookAt.set(state.carPos.x, 1, state.carPos.z);
}

const buildingConfigs = [];
for (let i = 0; i < 80; i++) {
  const t = i / 80;
  const p = getTrackPoint(t);
  const tan = getTrackTangent(t);
  const nx = -tan.z, nz = tan.x;
  
  for (let side = -1; side <= 1; side += 2) {
    if (Math.random() > 0.35) continue;
    
    const dist = TRACK_WIDTH / 2 + 8 + Math.random() * 6;
    const bx = p.x + nx * side * dist;
    const bz = p.z + nz * side * dist;
    
    let tooClose = false;
    for (const bc of buildingConfigs) {
      if ((bc.x - bx) ** 2 + (bc.z - bz) ** 2 < 64) { tooClose = true; break; }
    }
    if (tooClose) continue;
    
    const w = 3 + Math.random() * 4;
    const h = 5 + Math.random() * 10;
    const d = 3 + Math.random() * 4;
    const bMat = [mat.brick, mat.brickDark, mat.brickLight][Math.floor(Math.random() * 3)];
    
    const building = createBuilding(w, h, d, bMat);
    building.position.set(bx, 0, bz);
    building.rotation.y = Math.atan2(tan.x, tan.z) + (Math.random() - 0.5) * 0.3;
    scene.add(building);
    
    buildingConfigs.push({ x: bx, z: bz });
  }
}

// Trees via InstancedMesh (120 trees: 1 trunk + 4 foliage spheres each → 3 instanced meshes)
{
  const TREE_COUNT = 120;
  const FOLIAGE_PER_TREE = 4;

  // Pre-generate tree data (positions, sizes, foliage type)
  const treeData = [];
  const seededRandom = (() => { let s = 42; return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; }; })();

  for (let i = 0; i < TREE_COUNT; i++) {
    const t = i / TREE_COUNT;
    const p = getTrackPoint(t);
    const tan = getTrackTangent(t);
    const nx = -tan.z, nz = tan.x;
    const side = seededRandom() > 0.5 ? 1 : -1;
    const dist = TRACK_WIDTH / 2 + 5 + seededRandom() * 4;
    const tx = p.x + nx * side * dist + (seededRandom() - 0.5) * 2;
    const tz = p.z + nz * side * dist + (seededRandom() - 0.5) * 2;
    const size = 0.6 + seededRandom() * 0.6;
    const useDarkFoliage = seededRandom() > 0.5;
    treeData.push({ x: tx, z: tz, size, useDarkFoliage });
  }

  // Trunk instanced mesh
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2, 6);
  trunkGeo.translate(0, 1, 0); // position.y = size (we'll scale per instance)
  const trunkInstanced = new THREE.InstancedMesh(trunkGeo, mat.trunk, TREE_COUNT);
  trunkInstanced.name = 'treesTrunks';
  trunkInstanced.castShadow = true;
  trunkInstanced.receiveShadow = false;

  // Foliage: separate light and dark instanced meshes
  // Count how many foliage instances for each type
  let lightCount = 0, darkCount = 0;
  treeData.forEach(td => {
    if (td.useDarkFoliage) darkCount += FOLIAGE_PER_TREE;
    else lightCount += FOLIAGE_PER_TREE;
  });

  const foliageGeo = new THREE.SphereGeometry(1, 6, 5); // unit sphere, scaled per instance
  const foliageLightInstanced = new THREE.InstancedMesh(foliageGeo, mat.tree, lightCount);
  foliageLightInstanced.name = 'treesFoliageLight';
  foliageLightInstanced.castShadow = true;
  foliageLightInstanced.receiveShadow = false;

  const foliageDarkInstanced = new THREE.InstancedMesh(foliageGeo, mat.treeDark, darkCount);
  foliageDarkInstanced.name = 'treesFoliageDark';
  foliageDarkInstanced.castShadow = true;
  foliageDarkInstanced.receiveShadow = false;

  // Foliage offsets relative to tree origin (before scaling by tree size)
  const foliageOffsets = [
    { x: 0, y: 2.5, z: 0, r: 1.2 },
    { x: 0.5, y: 2.2, z: 0.3, r: 0.8 },
    { x: -0.4, y: 2.8, z: -0.2, r: 0.7 },
    { x: 0.2, y: 3.1, z: -0.3, r: 0.6 },
  ];

  const dummy = new THREE.Object3D();
  let lightIdx = 0, darkIdx = 0;

  treeData.forEach((td, i) => {
    const s = td.size;

    // Trunk: scaled uniformly by tree size, positioned at tree location
    dummy.position.set(td.x, 0, td.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunkInstanced.setMatrixAt(i, dummy.matrix);

    // Foliage spheres
    foliageOffsets.forEach(fo => {
      dummy.position.set(td.x + fo.x * s, fo.y * s, td.z + fo.z * s);
      dummy.rotation.set(0, 0, 0);
      const fr = fo.r * s;
      dummy.scale.set(fr, fr, fr);
      dummy.updateMatrix();

      if (td.useDarkFoliage) {
        foliageDarkInstanced.setMatrixAt(darkIdx++, dummy.matrix);
      } else {
        foliageLightInstanced.setMatrixAt(lightIdx++, dummy.matrix);
      }
    });
  });

  trunkInstanced.instanceMatrix.needsUpdate = true;
  foliageLightInstanced.instanceMatrix.needsUpdate = true;
  foliageDarkInstanced.instanceMatrix.needsUpdate = true;

  scene.add(trunkInstanced);
  scene.add(foliageLightInstanced);
  scene.add(foliageDarkInstanced);

  trunkGeo.dispose();
  // foliageGeo shared, don't dispose until both are added
}

// Lamp posts via InstancedMesh (40 posts, but only 2 instanced meshes + 5 lights)
{
  const LAMP_COUNT = 40;

  // Shared geometries
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 4, 6);
  poleGeo.translate(0, 2, 0);
  const armGeo = new THREE.BoxGeometry(0.08, 0.08, 1.2);
  armGeo.translate(0, 4, 0.6);
  const elbowGeo = new THREE.SphereGeometry(0.1, 6, 4);
  elbowGeo.translate(0, 4, 0.05);
  const lampHeadGeo = new THREE.BoxGeometry(0.3, 0.2, 0.4);
  lampHeadGeo.translate(0, 3.85, 1.15);

  // Merge pole + arm + elbow into one geometry for the "structure" instanced mesh
  const structureGeo = mergeGeometries([poleGeo, armGeo, elbowGeo]);
  const structureInstanced = new THREE.InstancedMesh(structureGeo, mat.metal, LAMP_COUNT);
  structureInstanced.name = 'lampPostStructures';
  structureInstanced.castShadow = true;
  structureInstanced.receiveShadow = false;

  // Lamp head as separate instanced mesh (emissive material)
  const lampHeadInstanced = new THREE.InstancedMesh(lampHeadGeo, mat.lampLight, LAMP_COUNT);
  lampHeadInstanced.name = 'lampPostHeads';
  lampHeadInstanced.castShadow = false;
  lampHeadInstanced.receiveShadow = false;

  // Pre-compute all lamp positions and rotations, set instance matrices
  const lampPositions = []; // store for light placement
  const dummy = new THREE.Object3D();

  for (let i = 0; i < LAMP_COUNT; i++) {
    const t = i / LAMP_COUNT;
    const p = getTrackPoint(t);
    const tan = getTrackTangent(t);
    const nx = -tan.z, nz = tan.x;
    const side = (i % 2 === 0) ? 1 : -1;
    const dist = TRACK_WIDTH / 2 + 2.5;
    const lx = p.x + nx * side * dist;
    const lz = p.z + nz * side * dist;
    const toRoadX = p.x - lx;
    const toRoadZ = p.z - lz;
    const rotY = Math.atan2(toRoadX, toRoadZ);

    dummy.position.set(lx, 0, lz);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();

    structureInstanced.setMatrixAt(i, dummy.matrix);
    lampHeadInstanced.setMatrixAt(i, dummy.matrix);

    lampPositions.push({ x: lx, z: lz, rotY });
  }

  structureInstanced.instanceMatrix.needsUpdate = true;
  lampHeadInstanced.instanceMatrix.needsUpdate = true;

  scene.add(structureInstanced);
  scene.add(lampHeadInstanced);

  // Clean up merged source geos
  poleGeo.dispose();
  armGeo.dispose();
  elbowGeo.dispose();
  lampHeadGeo.dispose();

  // Only 5 strategically placed PointLights evenly around the track
  const LIGHT_COUNT = 5;
  for (let li = 0; li < LIGHT_COUNT; li++) {
    // Pick the lamp post closest to evenly-spaced track positions
    const targetIdx = Math.round((li / LIGHT_COUNT) * LAMP_COUNT) % LAMP_COUNT;
    const lp = lampPositions[targetIdx];
    // Offset light toward the road (in the direction the lamp arm faces)
    const offX = Math.sin(lp.rotY) * 1.15;
    const offZ = Math.cos(lp.rotY) * 1.15;
    const light = new THREE.PointLight(0xFFDD88, 2.5, 18, 1.5);
    light.name = `lampLight_${li}`;
    light.position.set(lp.x + offX, 3.7, lp.z + offZ);
    scene.add(light);
  }
}

// ============ COLLISION ============
function isOnTrack(px, pz) {
  const { dist } = getClosestTrackT(px, pz);
  return dist < TRACK_WIDTH / 2 + 1;
}

// ============ HUD ============
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:"Fredoka","Lilita One",Arial,sans-serif;z-index:100;';
document.body.appendChild(hud);



const timerDisplay = document.createElement('div');
timerDisplay.style.cssText = 'position:absolute;top:16px;left:24px;text-align:center;pointer-events:none;background:rgba(0,0,0,0.55);border:3px solid rgba(255,255,255,0.7);border-radius:18px;padding:8px 18px;box-shadow:0 4px 0 rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.15);min-width:100px;';
hud.appendChild(timerDisplay);

const lapDisplay = document.createElement('div');
lapDisplay.style.cssText = 'position:absolute;top:16px;right:24px;text-align:center;pointer-events:none;background:rgba(0,0,0,0.55);border:3px solid rgba(255,255,255,0.7);border-radius:18px;padding:8px 18px;box-shadow:0 4px 0 rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.15);';
hud.appendChild(lapDisplay);

const gameOverOverlay = document.createElement('div');
gameOverOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);z-index:200;';
hud.appendChild(gameOverOverlay);

const minimapCanvas = document.createElement('canvas');
minimapCanvas.width = 160;
minimapCanvas.height = 160;
minimapCanvas.style.cssText = 'position:absolute;bottom:30px;left:24px;border-radius:20px;border:3px solid rgba(255,255,255,0.7);background:rgba(0,0,0,0.6);box-shadow:0 4px 0 rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.15);';
hud.appendChild(minimapCanvas);
const minimapCtx = minimapCanvas.getContext('2d');

const countdownDisplay = document.createElement('div');
countdownDisplay.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:130px;font-weight:900;color:white;font-family:"Lilita One","Fredoka",sans-serif;text-shadow:0 0 40px rgba(255,100,100,0.8),0 6px 0 rgba(0,0,0,0.5),0 8px 20px rgba(0,0,0,0.4);-webkit-text-stroke:4px rgba(0,0,0,0.35);transition:all 0.3s;';
hud.appendChild(countdownDisplay);

const pointsDisplay = document.createElement('div');
pointsDisplay.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;background:rgba(0,0,0,0.55);border:3px solid rgba(255,220,60,0.8);border-radius:18px;padding:8px 22px;box-shadow:0 4px 0 rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,200,0.15);';
hud.appendChild(pointsDisplay);

const arcadeHud = document.createElement('div');
arcadeHud.style.cssText = 'position:absolute;top:112px;left:24px;width:250px;pointer-events:none;color:#fff;';
hud.appendChild(arcadeHud);

const boostDisplay = document.createElement('div');
boostDisplay.style.cssText = 'position:absolute;bottom:106px;left:50%;transform:translateX(-50%);width:280px;pointer-events:none;';
hud.appendChild(boostDisplay);

const eventBanner = document.createElement('div');
eventBanner.style.cssText = 'position:absolute;top:18%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:160;';
hud.appendChild(eventBanner);

const popupStack = document.createElement('div');
popupStack.style.cssText = 'position:absolute;top:31%;left:50%;transform:translateX(-50%);width:420px;text-align:center;pointer-events:none;z-index:155;';
hud.appendChild(popupStack);

const pointsLogPanel = document.createElement('div');
pointsLogPanel.style.cssText = 'position:absolute;bottom:30px;right:24px;width:210px;max-height:260px;overflow:hidden;pointer-events:none;display:flex;flex-direction:column-reverse;';
hud.appendChild(pointsLogPanel);

const driftComboDisplay = document.createElement('div');
driftComboDisplay.style.cssText = 'position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;opacity:0;transition:opacity 0.2s;';
hud.appendChild(driftComboDisplay);

const wrongWayDisplay = document.createElement('div');
wrongWayDisplay.style.cssText = 'position:absolute;top:22%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;opacity:0;transition:opacity 0.2s;z-index:150;';
hud.appendChild(wrongWayDisplay);

const controlsHint = document.createElement('div');
controlsHint.style.cssText = 'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.55);color:#ddd;padding:10px 22px;border-radius:16px;font-size:13px;font-weight:500;border:3px solid rgba(255,255,255,0.5);box-shadow:0 4px 0 rgba(0,0,0,0.3);';
controlsHint.innerHTML = 'JOYSTICK / WASD - drive &nbsp;|&nbsp; DRIFT / SPACE &nbsp;|&nbsp; BOOST / E';
hud.appendChild(controlsHint);

const gamepadDisplay = document.createElement('div');
gamepadDisplay.style.cssText = 'position:absolute;bottom:78px;right:24px;display:none;background:rgba(0,0,0,0.58);color:#88ffaa;padding:8px 12px;border-radius:12px;font-size:11px;font-weight:800;border:2px solid rgba(100,255,160,0.45);letter-spacing:0.5px;';
hud.appendChild(gamepadDisplay);

// ============ DIFFICULTY BUTTON ============
const diffBtn = document.createElement('div');
diffBtn.style.cssText = 'position:absolute;bottom:74px;left:50%;transform:translateX(-50%);pointer-events:auto;cursor:pointer;background:rgba(0,0,0,0.55);padding:8px 18px;border-radius:16px;border:3px solid rgba(255,255,255,0.5);display:flex;align-items:center;gap:10px;transition:all 0.2s;user-select:none;box-shadow:0 4px 0 rgba(0,0,0,0.3);';
hud.appendChild(diffBtn);

function updateDiffBtn() {
  const lvl = LEVELS[currentLevel];
  if (!lvl) { diffBtn.style.display = 'none'; return; }
  diffBtn.style.display = 'flex';
  diffBtn.innerHTML = `<span style="font-size:11px;color:rgba(255,255,255,0.6);font-weight:600;letter-spacing:1px;">DIFFICULTY</span><span style="font-size:14px;font-weight:700;color:${lvl.color};letter-spacing:0.5px;-webkit-text-stroke:0.5px rgba(0,0,0,0.3);">${lvl.name}</span>`;
}
updateDiffBtn();

diffBtn.addEventListener('mouseenter', () => { diffBtn.style.background = 'rgba(0,0,0,0.7)'; diffBtn.style.borderColor = 'rgba(255,255,255,0.8)'; diffBtn.style.transform = 'translateX(-50%) translateY(-2px)'; diffBtn.style.boxShadow = '0 6px 0 rgba(0,0,0,0.3)'; });
diffBtn.addEventListener('mouseleave', () => { diffBtn.style.background = 'rgba(0,0,0,0.55)'; diffBtn.style.borderColor = 'rgba(255,255,255,0.5)'; diffBtn.style.transform = 'translateX(-50%) translateY(0)'; diffBtn.style.boxShadow = '0 4px 0 rgba(0,0,0,0.3)'; });
diffBtn.addEventListener('click', () => {
  // Cycle difficulty: 1 -> 2 -> 3 -> 1
  const nextLvl = (currentLevel % 3) + 1;
  startLevel(nextLvl);
  updateDiffBtn();
});

// ============ FPS COUNTER ============
let fpsVisible = false;
let fpsFrames = 0;
let fpsLastTime = performance.now();
let fpsValue = 0;

const fpsDisplay = document.createElement('div');
fpsDisplay.style.cssText = 'position:absolute;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.55);color:#0f0;padding:6px 14px;border-radius:14px;font-family:"Fredoka",monospace;font-size:14px;font-weight:700;border:3px solid rgba(0,255,0,0.5);display:none;pointer-events:none;z-index:300;box-shadow:0 4px 0 rgba(0,0,0,0.3);';
hud.appendChild(fpsDisplay);

function toggleFPS() {
  fpsVisible = !fpsVisible;
  fpsDisplay.style.display = fpsVisible ? 'block' : 'none';
}

function updateFPS() {
  fpsFrames++;
  const now = performance.now();
  const elapsed = now - fpsLastTime;
  if (elapsed >= 500) {
    fpsValue = Math.round((fpsFrames * 1000) / elapsed);
    fpsFrames = 0;
    fpsLastTime = now;
    if (fpsVisible) {
      fpsDisplay.textContent = `${fpsValue} FPS`;
    }
  }
}

// ============ MINIMAP ============
function drawMinimap() {
  const ctx = minimapCtx;
  const w = 160, h = 160;
  ctx.clearRect(0, 0, w, h);
  
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const p = getTrackPoint(t);
    const mx = w / 2 + p.x * 1.7;
    const my = h / 2 + p.z * 1.7;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.lineTo(mx, my);
  }
  ctx.closePath();
  ctx.stroke();
  
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const p = getTrackPoint(t);
    const mx = w / 2 + p.x * 1.7;
    const my = h / 2 + p.z * 1.7;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.lineTo(mx, my);
  }
  ctx.closePath();
  ctx.stroke();
  
  state.opponents.forEach((opp, i) => {
    if (!opp.mesh.visible) return;
    const p = getTrackPoint(opp.t);
    const mx = w / 2 + p.x * 1.7;
    const my = h / 2 + p.z * 1.7;
    ctx.fillStyle = ['#2255DD', '#22AA44', '#DDAA22'][i];
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw boxes on minimap
  state.boxes.forEach(box => {
    const mx = w / 2 + box.x * 1.7;
    const my = h / 2 + box.z * 1.7;
    ctx.fillStyle = '#CC8833';
    ctx.fillRect(mx - 2, my - 2, 4, 4);
  });
  
  const px = w / 2 + state.carPos.x * 1.7;
  const py = h / 2 + state.carPos.z * 1.7;
  ctx.fillStyle = '#FF3333';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// ============ PARTICLE SYSTEM ============
function spawnParticle(x, y, z) {
  const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const grey = 0x70 + Math.floor(Math.random() * 0x30);
  const particle = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: (grey << 16) | (grey << 8) | grey, transparent: true, opacity: 0.8 }));
  particle.position.set(x, y, z);
  scene.add(particle);
  state.particles.push({
    mesh: particle,
    vel: { x: (Math.random() - 0.5) * 0.1, y: Math.random() * 0.08, z: (Math.random() - 0.5) * 0.1 },
    life: 1,
    type: 'dust',
  });
}

function spawnDriftSmoke(x, y, z) {
  const geo = new THREE.SphereGeometry(0.15 + Math.random() * 0.15, 4, 4);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });
  const particle = new THREE.Mesh(geo, smokeMat);
  particle.position.set(x, y, z);
  scene.add(particle);
  state.particles.push({
    mesh: particle,
    vel: { x: (Math.random() - 0.5) * 0.03, y: 0.02 + Math.random() * 0.02, z: (Math.random() - 0.5) * 0.03 },
    life: 1,
    type: 'smoke',
  });
}

function spawnDriftSpark(x, y, z) {
  const geo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  const sparkMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0x00eeff : 0xaa44ff });
  const particle = new THREE.Mesh(geo, sparkMat);
  particle.position.set(x, y, z);
  scene.add(particle);
  state.particles.push({
    mesh: particle,
    vel: {
      x: (Math.random() - 0.5) * 0.15,
      y: 0.05 + Math.random() * 0.1,
      z: (Math.random() - 0.5) * 0.15,
    },
    life: 0.5 + Math.random() * 0.3,
    type: 'spark',
  });
}

function spawnBoostFlame(x, y, z) {
  // Electric boost plasma — cyan/blue/violet energy burst instead of orange fire
  const geo = new THREE.SphereGeometry(0.10 + Math.random() * 0.10, 4, 4);
  const pick = Math.random();
  const col = pick > 0.65 ? 0x00eeff : pick > 0.30 ? 0x6644ff : 0xcc44ff;
  const flameMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
  const particle = new THREE.Mesh(geo, flameMat);
  particle.position.set(x, y, z);
  scene.add(particle);
  state.particles.push({
    mesh: particle,
    vel: {
      x: (Math.random() - 0.5) * 0.06,
      y: 0.01 + Math.random() * 0.04,
      z: (Math.random() - 0.5) * 0.06,
    },
    life: 0.25 + Math.random() * 0.2,
    type: 'flame',
  });
}

// ---- Exhaust smoke puff ----
// Emitted from rear exhaust pipe at idle/low speeds, dark grey-brown at idle, light grey when moving
state.exhaustTimer = 0;

// ============ ENGINE AUDIO SYSTEM ============
// Sample-based EV audio: real recorded motor sounds pitch-shifted by speed
const engineAudio = {
  ctx: null,
  buffers: {},
  engineSource: null,
  engineGain: null,
  filterNode: null,
  started: false,
  loaded: false,
};

async function _loadAudioBuffer(ctx, url) {
  const resp = await fetch(url);
  const ab = await resp.arrayBuffer();
  return ctx.decodeAudioData(ab);
}

function _startEngineLoop() {
  if (!engineAudio.loaded || !engineAudio.ctx || engineAudio.engineSource) return;
  const ctx = engineAudio.ctx;
  const src = ctx.createBufferSource();
  src.buffer = engineAudio.buffers.rev;
  src.loop = true;
  src.playbackRate.value = 0.28;
  src.connect(engineAudio.filterNode);
  src.start();
  engineAudio.engineSource = src;
  engineAudio.engineGain.gain.setTargetAtTime(0.60, ctx.currentTime, 0.6);
}

function initEngineAudio() {
  if (engineAudio.started) return;
  engineAudio.started = true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    engineAudio.ctx = ctx;

    // Build processing chain (works before samples load)
    engineAudio.filterNode = ctx.createBiquadFilter();
    engineAudio.filterNode.type = 'lowpass';
    engineAudio.filterNode.frequency.value = 1200;
    engineAudio.filterNode.Q.value = 0.7;

    engineAudio.engineGain = ctx.createGain();
    engineAudio.engineGain.gain.value = 0;

    engineAudio.filterNode.connect(engineAudio.engineGain);
    engineAudio.engineGain.connect(ctx.destination);

    // Load the real EV motor recordings
    Promise.all([
      _loadAudioBuffer(ctx, '/sound/ev-supercar-rev-rac5jyuh.wav'),
    ]).then(([revBuf]) => {
      if (!engineAudio.ctx) return;
      engineAudio.buffers.rev = revBuf;
      engineAudio.loaded = true;
      _startEngineLoop();
    }).catch(e => console.warn('EV sound load failed:', e));
  } catch (e) {
    console.warn('Engine audio init failed:', e);
  }
}

function updateEngineAudio(speedRatio) {
  if (!engineAudio.started || !engineAudio.ctx) return;
  if (engineAudio.ctx.state === 'suspended') engineAudio.ctx.resume();
  if (!engineAudio.engineSource) return;

  const t = engineAudio.ctx.currentTime;
  const abs = Math.abs(speedRatio);

  // Pitch: idle 0.28x → full throttle 2.1x playback rate
  const rate = 0.28 + Math.pow(abs, 0.62) * 1.82;
  engineAudio.engineSource.playbackRate.setTargetAtTime(rate, t, 0.07);

  // Volume swells at speed for immersion
  const vol = 0.38 + abs * 0.32;
  engineAudio.engineGain.gain.setTargetAtTime(vol, t, 0.10);

  // Low-pass opens at high speed to let the high-freq whine through
  const lpFreq = 900 + abs * 5500;
  engineAudio.filterNode.frequency.setTargetAtTime(lpFreq, t, 0.09);
}

function playSfx(type) {
  if (!engineAudio.started || !engineAudio.ctx) return;
  const ctx = engineAudio.ctx;
  const now = ctx.currentTime;

  function synth(freq, endFreq, dur, wave, vol, delay) {
    delay = delay || 0;
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now + delay);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + delay + dur);
    out.gain.setValueAtTime(0.0001, now + delay);
    out.gain.exponentialRampToValueAtTime(vol, now + delay + 0.018);
    out.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
    osc.connect(out);
    osc.start(now + delay);
    osc.stop(now + delay + dur + 0.02);
  }

  function noiseBurst(dur, filterFreq, vol, delay) {
    delay = delay || 0;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    filt.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filt);
    filt.connect(g);
    g.connect(ctx.destination);
    src.start(now + delay);
  }

  if (type === 'boost') {
    // Capacitor discharge surge: big power sweep + energy noise crack
    synth(160, 3400, 0.50, 'sine', 0.13);
    synth(320, 5000, 0.35, 'triangle', 0.07, 0.03);
    noiseBurst(0.09, 2800, 0.08);
  } else if (type === 'drift') {
    // Regen braking: descending motor whine + tire squeal noise
    synth(1600, 500, 0.28, 'triangle', 0.06);
    noiseBurst(0.22, 4000, 0.04);
  } else if (type === 'crash_car') {
    // High-speed collision: thud + crunch + metallic ring
    synth(130, 30, 0.45, 'sine', 0.15);
    noiseBurst(0.40, 700, 0.12);
    synth(380, 200, 0.35, 'triangle', 0.07, 0.05);
  } else if (type === 'crash_wall') {
    // Wall scrape: bass thud + noise + short metallic tick
    synth(110, 25, 0.38, 'sine', 0.13);
    noiseBurst(0.30, 1200, 0.10);
    synth(600, 350, 0.15, 'triangle', 0.05, 0.04);
  } else if (type === 'near_miss') {
    synth(900, 2000, 0.11, 'sine', 0.055);
  } else if (type === 'close_call' || type === 'thread_needle') {
    synth(700, 2200, 0.18, 'triangle', 0.065);
    noiseBurst(0.08, 3000, 0.03);
  } else if (type === 'traffic_weave' || type === 'combo') {
    const base = 500 + (state.combo || 0) * 60;
    synth(base, base * 1.7, 0.11, 'sine', 0.04);
  } else if (type === 'lap' || type === 'perfect_lap' || type === 'mission') {
    // Two-note electric chime
    synth(660, 660, 0.28, 'sine', 0.10);
    synth(990, 990, 0.22, 'sine', 0.08, 0.20);
    synth(1320, 1320, 0.15, 'sine', 0.05, 0.38);
  } else if (type === 'warning') {
    synth(1000, 700, 0.16, 'sine', 0.08);
    synth(1000, 700, 0.16, 'sine', 0.07, 0.22);
  } else if (type === 'siren') {
    synth(880, 1100, 0.18, 'sine', 0.045);
  }
}

function stopEngineAudio() {
  if (!engineAudio.started) return;
  try {
    if (engineAudio.engineGain && engineAudio.ctx) {
      engineAudio.engineGain.gain.setTargetAtTime(0, engineAudio.ctx.currentTime, 0.2);
    }
    setTimeout(() => {
      try { if (engineAudio.engineSource) engineAudio.engineSource.stop(); } catch (e) {}
      engineAudio.engineSource = null;
      engineAudio.loaded = false;
      engineAudio.buffers = {};
      if (engineAudio.ctx) { try { engineAudio.ctx.close(); } catch (e) {} }
      engineAudio.ctx = null;
      engineAudio.started = false;
    }, 400);
  } catch (e) {}
}

// Start audio on first user interaction (required by browser autoplay policy)
function tryStartEngineAudio() {
  if (!engineAudio.started && currentLevel !== 0) {
    initEngineAudio();
  }
}
window.addEventListener('keydown',     tryStartEngineAudio, { once: false });
window.addEventListener('touchstart',  tryStartEngineAudio, { once: false });
window.addEventListener('mousedown',   tryStartEngineAudio, { once: false });

function spawnExhaustPuff(x, y, z, isIdle) {
  // EVs have no exhaust pipe — emit tiny electric energy sparks from the motor
  // under hard acceleration; skip at idle (no combustion, no emissions)
  if (isIdle) return;
  const geo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  const pick = Math.random();
  const col = pick > 0.5 ? 0x00ddff : 0x8844ff;
  const sparkMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 });
  const spark = new THREE.Mesh(geo, sparkMat);
  spark.position.set(x, y, z);
  scene.add(spark);
  state.particles.push({
    mesh: spark,
    vel: {
      x: (Math.random() - 0.5) * 0.05,
      y: 0.02 + Math.random() * 0.03,
      z: (Math.random() - 0.5) * 0.05,
    },
    life: 0.3 + Math.random() * 0.2,
    type: 'exhaust',
  });
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    const fadeRate = p.type === 'smoke' ? 1.5 : p.type === 'spark' ? 3 : p.type === 'flame' ? 4 : p.type === 'exhaust' ? 0.85 : 2;
    p.life -= dt * fadeRate;
    p.mesh.position.x += p.vel.x;
    p.mesh.position.y += p.vel.y;
    p.mesh.position.z += p.vel.z;

    if (p.type === 'smoke') {
      p.mesh.scale.multiplyScalar(1 + dt * 2);
      p.vel.y *= 0.98;
    } else if (p.type === 'exhaust') {
      // Puff expands and floats upward, slowing down
      p.mesh.scale.multiplyScalar(1 + dt * 1.8);
      p.vel.y *= 0.97;
      p.vel.x *= 0.96;
      p.vel.z *= 0.96;
    } else if (p.type === 'spark') {
      p.vel.y -= 0.006;
    } else if (p.type === 'flame') {
      p.mesh.scale.multiplyScalar(1 - dt * 3);
    } else {
      p.vel.y -= 0.003;
    }

    p.mesh.material.opacity = Math.max(0, p.life * (p.type === 'exhaust' ? 0.55 : 1));
    p.mesh.material.transparent = true;
    
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      state.particles.splice(i, 1);
    }
  }
}

// ============ SKID MARK SYSTEM ============
// Skid marks via single InstancedMesh (300 instances, fading via instance color alpha)
const skidGeo = new THREE.PlaneGeometry(0.35, 1.2);
skidGeo.rotateX(-Math.PI / 2);
const skidMatInst = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  fog: false,
});
const skidInstanced = new THREE.InstancedMesh(skidGeo, skidMatInst, state.maxSkidMarks);
skidInstanced.name = 'skidMarksInstanced';
skidInstanced.frustumCulled = false;
skidInstanced.renderOrder = 2;
skidInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

// Instance colors: RGB where we use all channels for the dark skid color, alpha handled via color brightness
// We'll use instanceColor to fade: bright = visible, black = invisible against dark road
const skidColors = new Float32Array(state.maxSkidMarks * 3);
const skidDummy = new THREE.Object3D();

// Initialize all instances off-screen and invisible
for (let i = 0; i < state.maxSkidMarks; i++) {
  skidDummy.position.set(0, -100, 0);
  skidDummy.rotation.set(0, 0, 0);
  skidDummy.scale.set(1, 1, 1);
  skidDummy.updateMatrix();
  skidInstanced.setMatrixAt(i, skidDummy.matrix);
  // Start with zero color (invisible on dark road)
  skidColors[i * 3] = 0;
  skidColors[i * 3 + 1] = 0;
  skidColors[i * 3 + 2] = 0;
  state.skidMarks.push({ life: 0, maxLife: 0 });
}
skidInstanced.instanceColor = new THREE.InstancedBufferAttribute(skidColors, 3);
skidInstanced.instanceColor.setUsage(THREE.DynamicDrawUsage);
scene.add(skidInstanced);

function spawnSkidMark(x, z, angle) {
  const idx = state.skidMarkIndex % state.maxSkidMarks;
  const mark = state.skidMarks[idx];
  skidDummy.position.set(x, 0.07, z);
  skidDummy.rotation.set(0, angle, 0);
  skidDummy.scale.set(1, 1, 1);
  skidDummy.updateMatrix();
  skidInstanced.setMatrixAt(idx, skidDummy.matrix);
  skidInstanced.instanceMatrix.needsUpdate = true;
  // Set color to black skid mark at full intensity
  const ca = skidInstanced.instanceColor.array;
  ca[idx * 3] = 0.05;
  ca[idx * 3 + 1] = 0.05;
  ca[idx * 3 + 2] = 0.05;
  skidInstanced.instanceColor.needsUpdate = true;
  mark.life = 8.0;
  mark.maxLife = 8.0;
  state.skidMarkIndex++;
}

function updateSkidMarks(dt) {
  let colorDirty = false;
  const ca = skidInstanced.instanceColor.array;
  const baseC = 0.05;
  for (let i = 0; i < state.maxSkidMarks; i++) {
    const mark = state.skidMarks[i];
    if (mark.life > 0) {
      mark.life -= dt;
      let fade = 1;
      if (mark.life < 3) {
        fade = Math.max(0, mark.life / 3);
      }
      if (mark.life <= 0) {
        fade = 0;
        // Move off-screen
        skidDummy.position.set(0, -100, 0);
        skidDummy.rotation.set(0, 0, 0);
        skidDummy.scale.set(1, 1, 1);
        skidDummy.updateMatrix();
        skidInstanced.setMatrixAt(i, skidDummy.matrix);
        skidInstanced.instanceMatrix.needsUpdate = true;
      }
      const c = baseC * fade;
      ca[i * 3] = c;
      ca[i * 3 + 1] = c;
      ca[i * 3 + 2] = c;
      colorDirty = true;
    }
  }
  if (colorDirty) {
    skidInstanced.instanceColor.needsUpdate = true;
  }
}

// ============ DEBUG FREE-CAM MODE ============
let debugMode = false;
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.1;
orbitControls.enabled = false;
orbitControls.maxPolarAngle = Math.PI * 0.85;
orbitControls.minDistance = 2;
orbitControls.maxDistance = 150;

const debugBanner = document.createElement('div');
debugBanner.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#0f0;padding:12px 28px;border-radius:16px;font-family:"Fredoka",monospace;font-size:15px;font-weight:600;z-index:300;pointer-events:none;opacity:0;transition:opacity 0.3s;border:3px solid rgba(0,255,0,0.5);box-shadow:0 4px 0 rgba(0,0,0,0.3);';
document.body.appendChild(debugBanner);

// ============ SCENE SETTINGS UI ============
let settingsOpen = false;
const settingsPanel = document.createElement('div');
settingsPanel.style.cssText = 'position:fixed;top:50%;right:20px;transform:translateY(-50%);width:280px;max-height:80vh;overflow-y:auto;background:rgba(10,10,14,0.85);border:3px solid rgba(255,255,255,0.5);border-radius:22px;padding:20px 18px;z-index:400;pointer-events:auto;font-family:"Fredoka","Lilita One",sans-serif;color:#fff;display:none;box-shadow:0 6px 0 rgba(0,0,0,0.3);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;';
document.body.appendChild(settingsPanel);

const settingsState = {
  fogDensity: 0.012,
  exposure: 0.45,
  bgBlur: 0.40,
  bgIntensity: 0.65,
  sunIntensity: 1.60,
  ambientIntensity: 0.00,
  shadowsEnabled: true,
  sunColorHex: '#d4a44a',
  ambientColorHex: '#d4956b',
  fogColorHex: '#d4956b',
};

function toggleSettings() {
  settingsOpen = !settingsOpen;
  settingsPanel.style.display = settingsOpen ? 'block' : 'none';
}

function buildSettingsUI() {
  const s = settingsState;
  settingsPanel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div style="font-size:15px;font-weight:700;letter-spacing:1px;opacity:0.9;">⚙ SCENE SETTINGS</div>
      <div id="settings-close" style="cursor:pointer;font-size:18px;opacity:0.5;padding:2px 6px;">✕</div>
    </div>
    <div style="font-size:10px;letter-spacing:1.5px;opacity:0.35;margin-bottom:10px;font-weight:600;">LIGHTING</div>
    ${makeSlider('Sun Intensity', 'sunIntensity', 0, 5, 0.1, s.sunIntensity)}
    ${makeSlider('Ambient Intensity', 'ambientIntensity', 0, 3, 0.05, s.ambientIntensity)}
    ${makeColorPicker('Sun Color', 'sunColorHex', s.sunColorHex)}
    ${makeColorPicker('Ambient Color', 'ambientColorHex', s.ambientColorHex)}
    <div style="height:1px;background:rgba(255,255,255,0.08);margin:14px 0;"></div>
    <div style="font-size:10px;letter-spacing:1.5px;opacity:0.35;margin-bottom:10px;font-weight:600;">ATMOSPHERE</div>
    ${makeSlider('Fog Density', 'fogDensity', 0, 0.03, 0.001, s.fogDensity)}
    ${makeColorPicker('Fog Color', 'fogColorHex', s.fogColorHex)}
    ${makeSlider('Exposure', 'exposure', 0.2, 3, 0.05, s.exposure)}
    ${makeSlider('BG Blur', 'bgBlur', 0, 1, 0.05, s.bgBlur)}
    ${makeSlider('BG Intensity', 'bgIntensity', 0, 2, 0.05, s.bgIntensity)}
    <div style="height:1px;background:rgba(255,255,255,0.08);margin:14px 0;"></div>
    <div style="font-size:10px;letter-spacing:1.5px;opacity:0.35;margin-bottom:10px;font-weight:600;">RENDERING</div>
    ${makeToggle('Shadows', 'shadowsEnabled', s.shadowsEnabled)}
    <div style="margin-top:14px;text-align:center;">
      <button id="settings-reset" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#aaa;padding:6px 18px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;">Reset Defaults</button>
    </div>
    <div style="font-size:10px;opacity:0.25;text-align:center;margin-top:12px;">Press V to toggle</div>
  `;

  settingsPanel.querySelector('#settings-close').addEventListener('click', toggleSettings);
  settingsPanel.querySelector('#settings-reset').addEventListener('click', resetSettings);

  settingsPanel.querySelectorAll('[data-setting]').forEach(el => {
    const key = el.dataset.setting;
    if (el.type === 'range') {
      el.addEventListener('input', () => {
        settingsState[key] = parseFloat(el.value);
        const valSpan = el.parentElement.querySelector('.setting-val');
        if (valSpan) valSpan.textContent = parseFloat(el.value).toFixed(key === 'fogDensity' ? 3 : 2);
        applySettings();
      });
    } else if (el.type === 'color') {
      el.addEventListener('input', () => {
        settingsState[key] = el.value;
        applySettings();
      });
    } else if (el.type === 'checkbox') {
      el.addEventListener('change', () => {
        settingsState[key] = el.checked;
        applySettings();
      });
    }
  });
}

function makeSlider(label, key, min, max, step, value) {
  const dec = key === 'fogDensity' ? 3 : 2;
  return `<div style="margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span style="font-size:12px;opacity:0.7;">${label}</span>
      <span class="setting-val" style="font-size:12px;opacity:0.5;font-variant-numeric:tabular-nums;">${value.toFixed(dec)}</span>
    </div>
    <input data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"
      style="width:100%;height:4px;-webkit-appearance:none;appearance:none;background:rgba(255,255,255,0.12);border-radius:2px;outline:none;cursor:pointer;accent-color:#6688ff;">
  </div>`;
}

function makeColorPicker(label, key, value) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
    <span style="font-size:12px;opacity:0.7;">${label}</span>
    <input data-setting="${key}" type="color" value="${value}"
      style="width:32px;height:24px;border:1px solid rgba(255,255,255,0.15);border-radius:6px;background:transparent;cursor:pointer;padding:0;">
  </div>`;
}

function makeToggle(label, key, value) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
    <span style="font-size:12px;opacity:0.7;">${label}</span>
    <label style="position:relative;width:38px;height:20px;cursor:pointer;">
      <input data-setting="${key}" type="checkbox" ${value ? 'checked' : ''}
        style="opacity:0;width:0;height:0;position:absolute;">
      <span style="position:absolute;top:0;left:0;right:0;bottom:0;background:${value ? 'rgba(100,140,255,0.6)' : 'rgba(255,255,255,0.12)'};border-radius:10px;transition:background 0.2s;">
        <span style="position:absolute;top:2px;left:${value ? '20px' : '2px'};width:16px;height:16px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>
      </span>
    </label>
  </div>`;
}

function applyNightVisibility() {
  const nightFogColor = new THREE.Color(0x414663);
  scene.fog = new THREE.FogExp2(nightFogColor, 0.012);
  scene.background = nightFogColor.clone();
  renderer.toneMappingExposure = Math.max(settingsState.exposure, 0.88);
  ambientLight.color.set(0xb1c8f0);
  ambientLight.intensity = 1.18;
  sunLight.color.set(0xaec8ff);
  sunLight.intensity = 1.05;
  nightVisibilityLight.intensity = 0.62;
  playerNightHeadlight.intensity = 44;
}

function applySettings() {
  if (state.dynamicEvent?.type === 'night') {
    applyNightVisibility();
    return;
  }
  const s = settingsState;
  renderer.toneMappingExposure = s.exposure;
  const fogColor = new THREE.Color(s.fogColorHex);
  scene.fog = new THREE.FogExp2(fogColor, s.fogDensity);
  // Always sync background to fog color for seamless horizon
  scene.background = fogColor.clone();
  scene.backgroundBlurriness = 0;
  scene.backgroundIntensity = 1.0;
  sunLight.intensity = s.sunIntensity;
  sunLight.color.set(s.sunColorHex);
  ambientLight.intensity = s.ambientIntensity;
  ambientLight.color.set(s.ambientColorHex);
  nightVisibilityLight.intensity = 0;
  playerNightHeadlight.intensity = 0;
  renderer.shadowMap.enabled = s.shadowsEnabled;
  sunLight.castShadow = s.shadowsEnabled;
  // Update ground vertex colors to fade into new fog color
  const ground = track.getObjectByName('groundPlane');
  if (ground) {
    const grassCol = new THREE.Color(0x66AA44);
    const positions = ground.geometry.attributes.position;
    const colors = ground.geometry.attributes.color;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getY(i);
      const dist = Math.sqrt(x * x + z * z);
      const t = THREE.MathUtils.smoothstep(dist, 50, 130);
      const c = grassCol.clone().lerp(fogColor, t);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
  }
  // Update horizon ring color
  const horizon = track.getObjectByName('horizonRing');
  if (horizon) {
    horizon.material.color.copy(fogColor);
  }
}

function resetSettings() {
  settingsState.fogDensity = 0.012;
  settingsState.exposure = 0.45;
  settingsState.bgBlur = 0.40;
  settingsState.bgIntensity = 0.65;
  settingsState.sunIntensity = 1.60;
  settingsState.ambientIntensity = 0.00;
  settingsState.shadowsEnabled = true;
  settingsState.sunColorHex = '#d4a44a';
  settingsState.ambientColorHex = '#d4956b';
  settingsState.fogColorHex = '#d4956b';
  applySettings();
  buildSettingsUI();
}

buildSettingsUI();

function toggleDebugMode() {
  debugMode = !debugMode;
  orbitControls.enabled = debugMode;
  if (debugMode) {
    orbitControls.target.set(state.carPos.x, 1, state.carPos.z);
    orbitControls.update();
    debugBanner.textContent = '🔍 DEBUG CAM — press F to return 🚌';
    debugBanner.style.opacity = '1';
    setTimeout(() => { debugBanner.style.opacity = '0'; }, 2000);
  } else {
    debugBanner.textContent = '🚌 RACE CAM';
    debugBanner.style.opacity = '1';
    setTimeout(() => { debugBanner.style.opacity = '0'; }, 1500);
    cameraOffset.set(
      state.carPos.x - Math.sin(state.carAngle) * 18,
      10,
      state.carPos.z - Math.cos(state.carAngle) * 18
    );
    cameraLookAt.set(
      state.carPos.x + Math.sin(state.carAngle) * 4,
      1.5,
      state.carPos.z + Math.cos(state.carAngle) * 4
    );
  }
}

// ============ INPUT ============
window.addEventListener('keydown', e => {
  if (e.code === 'KeyF') { toggleDebugMode(); return; }
  if (e.code === 'KeyG') { toggleFPS(); return; }
  if (e.code === 'KeyV' && !e.ctrlKey && !e.metaKey) {
    toggleSettings();
    return;
  }
  state.keys[e.code] = true;
});
window.addEventListener('keyup', e => { state.keys[e.code] = false; });

function axisWithDeadzone(value, deadzone = 0.14) {
  const abs = Math.abs(value || 0);
  if (abs <= deadzone) return 0;
  return Math.sign(value) * ((abs - deadzone) / (1 - deadzone));
}

function gamepadButtonDown(pad, index, threshold = 0.18) {
  const button = pad?.buttons?.[index];
  return Boolean(button && (button.pressed || button.value > threshold));
}

function gamepadButtonValue(pad, index) {
  const button = pad?.buttons?.[index];
  return button ? Math.max(button.pressed ? 1 : 0, button.value || 0) : 0;
}

function shapedAnalog(value) {
  if (!value) return 0;
  return Math.sign(value) * Math.pow(Math.abs(value), 1.35);
}

function updateGamepadInput() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  const pad = pads.find(candidate => candidate && candidate.connected);
  if (!pad) {
    state.gamepad.connected = false;
    state.gamepad.x = 0;
    state.gamepad.y = 0;
    state.gamepad.accelerate = 0;
    state.gamepad.brake = 0;
    state.gamepad.drift = false;
    state.gamepad.boost = false;
    state.gamepad.restartHeld = false;
    gamepadDisplay.style.display = 'none';
    return;
  }

  const wasConnected = state.gamepad.connected;
  state.gamepad.connected = true;
  state.gamepad.id = pad.id || 'Gamepad';
  const deadzone = window.virtualController?.settings?.deadzone ?? 0.12;
  const sensitivity = window.virtualController?.settings?.sensitivity ?? 1;
  state.gamepad.x = THREE.MathUtils.clamp(axisWithDeadzone(pad.axes[0] || 0, deadzone) * sensitivity, -1, 1);
  state.gamepad.y = THREE.MathUtils.clamp(axisWithDeadzone(pad.axes[1] || 0, deadzone) * sensitivity, -1, 1);
  state.cameraStick.x = axisWithDeadzone(pad.axes[2] || 0, deadzone);
  state.cameraStick.y = axisWithDeadzone(pad.axes[3] || 0, deadzone);
  state.gamepad.accelerate = Math.max(gamepadButtonValue(pad, 7), Math.max(0, -state.gamepad.y));
  state.gamepad.brake = Math.max(gamepadButtonValue(pad, 6), Math.max(0, state.gamepad.y));
  state.gamepad.drift = gamepadButtonDown(pad, 0) || gamepadButtonDown(pad, 4) || gamepadButtonDown(pad, 2);
  state.gamepad.boost = gamepadButtonDown(pad, 1) || gamepadButtonDown(pad, 5) || gamepadButtonValue(pad, 7) > 0.82;

  const restartPressed = gamepadButtonDown(pad, 9);
  if (restartPressed && !state.gamepad.restartHeld && state.gameOver) restartGame();
  state.gamepad.restartHeld = restartPressed;

  if (!engineAudio.started && (Math.abs(state.gamepad.x) > 0 || Math.abs(state.gamepad.y) > 0 || state.gamepad.accelerate || state.gamepad.boost)) {
    initEngineAudio();
  }
  gamepadDisplay.style.display = 'block';
  gamepadDisplay.textContent = wasConnected ? 'CONTROLLER READY | LS 360 drive | RS camera | RT gas | LT brake | A drift | B boost' : 'CONTROLLER CONNECTED';
}

window.addEventListener('gamepadconnected', () => {
  gamepadDisplay.style.display = 'block';
  gamepadDisplay.textContent = 'CONTROLLER CONNECTED';
});
window.addEventListener('gamepaddisconnected', () => {
  state.gamepad.connected = false;
  gamepadDisplay.style.display = 'none';
});

const CONTROLLER_SETTINGS_KEY = 'driftArcadeControllerV1';
const defaultControllerSettings = {
  sensitivity: 1.12,
  deadzone: 0.08,
  haptics: true,
  motion: false,
  turbo: false,
  theme: 'cyber',
};
function loadControllerSettings() {
  try {
    return { ...defaultControllerSettings, ...(JSON.parse(localStorage.getItem(CONTROLLER_SETTINGS_KEY) || '{}') || {}) };
  } catch (e) {
    return { ...defaultControllerSettings };
  }
}
function saveControllerSettings() {
  localStorage.setItem(CONTROLLER_SETTINGS_KEY, JSON.stringify(virtualController.settings));
}

const virtualController = {
  settings: loadControllerSettings(),
  motion: { supported: 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window, active: false, x: 0, y: 0 },
  battery: { supported: false, level: null, charging: false },
  turboPulse: 0,
  turboBoost: false,
  lastMenuMove: 0,
  particles: [],
  buttons: {},
  pads: [],
};
window.virtualController = virtualController;

const controllerStyle = document.createElement('style');
controllerStyle.textContent = `
  .vc-root{position:fixed;inset:auto 0 0 0;height:222px;pointer-events:none;z-index:610;font-family:"Fredoka","Lilita One",Arial,sans-serif;color:#eaffff}
  .vc-glass{background:linear-gradient(135deg,rgba(8,14,30,.50),rgba(26,10,42,.36));border:2px solid rgba(115,240,255,.55);box-shadow:0 0 20px rgba(0,240,255,.20),inset 0 0 22px rgba(255,255,255,.08);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .vc-joy{position:absolute;width:164px;height:164px;border-radius:28px;pointer-events:auto;touch-action:none;user-select:none;cursor:grab}
  .vc-joy:before{content:"";position:absolute;inset:14px;border-radius:50%;border:2px solid rgba(255,255,255,.55);background:radial-gradient(circle at 45% 42%,rgba(0,255,255,.23),rgba(255,0,255,.13) 45%,rgba(0,0,0,.30));box-shadow:0 0 30px rgba(0,255,255,.22),inset 0 0 26px rgba(255,255,255,.11)}
  .vc-thumb{position:absolute;left:50%;top:50%;width:64px;height:64px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 25%,#fff6a8,#ffdd33 45%,#ff6a00);border:3px solid rgba(255,255,255,.8);box-shadow:0 8px 0 rgba(0,0,0,.32),0 0 26px rgba(255,221,50,.72);will-change:transform}
  .vc-stick-label{position:absolute;left:0;right:0;bottom:-20px;text-align:center;font-size:11px;font-weight:900;letter-spacing:1.4px;color:rgba(235,255,255,.84);text-shadow:0 0 10px rgba(0,255,255,.7)}
  .vc-btn{position:absolute;min-width:72px;height:58px;border-radius:18px;pointer-events:auto;touch-action:none;user-select:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:.5px;color:#fff;border:2px solid rgba(255,255,255,.44);background:linear-gradient(135deg,rgba(255,255,255,.18),rgba(255,255,255,.06));box-shadow:0 7px 0 rgba(0,0,0,.28),0 0 24px rgba(0,255,255,.16);transition:transform .08s,box-shadow .08s,filter .12s}
  .vc-btn[data-active="true"]{transform:translateY(5px) scale(.96);box-shadow:0 2px 0 rgba(0,0,0,.35),0 0 28px currentColor;filter:saturate(1.5)}
  .vc-boost{right:136px;bottom:92px;color:#48efff;border-color:rgba(72,239,255,.72)}
  .vc-drift{right:136px;bottom:26px;color:#ffba35;border-color:rgba(255,186,53,.76)}
  .vc-up{right:44px;bottom:96px;min-width:62px;border-radius:50%;color:#9fff74}
  .vc-down{right:44px;bottom:24px;min-width:62px;border-radius:50%;color:#9fff74}
  .vc-turbo{right:226px;bottom:26px;min-width:82px;color:#ff4dff;border-color:rgba(255,77,255,.75)}
  .vc-panel{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);width:min(470px,42vw);border-radius:18px;padding:10px 14px;pointer-events:auto}
  .vc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11px;font-weight:800;letter-spacing:.8px}
  .vc-meter{height:6px;border-radius:8px;background:rgba(255,255,255,.12);overflow:hidden;flex:1}.vc-meter>span{display:block;height:100%;width:50%;background:linear-gradient(90deg,#00f5ff,#ff35f8,#ffe246);box-shadow:0 0 14px #00f5ff}
  .vc-slider{width:96px;accent-color:#00efff}.vc-pill{padding:4px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08)}
  .vc-particle{position:absolute;width:6px;height:6px;border-radius:50%;background:#00efff;box-shadow:0 0 12px #00efff;pointer-events:none;opacity:.9}
  @media (max-width:760px){.vc-root{height:248px}.vc-joy[data-stick="drive"]{width:132px!important;height:132px!important;bottom:30px!important;left:14px!important}.vc-joy[data-stick="camera"]{width:84px!important;height:84px!important;bottom:44px!important;left:154px!important;border-radius:20px!important}.vc-joy[data-stick="camera"] .vc-thumb{width:34px!important;height:34px!important}.vc-thumb{width:56px;height:56px}.vc-stick-label{font-size:10px;bottom:-18px}.vc-panel{display:none}.vc-boost{right:14px;bottom:132px;min-width:72px;height:52px}.vc-drift{right:14px;bottom:68px;min-width:72px;height:52px}.vc-up{right:14px;bottom:8px;min-width:58px;height:52px}.vc-down{right:86px;bottom:8px;min-width:58px;height:52px}.vc-turbo{left:154px;right:auto;bottom:8px;min-width:84px;height:52px;font-size:11px}}
`;
document.head.appendChild(controllerStyle);

const mobileControls = document.createElement('div');
mobileControls.className = 'vc-root';
mobileControls.setAttribute('aria-label', 'Advanced virtual game controller');
mobileControls.innerHTML = `
  <div class="vc-joy vc-glass" data-stick="drive" role="application" aria-label="360 degree analog driving joystick" style="left:22px;bottom:38px">
    <div class="vc-thumb" data-stick-thumb="drive"></div>
    <div class="vc-stick-label">360 DRIVE</div>
  </div>
  <div class="vc-joy vc-glass" data-stick="camera" role="application" aria-label="Camera control joystick" style="left:208px;bottom:46px;width:118px;height:118px;border-radius:24px">
    <div class="vc-thumb" data-stick-thumb="camera" style="width:44px;height:44px;background:radial-gradient(circle at 35% 25%,#dff,#42efff 45%,#145cff)"></div>
    <div class="vc-stick-label">CAMERA</div>
  </div>
  <div class="vc-panel vc-glass">
    <div class="vc-row"><span>CONTROLLER</span><span class="vc-pill" data-vc-status>TOUCH READY</span><span class="vc-pill" data-vc-battery>BATTERY N/A</span></div>
    <div class="vc-row" style="margin-top:8px"><span>ANALOG</span><div class="vc-meter"><span data-vc-meter></span></div><span data-vc-xy>0.00 / 0.00</span></div>
    <div class="vc-row" style="margin-top:8px"><label>SENS <input class="vc-slider" data-vc-slider="sensitivity" type="range" min="0.55" max="1.8" step="0.01"></label><label>DEAD <input class="vc-slider" data-vc-slider="deadzone" type="range" min="0" max="0.28" step="0.01"></label><button class="vc-pill" data-vc-motion style="color:#eaffff;cursor:pointer">MOTION OFF</button></div>
  </div>
  <div class="vc-btn vc-boost" data-btn="boost">BOOST</div>
  <div class="vc-btn vc-drift" data-btn="drift">DRIFT</div>
  <div class="vc-btn vc-up" data-btn="up">UP</div>
  <div class="vc-btn vc-down" data-btn="down">DOWN</div>
  <div class="vc-btn vc-turbo" data-btn="turbo">TURBO</div>
`;
document.body.appendChild(mobileControls);

const driveStick = mobileControls.querySelector('[data-stick="drive"]');
const driveThumb = mobileControls.querySelector('[data-stick-thumb="drive"]');
const cameraStick = mobileControls.querySelector('[data-stick="camera"]');
const cameraThumb = mobileControls.querySelector('[data-stick-thumb="camera"]');
const controllerStatus = mobileControls.querySelector('[data-vc-status]');
const controllerBattery = mobileControls.querySelector('[data-vc-battery]');
const controllerMeter = mobileControls.querySelector('[data-vc-meter]');
const controllerXY = mobileControls.querySelector('[data-vc-xy]');
const motionToggle = mobileControls.querySelector('[data-vc-motion]');
mobileControls.querySelectorAll('[data-vc-slider]').forEach(slider => {
  const key = slider.dataset.vcSlider;
  slider.value = virtualController.settings[key];
  slider.addEventListener('input', () => {
    virtualController.settings[key] = Number(slider.value);
    saveControllerSettings();
    hapticPulse(12, 0.12);
  });
});

function hapticPulse(duration = 18, intensity = 0.35) {
  if (!virtualController.settings.haptics) return;
  if (navigator.vibrate) navigator.vibrate(Math.max(1, Math.round(duration)));
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  pads.forEach(pad => {
    const actuator = pad.vibrationActuator;
    if (actuator?.playEffect) {
      actuator.playEffect('dual-rumble', {
        duration: Math.max(20, Math.round(duration * 2)),
        weakMagnitude: Math.min(1, intensity * 0.55),
        strongMagnitude: Math.min(1, intensity),
      }).catch(() => {});
    }
  });
}

function spawnControllerParticle(x, y, color = '#00efff') {
  const p = document.createElement('div');
  p.className = 'vc-particle';
  p.style.left = `${x}px`;
  p.style.top = `${y}px`;
  p.style.background = color;
  p.style.boxShadow = `0 0 14px ${color}`;
  mobileControls.appendChild(p);
  virtualController.particles.push({ node: p, x, y, vx: (Math.random() - 0.5) * 2.4, vy: -1.2 - Math.random() * 1.8, life: 1 });
}

function updateStickFromPointer(e, stickNode, thumbNode, targetState, options = {}) {
  const rect = stickNode.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const maxRadius = rect.width * (options.radiusScale || 0.34);
  const dx = e.clientX - centerX;
  const dy = e.clientY - centerY;
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(maxRadius, dist);
  const angle = Math.atan2(dy, dx);
  const px = Math.cos(angle) * clamped;
  const py = Math.sin(angle) * clamped;
  const rawX = px / maxRadius;
  const rawY = py / maxRadius;
  const deadzone = virtualController.settings.deadzone;
  const magnitude = Math.hypot(rawX, rawY);
  const normalized = magnitude <= deadzone ? 0 : (magnitude - deadzone) / (1 - deadzone);
  const sensitivity = virtualController.settings.sensitivity;
  targetState.x = normalized ? THREE.MathUtils.clamp((rawX / Math.max(0.001, magnitude)) * normalized * sensitivity, -1, 1) : 0;
  targetState.y = normalized ? THREE.MathUtils.clamp((rawY / Math.max(0.001, magnitude)) * normalized * sensitivity, -1, 1) : 0;
  targetState.magnitude = Math.min(1, Math.hypot(targetState.x, targetState.y));
  targetState.angle = angle;
  targetState.pressure = e.pressure && e.pressure > 0 ? e.pressure : targetState.magnitude;
  thumbNode.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${targetState.x * 14}deg) scale(${1 + targetState.pressure * 0.12})`;
  controllerMeter.style.width = `${Math.round(targetState.magnitude * 100)}%`;
  controllerXY.textContent = `${targetState.x.toFixed(2)} / ${targetState.y.toFixed(2)}`;
  if (Math.random() > 0.82) spawnControllerParticle(e.clientX, e.clientY, options.color || '#00efff');
}

function resetStick(thumbNode, targetState) {
  targetState.active = false;
  targetState.pointerId = null;
  targetState.x = 0;
  targetState.y = 0;
  targetState.magnitude = 0;
  targetState.pressure = 0;
  thumbNode.style.transform = 'translate(-50%,-50%)';
}

function bindStick(stickNode, thumbNode, targetState, options) {
  stickNode.addEventListener('pointerdown', e => {
    e.preventDefault();
    stickNode.setPointerCapture(e.pointerId);
    stickNode.style.cursor = 'grabbing';
    targetState.active = true;
    targetState.pointerId = e.pointerId;
    updateStickFromPointer(e, stickNode, thumbNode, targetState, options);
    hapticPulse(16, 0.2);
  });
  stickNode.addEventListener('pointermove', e => {
    if (!targetState.active || targetState.pointerId !== e.pointerId) return;
    e.preventDefault();
    updateStickFromPointer(e, stickNode, thumbNode, targetState, options);
  });
  const finish = e => {
    if (targetState.pointerId !== null && e.pointerId !== targetState.pointerId) return;
    stickNode.style.cursor = 'grab';
    resetStick(thumbNode, targetState);
    hapticPulse(8, 0.1);
  };
  stickNode.addEventListener('pointerup', finish);
  stickNode.addEventListener('pointercancel', finish);
  stickNode.addEventListener('lostpointercapture', () => resetStick(thumbNode, targetState));
}

bindStick(driveStick, driveThumb, state.joystick, { color: '#ffe246' });
bindStick(cameraStick, cameraThumb, state.cameraStick, { color: '#42efff', radiusScale: 0.30 });

function bindVirtualButton(name, key, opts = {}) {
  const btn = mobileControls.querySelector(`[data-btn="${name}"]`);
  virtualController.buttons[name] = { pressed: false, key, node: btn, pressure: 0 };
  const setPressed = (pressed, e) => {
    virtualController.buttons[name].pressed = pressed;
    virtualController.buttons[name].pressure = pressed ? (e?.pressure && e.pressure > 0 ? e.pressure : 1) : 0;
    if (key) state.keys[key] = pressed;
    btn.dataset.active = pressed ? 'true' : 'false';
    if (pressed) {
      hapticPulse(opts.haptic || 20, opts.intensity || 0.3);
      const rect = btn.getBoundingClientRect();
      for (let i = 0; i < 3; i++) spawnControllerParticle(rect.left + rect.width / 2, rect.top + rect.height / 2, opts.color || '#ff35f8');
    }
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    if (name === 'turbo') {
      virtualController.settings.turbo = !virtualController.settings.turbo;
      saveControllerSettings();
      btn.dataset.active = virtualController.settings.turbo ? 'true' : 'false';
      btn.textContent = virtualController.settings.turbo ? 'TURBO ON' : 'TURBO';
      hapticPulse(35, 0.45);
      return;
    }
    setPressed(true, e);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
    btn.addEventListener(type, e => {
      if (name !== 'turbo') setPressed(false, e);
    });
  });
}

bindVirtualButton('boost', 'KeyE', { color: '#42efff', haptic: 28, intensity: 0.45 });
bindVirtualButton('drift', 'Space', { color: '#ffba35', haptic: 20, intensity: 0.32 });
bindVirtualButton('up', 'ArrowUp', { color: '#9fff74', haptic: 12, intensity: 0.18 });
bindVirtualButton('down', 'ArrowDown', { color: '#9fff74', haptic: 12, intensity: 0.18 });
bindVirtualButton('turbo', null, { color: '#ff35f8', haptic: 35, intensity: 0.45 });
if (virtualController.settings.turbo) {
  virtualController.buttons.turbo.node.dataset.active = 'true';
  virtualController.buttons.turbo.node.textContent = 'TURBO ON';
}

if (navigator.getBattery) {
  navigator.getBattery().then(battery => {
    virtualController.battery.supported = true;
    const updateBattery = () => {
      virtualController.battery.level = battery.level;
      virtualController.battery.charging = battery.charging;
    };
    updateBattery();
    battery.addEventListener('levelchange', updateBattery);
    battery.addEventListener('chargingchange', updateBattery);
  }).catch(() => {});
}

function setMotionEnabled(enabled) {
  virtualController.settings.motion = enabled;
  virtualController.motion.active = enabled;
  saveControllerSettings();
  motionToggle.textContent = enabled ? 'MOTION ON' : 'MOTION OFF';
  motionToggle.style.borderColor = enabled ? 'rgba(0,255,170,.8)' : 'rgba(255,255,255,.22)';
}

motionToggle.addEventListener('click', async () => {
  if (!virtualController.motion.supported) {
    motionToggle.textContent = 'NO MOTION';
    return;
  }
  const anyDeviceOrientation = window.DeviceOrientationEvent;
  if (anyDeviceOrientation?.requestPermission) {
    try {
      const result = await anyDeviceOrientation.requestPermission();
      if (result !== 'granted') return;
    } catch (e) {
      return;
    }
  }
  setMotionEnabled(!virtualController.settings.motion);
  hapticPulse(24, 0.24);
});
setMotionEnabled(virtualController.settings.motion);

window.addEventListener('deviceorientation', e => {
  if (!virtualController.settings.motion) return;
  const gamma = THREE.MathUtils.clamp((e.gamma || 0) / 35, -1, 1);
  const beta = THREE.MathUtils.clamp(((e.beta || 0) - 25) / 35, -1, 1);
  virtualController.motion.x = Math.abs(gamma) < virtualController.settings.deadzone ? 0 : gamma * virtualController.settings.sensitivity;
  virtualController.motion.y = Math.abs(beta) < virtualController.settings.deadzone ? 0 : beta;
});

function updateVirtualController(dt) {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(p => p && p.connected) : [];
  const status = pads.length ? `${pads.length} WIRELESS PAD${pads.length > 1 ? 'S' : ''}` : virtualController.motion.active ? 'TOUCH + MOTION' : 'TOUCH READY';
  controllerStatus.textContent = status;
  controllerBattery.textContent = virtualController.battery.supported && virtualController.battery.level !== null
    ? `BATTERY ${Math.round(virtualController.battery.level * 100)}%${virtualController.battery.charging ? ' +' : ''}`
    : 'BATTERY N/A';
  virtualController.turboPulse += dt;
  virtualController.turboBoost = virtualController.settings.turbo && Math.sin(virtualController.turboPulse * 18) > 0.2 && !state.gameOver;
  for (let i = virtualController.particles.length - 1; i >= 0; i--) {
    const p = virtualController.particles[i];
    p.life -= dt * 1.8;
    p.x += p.vx * 60 * dt;
    p.y += p.vy * 60 * dt;
    p.node.style.transform = `translate(${p.x}px,${p.y}px) scale(${Math.max(0, p.life)})`;
    p.node.style.opacity = `${Math.max(0, p.life)}`;
    if (p.life <= 0) {
      p.node.remove();
      virtualController.particles.splice(i, 1);
    }
  }
}

function controllerMenuAction(dt) {
  const now = performance.now();
  const x = state.joystick.active ? state.joystick.x : state.gamepad.x;
  const y = state.joystick.active ? state.joystick.y : state.gamepad.y;
  if (now - virtualController.lastMenuMove < 260) return;
  if (levelSelectOverlay.style.display === 'flex') {
    const buttons = Array.from(levelSelectOverlay.querySelectorAll('.level-btn'));
    if (!buttons.length) return;
    let index = buttons.findIndex(btn => btn.dataset.padFocus === 'true');
    if (index < 0) index = 1;
    if (Math.abs(x) > 0.45) index = THREE.MathUtils.clamp(index + Math.sign(x), 0, buttons.length - 1);
    if (Math.abs(y) > 0.72 || state.keys.Enter || virtualController.buttons.boost?.pressed || state.gamepad.boost) buttons[index].click();
    buttons.forEach((btn, i) => {
      btn.dataset.padFocus = i === index ? 'true' : 'false';
      btn.style.boxShadow = i === index ? '0 0 24px rgba(0,255,255,.8),0 8px 0 rgba(0,0,0,.3)' : '0 5px 0 rgba(0,0,0,0.3)';
    });
    virtualController.lastMenuMove = now;
  } else if (garageOverlay.style.display === 'flex' && (Math.abs(y) > 0.65 || virtualController.buttons.drift?.pressed || state.gamepad.drift)) {
    garageOverlay.style.display = 'none';
    buildLevelSelect();
    virtualController.lastMenuMove = now;
  }
}

function activateBoost() {
  if (state.boosting || state.boost < 18 || state.boostCooldown > 0 || state.gameOver) return;
  state.boosting = true;
  state.boostPulse = 0.35;
  state.boostCooldown = 0.4;
  hapticPulse(44, 0.7);
  awardEvent('boost', 30, 'BOOST LAUNCH', { boost: 0, comboStrength: 0.4, color: '#44ccff' });
  playSfx('boost');
}

function updateBoost(dt, dtScale) {
  const requestingBoost = state.keys.KeyE || state.keys.KeyQ || state.gamepad.boost || virtualController.turboBoost;
  if (requestingBoost && !state.boosting) activateBoost();
  if (state.boostCooldown > 0) state.boostCooldown -= dt;
  if (state.boosting) {
    state.boost = Math.max(0, state.boost - dt * 32);
    state.speed = Math.min(state.speed + state.acceleration * 1.2 * dtScale, state.maxSpeed * 1.35);
    state.screenShake = Math.max(state.screenShake, 0.08);
    state.screenShakeIntensity = Math.max(state.screenShakeIntensity, 0.08);
    bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, 0.45, 0.12);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 62, 0.08);
    camera.updateProjectionMatrix();
    const rearX = state.carPos.x - Math.sin(state.carAngle) * 2.4;
    const rearZ = state.carPos.z - Math.cos(state.carAngle) * 2.4;
    if (Math.random() > 0.25) spawnBoostFlame(rearX, 0.45, rearZ);
    if (state.boost <= 0 || !requestingBoost) {
      state.boosting = false;
      state.boostCooldown = 0.75;
    }
  } else {
    bloomPass.strength = THREE.MathUtils.lerp(bloomPass.strength, 0.15, 0.05);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 50, 0.05);
    camera.updateProjectionMatrix();
  }
}

function updateNearMisses(dt) {
  if (!raceStarted || state.gameOver) return;
  if (state.threadNeedleCooldown > 0) state.threadNeedleCooldown -= dt;
  const closeOpps = [];
  state.opponents.forEach((opp, i) => {
    if (!opp.mesh.visible) return;
    const dx = state.carPos.x - opp.mesh.position.x;
    const dz = state.carPos.z - opp.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 6.2 && dist > 2.4 && state.speed > state.maxSpeed * 0.32) closeOpps.push({ opp, dx, dz, dist });
    const key = `opp_${i}`;
    const cooldown = state.nearMisses.get(key) || 0;
    if (cooldown > 0) state.nearMisses.set(key, Math.max(0, cooldown - dt));
    if (dist < 5.0 && dist > 2.35 && cooldown <= 0 && state.speed > state.maxSpeed * 0.35) {
      const close = dist < 3.1;
      state.nearMisses.set(key, 1.15);
      state.nearMissCount++;
      if (close) state.closeCallCount++;
      state.closestNearMiss = Math.min(state.closestNearMiss, dist);
      const side = Math.sign(Math.sin(Math.atan2(dx, dz) - state.carAngle)) || 1;
      if (state.lastWeaveSide !== 0 && side !== state.lastWeaveSide && state.totalTime - state.lastWeaveTime < 2.3) {
        state.weaveCount++;
        awardEvent('traffic_weave', 85 + state.weaveCount * 20, `WEAVE x${state.weaveCount}`, { boost: 8, comboStrength: 1.2, color: '#66ddff' });
      }
      state.lastWeaveSide = side;
      state.lastWeaveTime = state.totalTime;
      awardEvent(close ? 'close_call' : 'near_miss', close ? 120 : 60, close ? 'CLOSE CALL' : 'NEAR MISS', { boost: close ? 12 : 7, comboStrength: close ? 1.5 : 1, color: close ? '#ffdd44' : '#44ff88' });
      if (close) {
        state.screenShake = Math.max(state.screenShake, 0.16);
        state.screenShakeIntensity = Math.max(state.screenShakeIntensity, 0.12);
      }
    }
  });
  if (closeOpps.length >= 2 && state.threadNeedleCooldown <= 0) {
    closeOpps.sort((a, b) => a.dist - b.dist);
    const a = closeOpps[0], b = closeOpps[1];
    const gap = Math.hypot(a.opp.mesh.position.x - b.opp.mesh.position.x, a.opp.mesh.position.z - b.opp.mesh.position.z);
    if (gap < 7.5) {
      state.threadNeedleCooldown = 2.4;
      awardEvent('thread_needle', 260, 'THREAD THE NEEDLE', { boost: 22, comboStrength: 2.2, color: '#ff66ff' });
    }
  }
}

function startDynamicEvent(type) {
  state.dynamicEvent = { type, time: 0, duration: type === 'police' ? 12 : type === 'night' ? 14 : 9 };
  state.eventWarning = null;
  state.eventTimer = 1.4;
  if (type === 'rain') state.weatherGrip = 0.82;
  if (type === 'night') {
    applyNightVisibility();
  }
  if (type === 'traffic' || type === 'construction' || type === 'roadblock' || type === 'delivery') spawnBoxes();
  if (type === 'police') {
    state.opponents.forEach((opp, i) => {
      if (i === 0) {
        opp.mesh.visible = true;
        opp.speed = 0.00034;
      }
    });
  }
  playSfx(type === 'police' ? 'siren' : 'warning');
}

function endDynamicEvent() {
  if (!state.dynamicEvent) return;
  const type = state.dynamicEvent.type;
  if (type === 'rain') state.weatherGrip = 1;
  if (type === 'night') applySettings();
  if ((type === 'construction' || type === 'roadblock' || type === 'delivery') && !LEVELS[currentLevel].boxes) clearBoxes();
  awardEvent('event_survive', 180, `${type.toUpperCase()} SURVIVED`, { boost: 18, comboStrength: 1.5, color: '#ffdd44' });
  state.dynamicEvent = null;
  state.nextDynamicEventTime = state.totalTime + 10 + Math.random() * 12;
}

function updateDynamicEvents(dt) {
  if (!raceStarted || state.gameOver) return;
  if (!state.dynamicEvent && !state.eventWarning && state.totalTime >= state.nextDynamicEventTime) {
    const pool = ['police', 'traffic', 'construction', 'roadblock', 'rain', 'night', 'delivery'];
    state.eventWarning = { type: pool[Math.floor(Math.random() * pool.length)], time: 2.4 };
    playSfx('warning');
  }
  if (state.eventWarning) {
    state.eventWarning.time -= dt;
    if (state.eventWarning.time <= 0) startDynamicEvent(state.eventWarning.type);
  }
  if (state.dynamicEvent) {
    state.dynamicEvent.time += dt;
    if (state.dynamicEvent.type === 'police' && state.totalTime % 0.3 < dt) playSfx('siren');
    if (state.dynamicEvent.type === 'rain' && Math.random() > 0.65) spawnParticle(state.carPos.x + (Math.random() - 0.5) * 8, 2.0, state.carPos.z + (Math.random() - 0.5) * 8);
    if (state.dynamicEvent.time >= state.dynamicEvent.duration) endDynamicEvent();
  }
}

function updateArcadeHud(dt) {
  const compact = window.innerWidth < 640;
  mobileControls.style.display = 'block';
  timerDisplay.style.transform = compact ? 'scale(0.72)' : '';
  timerDisplay.style.transformOrigin = 'top left';
  timerDisplay.style.left = compact ? '8px' : '24px';
  timerDisplay.style.top = compact ? '8px' : '16px';
  pointsDisplay.style.transform = compact ? 'translateX(-50%) scale(0.72)' : 'translateX(-50%)';
  pointsDisplay.style.transformOrigin = 'top center';
  pointsDisplay.style.top = compact ? '8px' : '16px';
  lapDisplay.style.transform = compact ? 'scale(0.72)' : '';
  lapDisplay.style.transformOrigin = 'top right';
  lapDisplay.style.right = compact ? '8px' : '24px';
  lapDisplay.style.top = compact ? '8px' : '16px';
  arcadeHud.style.top = compact ? '112px' : '112px';
  arcadeHud.style.left = compact ? '8px' : '24px';
  arcadeHud.style.width = compact ? '218px' : '250px';
  boostDisplay.style.bottom = compact ? '218px' : '106px';
  boostDisplay.style.width = compact ? '238px' : '280px';
  controlsHint.style.display = compact ? 'none' : 'block';
  pointsLogPanel.style.bottom = compact ? '30px' : '198px';
  minimapCanvas.style.display = compact ? 'none' : 'block';
  minimapCanvas.style.transform = compact ? 'scale(0.72)' : '';
  minimapCanvas.style.transformOrigin = 'bottom left';
  minimapCanvas.style.left = compact ? '8px' : '24px';
  minimapCanvas.style.bottom = compact ? '12px' : '198px';
  eventBanner.style.top = compact ? '35%' : '18%';
  diffBtn.style.display = compact ? 'none' : 'flex';
  state.eventPopups.forEach(p => { p.age += dt; p.life -= dt; });
  state.eventPopups = state.eventPopups.filter(p => p.life > 0);
  const comboPct = Math.max(0, Math.min(1, state.comboTimer / 4.5));
  const missionHtml = runMissions.map(m => {
    const pct = Math.min(1, m.progress / m.target);
    return `<div style="margin-top:6px;font-size:11px;color:${m.complete ? '#88ffaa' : 'rgba(255,255,255,0.75)'};">
      ${m.complete ? 'DONE' : `${Math.floor(m.progress)}/${m.target}`} ${m.label}
      <div style="height:4px;background:rgba(255,255,255,0.12);border-radius:6px;overflow:hidden;margin-top:2px;"><div style="height:100%;width:${pct * 100}%;background:${m.complete ? '#44ff88' : '#ffdd44'};"></div></div>
    </div>`;
  }).join('');
  arcadeHud.innerHTML = `
    <div style="background:rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.28);border-radius:14px;padding:10px 12px;box-shadow:0 4px 0 rgba(0,0,0,0.28);">
      <div style="display:flex;justify-content:space-between;align-items:end;"><span style="font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,0.55);">COMBO</span><span style="font-size:28px;font-weight:900;color:${state.combo >= 5 ? '#ff6644' : '#ffdd44'};">x${state.combo.toFixed(1)}</span></div>
      <div style="height:6px;background:rgba(255,255,255,0.12);border-radius:10px;overflow:hidden;"><div style="height:100%;width:${comboPct * 100}%;background:linear-gradient(90deg,#44ff88,#ffdd44,#ff6644);"></div></div>
      <div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.62);">Vehicle: ${state.activeVehicleStats?.name || 'Taxi'} | Coins: ${profile.coins}</div>
      ${missionHtml}
    </div>`;
  const boostPct = Math.min(1, state.boost / state.boostCapacity);
  boostDisplay.innerHTML = `<div style="background:rgba(0,0,0,0.58);border:3px solid ${state.boosting ? 'rgba(80,220,255,0.9)' : 'rgba(255,255,255,0.45)'};border-radius:16px;padding:7px 10px;box-shadow:0 4px 0 rgba(0,0,0,0.32);">
    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;letter-spacing:1.4px;color:rgba(255,255,255,0.7);"><span>BOOST</span><span>${state.boosting ? 'ACTIVE' : 'E'}</span></div>
    <div style="height:12px;background:rgba(255,255,255,0.12);border-radius:10px;overflow:hidden;margin-top:5px;"><div style="height:100%;width:${boostPct * 100}%;background:linear-gradient(90deg,#3ae7ff,#4477ff,#ff44ee);box-shadow:0 0 18px rgba(70,200,255,0.7);"></div></div>
  </div>`;
  const banner = state.eventWarning ? `WARNING: ${state.eventWarning.type.toUpperCase()} INCOMING` : state.dynamicEvent ? `${state.dynamicEvent.type.toUpperCase()} EVENT` : '';
  eventBanner.style.opacity = banner ? '1' : '0';
  eventBanner.innerHTML = banner ? `<div style="font-size:${compact ? 24 : 30}px;font-weight:900;color:#fff;text-shadow:0 0 25px rgba(255,80,80,0.8);letter-spacing:2px;">${banner}</div>` : '';
  popupStack.innerHTML = state.eventPopups.slice(-4).reverse().map((p, i) => {
    const alpha = Math.max(0, Math.min(1, p.life));
    return `<div style="opacity:${alpha};transform:translateY(${-p.age * 18 - i * 3}px) scale(${1 + Math.max(0, 0.25 - p.age) * 0.6});transition:transform 0.05s;font-weight:900;text-shadow:0 3px 0 rgba(0,0,0,0.45),0 0 24px ${p.color};">
      <div style="font-size:${i === 0 ? 34 : 24}px;color:${p.color};">${p.label}</div>
      <div style="font-size:${i === 0 ? 28 : 18}px;color:#fff;">+${p.amount.toLocaleString()}</div>
    </div>`;
  }).join('');
}

// ============ GAME LOOP ============
const clock = new THREE.Clock();
let countdownTimer = 3;
let raceStarted = false;
const cameraOffset = new THREE.Vector3();
const cameraLookAt = new THREE.Vector3();

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
function formatTimeFixed(seconds) {
  const raw = formatTime(seconds);
  return raw.split('').map(ch => `<span style="display:inline-block;width:${ch === ':' || ch === '.' ? '0.45em' : '0.65em'};text-align:center;">${ch}</span>`).join('');
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateGamepadInput();
  updateVirtualController(dt);
  
  // Don't run game if no level selected
  if (currentLevel === 0) {
    controllerMenuAction(dt);
    renderToon();
    return;
  }

  // Countdown
  if (!raceStarted) {
    countdownTimer -= dt;
    if (countdownTimer > 0) {
      const num = Math.ceil(countdownTimer);
      countdownDisplay.textContent = num;
      countdownDisplay.style.transform = `translate(-50%,-50%) scale(${1 + (countdownTimer % 1) * 0.3})`;
      const cColor = num === 1 ? '#ff4444' : num === 2 ? '#ffaa00' : '#ffffff';
      const cGlow = num === 1 ? 'rgba(255,68,68,0.8)' : num === 2 ? 'rgba(255,170,0,0.8)' : 'rgba(255,255,255,0.8)';
      countdownDisplay.style.color = cColor;
      countdownDisplay.style.textShadow = `0 0 40px ${cGlow}, 0 0 80px ${cGlow}, 0 4px 20px rgba(0,0,0,0.5)`;
    } else {
      countdownDisplay.textContent = 'GO!';
      countdownDisplay.style.color = '#44ff44';
      countdownDisplay.style.textShadow = '0 0 40px rgba(68,255,68,0.8), 0 0 80px rgba(68,255,68,0.8), 0 4px 20px rgba(0,0,0,0.5)';
      if (countdownTimer < -0.8) {
        countdownDisplay.style.opacity = '0';
        raceStarted = true;
      }
    }
  }
  
  if (raceStarted && !state.gameOver) {
    state.totalTime += dt;
    state.lapTime += dt;
    state.timeRemaining = Math.max(0, state.maxTime - state.totalTime);

    if (state.timeRemaining <= 0) {
      // Bank any in-progress drift points before ending
      if (state.drifting && state.driftPoints > 0) {
        const banked = Math.round(state.driftPoints * state.pointsMultiplier);
        if (banked >= 5) {
          awardEvent('drift', banked, 'FINAL DRIFT', { boost: 0, comboStrength: 0, rawDrift: banked, noCombo: true, color: '#ffaa33' });
        }
        state.driftPoints = 0;
        state.pointsMultiplier = 1;
        state.drifting = false;
        state.driftBoost = 0;
      }
      state.gameOver = true;
      state.speed = 0;
      const score = Math.round(state.totalPoints);
      const runCoins = Math.max(20, Math.round(score / 35 * (state.activeVehicleStats?.coinBonus || 1)));
      state.coinsEarned += runCoins;
      profile.coins += runCoins;
      profile.xp += Math.round(score / 18);
      profile.level = Math.max(profile.level, 1 + Math.floor(profile.xp / 750));
      profile.bestScore = Math.max(profile.bestScore || 0, score);
      profile.bestCombo = Math.max(profile.bestCombo || 1, state.maxCombo);
      profile.bestNearMiss = Math.max(profile.bestNearMiss || 0, Number.isFinite(state.closestNearMiss) ? (6 - state.closestNearMiss) : 0);
      saveProfile();
      gameOverOverlay.style.display = 'flex';
      gameOverOverlay.innerHTML = `
        <div style="text-align:center;color:#fff;font-family:'Fredoka','Lilita One',sans-serif;">
          <div style="font-size:20px;letter-spacing:4px;color:rgba(255,255,255,0.6);margin-bottom:8px;font-weight:600;">TIME'S UP!</div>
          <div style="font-size:72px;font-weight:700;letter-spacing:-1px;margin-bottom:4px;font-family:'Lilita One',sans-serif;">FINAL SCORE</div>
          <div style="font-size:68px;font-weight:700;color:#ffdd44;margin-bottom:14px;font-family:'Lilita One',sans-serif;">${score.toLocaleString()}</div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(145px,1fr));gap:7px;margin:0 auto 12px;width:min(520px,90vw);font-size:14px;color:rgba(255,255,255,0.72);font-weight:700;">
            <div>Laps: ${state.lap}</div><div>Max combo: x${state.maxCombo.toFixed(1)}</div>
            <div>Near misses: ${state.nearMissCount}</div><div>Crashes: ${state.crashes}</div>
            <div>Missions: ${state.missionsCompleted}</div><div>Coins earned: ${state.coinsEarned}</div>
          </div>
          <div style="font-size:13px;color:#88ffaa;margin-bottom:8px;font-weight:700;">Best ${profile.bestScore.toLocaleString()} | Level ${profile.level} | Coins ${profile.coins}</div>
          <div style="font-size:16px;color:rgba(255,255,255,0.65);margin-bottom:6px;font-weight:500;">🏁 LAPS COMPLETED: ${state.lap}</div>
          <div style="font-size:16px;color:rgba(255,255,255,0.65);margin-bottom:6px;font-weight:500;">EVENTS: ${state.pointsLog.filter(e=>e.amount>0).length} earned · ${state.pointsLog.filter(e=>e.amount<0||e.amount===0&&e.type.startsWith('crash')).length} crashes</div>
          <div style="max-height:140px;overflow-y:auto;margin:12px auto 0;width:300px;text-align:left;pointer-events:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.3) transparent;">
            ${state.pointsLog.map(e => {
              const icon = e.type==='drift'?'⚡':e.type==='lap'?'🏁':e.type==='crash_wall'?'💥':'🚗';
              const color = e.amount>0?(e.type==='lap'?'#ffdd44':'#44ff88'):'#ff4444';
              const label = e.type==='drift'?`Drift x${e.multiplier.toFixed(1)}`:e.type==='lap'?`Lap ${e.lap}`:e.type==='crash_wall'?'Wall crash':'Car crash';
              const baseP = e.type==='drift'?Math.round(e.amount/e.multiplier):0;
              const amt = e.type==='drift'?`${baseP.toLocaleString()} → +${e.amount.toLocaleString()}`:e.amount>0?`+${e.amount.toLocaleString()}`:e.amount<0?e.amount.toLocaleString():'—';
              return `<div style="display:flex;justify-content:space-between;padding:4px 10px;margin-bottom:3px;border-radius:10px;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.12);font-size:12px;font-weight:500;"><span>${icon} <span style="color:#bbb;">${formatTime(e.time)}</span> ${label}</span><span style="color:${color};font-weight:700;">${amt}</span></div>`;
            }).join('')}
          </div>
          <button onclick="window.openGarage()" style="pointer-events:auto;cursor:pointer;margin-top:18px;background:rgba(255,221,68,0.16);border:2px solid rgba(255,221,68,0.55);color:#ffdd44;border-radius:14px;padding:10px 18px;font-family:inherit;font-weight:900;">GARAGE / UPGRADES</button>
          <div style="font-size:15px;color:rgba(255,255,255,0.45);margin-top:14px;font-weight:500;">Press ENTER or tap to restart</div>
        </div>`;
      return;
    }
    
    const dtScale = dt * 60;
    updateCombo(dt);
    updateDynamicEvents(dt);
    const holdingDrift = state.keys['Space'] || state.keys['ShiftLeft'] || state.keys['ShiftRight'] || state.gamepad.drift;
    const motionX = virtualController.settings.motion ? virtualController.motion.x : 0;
    const motionY = virtualController.settings.motion ? virtualController.motion.y : 0;
    const joystickX = state.joystick?.active ? state.joystick.x : (Math.abs(state.gamepad.x) > 0.02 ? state.gamepad.x : motionX);
    const joystickY = state.joystick?.active ? state.joystick.y : (Math.abs(state.gamepad.y) > 0.02 ? state.gamepad.y : motionY);
    const turningLeft = state.keys['ArrowLeft'] || state.keys['KeyA'];
    const turningRight = state.keys['ArrowRight'] || state.keys['KeyD'];

    const digitalTurn = turningLeft ? 1 : turningRight ? -1 : 0;
    const digitalSteerLimit = holdingDrift ? 0.95 : 0.72;
    const rawTurnDir = Math.abs(joystickX) > 0.05 ? -shapedAnalog(joystickX) : digitalTurn * digitalSteerLimit;
    const turnLerpSpeed = rawTurnDir !== 0 ? (holdingDrift ? 0.14 : 0.10) : 0.16;
    state.turnInput = THREE.MathUtils.lerp(state.turnInput, rawTurnDir, turnLerpSpeed * dtScale);
    if (Math.abs(state.turnInput) < 0.01) state.turnInput = 0;

    if (rawTurnDir !== 0) {
      if (rawTurnDir === state.lastTurnDir) {
        state.turnHoldTime += dt;
      } else {
        state.turnHoldTime = 0;
      }
      state.lastTurnDir = rawTurnDir;
    } else {
      state.turnHoldTime = Math.max(0, state.turnHoldTime - dt * 3);
    }

    const turnIntensity = Math.min(1.0, 0.58 + state.turnHoldTime * 0.72);
    const turnDir = state.turnInput;
    const turning = Math.abs(turnDir) > 0.05;
    const absTurn = Math.abs(turnDir);

    let effectiveMax = state.maxSpeed * (state.boosting ? 1.35 : 1);
    const grip = state.weatherGrip;
    const speedRatioForSteering = Math.min(1, Math.abs(state.speed) / state.maxSpeed);
    const highSpeedSteerControl = THREE.MathUtils.lerp(1.0, state.drifting ? 0.78 : 0.58, speedRatioForSteering);

    const touchThrottle = state.joystick.active || virtualController.settings.motion ? Math.max(0, -joystickY) : 0;
    const touchBrake = state.joystick.active || virtualController.settings.motion ? Math.max(0, joystickY) : 0;
    const throttleAmount = Math.max(state.keys['ArrowUp'] || state.keys['KeyW'] ? 1 : 0, touchThrottle, state.gamepad.accelerate);
    const brakeAmount = Math.max(state.keys['ArrowDown'] || state.keys['KeyS'] ? 1 : 0, touchBrake, state.gamepad.brake);
    if (throttleAmount > 0.05) {
      state.speed = Math.min(state.speed + state.acceleration * throttleAmount * dtScale, effectiveMax);
    } else if (brakeAmount > 0.05) {
      state.speed = Math.max(state.speed - state.braking * brakeAmount * dtScale, -state.maxSpeed * 0.3);
    } else {
      if (state.speed > 0) state.speed = Math.max(0, state.speed - state.friction * dtScale);
      else state.speed = Math.min(0, state.speed + state.friction * dtScale);
    }

    updateBoost(dt, dtScale);

    const canDrift = holdingDrift && absTurn > 0.15 && state.speed > state.maxSpeed * 0.35;
    if (canDrift && !state.drifting) {
      state.drifting = true;
      state.driftMomentum = Math.sign(turnDir) * 0.02;
      state.driftBoost = 0;
      hapticPulse(24, 0.32);
    }
    if (state.drifting && (!holdingDrift || state.speed < state.maxSpeed * 0.15)) {
      if (state.driftPoints > 0) {
        const banked = Math.round(state.driftPoints * state.pointsMultiplier);
        if (banked >= 5) {
          awardEvent('drift', banked, 'DRIFT SCORE', { boost: Math.min(22, banked / 35), comboStrength: Math.min(2.5, banked / 300), rawDrift: banked, noCombo: true, color: '#ffaa33' });
          if (banked >= 180) {
            state.boost = Math.min(state.boostCapacity, state.boost + 10);
            state.speed = Math.min(state.speed + 0.06, state.maxSpeed * 1.15);
            addPopup('DRIFT EXIT BOOST', 0, '#44ccff');
            playSfx('boost');
          }
          state.bankedAmount = banked;
          state.showPointsBanked = 3.5;
          state.driftGracePeriod = 2.0;
          state.pendingPointsFlashIntensity = 0.4 + Math.min(0.4, banked / 2000);
        }
      }
      state.driftPoints = 0;
      state.pointsMultiplier = 1;
      state.drifting = false;
      // DON'T zero driftAngle/driftMomentum — let them decay smoothly in the else branch
      state.driftBoost = 0;
    }

    if (state.drifting) {
      const driftTurnMul = 1.4 * (state.activeVehicleStats?.drift || 1);
      state.carAngle += turnDir * turnIntensity * state.turnSpeed * grip * highSpeedSteerControl * driftTurnMul * (state.speed / state.maxSpeed) * dtScale;

      const driftDir = Math.sign(state.driftMomentum) || Math.sign(turnDir);
      const targetMomentum = driftDir * 0.045 * (state.activeVehicleStats?.drift || 1);
      state.driftMomentum = THREE.MathUtils.lerp(state.driftMomentum, targetMomentum, 0.06 * dtScale);

      if (absTurn > 0.1 && Math.sign(turnDir) !== driftDir) {
        const counterForce = absTurn * 0.035;
        state.driftMomentum *= (1 - counterForce * dtScale);
      }

      state.driftAngle = THREE.MathUtils.lerp(state.driftAngle, state.driftMomentum * 18, 0.08 * dtScale);
      state.driftBoost += Math.abs(state.driftMomentum) * dt * 3;

      const pointRate = Math.abs(state.driftMomentum) * state.speed * 800 * (state.activeVehicleStats?.drift || 1);
      state.driftPoints += pointRate * dt;
      state.pointsMultiplier = Math.min(5, 1 + state.driftBoost * 0.8);
      state.speed *= (1 - 0.002 * dtScale);
    } else {
      state.carAngle += turnDir * turnIntensity * state.turnSpeed * grip * highSpeedSteerControl * (state.speed / state.maxSpeed) * dtScale;
      // Smooth recovery from drift — fast enough to feel responsive, slow enough to not snap
      const recoverySpeed = 0.12;
      state.driftAngle = THREE.MathUtils.lerp(state.driftAngle, 0, recoverySpeed * dtScale);
      state.driftMomentum = THREE.MathUtils.lerp(state.driftMomentum, 0, recoverySpeed * dtScale);
      // Clamp to zero when close to avoid lingering drift feel
      if (Math.abs(state.driftAngle) < 0.005) state.driftAngle = 0;
      if (Math.abs(state.driftMomentum) < 0.0005) state.driftMomentum = 0;
    }

    // Gentle road following keeps normal driving smooth on the continuous bends.
    // Strong steering and active drifts still allow the player to choose their line.
    if (state.speed > state.maxSpeed * 0.08) {
      const guide = getClosestTrackT(state.carPos.x, state.carPos.z);
      const pathPoint = getTrackPoint(guide.t);
      const pathTangent = getTrackTangent(guide.t);
      const playerSteering = Math.abs(rawTurnDir);
      const centerPull = state.drifting ? 0.015 : THREE.MathUtils.lerp(0.14, 0.035, Math.min(1, playerSteering));
      const desiredX = pathTangent.x + (pathPoint.x - state.carPos.x) * centerPull;
      const desiredZ = pathTangent.z + (pathPoint.z - state.carPos.z) * centerPull;
      const desiredAngle = Math.atan2(desiredX, desiredZ);
      const headingError = normalizeAngle(desiredAngle - state.carAngle);
      const edgeRatio = THREE.MathUtils.clamp((guide.dist - TRACK_WIDTH * 0.2) / (TRACK_WIDTH * 0.3), 0, 1);
      const baseAssist = state.drifting ? 0.006 : playerSteering < 0.05 ? 0.08 : 0.025;
      const assist = baseAssist + edgeRatio * (state.drifting ? 0.008 : 0.075);
      state.carAngle += THREE.MathUtils.clamp(headingError, -0.55, 0.55) * assist * dtScale;
    }

    if (state.driftGracePeriod > 0) {
      const prevGrace = state.driftGracePeriod;
      state.driftGracePeriod -= dt;
      if (state.driftGracePeriod <= 0 && prevGrace > 0 && state.pendingPointsFlashIntensity > 0) {
        state.pointsFlash = 0.5;
        state.pointsFlashIntensity = state.pendingPointsFlashIntensity;
        state.pendingPointsFlashIntensity = 0;
      }
    }

    const moveAngle = state.carAngle;
    const forwardX = Math.sin(moveAngle) * state.speed * dtScale;
    const forwardZ = Math.cos(moveAngle) * state.speed * dtScale;
    const lateralX = Math.cos(moveAngle) * state.driftMomentum * state.speed * dtScale * 8;
    const lateralZ = -Math.sin(moveAngle) * state.driftMomentum * state.speed * dtScale * 8;

    const newX = state.carPos.x + forwardX + lateralX;
    const newZ = state.carPos.z + forwardZ + lateralZ;
    
    if (isOnTrack(newX, newZ)) {
      state.carPos.x = newX;
      state.carPos.z = newZ;
    } else {
      state.speed *= 0.85;
      if (state.wallCrashCooldown <= 0) {
        state.wallCrashCooldown = 1.0;
        hapticPulse(90, 1);
        state.crashes++;
        state.perfectLapActive = false;
        state.boost = Math.max(0, state.boost - 22);
        breakCombo();
        playSfx('crash_wall');
        state.screenShake = 0.35;
        state.screenShakeIntensity = 0.3 + Math.min(0.4, Math.abs(state.speed) * 0.8);
        state.crashFlash = 0.4;
        state.crashFlashIntensity = 0.5 + Math.min(0.5, Math.abs(state.speed) * 1.0);
        if (state.drifting && state.driftPoints > 0) {
          const lost = Math.round(state.driftPoints * state.pointsMultiplier);
          state.pointsLog.push({ type: 'crash_wall', amount: -lost, time: state.totalTime });
          state.driftPoints = 0;
          state.pointsMultiplier = 1;
          state.drifting = false;
          // Don't zero driftAngle/driftMomentum — let them decay naturally
          state.driftBoost = 0;
          state.showPointsBanked = 1.5;
          state.bankedAmount = -lost;
        } else if (state.driftGracePeriod > 0) {
          let clawback = 0;
          for (let li = state.pointsLog.length - 1; li >= 0; li--) {
            if (state.pointsLog[li].type === 'drift') {
              clawback = state.pointsLog[li].amount;
              state.pointsLog.splice(li, 1);
              break;
            }
          }
          if (clawback > 0) {
            state.totalPoints = Math.max(0, state.totalPoints - clawback);
            state.pointsLog.push({ type: 'crash_wall', amount: -clawback, time: state.totalTime });
            state.showPointsBanked = 1.5;
            state.bankedAmount = -clawback;
          } else {
            state.bankedAmount = -1;
            state.showPointsBanked = 1.0;
          }
          state.driftGracePeriod = 0;
        }
      }
      if (state.drifting) { state.driftMomentum *= 0.5; }
      if (isOnTrack(newX, state.carPos.z)) {
        state.carPos.x = newX;
      } else if (isOnTrack(state.carPos.x, newZ)) {
        state.carPos.z = newZ;
      }
      
      if (Math.abs(state.speed) > 0.1) {
        for (let i = 0; i < 3; i++) {
          spawnParticle(state.carPos.x, 0.3, state.carPos.z);
        }
      }
    }
    
    if (state.carCrashCooldown > 0) state.carCrashCooldown -= dt;
    if (state.wallCrashCooldown > 0) state.wallCrashCooldown -= dt;

    state.opponents.forEach(opp => {
      if (!opp.mesh.visible) return;
      const dx = state.carPos.x - opp.mesh.position.x;
      const dz = state.carPos.z - opp.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      // Elliptical hitbox — bus is long (4.8) and wide (1.6), scaled up
      const toOppAngle = Math.atan2(dx, dz);
      const relAngle = toOppAngle - opp.mesh.rotation.y;
      const sideComponent = Math.abs(Math.sin(relAngle));
      const hitRadius = 3.4 - sideComponent * 1.0; // 3.4 front/back, ~2.4 on sides
      if (dist < hitRadius && dist > 0.01) {
        const pushX = dx / dist;
        const pushZ = dz / dist;
        const overlap = hitRadius - dist;
        state.carPos.x += pushX * (overlap + 0.05);
        state.carPos.z += pushZ * (overlap + 0.05);
        state.speed *= 0.85;

        if (state.carCrashCooldown <= 0) {
          state.carCrashCooldown = 1.0;
          hapticPulse(100, 1);
          state.crashes++;
          state.perfectLapActive = false;
          state.boost = Math.max(0, state.boost - 28);
          breakCombo();
          playSfx('crash_car');
          state.speed *= 0.82 + Math.min(0.12, ((state.activeVehicleStats?.crash || 1) - 1) * 0.08);
          state.screenShake = 0.4;
          state.screenShakeIntensity = 0.4 + Math.min(0.5, Math.abs(state.speed) * 0.9);
          state.crashFlash = 0.45;
          state.crashFlashIntensity = 0.6 + Math.min(0.4, Math.abs(state.speed) * 1.0);

          if (state.drifting && state.driftPoints > 0) {
            const lost = Math.round(state.driftPoints * state.pointsMultiplier);
            state.pointsLog.push({ type: 'crash_car', amount: -lost, time: state.totalTime });
            state.driftPoints = 0;
            state.pointsMultiplier = 1;
          state.drifting = false;
          // Don't zero driftAngle/driftMomentum — let them decay naturally
          state.driftBoost = 0;
          state.showPointsBanked = 1.5;
          state.bankedAmount = -lost;
          } else if (state.driftGracePeriod > 0) {
            let clawback = 0;
            for (let li = state.pointsLog.length - 1; li >= 0; li--) {
              if (state.pointsLog[li].type === 'drift') {
                clawback = state.pointsLog[li].amount;
                state.pointsLog.splice(li, 1);
                break;
              }
            }
            if (clawback > 0) {
              state.totalPoints = Math.max(0, state.totalPoints - clawback);
              state.pointsLog.push({ type: 'crash_car', amount: -clawback, time: state.totalTime });
              state.showPointsBanked = 1.5;
              state.bankedAmount = -clawback;
            } else {
              state.bankedAmount = -1;
              state.showPointsBanked = 1.0;
            }
            state.driftGracePeriod = 0;
          }

          const hitX = (state.carPos.x + opp.mesh.position.x) / 2;
          const hitZ = (state.carPos.z + opp.mesh.position.z) / 2;
          for (let i = 0; i < 6; i++) {
            spawnDriftSpark(hitX + (Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.3, hitZ + (Math.random() - 0.5) * 0.5);
          }
        }
      }
    });

    // Box obstacle collision
    state.boxes.forEach(box => {
      const dx = state.carPos.x - box.x;
      const dz = state.carPos.z - box.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < box.radius + 1.6 && dist > 0.01) {
        const pushX = dx / dist;
        const pushZ = dz / dist;
        const overlap = (box.radius + 1.6) - dist;
        state.carPos.x += pushX * (overlap + 0.05);
        state.carPos.z += pushZ * (overlap + 0.05);
        state.speed *= 0.6;

        if (state.wallCrashCooldown <= 0) {
          state.wallCrashCooldown = 0.5;
          hapticPulse(70, 0.8);
          state.crashes++;
          state.perfectLapActive = false;
          state.boost = Math.max(0, state.boost - 16);
          breakCombo();
          playSfx('crash_wall');
          state.screenShake = 0.25;
          state.screenShakeIntensity = 0.25 + Math.min(0.3, Math.abs(state.speed) * 0.6);
          state.crashFlash = 0.3;
          state.crashFlashIntensity = 0.4;
          if (state.drifting && state.driftPoints > 0) {
            const lost = Math.round(state.driftPoints * state.pointsMultiplier);
            state.pointsLog.push({ type: 'crash_wall', amount: -lost, time: state.totalTime });
            state.driftPoints = 0;
            state.pointsMultiplier = 1;
            state.drifting = false;
            state.driftBoost = 0;
            state.showPointsBanked = 1.5;
            state.bankedAmount = -lost;
          }
          for (let i = 0; i < 4; i++) {
            spawnParticle(box.x + (Math.random()-0.5)*0.8, 0.5 + Math.random()*0.5, box.z + (Math.random()-0.5)*0.8);
          }
        }
      }
    });

    const { dist: trackDist } = getClosestTrackT(state.carPos.x, state.carPos.z);
    if (trackDist > TRACK_WIDTH / 2 - 0.5) {
      state.speed *= 0.98;
    }
    
    if (state.drifting && state.speed > state.maxSpeed * 0.3) {
      // Bus rear is ~2.4 units behind center
      const rearOffsetX = -Math.sin(state.carAngle) * 2.0;
      const rearOffsetZ = -Math.cos(state.carAngle) * 2.0;
      const perpX = Math.cos(state.carAngle);
      const perpZ = -Math.sin(state.carAngle);
      for (let side = -1; side <= 1; side += 2) {
        if (Math.random() > 0.3) {
          const sx = state.carPos.x + rearOffsetX + perpX * side * 0.65 + (Math.random() - 0.5) * 0.3;
          const sz = state.carPos.z + rearOffsetZ + perpZ * side * 0.65 + (Math.random() - 0.5) * 0.3;
          spawnDriftSmoke(sx, 0.05, sz);
        }
      }
      if (Math.random() > 0.5) {
        const sx = state.carPos.x + rearOffsetX + (Math.random() - 0.5) * 1.2;
        const sz = state.carPos.z + rearOffsetZ + (Math.random() - 0.5) * 1.2;
        spawnDriftSpark(sx, 0.2, sz);
      }
    }

    if (state.drifting && state.speed > state.maxSpeed * 0.25) {
      const rearX = -Math.sin(state.carAngle) * 1.9;
      const rearZ = -Math.cos(state.carAngle) * 1.9;
      const perpX = Math.cos(state.carAngle);
      const perpZ = -Math.sin(state.carAngle);
      const markAngle = state.carAngle + state.driftAngle;
      for (let side = -1; side <= 1; side += 2) {
        const sx = state.carPos.x + rearX + perpX * side * 0.60;
        const sz = state.carPos.z + rearZ + perpZ * side * 0.60;
        spawnSkidMark(sx, sz, markAngle);
      }
    }

    if (!state.drifting && Math.abs(state.speed) > 0.3 && absTurn > 0.3) {
      if (Math.random() > 0.5) {
        spawnParticle(
          state.carPos.x - Math.sin(state.carAngle) * 0.8 + (Math.random() - 0.5) * 0.5,
          0.1,
          state.carPos.z - Math.cos(state.carAngle) * 0.8 + (Math.random() - 0.5) * 0.5
        );
      }
    }

    updateNearMisses(dt);
    
    const { t: currentT } = getClosestTrackT(state.carPos.x, state.carPos.z);

    // Wrong-way detection
    if (state.speed > 0.05) {
      const tan = getTrackTangent(currentT);
      const trackAngle = Math.atan2(tan.x, tan.z);
      const carForwardAngle = state.carAngle;
      let angleDiff = carForwardAngle - trackAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      const goingWrongWay = Math.abs(angleDiff) > Math.PI * 0.6;

      if (goingWrongWay) {
        if (!state.wrongWay) {
          state.wrongWay = true;
          state.wrongWayTimer = 0;
        }
        state.wrongWayTimer += dt;
        if (state.wrongWayTimer >= 2.0 && state.wrongWayCooldown <= 0) {
          // Reset car to correct direction at current track position
          const resetTan = getTrackTangent(currentT);
          state.carAngle = Math.atan2(resetTan.x, resetTan.z);
          state.velocityAngle = state.carAngle;
          state.speed *= 0.3;
          state.driftAngle = 0;
          state.driftMomentum = 0;
          if (state.drifting) {
            state.driftPoints = 0;
            state.pointsMultiplier = 1;
            state.drifting = false;
            state.driftBoost = 0;
          }
          state.wrongWay = false;
          state.wrongWayTimer = 0;
          state.wrongWayCooldown = 1.0;
        }
      } else {
        state.wrongWay = false;
        state.wrongWayTimer = 0;
      }
    } else {
      state.wrongWay = false;
      state.wrongWayTimer = 0;
    }
    if (state.wrongWayCooldown > 0) state.wrongWayCooldown -= dt;
    
    const checkpointTs = [0.25, 0.5, 0.75, 0.95];
    for (let c = 0; c < 4; c++) {
      if (!state.checkpoints[c] && Math.abs(currentT - checkpointTs[c]) < 0.03) {
        if (c === 0 || state.checkpoints[c - 1]) {
          state.checkpoints[c] = true;
        }
      }
    }
    
    if (state.checkpoints.every(c => c) && currentT < 0.05 && state.lastCheckpoint > 0.9) {
      state.lap++;
      const lapBonus = 500 + state.lap * 200;
      awardEvent('lap', lapBonus, `LAP ${state.lap}`, { boost: 12, comboStrength: 0.5, noCombo: true, color: '#ffdd44', lap: state.lap });
      if (state.perfectLapActive) {
        awardEvent('perfect_lap', 350, 'PERFECT LAP', { boost: 25, comboStrength: 1.5, color: '#88ffaa' });
      }
      state.bankedAmount = lapBonus;
      state.showPointsBanked = 2.0;
      state.pointsFlash = 0.6;
      state.pointsFlashIntensity = 0.5 + Math.min(0.3, lapBonus / 3000);
      state.pendingPointsFlashIntensity = 0;
      state.driftGracePeriod = 0;
      if (state.lapTime < state.bestLap) state.bestLap = state.lapTime;
      state.lapTime = 0;
      state.checkpoints = [false, false, false, false];
      state.perfectLapActive = true;
      playSfx('lap');
    }
    state.lastCheckpoint = currentT;
  }
  
  playerCar.position.set(state.carPos.x, 0.0, state.carPos.z);
  playerCar.rotation.y = state.carAngle;

  // Rotate wheels based on speed (larger wheels = lower RPM)
  const wheelSpinSpeed = state.speed * 3.2;
  if (playerCar.userData.wheels) {
    playerCar.userData.wheels.forEach(w => {
      w.rotation.x += wheelSpinSpeed;
    });
  }
  state.opponents.forEach(opp => {
    if (opp.mesh.userData.wheels) {
      const oppSpinSpeed = opp.speed * 0.6 * 60 * 4.5;
      opp.mesh.userData.wheels.forEach(w => {
        w.rotation.x += oppSpinSpeed;
      });
    }
  });

    const turnYawAmount = state.turnInput * state.speed * 2.5;
    // Use driftAngle directly (it now smoothly lerps to 0 after drift ends)
    const totalVisualYaw = state.driftAngle + turnYawAmount * 0.08;
    playerCar.rotation.y = state.carAngle + totalVisualYaw;

  // Lean: buses rock more dramatically on turns (heavy body roll)
  const targetTilt = state.turnInput * 0.07;
  // Use driftMomentum directly — it smoothly decays after drift ends
  const driftTilt = state.driftMomentum * 3.5;
  const desiredLean = (targetTilt * state.speed * 3) + driftTilt;
  // Slower lerp for smoother lean transitions (especially exiting drift)
  const leanLerpSpeed = state.drifting ? 0.1 : 0.05;
  const smoothLean = THREE.MathUtils.lerp(playerCar.userData.currentLean || 0, desiredLean, leanLerpSpeed);
  playerCar.userData.currentLean = smoothLean;

  // Never rotate the car group itself on Z
  playerCar.rotation.z = 0;

  const wheels = playerCar.userData.wheels || [];
  playerCar.children.forEach(child => {
    // Cache original positions once
    if (child.userData.origX === undefined) child.userData.origX = child.position.x;
    if (child.userData.origY === undefined) child.userData.origY = child.position.y;
    if (child.userData.origZ === undefined) child.userData.origZ = child.position.z;

    if (wheels.includes(child)) {
      // Wheels: always reset to exact original position, no lean at all
      child.position.x = child.userData.origX;
      child.position.y = child.userData.origY;
      child.position.z = child.userData.origZ;
      child.rotation.z = 0;
    } else {
      // Body parts: pivot around y=0 so bottom stays grounded, top leans
      const ox = child.userData.origX;
      const oy = child.userData.origY;
      const cosL = Math.cos(smoothLean);
      const sinL = Math.sin(smoothLean);
      // Rotate the position around the Z-axis at y=0 (ground level)
      child.position.x = ox * cosL - oy * sinL;
      child.position.y = ox * sinL + oy * cosL;
      child.position.z = child.userData.origZ;
      child.rotation.z = smoothLean;
    }
  });
  
  state.opponents.forEach(opp => {
    if (!opp.mesh.visible) return;
    opp.prevT = opp.t;
    opp.t += opp.speed * 0.6 * dt * 60 * (raceStarted ? 1 : 0);
    
    if (opp.t >= 1) {
      opp.t -= 1;
      opp.lap++;
    }
    
    const p = getTrackPoint(opp.t);
    const tan = getTrackTangent(opp.t);
    const nx = -tan.z, nz = tan.x;
    
    opp.mesh.position.set(p.x + nx * opp.offset, 0, p.z + nz * opp.offset);
    opp.mesh.rotation.y = Math.atan2(tan.x, tan.z);
  });
  
  const camDist = 18;   // pulled back further to keep full bus visible
  const camHeight = 10; // higher up to see over the tall bus

  // Drift camera: rotate slightly left when drifting, plus right-stick camera look.
  const cameraStickLook = THREE.MathUtils.clamp(state.cameraStick.x || 0, -1, 1) * 0.35;
  const driftCamTarget = (state.drifting && state.speed > state.maxSpeed * 0.2) ? 0.25 : 0;
  state._driftCamAngle = THREE.MathUtils.lerp(state._driftCamAngle || 0, driftCamTarget, 0.04);
  const camAngle = state.carAngle + state._driftCamAngle + cameraStickLook;

  const idealOffset = new THREE.Vector3(
    state.carPos.x - Math.sin(camAngle) * camDist,
    camHeight,
    state.carPos.z - Math.cos(camAngle) * camDist
  );
  
  const idealLookAt = new THREE.Vector3(
    state.carPos.x + Math.sin(camAngle) * 4,
    1.5,
    state.carPos.z + Math.cos(camAngle) * 4
  );
  
  const cameraFollow = state.drifting ? 0.085 : 0.07;
  cameraOffset.lerp(idealOffset, cameraFollow);
  cameraLookAt.lerp(idealLookAt, cameraFollow + 0.025);
  
  if (!debugMode) {
    camera.position.copy(cameraOffset);
  }
  
  if (state.screenShake > 0) {
    const shakeDecay = state.screenShake / 0.4;
    const intensity = state.screenShakeIntensity * shakeDecay;
    const freq = 35;
    const t = performance.now() * 0.001;
    camera.position.x += Math.sin(t * freq) * intensity * 0.7;
    camera.position.y += Math.cos(t * freq * 1.3) * intensity * 0.4;
    camera.position.z += Math.sin(t * freq * 0.9 + 1.5) * intensity * 0.7;
    state.screenShake -= dt;
    if (state.screenShake <= 0) {
      state.screenShake = 0;
      state.screenShakeIntensity = 0;
    }
  }
  
  if (!debugMode) {
    camera.lookAt(cameraLookAt);
  } else {
    orbitControls.update();
  }
  
  sunLight.position.set(state.carPos.x + 40, 60, state.carPos.z + 30);
  sunLight.target.position.set(state.carPos.x, 0, state.carPos.z);
  sunLight.target.updateMatrixWorld();
  
  // ---- Exhaust smoke emission ----
  if (raceStarted && !state.gameOver && currentLevel !== 0) {
    state.exhaustTimer -= dt;
    const absSpeed = Math.abs(state.speed);
    const isIdle = absSpeed < state.maxSpeed * 0.12;
    const isLowSpeed = absSpeed < state.maxSpeed * 0.40;

    // Emit rate: faster puffs at idle, occasional wisps at low speed
    const emitInterval = isIdle ? 0.22 : isLowSpeed ? 0.45 : 0;

    if (emitInterval > 0 && state.exhaustTimer <= 0) {
      state.exhaustTimer = emitInterval + (Math.random() * emitInterval * 0.4);

      // Compute world position of exhaust pipe tip
      const offset = playerCar.userData.exhaustOffset;
      const angle = playerCar.rotation.y;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      // Rotate local offset by bus yaw
      const wx = state.carPos.x + offset.x * cosA + offset.z * sinA;
      const wy = offset.y;
      const wz = state.carPos.z - offset.x * sinA + offset.z * cosA;

      // Burst of 1–3 puffs at idle, single wisp at low speed
      const count = isIdle ? 1 + Math.floor(Math.random() * 2) : 1;
      for (let pi = 0; pi < count; pi++) {
        const jitterX = (Math.random() - 0.5) * 0.08;
        const jitterZ = (Math.random() - 0.5) * 0.08;
        spawnExhaustPuff(wx + jitterX, wy, wz + jitterZ, isIdle);
      }
    }
  }

  // ---- Engine audio update ----
  if (engineAudio.started) {
    const speedRatio = state.speed / state.maxSpeed;
    updateEngineAudio(speedRatio);
  }

  updateParticles(dt);
  updateSkidMarks(dt);
  

  
  const playerT = getClosestTrackT(state.carPos.x, state.carPos.z).t;
  const playerProgress = state.lap + playerT;
  let position = 1;
  state.opponents.forEach(opp => {
    if (opp.mesh.visible && opp.lap + opp.t > playerProgress) position++;
  });
  
  lapDisplay.innerHTML = `<div style="font-size:13px;color:rgba(255,255,255,0.5);letter-spacing:2px;font-weight:600;">LAP</div><div style="font-size:32px;font-weight:800;color:#fff;margin-top:2px;">${state.lap + 1}</div>`;
  
  const timeLeft = state.timeRemaining;
  const timerColor = timeLeft <= 10 ? (Math.floor(timeLeft * 3) % 2 === 0 ? '#ff3333' : '#ff6666') : '#fff';
  const timerGlow = timeLeft <= 10 ? 'text-shadow:0 0 15px rgba(255,50,50,0.6);' : '';
  timerDisplay.innerHTML = `<div style="font-size:13px;color:rgba(255,255,255,0.5);letter-spacing:2px;font-weight:600;">TIME</div><div style="font-size:32px;font-weight:800;color:${timerColor};margin-top:2px;${timerGlow}">${formatTimeFixed(timeLeft)}</div>`;
  
  if (state.showPointsBanked > 0) state.showPointsBanked -= dt;

  pointsDisplay.innerHTML = `<div style="font-size:13px;color:rgba(255,255,255,0.5);letter-spacing:2px;font-weight:600;">SCORE</div><div style="font-size:32px;font-weight:800;color:#fff;margin-top:2px;">${Math.round(state.totalPoints).toLocaleString()}</div>`;

  if (state.drifting && state.driftPoints > 5) {
    const mulColor = state.pointsMultiplier >= 4 ? '#ff4400' : state.pointsMultiplier >= 2.5 ? '#ffaa00' : '#ffdd44';
    driftComboDisplay.style.opacity = '1';
    driftComboDisplay.innerHTML = `<div style="font-size:48px;font-weight:900;color:#fff;text-shadow:0 0 20px rgba(255,150,0,0.6);letter-spacing:-1px;">+${Math.round(state.driftPoints * state.pointsMultiplier).toLocaleString()}</div><div style="font-size:16px;font-weight:700;color:${mulColor};margin-top:2px;letter-spacing:1px;">x${state.pointsMultiplier.toFixed(1)} MULTIPLIER</div>`;
  } else if (state.showPointsBanked > 0) {
    driftComboDisplay.style.opacity = String(Math.min(1, state.showPointsBanked * 2));
    if (state.bankedAmount < 0) {
      driftComboDisplay.innerHTML = `<div style="font-size:36px;font-weight:900;color:#ff3333;text-shadow:0 0 20px rgba(255,0,0,0.5);">CRASH!</div><div style="font-size:14px;color:#ff6666;margin-top:4px;">POINTS LOST</div>`;
    } else {
      const graceLeft = Math.max(0, state.driftGracePeriod);
      const graceFraction = state.driftGracePeriod > 0 ? graceLeft / 2.0 : 0;
      const r = Math.round(255 * graceFraction + 68 * (1 - graceFraction));
      const g = Math.round(221 * graceFraction + 255 * (1 - graceFraction));
      const b = Math.round(68 * graceFraction + 136 * (1 - graceFraction));
      const pointsColor = `rgb(${r},${g},${b})`;
      const glowR = Math.round(255 * graceFraction);
      const glowG = Math.round(150 * graceFraction + 255 * (1 - graceFraction));
      const glowB = Math.round(0 * graceFraction + 100 * (1 - graceFraction));
      const glowColor = `rgba(${glowR},${glowG},${glowB},0.4)`;
      const lastLog = state.pointsLog.length > 0 ? state.pointsLog[state.pointsLog.length - 1] : null;
      const sourceIcon = lastLog && lastLog.type === 'lap' ? '🏁' : '⚡';
      const graceBar = graceLeft > 0 ? `<div style="font-size:11px;color:#ffdd44;margin-top:6px;letter-spacing:1px;">⚠ SAFE FOR ${graceLeft.toFixed(1)}s</div>` : '';
      const bankedLabel = graceLeft > 0 ? '' : `<div style="font-size:14px;color:#88ffaa;margin-top:4px;">${sourceIcon} POINTS WON</div>`;
      const pointsNumColor = graceLeft > 0 ? pointsColor : '#44ff88';
      const pointsNumGlow = graceLeft > 0 ? glowColor : 'rgba(0,255,100,0.4)';
      const numIcon = graceLeft > 0 ? `${sourceIcon} ` : '';
      const justBanked = graceLeft <= 0 && state.showPointsBanked > 0 && state.showPointsBanked < 1.6;
      const popScale = justBanked ? 1 + Math.max(0, (state.showPointsBanked - 0.8)) * 0.5 : 1;
      const popStyle = `transform:translate(-50%,-50%) scale(${popScale});transition:transform 0.25s cubic-bezier(0.18,1.4,0.4,1);`;
      driftComboDisplay.style.cssText = `position:absolute;top:40%;left:50%;${popStyle}text-align:center;pointer-events:none;opacity:${Math.min(1, state.showPointsBanked * 2)};`;
      driftComboDisplay.innerHTML = `<div style="font-size:36px;font-weight:900;color:${pointsNumColor};text-shadow:0 0 20px ${pointsNumGlow};transition:color 0.15s,text-shadow 0.15s;">${numIcon}+${state.bankedAmount.toLocaleString()}</div>${bankedLabel}${graceBar}`;
    }
  } else {
    driftComboDisplay.style.opacity = '0';
  }

  // Wrong-way HUD
  if (state.wrongWay) {
    const pulse = Math.floor(state.wrongWayTimer * 4) % 2 === 0;
    const remaining = Math.max(0, 2.0 - state.wrongWayTimer);
    wrongWayDisplay.style.opacity = '1';
    wrongWayDisplay.innerHTML = `<div style="font-size:48px;font-weight:900;color:${pulse ? '#ff3333' : '#ff6666'};text-shadow:0 0 30px rgba(255,0,0,0.7);letter-spacing:4px;">⚠ WRONG WAY ⚠</div><div style="font-size:16px;color:#ff8888;margin-top:8px;">Resetting in ${remaining.toFixed(1)}s</div>`;
  } else {
    wrongWayDisplay.style.opacity = '0';
  }

  if (state.crashFlash > 0) {
    state.crashFlash -= dt;
    const flashAlpha = Math.max(0, state.crashFlash / 0.45) * state.crashFlashIntensity;
    const vignetteEl = document.getElementById('crash-vignette');
    const chromL = document.getElementById('chromatic-left');
    const chromR = document.getElementById('chromatic-right');
    vignetteEl.style.opacity = flashAlpha;
    chromL.style.opacity = flashAlpha * 0.8;
    chromR.style.opacity = flashAlpha * 0.8;
    if (state.crashFlash <= 0) {
      state.crashFlash = 0;
      vignetteEl.style.opacity = '0';
      chromL.style.opacity = '0';
      chromR.style.opacity = '0';
    }
  }

  if (state.pointsFlash > 0) {
    state.pointsFlash -= dt;
    const pAlpha = Math.max(0, state.pointsFlash / 0.6) * state.pointsFlashIntensity;
    const pVig = document.getElementById('points-vignette');
    const pChromL = document.getElementById('points-chromatic-left');
    const pChromR = document.getElementById('points-chromatic-right');
    pVig.style.opacity = pAlpha;
    pChromL.style.opacity = pAlpha * 0.7;
    pChromR.style.opacity = pAlpha * 0.7;
    if (state.pointsFlash <= 0) {
      state.pointsFlash = 0;
      pVig.style.opacity = '0';
      pChromL.style.opacity = '0';
      pChromR.style.opacity = '0';
    }
  }

  updateArcadeHud(dt);
  drawMinimap();
  updatePointsLog();
  updateFPS();
  
  renderToon();
}

// ============ TOON RENDER FUNCTION ============
function renderToon() {
  // 1. Render depth pass
  renderer.setRenderTarget(depthTarget);
  renderer.render(scene, camera);

  // 2. Render normal pass (override all materials)
  scene.overrideMaterial = normalMat;
  renderer.setRenderTarget(normalTarget);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;

  // 3. Reset render target
  renderer.setRenderTarget(null);

  // 4. Feed depth + normal textures to outline shader
  outlinePass.uniforms.tDepth.value = depthTarget.depthTexture;
  outlinePass.uniforms.tNormal.value = normalTarget.texture;
  outlinePass.uniforms.cameraNear.value = camera.near;
  outlinePass.uniforms.cameraFar.value = camera.far;

  // 5. Render final composited image via EffectComposer
  composer.render();
}

// ============ RESIZE ============
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  depthTarget.setSize(window.innerWidth, window.innerHeight);
  normalTarget.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  outlinePass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
});

function restartGame() {
  if (!state.gameOver) return;
  hapticPulse(35, 0.3);
  // Restart audio fresh so pitch/volume reset cleanly
  stopEngineAudio();
  setTimeout(() => { if (currentLevel !== 0) initEngineAudio(); }, 450);
  startLevel(currentLevel);
  updateDiffBtn();
}

function returnToLevelSelect() {
  state.gameOver = true;
  state.speed = 0;
  gameOverOverlay.style.display = 'none';
  stopEngineAudio();
  setTimeout(() => { if (currentLevel !== 0) initEngineAudio(); }, 450);
  // Restart at current difficulty
  startLevel(currentLevel || 2);
  updateDiffBtn();
}

window.addEventListener('keydown', e => {
  if (e.code === 'Enter' && state.gameOver) restartGame();
  if (e.code === 'Escape' && state.gameOver) restartGame();
});
window.addEventListener('touchstart', () => {
  if (state.gameOver) restartGame();
});

// ============ POINTS LOG RENDERER ============
function updatePointsLog() {
  const log = state.pointsLog;
  const recentCount = 8;
  const startIdx = Math.max(0, log.length - recentCount);
  const recent = log.slice(startIdx);

  let html = '';
  recent.forEach((entry, i) => {
    const age = state.totalTime - entry.time;
    const opacity = age < 3 ? 1 : Math.max(0.3, 1 - (age - 3) * 0.15);
    const isNeg = entry.amount < 0 || entry.amount === 0 && entry.type.startsWith('crash');
    const timeStr = formatTime(entry.time);
    let icon, label, color, amtStr;

    if (entry.type === 'drift') {
      icon = '⚡'; label = `DRIFT x${entry.multiplier.toFixed(1)}`; color = '#44ff88';
      amtStr = `+${entry.amount.toLocaleString()}`;
    } else if (entry.type === 'lap') {
      icon = '🏁'; label = `LAP ${entry.lap}`; color = '#44ff88'; amtStr = `+${entry.amount.toLocaleString()}`;
    } else if (entry.type === 'crash_wall') {
      icon = '💥'; label = 'WALL CRASH'; color = '#ff4444'; amtStr = entry.amount === 0 ? '—' : `${entry.amount.toLocaleString()}`;
    } else if (entry.type === 'crash_car') {
      icon = '🚗'; label = 'CAR CRASH'; color = '#ff6644'; amtStr = entry.amount === 0 ? '—' : `${entry.amount.toLocaleString()}`;
    } else {
      icon = '•'; label = entry.type; color = '#fff'; amtStr = `${entry.amount}`;
    }

    const isNew = age < 0.8;
    const animStyle = isNew ? 'animation:logSlide 0.3s ease-out;' : '';

    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 10px;margin-bottom:3px;border-radius:6px;background:rgba(0,0,0,0.55);border:1px solid ${isNeg ? 'rgba(255,60,60,0.25)' : 'rgba(255,255,255,0.08)'};opacity:${opacity};font-size:12px;color:#ccc;${animStyle}backdrop-filter:blur(4px);">
      <div style="display:flex;align-items:center;gap:5px;">
        <span style="font-size:13px;">${icon}</span>
        <span style="color:${color};font-weight:700;font-size:11px;">${label}</span>
      </div>
      <div style="font-weight:800;color:${color};font-size:13px;font-variant-numeric:tabular-nums;">${amtStr}</div>
    </div>`;
  });

  pointsLogPanel.innerHTML = html;
}

const logStyle = document.createElement('style');
logStyle.textContent = `@keyframes logSlide { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
document.head.appendChild(logStyle);

cameraOffset.set(state.carPos.x, 10, state.carPos.z - 18);
cameraLookAt.set(state.carPos.x, 1.5, state.carPos.z);

// Use setup data from the React lobby if available, otherwise fall back to level select overlay
const __setup = window.__gameSetup;
if (__setup) {
  const firstPlayer = __setup.players[0];
  if (firstPlayer?.vehicle && VEHICLES[firstPlayer.vehicle]) {
    profile.selectedVehicle = firstPlayer.vehicle;
    saveProfile();
  }
  startLevel(__setup.difficulty);
} else {
  buildLevelSelect();
}
updateDiffBtn();

// Use setAnimationLoop for WebGPU renderer
renderer.setAnimationLoop(animate);
