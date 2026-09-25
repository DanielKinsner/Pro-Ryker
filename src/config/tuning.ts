// Every feel number in one place. Units: metres, seconds, radians (unless *_DEG).
// These started as the design kit's TUNING_PROPOSAL hypotheses and are calibrated by play.

export const SIM = {
  dt: 1 / 120,
  maxCatchUp: 8,
  gravity: -15.5, // arcade gravity: snappier than 9.81 so air feels punchy, not floaty
  solverIterations: 8,
};

export const VEHICLE = {
  massKg: 240, // rider included; low-ish so the ragdoll can tug it without solver strain
  comLocal: [0, 0.48, 0.05] as const, // model space (x right, y up, -z forward)
  // Wheel centres in model space (measured from the Ryker GLB).
  wheels: [
    { name: 'fl', pos: [-0.52, 0.286, -0.854], radius: 0.284, front: true },
    { name: 'fr', pos: [0.539, 0.286, -0.854], radius: 0.284, front: true },
    { name: 'r', pos: [0, 0.285, 0.854], radius: 0.285, front: false },
  ] as const,
  suspensionRest: 0.16, // travel available below the wheel's rest position
  suspensionUp: 0.14, // travel above (bump)
  springK: 42000, // N/m per wheel
  damperC: 3600,
  maxSpeed: 26, // m/s (~58 mph) — stupid fast for a skatepark, on purpose
  reverseMax: 6,
  engineForce: 5200, // N at the rear contact
  brakeForce: 9000,
  rollingDrag: 0.35,
  airDrag: 0.0035,
  steerMaxLow: 0.62, // rad of front-wheel steer at low speed
  steerMaxHigh: 0.2,
  yawRateMax: 2.9, // rad/s arcade turn authority
  lateralGrip: 18, // how fast sideways slip is cancelled (1/s)
  driftGrip: 3.2,
  stickForce: 0.9, // extra surface adhesion (x gravity) on steep ground at speed
  uprightAssist: 26, // ground alignment torque gain
  uprightDamp: 7,
  ollieBase: 5.6,
  ollieCharge: 2.8,
  chargeTime: 0.55,
  coyoteTime: 0.16,
  vertNormalY: 0.6, // launches off transitions steeper than ~53° are vert air (straight up, back into the ramp)
};

export const AIR = {
  spinAccel: 22,
  spinMax: 9.4, // rad/s ≈ 540°/s
  flipAccel: 9, // W/S in the air is a lean for landings; big flips are J tricks
  flipMax: 2.6,
  damp: 7.5, // how fast spin/flip stop when you let go
  flipTrickDur: 0.62,
  grabBlendIn: 0.16,
};

export const LANDING = {
  cleanUpDeg: 28,
  sketchyUpDeg: 48,
  badUpDeg: 72,
  cleanYawDeg: 32,
  sketchyYawDeg: 58,
  fakieYawDeg: 145,
  slamImpact: 17, // m/s into the surface normal
  grabReleaseGrace: 0.12, // must let go of a grab this long before touchdown
};

export const RIDER = {
  unsettledEnter: 0.35,
  unsettledExit: 0.18,
  hangEnter: 0.72,
  dwell: 0.12,
  strainDecay: 0.55, // per second when riding clean
  recoverSettle: 0.8, // seconds of protection after a recovery
  // Hanging-on minigame
  haulPerTap: 0.16,
  haulDecayBase: 0.18,
  haulDecayPerMps: 0.028,
  gripDrainBase: 0.07,
  gripDrainPerMps: 0.012,
  gripDrainImpact: 0.12,
  deathGripThrottle: 0.62, // his weight on the twist-grip
  hangSteer: 0.35,
  recoverBlend: 0.42,
};

export const SESSION = {
  runSeconds: 120,
  comboGrace: 0.45, // grounded time before a combo banks
  maxFinishGrace: 6,
  multiplierCap: 20,
  specialFill: 0.00011,
  specialDrain: 0.035,
};

export const CAMERA = {
  distance: 6.4,
  height: 2.5,
  lookAhead: 2.2,
  fov: 62,
  followLerp: 7.5,
  hangExtra: 0.9,
};

export const deg = (d: number) => (d * Math.PI) / 180;
