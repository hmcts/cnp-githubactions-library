import { strict as assert } from "node:assert";
import { test } from "node:test";

import { advanceState, loadState, pruneState, recordNotified, splitByFreshness } from "./state.mjs";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const RENOTIFY_AFTER_MS = 6 * HOUR;
const RESOLVE_AFTER_CLEAN_RUNS = 3;

const iso = (ms) => new Date(ms).toISOString();

// Drives one scheduled run end to end, in the order run-checks.mjs does it, so the
// tests exercise the interaction between hysteresis, freshness and notification
// rather than each function in isolation.
const run = ({ state, firing, nowMs, resolveAfterCleanRuns = RESOLVE_AFTER_CLEAN_RUNS, maxFindings = 3 }) => {
  const advanced = advanceState({
    state,
    firingFingerprints: new Set(firing),
    nowIso: iso(nowMs),
    resolveAfterCleanRuns
  });
  const findings = firing.map((fingerprint) => ({ fingerprint }));
  const { stillQuiet, fresh } = splitByFreshness({
    findings,
    state: advanced.state,
    nowMs,
    renotifyAfterMs: RENOTIFY_AFTER_MS
  });
  const emitted = fresh.slice(0, maxFindings);
  return {
    state: recordNotified({
      state: advanced.state,
      fingerprints: emitted.map((finding) => finding.fingerprint),
      nowIso: iso(nowMs)
    }),
    resolved: advanced.resolved,
    emitted: emitted.map((finding) => finding.fingerprint),
    stillQuiet: stillQuiet.map((finding) => finding.fingerprint)
  };
};

test("a recurrence inside the re-notify window is neither reported nor resolved", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  let state = loadState(null);
  const resolvedEver = [];

  const first = run({ state, firing: ["exceptions:a"], nowMs: start });
  assert.deepEqual(first.emitted, ["exceptions:a"]);
  state = first.state;
  resolvedEver.push(...first.resolved);

  const clean = run({ state, firing: [], nowMs: start + 15 * MINUTE });
  state = clean.state;
  resolvedEver.push(...clean.resolved);

  const again = run({ state, firing: ["exceptions:a"], nowMs: start + 30 * MINUTE });
  assert.deepEqual(again.emitted, []);
  assert.deepEqual(again.stillQuiet, ["exceptions:a"]);
  resolvedEver.push(...again.resolved);

  assert.deepEqual(resolvedEver, []);
});

test("a recurrence after the re-notify window is reported again", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  const first = run({ state: loadState(null), firing: ["exceptions:a"], nowMs: start });
  const again = run({ state: first.state, firing: ["exceptions:a"], nowMs: start + 7 * HOUR });

  assert.deepEqual(again.emitted, ["exceptions:a"]);
  assert.deepEqual(again.resolved, []);
});

test("resolution waits for the clean-run threshold and is announced once", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  let state = run({ state: loadState(null), firing: ["exceptions:a"], nowMs: start }).state;

  const announcements = [];
  for (let i = 1; i <= 6; i++) {
    const outcome = run({ state, firing: [], nowMs: start + i * 15 * MINUTE });
    state = outcome.state;
    announcements.push(outcome.resolved);
  }

  assert.deepEqual(announcements, [[], [], ["exceptions:a"], [], [], []]);
});

test("firing again after resolution allows a second recovery announcement", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  let state = run({ state: loadState(null), firing: ["exceptions:a"], nowMs: start }).state;

  for (let i = 1; i <= RESOLVE_AFTER_CLEAN_RUNS; i++) {
    state = run({ state, firing: [], nowMs: start + i * 15 * MINUTE }).state;
  }
  assert.equal(state.problems["exceptions:a"].resolvedAt, iso(start + 45 * MINUTE));

  const recurrence = run({ state, firing: ["exceptions:a"], nowMs: start + 8 * HOUR });
  state = recurrence.state;
  assert.deepEqual(recurrence.emitted, ["exceptions:a"]);
  assert.equal(state.problems["exceptions:a"].resolvedAt, null);
  assert.equal(state.problems["exceptions:a"].cleanRuns, 0);

  const announcements = [];
  for (let i = 1; i <= RESOLVE_AFTER_CLEAN_RUNS; i++) {
    const outcome = run({ state, firing: [], nowMs: start + 8 * HOUR + i * 15 * MINUTE });
    state = outcome.state;
    announcements.push(outcome.resolved);
  }
  assert.deepEqual(announcements, [[], [], ["exceptions:a"]]);
});

