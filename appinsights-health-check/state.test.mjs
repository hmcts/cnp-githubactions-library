import { strict as assert } from "node:assert";
import { test } from "node:test";

import { normaliseFingerprint } from "./fingerprint.mjs";
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
// `firing` is given as raw fingerprints, and normalised here exactly where
// run-checks.mjs does it, so the keys the state sees are the ones it would see in a
// real run. The reported lists stay raw, as the emitted findings do.
const run = ({ state, firing, nowMs, resolveAfterCleanRuns = RESOLVE_AFTER_CLEAN_RUNS, maxFindings = 3 }) => {
  const findings = firing.map((fingerprint) => ({
    fingerprint,
    normalisedFingerprint: normaliseFingerprint(fingerprint)
  }));
  const advanced = advanceState({
    state,
    firingFingerprints: new Set(findings.map((finding) => finding.normalisedFingerprint)),
    nowIso: iso(nowMs),
    resolveAfterCleanRuns
  });
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
      fingerprints: emitted.map((finding) => finding.normalisedFingerprint),
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

// The throw site a real Node problemId carries, and the same problem after a Renovate
// bump has moved the line it is thrown from.
const RAW = "exceptions:ContainerAlreadyExists at handleErrorResponse (/opt/app/node_modules/@azure/core-client/dist/commonjs/deserializationPolicy.js:146:19):api";
const AFTER_BUMP = RAW.replace(":146:19)", ":151:23)");
const KEY = normaliseFingerprint(RAW);

test("a state file keyed on raw fingerprints re-keys on the normalised form", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  const cached = {
    problems: {
      [RAW]: { lastNotified: iso(start - 30 * MINUTE), lastFiring: iso(start - 30 * MINUTE), cleanRuns: 0, resolvedAt: null }
    }
  };

  const state = loadState(cached);
  assert.deepEqual(Object.keys(state.problems), [KEY]);

  // Post-bump, so the raw fingerprint no longer matches the one in the cached file.
  const outcome = run({ state, firing: [AFTER_BUMP], nowMs: start });
  assert.deepEqual(outcome.emitted, []);
  assert.deepEqual(outcome.stillQuiet, [AFTER_BUMP]);
  assert.deepEqual(outcome.resolved, []);
});

test("a legacy flat state keyed on raw fingerprints migrates without re-reporting", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  const state = loadState({ lastNotified: { [RAW]: iso(start - HOUR) } });

  assert.deepEqual(state.problems[KEY], {
    lastNotified: iso(start - HOUR),
    lastFiring: iso(start - HOUR),
    cleanRuns: 0,
    resolvedAt: null
  });

  const stillFiring = run({ state, firing: [AFTER_BUMP], nowMs: start });
  assert.deepEqual(stillFiring.emitted, []);
  assert.deepEqual(stillFiring.resolved, []);

  const nowClean = run({ state, firing: [], nowMs: start });
  assert.deepEqual(nowClean.resolved, []);
});

test("two raw keys that collapse to one merge rather than clobber", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  const state = loadState({
    problems: {
      [RAW]: {
        lastNotified: iso(start - 4 * HOUR),
        lastFiring: iso(start - 3 * HOUR),
        cleanRuns: 5,
        resolvedAt: iso(start - 3 * HOUR)
      },
      [AFTER_BUMP]: {
        lastNotified: iso(start - HOUR),
        lastFiring: iso(start - 2 * HOUR),
        cleanRuns: 1,
        resolvedAt: iso(start - 90 * MINUTE)
      }
    }
  });

  assert.deepEqual(Object.keys(state.problems), [KEY]);
  assert.deepEqual(state.problems[KEY], {
    lastNotified: iso(start - HOUR),
    lastFiring: iso(start - 2 * HOUR),
    cleanRuns: 5,
    resolvedAt: iso(start - 90 * MINUTE)
  });

  // The later lastNotified is the one that has to win, or the merged record falls out
  // of its cooldown four hours early.
  assert.deepEqual(run({ state, firing: [RAW], nowMs: start }).emitted, []);
});

test("merging tolerates records with no timestamps at all", () => {
  const state = loadState({
    problems: {
      [RAW]: { lastNotified: null, lastFiring: null, cleanRuns: 0, resolvedAt: null },
      [AFTER_BUMP]: { lastNotified: null, lastFiring: null, cleanRuns: 2, resolvedAt: null }
    }
  });

  assert.deepEqual(state.problems[KEY], { lastNotified: null, lastFiring: null, cleanRuns: 2, resolvedAt: null });
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
