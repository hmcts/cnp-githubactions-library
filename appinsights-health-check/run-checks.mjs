// Runs the consumer's Application Insights queries and evaluates them against the
// consumer's thresholds. Deliberately contains no queries of its own: services differ
// too much for a shared query set to be right, and a team should be able to tune its
// own monitoring without a PR against this repository.
//
// Node rather than bash because this parses YAML, evaluates rules and keeps state.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const QUERY_ENDPOINT = "https://api.applicationinsights.io/v1/apps";
const SUMMARY_LIMIT = 40;

const env = (name, fallback = "") => process.env[name] ?? fallback;

const output = (key, value) => {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  // Multi-line values need the delimiter form; a bare `k=v` truncates at the newline.
  const text = String(value);
  if (text.includes("\n")) {
    const delimiter = `ghadelimiter_${Math.random().toString(36).slice(2)}`;
    appendFileSync(path, `${key}<<${delimiter}\n${text}\n${delimiter}\n`);
  } else {
    appendFileSync(path, `${key}=${text}\n`);
  }
};

const summary = (line) => {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) appendFileSync(path, `${line}\n`);
};

const fatal = (message) => {
  // Always an error, never a silent pass: a query that cannot run must not be
  // indistinguishable from a query that found nothing wrong. That confusion is the
  // whole failure mode this action exists to avoid.
  console.log(`::error::appinsights-health-check: ${message}`);
  process.exit(1);
};

// ---------------------------------------------------------------------------
// Minimal YAML subset parser.
//
// Avoids a dependency: a composite action has no node_modules of its own, and
// `npm install js-yaml` on every scheduled run is a network dependency in the
// detection path. Supports nested maps, block sequences, inline `{}`/`[]` flow
// collections, `|`/`>` block scalars, quotes and comments — enough for the config
// schema. Anything it cannot parse is a hard error rather than a silent mis-read.
// ---------------------------------------------------------------------------

const stripComment = (line) => {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote && line[i - 1] !== "\\") quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
};

const parseScalar = (raw) => {
  const text = raw.trim();
  if (text === "" || text === "~" || text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text);
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length > 1) ||
    (text.startsWith("'") && text.endsWith("'") && text.length > 1)
  ) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  if (text.startsWith("{") || text.startsWith("[")) return parseFlow(text);
  return text;
};

// Splits on top-level commas only, so nested collections survive.
const splitFlow = (body) => {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") parts.push(current);
  return parts;
};

function parseFlow(text) {
  const body = text.slice(1, -1).trim();
  if (text.startsWith("[")) {
    if (body === "") return [];
    return splitFlow(body).map((part) => parseScalar(part));
  }
  if (body === "") return {};
  const result = {};
  for (const part of splitFlow(body)) {
    const idx = part.indexOf(":");
    if (idx === -1) fatal(`could not parse inline mapping near '${part.trim()}'`);
    result[parseScalar(part.slice(0, idx))] = parseScalar(part.slice(idx + 1));
  }
  return result;
}

// Reads a `|` or `>` block scalar: every following line indented deeper than the key.
const readBlockScalar = (lines, start, keyIndent, style) => {
  const collected = [];
  let i = start;
  let blockIndent = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      collected.push("");
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= keyIndent) break;
    if (blockIndent === null) blockIndent = indent;
    collected.push(line.slice(blockIndent));
  }
  while (collected.length && collected.at(-1) === "") collected.pop();
  const text = style === ">" ? collected.join(" ") : collected.join("\n");
  return [style === ">" ? text : `${text}\n`, i];
};

