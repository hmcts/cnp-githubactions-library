// A problem's stable identity, used for every "is this the same problem?" decision:
// suppression matching, the re-notify cooldown and the resolved output.
//
// An `exceptions` fingerprint carries problemId, which in Node is the throw site —
// function, file, line and column, often inside a third-party package:
//
//   exceptions:ContainerAlreadyExists at handleErrorResponse
//   (/opt/app/node_modules/@azure/core-client/dist/commonjs/deserializationPolicy.js:146:19):api
//
// A dependency bump moves that line, so the raw string changes while the problem does
// not. The exception type and the throwing function are what identify it; the
// directory and the `:line:col` are build detail, so they are dropped. The file's
// basename is kept because two functions of the same name in different files are
// different problems.
//
// The exact output shape is load-bearing. Consumers track problems by the normalised
// form and have open issues identified by it, so a different output here would orphan
// every one of them.
export const normaliseFingerprint = (fingerprint) =>
  fingerprint
    .replace(/\(([^)]*\/)?([^/)]+?):\d+:\d+\)/g, "($2)")
    .replace(/\s+/g, " ")
    .trim();
