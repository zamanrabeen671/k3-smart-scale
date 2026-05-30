import { decide, AutoScalerConfig, Metrics, State } from "./decision";

const cfg: AutoScalerConfig = {
  cpuScaleUpThreshold: 0.70,
  cpuScaleDownThreshold: 0.30,
  pendingForScaleUpSeconds: 180,
  idleForScaleDownSeconds: 600,
  cooldownUpSeconds: 300,
  cooldownDownSeconds: 600,
  minWorkers: 2,
  maxWorkers: 10,
};

const NOW = 1_000_000;

function baseState(overrides: Partial<State> = {}): State {
  return {
    scalingInProgress: false,
    lastScaleEpoch: 0,
    workerCount: 3,
    ...overrides,
  };
}

function baseMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    avgCpu: 0.50,
    pendingPods: 0,
    pendingLongEnough: false,
    idleLongEnough: false,
    nowEpoch: NOW,
    ...overrides,
  };
}

describe("decide()", () => {
  // ── NOOP guards ───────────────────────────────────────────────────────────

  test("NOOP when scalingInProgress=true", () => {
    const d = decide(cfg, baseMetrics(), baseState({ scalingInProgress: true }));
    expect(d.type).toBe("NOOP");
    expect(d.reason).toContain("scalingInProgress");
  });

  test("NOOP when inside scale-up cooldown", () => {
    // last scale was 100s ago, cooldownUp is 300s
    const d = decide(
      cfg,
      baseMetrics({ nowEpoch: NOW }),
      baseState({ lastScaleEpoch: NOW - 100, scaleUpActionId: "abc" })
    );
    expect(d.type).toBe("NOOP");
    expect(d.reason).toBe("cooldownActive");
  });

  test("NOOP when inside scale-down cooldown", () => {
    // last scale was 300s ago, cooldownDown is 600s
    const d = decide(
      cfg,
      baseMetrics({ nowEpoch: NOW }),
      baseState({ lastScaleEpoch: NOW - 300 })
    );
    expect(d.type).toBe("NOOP");
    expect(d.reason).toBe("cooldownActive");
  });

  test("NOOP when already at maxWorkers (no scale-up)", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.90, pendingLongEnough: true }),
      baseState({ workerCount: cfg.maxWorkers })
    );
    expect(d.type).toBe("NOOP");
    expect(d.reason).toBe("stable");
  });

  test("NOOP when already at minWorkers (no scale-down)", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.10, idleLongEnough: true }),
      baseState({ workerCount: cfg.minWorkers })
    );
    expect(d.type).toBe("NOOP");
    expect(d.reason).toBe("stable");
  });

  test("NOOP when CPU is in middle range with no pending pods", () => {
    const d = decide(cfg, baseMetrics({ avgCpu: 0.50 }), baseState());
    expect(d.type).toBe("NOOP");
    expect(d.reason).toBe("stable");
  });

  // ── SCALE_UP ─────────────────────────────────────────────────────────────

  test("SCALE_UP when CPU high", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.80 }),
      baseState()
    );
    expect(d.type).toBe("SCALE_UP");
    if (d.type === "SCALE_UP") {
      expect(d.reason).toBe("cpuHigh");
      expect(d.delta).toBe(1);
      expect(d.lockKey).toBe("cluster");
    }
  });

  test("SCALE_UP when pods pending long enough (even with low CPU)", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.20, pendingPods: 5, pendingLongEnough: true }),
      baseState()
    );
    expect(d.type).toBe("SCALE_UP");
    if (d.type === "SCALE_UP") {
      expect(d.reason).toBe("pendingPodsLongEnough");
    }
  });

  test("no SCALE_UP when pods pending but not long enough", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.20, pendingPods: 5, pendingLongEnough: false }),
      baseState()
    );
    expect(d.type).toBe("NOOP");
  });

  // ── SCALE_DOWN ───────────────────────────────────────────────────────────

  test("SCALE_DOWN when CPU low and cluster idle", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.10, idleLongEnough: true }),
      baseState({ workerCount: 4 })
    );
    expect(d.type).toBe("SCALE_DOWN");
    if (d.type === "SCALE_DOWN") {
      expect(d.reason).toBe("cpuLowAndIdle");
      expect(d.toRemove).toBe(1);
      expect(d.lockKey).toBe("cluster");
    }
  });

  test("SCALE_DOWN never removes more than 1 node per decision", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.10, idleLongEnough: true }),
      baseState({ workerCount: 8 })
    );
    expect(d.type).toBe("SCALE_DOWN");
    if (d.type === "SCALE_DOWN") {
      expect(d.toRemove).toBe(1);
    }
  });

  test("no SCALE_DOWN when CPU low but NOT idle long enough", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.10, idleLongEnough: false }),
      baseState({ workerCount: 4 })
    );
    expect(d.type).toBe("NOOP");
  });

  test("no SCALE_DOWN when idle but CPU above threshold", () => {
    const d = decide(
      cfg,
      baseMetrics({ avgCpu: 0.50, idleLongEnough: true }),
      baseState({ workerCount: 4 })
    );
    expect(d.type).toBe("NOOP");
  });
});
