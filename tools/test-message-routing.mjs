import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");

// Exercise the ACTUAL generated legacy listeners, not a separate reimplementation.
const runGenerator = async (owner, args, generator) => {
  const iterator = generator.apply(owner, args || []);
  let step = iterator.next();
  while (!step.done) {
    try {
      step = iterator.next(await step.value);
    } catch (error) {
      step = iterator.throw(error);
    }
  }
  return step.value;
};
for (const [file, client] of [
  ["background.js", "background"],
  ["edreader-main.js", "content"],
  ["edvideo-main.js", "content"],
]) {
  const ast = parser.parse(
    fs.readFileSync(new URL(`../assets/${file}`, import.meta.url), "utf8"),
  );
  const callbacks = [];
  traverse(ast, {
    CallExpression(path) {
      const object = path.node.callee?.object;
      if (
        path.node.callee?.property?.name !== "addListener" ||
        object?.property?.name !== "onMessage" ||
        object.object?.property?.name !== "runtime"
      )
        return;
      const enclosingClass = path.findParent((parent) => parent.isClass());
      const methods =
        enclosingClass?.node.body.body.map((method) => method.key?.name) || [];
      if (
        !methods.includes("emit") ||
        (!methods.includes("response") && !methods.includes("getStateChunks"))
      )
        return;
      callbacks.push(path.node.arguments[0]);
    },
  });
  assert.equal(
    callbacks.length,
    1,
    `${file}: expected one legacy message listener`,
  );
  const callback = callbacks[0];
  let helper;
  t.traverseFast(callback, (node) => {
    if (
      t.isCallExpression(node) &&
      t.isIdentifier(node.callee) &&
      node.arguments.some(
        (argument) => t.isFunctionExpression(argument) && argument.generator,
      )
    )
      helper = node.callee.name;
  });
  assert.ok(helper);
  const calls = [],
    events = [];
  const handler = async (message) => {
    calls.push(message);
  };
  const bus = {
    client,
    handlers: { probe: client === "background" ? handler : [handler] },
    event: { emit: (...args) => events.push(args) },
  };
  const listener = new Function(
    helper,
    "nt",
    "Vt",
    "tt",
    `return (${generate(callback).code});`,
  ).call(
    bus,
    runGenerator,
    () => {},
    () => {},
    () => {},
  );
  for (const message of [
    { type: "cheng:study:open" },
    { type: "cheng:study:live" },
    { type: "cheng:study:explain" },
    { type: "cheng:learning:open" },
    { type: "cheng:learning:tabs" },
    { type: "cheng:learning:engines" },
    { type: "lexihalo:subtitle-ai:get-config" },
    { type: "asr-offscreen", requestId: "fixture" },
    {},
    null,
    undefined,
    [],
    { from: "content", to: "background", name: "probe" },
    { from: "content", to: [null], name: "probe" },
    { to: [client], name: "probe" },
  ]) {
    const original = structuredClone(message);
    let result;
    try {
      result = listener(message, { tab: { id: 7 }, frameId: 0 });
      await result;
    } catch (error) {
      assert.fail(
        `${file}: typed/malformed message ${JSON.stringify(message)} crashed the legacy listener: ${error.stack}`,
      );
    }
    assert.equal(
      result,
      false,
      `${file}: unrelated messages must be ignored synchronously, without claiming the response channel`,
    );
    assert.deepEqual(message, original, "Ignored messages must not be mutated");
  }
  assert.equal(calls.length, 0);
  assert.equal(events.length, 0);
  const request = {
    from: "content",
    to: [client],
    name: "probe",
    uuid: "legacy-request",
  };
  await listener(request, { tab: { id: 7 }, frameId: 0 });
  assert.equal(calls.length, 1, `${file}: valid old requests still work`);
  const response = {
    from: client,
    to: [client],
    uuid: "legacy-response",
    response: { message: "ok" },
  };
  await listener(response, { tab: { id: 7 }, frameId: 0 });
  assert.equal(events.length, 1, `${file}: valid old responses still work`);
  assert.equal(events[0][0], "legacy-response");
}
console.log(
  "Legacy runtime listeners ignore typed/malformed messages synchronously; legacy requests and responses remain compatible.",
);
