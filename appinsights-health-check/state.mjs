// The run-to-run deduplication state machine, kept in its own module so it can be
// tested: run-checks.mjs reads env, queries the API and writes files at import time,
// so importing it from a test is not possible. Everything here is pure — no fs, no
// env, no clock — and the caller supplies the current time.

import { normaliseFingerprint } from "./fingerprint.mjs";

const blankRecord = () => ({ lastNotified: null, lastFiring: null, cleanRuns: 0, resolvedAt: null });

const toMs = (iso) => {
  const ms = Date.parse(iso ?? "");
  return Number.isFinite(ms) ? ms : -Infinity;
};

const later = (a, b) => (toMs(a) >= toMs(b) ? a : b);

// Several raw fingerprints can reduce to one normalised key, so records are merged
// rather than overwritten: the newest timestamps keep the cooldown and the recovery
// announcement honest, and the highest cleanRuns keeps recovery from restarting its
// count.
const mergeRecords = (a, b) => ({
  lastNotified: later(a.lastNotified, b.lastNotified),
  lastFiring: later(a.lastFiring, b.lastFiring),
  cleanRuns: Math.max(a.cleanRuns, b.cleanRuns),
  resolvedAt: later(a.resolvedAt, b.resolvedAt)
});

const put = (problems, fingerprint, record) => {
  const key = normaliseFingerprint(fingerprint);
  // hasOwn rather than `in`, so a fingerprint that happens to name an Object.prototype
  // member is not merged against it.
  problems[key] = Object.hasOwn(problems, key) ? mergeRecords(problems[key], record) : record;
};

// Accepts the previous shape, a flat `{ fingerprint: lastNotifiedIso }` map, as well
// as the current one, and re-keys both on the normalised fingerprint. Consumers
// restore this file from an Actions cache, so a shape or key change that failed to
// carry the old entries over would re-report every problem being held quiet.
export const loadState = (raw) => {
  const problems = {};
  if (raw && typeof raw === "object") {
    if (raw.problems && typeof raw.problems === "object") {
      for (const [fingerprint, record] of Object.entries(raw.problems)) {
        if (!record || typeof record !== "object") continue;
        put(problems, fingerprint, {
          lastNotified: record.lastNotified ?? null,
          lastFiring: record.lastFiring ?? null,
          cleanRuns: Number.isInteger(record.cleanRuns) && record.cleanRuns >= 0 ? record.cleanRuns : 0,
          resolvedAt: record.resolvedAt ?? null
        });
      }
    } else if (raw.lastNotified && typeof raw.lastNotified === "object") {
      for (const [fingerprint, iso] of Object.entries(raw.lastNotified)) {
        put(problems, fingerprint, { lastNotified: iso, lastFiring: iso, cleanRuns: 0, resolvedAt: null });
      }
    }
  }
  return { problems };
};

// Recovery needs hysteresis. A problem that is absent from a single run is usually
// still there — a 15-minute window simply caught none of it — and declaring it
// resolved immediately discards the cooldown that stops it being re-reported.
export const advanceState = ({ state, firingFingerprints, nowIso, resolveAfterCleanRuns }) => {
  const firing = new Set(firingFingerprints);
  const problems = {};
  const resolved = [];

  for (const fingerprint of new Set([...Object.keys(state.problems), ...firing])) {
    const record = state.problems[fingerprint] ?? blankRecord();

    if (firing.has(fingerprint)) {
      problems[fingerprint] = { ...record, lastFiring: nowIso, cleanRuns: 0, resolvedAt: null };
      continue;
    }

    const cleanRuns = record.cleanRuns + 1;
    // resolvedAt keeps the announcement to once per recovery; lastNotified keeps it to
    // problems someone was actually told about.
    const announce = cleanRuns >= resolveAfterCleanRuns && record.resolvedAt === null && record.lastNotified !== null;
    if (announce) resolved.push(fingerprint);
    problems[fingerprint] = { ...record, cleanRuns, resolvedAt: announce ? nowIso : record.resolvedAt };
  }

  return { state: { problems }, resolved };
};

// Keyed on the finding's normalised fingerprint, as every record here is: a problem
// whose throw site moved is the same problem, and must still be inside its cooldown.
export const splitByFreshness = ({ findings, state, nowMs, renotifyAfterMs }) => {
  const stillQuiet = [];
  const fresh = [];
  for (const finding of findings) {
    const last = state.problems[finding.normalisedFingerprint]?.lastNotified;
    if (last && nowMs - toMs(last) < renotifyAfterMs) {
      stillQuiet.push(finding);
    } else {
      fresh.push(finding);
    }
  }
  return { stillQuiet, fresh };
};

export const recordNotified = ({ state, fingerprints, nowIso }) => {
  const problems = { ...state.problems };
  for (const fingerprint of fingerprints) {
    problems[fingerprint] = { ...(problems[fingerprint] ?? blankRecord()), lastNotified: nowIso };
  }
  return { problems };
};

// Nothing is dropped when a problem recovers, because the cooldown has to outlive
// recovery, so the state needs a ceiling of its own.
export const pruneState = (state, nowMs, ttlMs) => {
  const problems = {};
  for (const [fingerprint, record] of Object.entries(state.problems)) {
    const latest = Math.max(toMs(record.lastFiring), toMs(record.lastNotified));
    if (nowMs - latest < ttlMs) problems[fingerprint] = record;
  }
  return { problems };
};
