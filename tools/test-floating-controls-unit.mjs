import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const parser = require("@babel/parser"),
  traverse = require("@babel/traverse").default,
  generate = require("@babel/generator").default;
import { recoverVideoToggleButton } from "../src/video/ui/VideoToggleButton.js";
const jsx = (type, props) => ({ type, props });
const state = {
  dualCaption: { enabled: false, mode: "dual" },
  setting: {
    language: { subtitle: "en", translation: "zh-CN" },
    theme: "light",
    font: "",
    hoverDict: false,
  },
  translatorService: { subtitle: { name: "Google" } },
  shortcuts: [],
  tasks: [],
  user: undefined,
};
const base = {
  React: {
    useState: (value) => [
      typeof value === "function" ? value() : value,
      () => {},
    ],
    useEffect() {},
    useRef: () => ({ current: null }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
  },
  jsxRuntime: { jsx, jsxs: jsx },
  useAppSelector: (selector) => selector(state),
  useAppDispatch: () => () => {},
  useLocale: () => ({ locale: (key) => key }),
  captionProvider: {
    platform: "html5",
    event: { on() {}, off() {} },
    lines: [],
    video: { hasAttribute: () => false },
  },
  platformContext: {},
  jn: [{ code: "en" }, { code: "zh-CN" }],
  zb: [],
  xb:
    () =>
    (...classes) =>
      classes.filter(Boolean).join(" "),
  hd: () => ({}),
  rj: Object.assign,
  nj: Object.assign,
};
const dependencies = new Proxy(base, {
  get: (target, key) => (key in target ? target[key] : () => false),
});
const oldWindow = globalThis.window,
  oldDocument = globalThis.document;
globalThis.document = { querySelector: () => null };
globalThis.window = { innerHeight: 900 };
try {
  const render = recoverVideoToggleButton(dependencies);
  assert.doesNotThrow(() =>
    render({ runtime: { scheme: "chrome-extension://fixture" } }),
  );
  for (const tasks of [undefined, null, "invalid", {}]) {
    state.tasks = tasks;
    assert.doesNotThrow(
      () => render({ runtime: { scheme: "chrome-extension://fixture" } }),
      `Legacy tasks ${String(tasks)} must not break the floating menu`,
    );
  }
} finally {
  if (oldWindow === undefined) delete globalThis.window;
  else globalThis.window = oldWindow;
  if (oldDocument === undefined) delete globalThis.document;
  else globalThis.document = oldDocument;
}
for (const file of ["edreader-main.js", "edvideo-main.js"]) {
  const ast = parser.parse(
    fs.readFileSync(new URL(`../assets/${file}`, import.meta.url), "utf8"),
  );
  let expression;
  traverse(ast, {
    ObjectProperty(path) {
      if (path.node.key?.name === "preloadedState")
        expression = generate(path.node.value).code;
    },
  });
  assert.ok(
    expression?.includes("Array.isArray"),
    `${file}: partial-state tasks must be normalized`,
  );
  const hydrate = new Function("e", `return (${expression});`);
  for (const input of [
    undefined,
    null,
    {},
    { tasks: undefined },
    { tasks: null },
    { tasks: "invalid" },
  ]) {
    const result = hydrate(input);
    if (input == null)
      assert.equal(
        result,
        input,
        "No payload must still use the root reducer defaults",
      );
    else assert.deepEqual(result.tasks, []);
  }
  const input = { tasks: ["caption-guide"], setting: { theme: "light" } };
  const result = hydrate(input);
  assert.equal(result.tasks, input.tasks);
  assert.equal(result.setting, input.setting);
}
console.log(
  "Floating video menu and partial-state hydration tolerate absent/malformed legacy task lists.",
);
