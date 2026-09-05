/**
 * Unit tests for the security alert rule engine.
 *
 * All DB and email side-effects are mocked so these tests run without a
 * real database or SMTP server.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file, so any variables they
// reference must be created with vi.hoisted() — otherwise they would be
// accessed before initialization.

const { insertValuesSpy, selectQueue, dbMock, sendEmailSpy } = vi.hoisted(() => {
  const insertValuesSpy = vi.fn().mockResolvedValue(undefined);
  const selectQueue: unknown[][] = [];

  function makeChain(result: unknown[]) {
    return {
      // Makes `await db.select().from(tbl)` work without a .where()
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
      where: vi.fn(() => Promise.resolve(result)),
    };
  }

  const dbMock = {
    select: vi.fn(() => ({
      from: vi.fn(() => makeChain(selectQueue.shift() ?? [])),
    })),
    insert: vi.fn(() => ({ values: insertValuesSpy })),
  };

  const sendEmailSpy = vi.fn().mockResolvedValue(undefined);

  return { insertValuesSpy, selectQueue, dbMock, sendEmailSpy };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => ({
  db: dbMock,
  adminNotificationsTable: { ruleId: "ruleId", createdAt: "createdAt" },
  businessSettingsTable: {},
  auditLogTable: { action: "action", createdAt: "createdAt" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...a: unknown[]) => a),
  gte: vi.fn(),
  sql: new Proxy(
    Object.assign(() => "sql", { raw: () => "sql" }),
    { get: (_t, _k) => () => "sql" },
  ),
  desc: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("./email", () => ({ sendSecurityAlertEmail: sendEmailSpy }));
vi.mock("./logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ─── Import the module under test (after mocks are registered) ───────────────
import { evaluateAlertRules, mergeRules, DEFAULT_RULES, type AlertRule } from "./security-alerts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal settings row that enables security alerts with no SMTP config. */
const baseSettings = {
  securityAlertEnabled: true,
  alertRules: null as AlertRule[] | null,
  smtpHost: null as string | null,
  smtpPort: null as number | null,
  smtpUser: null as string | null,
  smtpFrom: null as string | null,
  businessEmail: null as string | null,
};

/**
 * Push results into the select queue.
 * Order: [settingsRow], [cntRow]?, [throttleRow]?
 */
function queueSelects(...batches: unknown[][]) {
  selectQueue.length = 0;
  for (const b of batches) selectQueue.push(b);
}

beforeEach(() => {
  selectQueue.length = 0;
  insertValuesSpy.mockClear();
  sendEmailSpy.mockClear();
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
});

// ─── mergeRules (pure) ───────────────────────────────────────────────────────

describe("mergeRules", () => {
  it("returns DEFAULT_RULES when saved is null", () => {
    expect(mergeRules(null)).toEqual(DEFAULT_RULES);
  });

  it("returns DEFAULT_RULES when saved is empty", () => {
    expect(mergeRules([])).toEqual(DEFAULT_RULES);
  });

  it("overlays saved config onto the matching default", () => {
    const saved: AlertRule[] = [{ ...DEFAULT_RULES[0], enabled: false }];
    const merged = mergeRules(saved);
    expect(merged.find((r) => r.id === "brute-force-login")?.enabled).toBe(false);
    // other defaults untouched
    expect(merged.find((r) => r.id === "user-deleted")?.enabled).toBe(true);
  });

  it("appends custom rules not in defaults", () => {
    const custom: AlertRule[] = [
      {
        id: "my-custom-rule",
        name: "Custom",
        description: "Custom rule",
        enabled: true,
        type: "action_match",
        actionPattern: "custom.event",
        severity: "info",
        notifyInApp: true,
        notifyEmail: false,
      },
    ];
    const merged = mergeRules(custom);
    expect(merged.find((r) => r.id === "my-custom-rule")).toBeDefined();
    expect(merged.length).toBe(DEFAULT_RULES.length + 1);
  });
});

// ─── master switch ───────────────────────────────────────────────────────────

