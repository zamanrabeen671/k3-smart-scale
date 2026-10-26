export type AutoScalerConfig = {
  cpuScaleUpThreshold: number;      // e.g. 0.70
  cpuScaleDownThreshold: number;    // e.g. 0.30
  pendingForScaleUpSeconds: number; // e.g. 180
  idleForScaleDownSeconds: number;  // e.g. 600
  cooldownUpSeconds: number;        // e.g. 300
  cooldownDownSeconds: number;      // e.g. 600
  minWorkers: number;               // e.g. 2
  maxWorkers: number;               // e.g. 10
};

export type Metrics = {
  avgCpu: number;
  pendingPods: number;
  pendingLongEnough: boolean;
  idleLongEnough: boolean;
  nowEpoch: number;
};

export type State = {
  scalingInProgress: boolean;
  lastScaleEpoch: number;
  workerCount: number;
  scaleUpActionId?: string;
};

export type Decision =
  | { type: "NOOP"; reason: string }
  | { type: "SCALE_UP"; reason: string; delta: number; lockKey: "cluster" }
  | { type: "SCALE_DOWN"; reason: string; delta: number; lockKey: "cluster"; toRemove: number };

export function decide(cfg: AutoScalerConfig, m: Metrics, s: State): Decision {
  // Guard: never act while another scaling operation is in flight
  if (s.scalingInProgress) {
    return { type: "NOOP", reason: "scalingInProgress=true" };
  }

  // Cooldown: use different window depending on direction of last action
  const cooldownSec = s.scaleUpActionId
    ? cfg.cooldownUpSeconds
    : cfg.cooldownDownSeconds;

  if (m.nowEpoch - s.lastScaleEpoch < cooldownSec) {
    return { type: "NOOP", reason: "cooldownActive" };
  }

  const cpuUp   = m.avgCpu > cfg.cpuScaleUpThreshold;
  const cpuDown = m.avgCpu <= cfg.cpuScaleDownThreshold;

  // Scale Up: CPU pressure OR pods stuck pending
  if (s.workerCount < cfg.maxWorkers && (cpuUp || m.pendingLongEnough)) {
    return {
      type: "SCALE_UP",
      reason: cpuUp ? "cpuHigh" : "pendingPodsLongEnough",
      delta: 1,
      lockKey: "cluster",
    };
  }

  // Scale Down: CPU low AND cluster idle long enough
  if (s.workerCount > cfg.minWorkers && cpuDown && m.idleLongEnough) {
    const redundant = s.workerCount - cfg.minWorkers;
    return {
      type: "SCALE_DOWN",
      reason: "cpuLowAndIdle",
      delta: 1,
      lockKey: "cluster",
      toRemove: Math.min(redundant, 1),
    };
  }

  return { type: "NOOP", reason: "stable" };
}