function parseBlock(lines, start, indent) {
  // Decide map-vs-sequence from the first meaningful line at this indent.
  let probe = start;
  while (probe < lines.length && stripComment(lines[probe]).trim() === "") probe++;
  const isSequence = probe < lines.length && stripComment(lines[probe]).trimStart().startsWith("- ");

  const container = isSequence ? [] : {};
  let i = start;

  while (i < lines.length) {
    const rawLine = lines[i];
    const content = stripComment(rawLine);
    if (content.trim() === "") {
      i++;
      continue;
    }

    const lineIndent = content.length - content.trimStart().length;
    if (lineIndent < indent) break;
    if (lineIndent > indent) fatal(`unexpected indentation at line ${i + 1}: '${rawLine.trim()}'`);

    const trimmed = content.trim();

    if (isSequence) {
      if (!trimmed.startsWith("-")) break;
      const itemBody = trimmed.slice(1).trim();
      if (itemBody === "") {
        const [value, next] = [null, i + 1];
        container.push(value);
        i = next;
        continue;
      }
      // `- key: value` opens a map whose first key sits at the item's own indent.
      const colon = itemBody.indexOf(":");
      if (colon !== -1 && !itemBody.startsWith("{") && !itemBody.startsWith("[")) {
        const itemIndent = content.indexOf("-") + 2;
        const rewritten = [...lines];
        rewritten[i] = " ".repeat(itemIndent) + itemBody;
        const [value, next] = parseBlock(rewritten, i, itemIndent);
        container.push(value);
        i = next;
        continue;
      }
      container.push(parseScalar(itemBody));
      i++;
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon === -1) fatal(`expected 'key: value' at line ${i + 1}: '${rawLine.trim()}'`);
    const key = parseScalar(trimmed.slice(0, colon));
    const rest = trimmed.slice(colon + 1).trim();

    if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
      const [value, next] = readBlockScalar(lines, i + 1, lineIndent, rest[0]);
      container[key] = rest.endsWith("-") ? value.replace(/\n$/, "") : value;
      i = next;
      continue;
    }

    if (rest === "") {
      // Nested block, unless the next meaningful line dedents — then it is an empty value.
      let peek = i + 1;
      while (peek < lines.length && stripComment(lines[peek]).trim() === "") peek++;
      if (peek < lines.length) {
        const peekContent = stripComment(lines[peek]);
        const peekIndent = peekContent.length - peekContent.trimStart().length;
        // A sequence may sit at the parent key's own indent.
        if (peekIndent > lineIndent || (peekIndent === lineIndent && peekContent.trim().startsWith("- "))) {
          const [value, next] = parseBlock(lines, peek, peekIndent);
          container[key] = value;
          i = next;
          continue;
        }
      }
      container[key] = null;
      i++;
      continue;
    }

    container[key] = parseScalar(rest);
    i++;
  }

  return [container, i];
}

const parseYaml = (text) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => !/^\s*---\s*$/.test(l));
  const meaningful = lines.findIndex((l) => stripComment(l).trim() !== "");
  if (meaningful === -1) return {};
  const [value] = parseBlock(lines, meaningful, 0);
  return value;
};

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

const COMPARATORS = {
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b
};

