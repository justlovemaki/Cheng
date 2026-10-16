import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { recoverControlCenterWidget } from "../src/reader/control/ControlCenterWidget.js";
import { recoverControlCenterSettingsPanel } from "../src/reader/settings/ControlCenterSettingsPanel.js";

const require = createRequire(import.meta.url);
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const jsx = (type, props) => ({ type, props });
const nodes = (node) => node && typeof node === "object"
  ? [node, ...[node.props?.children].flat().flatMap(nodes)] : [];
const state = { setting: { conrolCenter: { blackList: [], transformY: 0 } }, edreader: {} };
let cursor = 0;
const hooks = [];
const widget = recoverControlCenterWidget({
  React: {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (next) => { hooks[index] = next; }];
    },
    useEffect() {},
    useRef: () => ({ current: 0 }),
  },
  classNames: () => (...values) => values.filter(Boolean).join(" "),
  jsxRuntime: { jsx, jsxs: jsx }, q_: { div: "div" }, uk: () => "draggable",
  useAppSelector: (selector) => selector(state),
  useDispatchBridge: () => ({}), useLocale: () => ({ locale: (key) => key }),
});
const oldWindow = globalThis.window;
globalThis.window = { innerHeight: 1000 };
const render = () => {
  cursor = 0;
  return widget({ runtime: { scheme: "chrome-extension://fixture" } });
};
const button = () => nodes(render()).find((node) => node.props?.className?.includes("rd-float-btn"));
try {
  nodes(render()).find((node) => node.type === "link").props.onLoad();
  assert.equal(button().props.style.opacity, 0.25);
  button().props.onMouseEnter();
  assert.equal(button().props.style.opacity, 1);
  button().props.onMouseLeave();
  assert.equal(button().props.style.opacity, 0.25);
  button().props.onFocus();
  button().props.onMouseLeave();
  assert.equal(button().props.style.opacity, 1, "Focus must survive mouse leave");
  button().props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} });
  assert.equal(button().props.style.opacity, 1, "Moving focus within the widget stays clear");
  button().props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null });
  assert.equal(button().props.style.opacity, 0.25);
  state.setting.conrolCenter.opacity = 45;
  assert.equal(button().props.style.opacity, 0.45);
  state.setting.conrolCenter.opacity = 100;
  assert.equal(button().props.style.opacity, 1, "Manual 100% remains supported");
  delete state.setting.conrolCenter.opacity;
  const settings = recoverControlCenterSettingsPanel({
    jsxRuntime: { jsx, jsxs: jsx },
    useAppSelector: (selector) => selector(state),
    useDispatchBridge: () => ({}), useLocale: () => ({ locale: (key) => key }),
    useSliderNavigation: () => ({}),
  })({});
  const range = nodes(settings).find((node) => node.props?.type === "range");
  assert.equal(range.props.value, 25);
  assert.equal(nodes(settings).find((node) => node.type === "label").props.children[0], 25);
} finally {
  if (oldWindow === undefined) delete globalThis.window;
  else globalThis.window = oldWindow;
}

// Exercise the actual migration and reducer installed in the generated bundle.
const ast = parser.parse(fs.readFileSync(new URL("../assets/background.js", import.meta.url), "utf8"));
let migration;
let reducer;
traverse(ast, {
  ArrowFunctionExpression(path) {
    const source = generate(path.node).code;
    if (path.node.params.length === 1 && source.includes("center.opacityVersion >= 1")) migration = source;
    if (path.node.params.length === 2 && source.includes("conrolCenter.opacityVersion = 1")) reducer = source;
  },
});
assert.ok(migration);
assert.ok(reducer);
for (const [center, expected, count] of [
  [{ opacity: 100 }, 25, 1],
  [{ opacity: 45 }, 45, 1],
  [{}, 25, 1],
  [{ opacity: 100, opacityVersion: 1 }, 100, 0],
  [{ opacity: 25, opacityVersion: 1 }, 25, 0],
]) {
  let dispatches = 0;
  const oldState = { setting: { conrolCenter: { ...center } } };
  const apply = vm.runInNewContext(`(${reducer})`);
  vm.runInNewContext(`(${migration})(state)`, {
    state: oldState,
    setControlCenterOpacityAction: (payload) => ({ payload }),
    store: { dispatch(action) { dispatches += 1; apply(oldState, action); } },
  });
  assert.equal(oldState.setting.conrolCenter.opacity, expected);
  assert.equal(dispatches, count);
  if (count) {
    assert.equal(oldState.setting.conrolCenter.opacityVersion, 1);
    apply(oldState, { payload: 100 });
    assert.equal(oldState.setting.conrolCenter.opacity, 100);
  }
}
console.log("Control-center idle/hover/focus opacity, settings and profile migration tests passed.");
