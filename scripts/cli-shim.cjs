// Lets CLI scripts (seed, worker, billing) import server modules guarded by
// `import "server-only"`, which otherwise throws outside the Next.js runtime.
const Module = require("module");
const path = require("path");
const original = Module._resolveFilename;
const stub = path.join(__dirname, "empty.cjs");
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return stub;
  return original.call(this, request, ...rest);
};