const parseComparison = (expression, checkId) => {
  const match = String(expression).trim().match(/^(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    fatal(
      `check '${checkId}' has an unparseable rule '${expression}'. Expected a comparator and a number, e.g. '> 0' or '== 0'.`
    );
  }
  return { compare: COMPARATORS[match[1]], threshold: Number.parseFloat(match[2]), text: `${match[1]} ${match[2]}` };
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const configPath = env("CONFIG_PATH", ".github/watchdog.yml");
if (!existsSync(configPath)) {
  fatal(`no config file at '${configPath}'. Create one, or set config-path.`);
}

let config;
try {
  config = parseYaml(readFileSync(configPath, "utf8"));
} catch (error) {
  fatal(`could not parse '${configPath}': ${error.message}`);
}

const appId = env("APP_ID") || config?.["app-insights"]?.["app-id"] || "";
if (!appId) {
  fatal(
    "no Application Insights app ID. Set the app-id input, or app-insights.app-id in the config. This is the app's GUID (az monitor app-insights component show --query appId), not the resource name."
  );
}

const checks = config?.checks;
if (!Array.isArray(checks) || checks.length === 0) {
  fatal(`'${configPath}' defines no checks. Add a 'checks:' list.`);
}

const knownCheckKeys = new Set(["id", "severity", "rule", "query", "fingerprint-by", "description"]);
for (const [index, check] of checks.entries()) {
  if (!check || typeof check !== "object") fatal(`check at position ${index + 1} is not a mapping.`);
  if (!check.id) fatal(`the check at position ${index + 1} has no 'id'.`);
  if (!check.query) fatal(`check '${check.id}' has no 'query'.`);
  if (!check.rule || typeof check.rule !== "object") {
    fatal(`check '${check.id}' has no 'rule'. Expected e.g. rule: { rows: '> 0' }.`);
  }
  for (const key of Object.keys(check)) {
    if (!knownCheckKeys.has(key)) {
      fatal(`check '${check.id}' has an unknown key '${key}'. Allowed: ${[...knownCheckKeys].join(", ")}.`);
    }
  }
  const ruleKeys = Object.keys(check.rule);
  const hasRows = ruleKeys.includes("rows");
  const hasColumn = ruleKeys.includes("column");
  if (!hasRows && !hasColumn) {
    fatal(`check '${check.id}' has a rule with neither 'rows' nor 'column'.`);
  }
  if (hasRows && hasColumn) {
    fatal(`check '${check.id}' has a rule with both 'rows' and 'column'. Use one.`);
  }
  if (hasColumn && !ruleKeys.includes("value")) {
    fatal(`check '${check.id}' has a 'column' rule with no 'value'.`);
  }
  // Parsed here as well as at evaluation time, so a malformed comparison is reported
  // as the config error it is rather than surfacing later as a confusing query failure.
  parseComparison(hasRows ? check.rule.rows : check.rule.value, check.id);
}

const duplicates = checks.map((c) => c.id).filter((id, i, all) => all.indexOf(id) !== i);
if (duplicates.length) fatal(`duplicate check ids: ${[...new Set(duplicates)].join(", ")}.`);

const suppressions = new Map();
for (const entry of config?.suppressions ?? []) {
  if (!entry?.fingerprint) fatal("a suppressions entry has no 'fingerprint'.");
  if (!entry.reason) {
    // Required so the list stays auditable — an unexplained entry is an invisible blind spot.
    fatal(`suppression '${entry.fingerprint}' has no 'reason'. Every suppression must say why.`);
  }
  suppressions.set(entry.fingerprint, entry.reason);
}

const parseDuration = (text, fallbackMs) => {
  if (!text) return fallbackMs;
  const match = String(text).trim().match(/^(\d+)\s*(m|h|d)$/);
  if (!match) fatal(`unparseable duration '${text}'. Use forms like 30m, 6h or 1d.`);
  const scale = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return Number.parseInt(match[1], 10) * scale;
};

const renotifyAfterMs = parseDuration(
  env("RENOTIFY_AFTER") || config?.defaults?.["renotify-after"],
  6 * 3_600_000
);
const maxFindings = Number.parseInt(env("MAX_FINDINGS", "3"), 10);
if (!Number.isFinite(maxFindings) || maxFindings < 1) fatal("max-findings must be a positive integer.");

const statePath = env("STATE_PATH", ".watchdog-state.json");
let state = { lastNotified: {} };
if (existsSync(statePath)) {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    if (parsed && typeof parsed === "object") state = { lastNotified: parsed.lastNotified ?? {} };
  } catch {
    // A corrupt state file must not stop detection; it degrades to re-reporting.
    console.log(`::warning::appinsights-health-check: could not read state at '${statePath}' — treating all findings as fresh.`);
  }
}

const token = env("AI_TOKEN");
if (!token) fatal("no Application Insights token was provided.");

const runQuery = async (kql, checkId) => {
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(`${QUERY_ENDPOINT}/${appId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: kql }),
      signal: AbortSignal.timeout(90_000)
    });
  } catch (error) {
    fatal(`check '${checkId}' could not reach the query API: ${error.message}`);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    let detail = bodyText.slice(0, 600);
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed?.error?.message ?? parsed?.error?.innererror?.message ?? detail;
    } catch {
      // Keep the raw body.
    }
    if (response.status === 403) {
      fatal(
        `check '${checkId}' was refused (403). The principal needs Monitoring Reader on the Application Insights resource. ${detail}`
      );
    }
    if (response.status === 400) {
      fatal(`check '${checkId}' has an invalid query (400). ${detail}`);
    }
    fatal(`check '${checkId}' failed with HTTP ${response.status}. ${detail}`);
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    fatal(`check '${checkId}' returned a response that is not JSON.`);
  }

  const table = payload?.tables?.find((t) => t.name === "PrimaryResult") ?? payload?.tables?.[0];
  if (!table) fatal(`check '${checkId}' returned no result table.`);

  const columns = table.columns.map((c) => c.name);
  const rows = (table.rows ?? []).map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
  return { rows, columns, durationMs: Date.now() - startedAt };
};

const fingerprintFor = (check, row) => {
  const keys = check["fingerprint-by"] ?? [];
  const parts = (Array.isArray(keys) ? keys : [keys])
    .map((key) => {
      if (!(key in row)) {
        fatal(
          `check '${check.id}' names '${key}' in fingerprint-by but the query does not return that column. Returned: ${Object.keys(row).join(", ") || "(no columns)"}.`
        );
      }
      return String(row[key] ?? "");
    })
    .filter((part) => part !== "");
  return [check.id, ...parts].join(":");
};

const window = env("WINDOW", "15m");
const baseline = env("BASELINE_WINDOW", "7d");
const nowMs = Date.now();

const verdicts = [];
const allFindings = [];
const firingFingerprints = new Set();
let anyFired = false;

for (const check of checks) {
  const kql = String(check.query).replaceAll("{{window}}", window).replaceAll("{{baseline}}", baseline);
  const { rows, durationMs } = await runQuery(kql, check.id);

  const severity = check.severity ?? config?.defaults?.severity ?? "medium";
  let fired = false;
  let observed;
  let ruleText;
  const rowsThatFired = [];

  if ("rows" in check.rule) {
    const { compare, threshold, text } = parseComparison(check.rule.rows, check.id);
    fired = compare(rows.length, threshold);
    observed = `${rows.length} row(s)`;
    ruleText = `rows ${text}`;
    if (fired) {
      // A `== 0` rule fires on emptiness, so there is no row to attribute it to —
      // the check itself is the finding.
      rowsThatFired.push(...(rows.length ? rows : [{}]));
    }
  } else {
    const column = check.rule.column;
    const { compare, threshold, text } = parseComparison(check.rule.value, check.id);
    ruleText = `${column} ${text}`;
    for (const row of rows) {
      if (!(column in row)) {
        fatal(
          `check '${check.id}' tests column '${column}' but the query does not return it. Returned: ${Object.keys(row).join(", ") || "(no columns)"}.`
        );
      }
      const value = Number(row[column]);
      if (!Number.isFinite(value)) {
        fatal(`check '${check.id}' returned a non-numeric value '${row[column]}' in column '${column}'.`);
      }
      if (compare(value, threshold)) rowsThatFired.push(row);
    }
    fired = rowsThatFired.length > 0;
    observed = `${rowsThatFired.length} of ${rows.length} row(s) breaching`;
  }

  verdicts.push({
    id: check.id,
    severity,
    fired,
    rule: ruleText,
    observed,
    rowCount: rows.length,
    queryMs: durationMs,
    query: kql,
    rows: rows.slice(0, 20)
  });

  if (!fired) continue;
  anyFired = true;

  for (const row of rowsThatFired) {
    const fingerprint = fingerprintFor(check, row);
    firingFingerprints.add(fingerprint);
    allFindings.push({
      fingerprint,
      checkId: check.id,
      severity,
      rule: ruleText,
      row,
      query: kql,
      suppressed: suppressions.has(fingerprint),
      suppressionReason: suppressions.get(fingerprint) ?? null
    });
  }
}

// Resolution: anything previously reported that is no longer firing.
const resolved = Object.keys(state.lastNotified).filter((fp) => !firingFingerprints.has(fp));

const suppressed = allFindings.filter((f) => f.suppressed);
const notSuppressed = allFindings.filter((f) => !f.suppressed);

const stillQuiet = [];
const fresh = [];
for (const finding of notSuppressed) {
  const last = state.lastNotified[finding.fingerprint];
  if (last && nowMs - new Date(last).getTime() < renotifyAfterMs) {
    stillQuiet.push(finding);
  } else {
    fresh.push(finding);
  }
}

const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
fresh.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));

const emitted = fresh.slice(0, maxFindings);
const deferred = fresh.slice(maxFindings);

// Only what is actually emitted updates the state, so a deferred finding is still
// fresh on the next run rather than being silently swallowed by the cap.
for (const finding of emitted) state.lastNotified[finding.fingerprint] = new Date(nowMs).toISOString();
for (const fingerprint of resolved) delete state.lastNotified[fingerprint];
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

const findingsPath = "appinsights-health-check-findings.json";
writeFileSync(
  findingsPath,
  `${JSON.stringify({ appId, window, baseline, generatedAt: new Date(nowMs).toISOString(), verdicts, findings: emitted, deferred, suppressed, resolved }, null, 2)}\n`
);

output("breached", emitted.length > 0);
output("findings", JSON.stringify(emitted));
output("findings-path", findingsPath);
output("deferred-count", deferred.length);
output("resolved", JSON.stringify(resolved));

// Summary: a clean run has to be auditable too, otherwise "nothing posted" is
// indistinguishable from "nothing ran".
summary("## Application Insights health check");
summary("");
summary(`Window \`${window}\`, baseline \`${baseline}\`, app \`${appId}\`.`);
summary("");
summary("| Check | Severity | Result | Rule | Observed | Query time |");
summary("|---|---|---|---|---|---|");
for (const verdict of verdicts) {
  summary(
    `| \`${verdict.id}\` | ${verdict.severity} | ${verdict.fired ? "🔴 fired" : "🟢 clean"} | \`${verdict.rule}\` | ${verdict.observed} | ${verdict.queryMs} ms |`
  );
}
summary("");

if (emitted.length) {
  summary(`### ${emitted.length} finding(s) reported`);
  summary("");
  for (const finding of emitted.slice(0, SUMMARY_LIMIT)) {
    summary(`- \`${finding.fingerprint}\` (${finding.severity}) — ${JSON.stringify(finding.row)}`);
  }
  summary("");
}
if (deferred.length) {
  summary(`### ${deferred.length} finding(s) deferred by max-findings=${maxFindings}`);
  summary("");
  summary("These will be reported on a later run. Raise `max-findings` to see more per run.");
  summary("");
  for (const finding of deferred.slice(0, SUMMARY_LIMIT)) summary(`- \`${finding.fingerprint}\` (${finding.severity})`);
  summary("");
}
if (stillQuiet.length) {
  summary(`### ${stillQuiet.length} ongoing finding(s) within the re-notify window`);
  summary("");
  for (const finding of stillQuiet.slice(0, SUMMARY_LIMIT)) summary(`- \`${finding.fingerprint}\``);
  summary("");
}
if (suppressed.length) {
  summary(`### ${suppressed.length} suppressed finding(s)`);
  summary("");
  for (const finding of suppressed.slice(0, SUMMARY_LIMIT)) {
    summary(`- \`${finding.fingerprint}\` — ${finding.suppressionReason}`);
  }
  summary("");
}
if (resolved.length) {
  summary(`### ${resolved.length} resolved`);
  summary("");
  for (const fingerprint of resolved.slice(0, SUMMARY_LIMIT)) summary(`- \`${fingerprint}\``);
  summary("");
}

console.log(
  `${verdicts.filter((v) => v.fired).length} of ${verdicts.length} check(s) fired. ` +
    `${emitted.length} reported, ${deferred.length} deferred, ${stillQuiet.length} within re-notify window, ` +
    `${suppressed.length} suppressed, ${resolved.length} resolved.`
);

if (anyFired && env("FAIL_ON_BREACH") === "true") {
  console.log("::error::appinsights-health-check: one or more checks fired.");
  process.exit(1);
}