test("a fingerprint that was never notified is never announced as resolved", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  // Deferred by the cap, so it fires but is never emitted.
  let state = run({ state: loadState(null), firing: ["a", "b", "c"], nowMs: start, maxFindings: 2 }).state;
  assert.equal(state.problems.c.lastNotified, null);

  const announcements = [];
  for (let i = 1; i <= 5; i++) {
    const outcome = run({ state, firing: [], nowMs: start + i * 15 * MINUTE });
    state = outcome.state;
    announcements.push(...outcome.resolved);
  }

  assert.deepEqual(announcements, ["a", "b"]);
  assert.equal(state.problems.c.cleanRuns, 5);
});

test("the old flat state migrates without re-reporting or resolving anything", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  const legacy = { lastNotified: { "exceptions:a": iso(start - 30 * MINUTE), "server-errors:b": iso(start - HOUR) } };

  const state = loadState(legacy);
  assert.deepEqual(state.problems["exceptions:a"], {
    lastNotified: iso(start - 30 * MINUTE),
    lastFiring: iso(start - 30 * MINUTE),
    cleanRuns: 0,
    resolvedAt: null
  });

  const stillFiring = run({ state, firing: ["exceptions:a"], nowMs: start });
  assert.deepEqual(stillFiring.emitted, []);
  assert.deepEqual(stillFiring.stillQuiet, ["exceptions:a"]);
  assert.deepEqual(stillFiring.resolved, []);

  const nowClean = run({ state, firing: [], nowMs: start });
  assert.deepEqual(nowClean.resolved, []);
});

test("an unreadable or absent state file loads as empty", () => {
  assert.deepEqual(loadState(null).problems, {});
  assert.deepEqual(loadState(undefined).problems, {});
  assert.deepEqual(loadState("not an object").problems, {});
  assert.deepEqual(loadState({ problems: { a: "not a record" } }).problems, {});
});

test("pruning drops records past the TTL and keeps recent ones", () => {
  const nowMs = Date.parse("2026-02-01T00:00:00.000Z");
  const ttlMs = 30 * DAY;
  const state = {
    problems: {
      recentlyFiring: { lastNotified: null, lastFiring: iso(nowMs - DAY), cleanRuns: 2, resolvedAt: null },
      recentlyNotified: { lastNotified: iso(nowMs - 2 * DAY), lastFiring: iso(nowMs - 40 * DAY), cleanRuns: 9, resolvedAt: null },
      stale: { lastNotified: iso(nowMs - 31 * DAY), lastFiring: iso(nowMs - 31 * DAY), cleanRuns: 99, resolvedAt: iso(nowMs - 30 * DAY) },
      undated: { lastNotified: null, lastFiring: null, cleanRuns: 1, resolvedAt: null }
    }
  };

  assert.deepEqual(Object.keys(pruneState(state, nowMs, ttlMs).problems), ["recentlyFiring", "recentlyNotified"]);
});

test("only emitted findings have their notification time advanced", () => {
  const nowIso = iso(Date.parse("2026-01-01T00:00:00.000Z"));
  const state = {
    problems: {
      emitted: { lastNotified: null, lastFiring: nowIso, cleanRuns: 0, resolvedAt: null },
      deferred: { lastNotified: null, lastFiring: nowIso, cleanRuns: 0, resolvedAt: null }
    }
  };

  const updated = recordNotified({ state, fingerprints: ["emitted"], nowIso });
  assert.equal(updated.problems.emitted.lastNotified, nowIso);
  assert.equal(updated.problems.deferred.lastNotified, null);
  assert.equal(state.problems.emitted.lastNotified, null);
});