describe("evaluateAlertRules — master switch disabled", () => {
  it("does nothing when securityAlertEnabled is false", async () => {
    queueSelects([{ ...baseSettings, securityAlertEnabled: false }]);

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail" });

    expect(insertValuesSpy).not.toHaveBeenCalled();
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("does nothing when no settings row exists", async () => {
    queueSelects([]); // empty array → no settings row

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail" });

    expect(insertValuesSpy).not.toHaveBeenCalled();
  });
});

// ─── disabled rules ──────────────────────────────────────────────────────────

describe("evaluateAlertRules — disabled rules", () => {
  it("skips every rule when all are disabled", async () => {
    const allDisabled = DEFAULT_RULES.map((r) => ({ ...r, enabled: false }));
    queueSelects([{ ...baseSettings, alertRules: allDisabled }]);

    await evaluateAlertRules({ action: "user.deleted", description: "user gone" });

    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it("skips only the disabled rule and fires the enabled ones", async () => {
    const mixed = DEFAULT_RULES.map((r) =>
      r.id === "user-deleted" ? { ...r, enabled: false } : r,
    );
    // role-change watches "user.updated" and stays enabled
    queueSelects([{ ...baseSettings, alertRules: mixed }]);

    await evaluateAlertRules({ action: "user.updated", description: "role change" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    expect((insertValuesSpy.mock.calls[0][0] as { ruleId: string }).ruleId).toBe("role-change");
  });
});

// ─── action_match rules ──────────────────────────────────────────────────────

describe("evaluateAlertRules — action_match rules", () => {
  it("fires once when the action matches", async () => {
    queueSelects([baseSettings]);

    await evaluateAlertRules({
      action: "user.deleted",
      description: "deleted user 5",
      actorName: "Alice",
      auditLogId: 99,
    });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    const payload = insertValuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.ruleId).toBe("user-deleted");
    expect(payload.severity).toBe("warning");
    expect(String(payload.title)).toContain("[WARNING]");
    expect(String(payload.body)).toContain("Alice");
    expect(payload.auditLogId).toBe(99);
  });

  it("does not fire when no rule matches the action", async () => {
    queueSelects([baseSettings]);

    await evaluateAlertRules({ action: "inventory.exported", description: "csv export" });

    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it("fires on every matching event — no throttle for action_match", async () => {
    queueSelects([baseSettings]);
    await evaluateAlertRules({ action: "user.deleted", description: "first" });

    queueSelects([baseSettings]);
    await evaluateAlertRules({ action: "user.deleted", description: "second" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(2);
  });

  it("fires the settings-changed rule when it has been enabled via saved config", async () => {
    const enabledSettings = DEFAULT_RULES.map((r) =>
      r.id === "settings-changed" ? { ...r, enabled: true } : r,
    );
    queueSelects([{ ...baseSettings, alertRules: enabledSettings }]);

    await evaluateAlertRules({ action: "settings.updated", description: "changed name" });

    expect((insertValuesSpy.mock.calls[0][0] as { ruleId: string }).ruleId).toBe("settings-changed");
  });
});

// ─── threshold — brute-force ─────────────────────────────────────────────────

describe("evaluateAlertRules — threshold (brute-force login, threshold=5, window=10 min)", () => {
  it("does not fire when count is below threshold (4 events)", async () => {
    queueSelects([baseSettings], [{ cnt: 4 }]);

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail" });

    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it("fires at exactly the threshold count (5 events), no prior notification", async () => {
    // Reads: settings → count=5 → throttle=0
    queueSelects([baseSettings], [{ cnt: 5 }], [{ cnt: 0 }]);

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail 5" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    const payload = insertValuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.ruleId).toBe("brute-force-login");
    expect(payload.severity).toBe("critical");
    expect(String(payload.title)).toContain("[CRITICAL]");
    expect(String(payload.body)).toContain("5");
  });

  it("fires when count exceeds threshold (10 events)", async () => {
    queueSelects([baseSettings], [{ cnt: 10 }], [{ cnt: 0 }]);

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    expect((insertValuesSpy.mock.calls[0][0] as { ruleId: string }).ruleId).toBe("brute-force-login");
  });

  it("throttles: does not fire when a notification already exists in the window", async () => {
    // count >= threshold BUT prior notification found → suppressed
    queueSelects([baseSettings], [{ cnt: 7 }], [{ cnt: 1 }]);

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail again" });

    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it("fires again after throttle window clears (0 prior notifications)", async () => {
    queueSelects([baseSettings], [{ cnt: 5 }], [{ cnt: 0 }]);
    await evaluateAlertRules({ action: "auth.login_failed", description: "new window" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
  });

  it("skips the throttle DB query entirely when count is below threshold", async () => {
    // count=2 → below threshold; wasRecentlyAlerted should never be called
    queueSelects([baseSettings], [{ cnt: 2 }]);

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail" });

    // 2 select calls: settings + countRecentActions; no third for throttle
    expect(dbMock.select).toHaveBeenCalledTimes(2);
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });
});

// ─── threshold — bulk-product-delete ─────────────────────────────────────────

describe("evaluateAlertRules — threshold (bulk-product-delete, threshold=3, window=5 min)", () => {
  it("fires at exactly 3 deletions", async () => {
    queueSelects([baseSettings], [{ cnt: 3 }], [{ cnt: 0 }]);

    await evaluateAlertRules({ action: "product.deleted", description: "product gone" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    expect((insertValuesSpy.mock.calls[0][0] as { ruleId: string }).ruleId).toBe("bulk-product-delete");
  });

  it("does not fire at 2 deletions (below threshold)", async () => {
    queueSelects([baseSettings], [{ cnt: 2 }]);

    await evaluateAlertRules({ action: "product.deleted", description: "product gone" });

    expect(insertValuesSpy).not.toHaveBeenCalled();
  });
});

// ─── email notifications ─────────────────────────────────────────────────────

describe("evaluateAlertRules — email notifications", () => {
  it("does not send email when notifyEmail is false (user-deleted rule)", async () => {
    queueSelects([baseSettings]);

    await evaluateAlertRules({ action: "user.deleted", description: "gone" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1); // in-app: yes
    expect(sendEmailSpy).not.toHaveBeenCalled();       // email: no
  });

  it("does not send email when SMTP is not configured (even if notifyEmail is true)", async () => {
    // brute-force rule has notifyEmail: true but smtpHost is null
    queueSelects([baseSettings], [{ cnt: 5 }], [{ cnt: 0 }]);

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1); // in-app notification created
    expect(sendEmailSpy).not.toHaveBeenCalled();       // no email — SMTP unconfigured
  });

  it("sends email when SMTP is fully configured and notifyEmail is true", async () => {
    const smtpSettings = {
      ...baseSettings,
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "user@example.com",
      smtpFrom: "alerts@example.com",
      businessEmail: "owner@example.com",
    };
    queueSelects([smtpSettings], [{ cnt: 5 }], [{ cnt: 0 }]);

    await evaluateAlertRules({ action: "auth.login_failed", description: "fail" });

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const arg = sendEmailSpy.mock.calls[0][0] as { to: string; severity: string };
    expect(arg.to).toBe("owner@example.com");
    expect(arg.severity).toBe("critical");
  });

  it("does not send email for action_match rule with notifyEmail: false", async () => {
    // role-change has notifyEmail: false
    queueSelects([baseSettings]);

    await evaluateAlertRules({ action: "user.updated", description: "role changed" });

    expect(insertValuesSpy).toHaveBeenCalledTimes(1);
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });
});
