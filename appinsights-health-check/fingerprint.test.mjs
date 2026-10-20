import { strict as assert } from "node:assert";
import { test } from "node:test";

import { normaliseFingerprint } from "./fingerprint.mjs";

// The literal output of a real `exceptions` check, with problemId as the throw site.
const RAW =
  "exceptions:ContainerAlreadyExists at handleErrorResponse (/opt/app/node_modules/@azure/core-client/dist/commonjs/deserializationPolicy.js:146:19):api";
const NORMALISED = "exceptions:ContainerAlreadyExists at handleErrorResponse (deserializationPolicy.js):api";

test("the throw site reduces to the file's basename", () => {
  assert.equal(normaliseFingerprint(RAW), NORMALISED);
});

test("a fingerprint with no throw site is unchanged", () => {
  assert.equal(normaliseFingerprint("server-errors:GET /api/cases:500:pcs-api"), "server-errors:GET /api/cases:500:pcs-api");
  assert.equal(normaliseFingerprint("exceptions:ECONNRESET:my-web"), "exceptions:ECONNRESET:my-web");
  assert.equal(normaliseFingerprint("crons-silent"), "crons-silent");
});

test("a dependency bump that moves the throw site keeps the same identity", () => {
  const afterBump = RAW.replace(":146:19)", ":151:23)");
  assert.notEqual(afterBump, RAW);
  assert.equal(normaliseFingerprint(afterBump), normaliseFingerprint(RAW));
});

test("the package path is dropped, so a relocated dependency keeps its identity", () => {
  const relocated = RAW.replace("/dist/commonjs/", "/dist/cjs/");
  assert.equal(normaliseFingerprint(relocated), NORMALISED);
});

test("a bare filename with no directory still loses its line and column", () => {
  assert.equal(normaliseFingerprint("exceptions:Boom at handler (app.js:12:3)"), "exceptions:Boom at handler (app.js)");
});

test("every throw site in a multi-frame fingerprint is reduced", () => {
  assert.equal(
    normaliseFingerprint("exceptions:Boom at a (/srv/a.js:1:2) at b (/srv/b.js:3:4)"),
    "exceptions:Boom at a (a.js) at b (b.js)"
  );
});

test("whitespace is collapsed and trimmed", () => {
  assert.equal(normaliseFingerprint("  exceptions:Boom   at\thandler  "), "exceptions:Boom at handler");
});

// A backslash-separated path keeps its directory, since only a forward slash marks
// one here. The line and column still go, which is what a version bump moves.
test("a Windows-style path keeps its directory but loses its line and column", () => {
  assert.equal(
    normaliseFingerprint("exceptions:Boom at handler (C:\\app\\handler.js:9:1)"),
    "exceptions:Boom at handler (C:\\app\\handler.js)"
  );
});

test("normalisation is idempotent, so a normalised value can be fed back in", () => {
  assert.equal(normaliseFingerprint(NORMALISED), NORMALISED);
});

test("different functions in the same file stay different problems", () => {
  const other = RAW.replace("handleErrorResponse", "deserializeResponseBody");
  assert.notEqual(normaliseFingerprint(other), NORMALISED);
});

test("the same function name in different files stays a different problem", () => {
  const other = RAW.replace("deserializationPolicy.js", "serializationPolicy.js");
  assert.notEqual(normaliseFingerprint(other), NORMALISED);
});
