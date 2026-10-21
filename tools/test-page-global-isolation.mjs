import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;

function lodashFactory(relative) {
  const ast = parser.parse(
    fs.readFileSync(new URL(relative, import.meta.url), "utf8"),
  );
  let factory;
  traverse(ast, {
    ObjectProperty(property) {
      if (
        property.node.key.value === 2935 &&
        ["ArrowFunctionExpression", "FunctionExpression"].includes(
          property.node.value.type,
        )
      ) {
        assert.equal(factory, undefined, "Expected exactly one Lodash module");
        factory = generate(property.node.value).code;
      }
    },
  });
  assert.ok(factory, `Lodash module missing: ${relative}`);
  return factory;
}

function run(factory, setup = "") {
  const context = vm.createContext({});
  vm.runInContext(
    `
    self = globalThis;
    module = { exports: {} };
    require = { nmd: value => value };
    String.prototype.format = function(value) { return this.replace('%s', value); };
    originalFormat = String.prototype.format;
    luciTranslate = text => String(text);
    ${setup}
    before = Object.getOwnPropertyDescriptor(globalThis, '_');
    (${factory})(module, module.exports, require);
  `,
    context,
  );
  return context;
}

for (const name of ["edvideo-main", "edreader-main"]) {
  const legacy = lodashFactory(`../vendor/legacy/${name}.js`);
  const original = run(legacy, "_ = luciTranslate;");
  assert.throws(
    () => vm.runInContext("_('Memory %s').format('42%')", original),
    /format is not a function/,
    "Must reproduce LuCI's original error",
  );

  const fixed = lodashFactory(`../assets/${name}.js`);
  for (const setup of [
    "_ = luciTranslate;",
    "let stored = luciTranslate; writes = 0; Object.defineProperty(globalThis, '_', {get: () => stored, set: value => {writes++; stored = value;}, configurable: false});",
    "Object.defineProperty(globalThis, '_', {value: luciTranslate, writable: false, configurable: false});",
    "",
  ]) {
    const context = run(fixed, setup);
    assert.equal(
      vm.runInContext("String.prototype.format === originalFormat", context),
      true,
    );
    assert.deepEqual(
      vm.runInContext(
        "Object.getOwnPropertyDescriptor(globalThis, '_')",
        context,
      ),
      context.before,
      "Host property descriptor, including getter/setter identity, must be unchanged",
    );
    if (setup) {
      assert.equal(vm.runInContext("_ === luciTranslate", context), true);
      assert.equal(
        vm.runInContext("_('Memory %s').format('42%')", context),
        "Memory 42%",
      );
      assert.equal(
        vm.runInContext(
          "typeof writes === 'undefined' || writes === 0",
          context,
        ),
        true,
        "No transient global writes allowed",
      );
    } else {
      assert.equal(
        vm.runInContext("Object.hasOwn(globalThis, '_')", context),
        false,
      );
      vm.runInContext("_ = luciTranslate;", context);
      assert.equal(
        vm.runInContext("_('Memory %s').format('42%')", context),
        "Memory 42%",
      );
    }
    // The actual bundled module still exports working Lodash to the plugin.
    assert.equal(
      vm.runInContext("typeof module.exports.debounce", context),
      "function",
    );
    assert.equal(
      vm.runInContext(
        "module.exports.map([1, 2], n => n * 2).join(',')",
        context,
      ),
      "2,4",
    );
    assert.equal(
      vm.runInContext(
        "module.exports.noConflict() === module.exports",
        context,
      ),
      true,
    );
    assert.equal(vm.runInContext("_ === luciTranslate", context), true);
  }
}
console.log(
  "Bundled Lodash stays private: LuCI _().format(), host descriptors, late initialization and internal exports preserved.",
);
