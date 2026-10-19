import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import prettier from "prettier";

const require = createRequire(import.meta.url);
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(
  fs.readFileSync(path.join(root, "config", "bundle-baseline.json"), "utf8"),
);
const renameReport = {};
const challengeGuardSource = fs.readFileSync(
  path.join(root, "src/shared/challenge-page-guard.js"), "utf8",
);
const contentBundleNames = new Set([
  "reader", "video", "languageDetector", "posTagger", "romanize",
]);
function guardContentScript(source) {
  // Keep the complete runtime (including prepended helpers and markers) behind
  // the gate. A reader-only blacklist is too late to protect page APIs.
  return `(() => {\n${challengeGuardSource}\nlexihaloRunOutsideChallenge(() => {\n${source}\n});\n})();\n`;
}

const symbolIndexes = {
  background: "config/symbols/background.json",
  reader: "config/symbols/reader.json",
  video: "config/symbols/video.json",
  popup: "config/symbols/popup.json",
};
const curated = {
  background: new Set([
    "Ka",
    "Qa",
    "hi",
    "Ii",
    "Si",
    "ji",
    "Ls",
    "zs",
    "Qs",
    "nl",
    "hl",
    "Cl",
    "uu",
    "bu",
    "Da",
    "La",
    "sn",
    "Ft",
    "Ya",
    "eu",
    "rc",
    "ou",
    "au",
  ]),
  reader: new Set([
    "Co",
    "So",
    "d_",
    "__",
    "Ex",
    "Ox",
    "Dx",
    "aw",
    "uw",
    "hw",
    "mw",
    "gk",
    "wk",
    "kk",
    "hC",
    "mC",
    "EC",
    "LC",
    "RC",
    "BC",
    "MC",
    "Hy",
    "yx",
    "kv",
    "gw",
    "ww",
    "Cw",
    "Tk",
    "vk",
    "Hw",
    "lk",
    "xx",
    "OT",
    "ZT",
    "Yc",
    "wu",
    "Gd",
    "yp",
    "Qf",
    "qk",
    "Mk",
    "Ok",
    "Ik",
    "KC",
  ]),
  video: new Set([
    "Os",
    "qs",
    "P_",
    "Hf",
    "Vf",
    "V_",
    "nh",
    "hh",
    "xh",
    "Nh",
    "Dh",
    "Yh",
    "am",
    "hm",
    "gm",
    "Am",
    "Pm",
    "Mm",
    "Hm",
    "Vm",
    "Um",
    "Km",
    "Zm",
    "Jm",
    "Xm",
    "Qm",
    "rg",
    "ig",
    "ag",
    "og",
    "sC",
    "mA",
    "HA",
    "aj",
  ]),
  popup: new Set(["T", "k", "S", "w", "C"]),
};

function findPrimaryFunction(ast, name = null) {
  const candidates = [];
  traverse(ast, {
    CallExpression(callPath) {
      const callee = callPath.get("callee");
      if (
        (callee.isArrowFunctionExpression() || callee.isFunctionExpression()) &&
        callee.get("body").isBlockStatement()
      ) {
        candidates.push({
          path: callee,
          statements: callee.node.body.body.length,
          size: callee.node.end - callee.node.start,
        });
      }
    },
  });
  if (name === "popup") {
    candidates.sort((a, b) => b.size - a.size);
    return candidates[0]?.path;
  }
  candidates.sort((a, b) => b.statements - a.statements || b.size - a.size);
  return candidates[0]?.path;
}

function pascalCase(value) {
  return value.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c) =>
    c.toUpperCase(),
  );
}

function applySemanticRenames(name, ast) {
  const indexPath = symbolIndexes[name];
  if (!indexPath) return [];
  const index = JSON.parse(fs.readFileSync(path.join(root, indexPath), "utf8"));
  const appPath = findPrimaryFunction(ast, name);
  if (!appPath) return [];
  const counts = new Map();
  for (const [original, suggested] of Object.entries(
    index.highConfidenceRenames || {},
  )) {
    if (curated[name]?.has(original) || suggested?.endsWith("Action")) {
      counts.set(suggested, (counts.get(suggested) || 0) + 1);
    }
  }
  const applied = [];
  const candidates = Object.entries(index.highConfidenceRenames || {})
    .filter(
      ([original, suggested]) =>
        Boolean(suggested) &&
        t.isValidIdentifier(suggested, false) &&
        (curated[name]?.has(original) || suggested.endsWith("Action")) &&
        counts.get(suggested) === 1,
    )
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [original, suggested] of candidates) {
    const binding = appPath.scope.getBinding(original);
    if (
      !binding ||
      original === suggested ||
      appPath.scope.hasBinding(suggested)
    )
      continue;
    const line = binding.path.node.loc?.start.line || null;
    appPath.scope.rename(original, suggested);
    const currentBinding = appPath.scope.getBinding(suggested);
    if (currentBinding?.path?.isVariableDeclarator()) {
      const init = currentBinding.path.get("init");
      const className = pascalCase(suggested);
      if (init.isClassExpression() && !init.node.id && /^[A-Z]/.test(className))
        init.node.id = t.identifier(className);
      if (
        init.isNewExpression() &&
        init.get("callee").isClassExpression() &&
        !init.node.callee.id &&
        /^[A-Z]/.test(className)
      )
        init.node.callee.id = t.identifier(className);
    }
    applied.push({ original, name: suggested, line });
  }
  return applied;
}

function parseStatements(source) {
  return parser.parse(source, {
    sourceType: "script",
    allowReturnOutsideFunction: true,
  }).program.body;
}

function guardLegacyRuntimeMessages(ast, area) {
  let guarded = 0;
  traverse(ast, { CallExpression(call) {
    const receiver = call.node.callee?.object;
    if (call.node.callee?.property?.name !== "addListener" || receiver?.property?.name !== "onMessage" || receiver.object?.property?.name !== "runtime") return;
    const owner = call.findParent(parent => parent.isClass());
    const methods = owner?.node.body.body.map(method => method.key?.name) || [];
    if (!methods.includes("emit") || (!methods.includes("response") && !methods.includes("getStateChunks"))) return;
    const listener = call.node.arguments[0];
    if ((!t.isArrowFunctionExpression(listener) && !t.isFunctionExpression(listener)) || listener.async || !t.isIdentifier(listener.params[0])) throw new Error(`${area}: legacy message callback shape changed`);
    const message = listener.params[0].name;
    const original = t.isBlockStatement(listener.body) ? listener.body.body : [t.returnStatement(listener.body)];
    listener.body = t.blockStatement([
      ...parseStatements(`
        // Typed learning/media messages belong to their own listeners. Ignore
        // them BEFORE starting a Promise, or the legacy bus both throws on
        // missing 'to' and may incorrectly claim their response channel.
        if (!${message} || typeof ${message} !== "object" || Array.isArray(${message}) ||
            !Array.isArray(${message}.to) || !${message}.to.every(target => typeof target === "string") ||
            typeof ${message}.from !== "string" ||
            (typeof ${message}.name !== "string" && !(${message}.response !== undefined && typeof ${message}.uuid === "string"))) return false;
      `),
      ...original,
    ]);
    guarded++;
  } });
  if (guarded !== 1) throw new Error(`${area}: expected one legacy runtime-message guard, got ${guarded}`);
}

function installBackgroundStructuredAiBridge(ast) {
  const appPath = findPrimaryFunction(ast);
  if (!appPath) throw new Error("background: primary application scope not found");
  for (const binding of [
    "TranslationEngineExecutor",
    "ii",
    "Lo",
    "es",
    "di",
  ]) {
    if (!appPath.scope.hasBinding(binding)) {
      throw new Error(`background: structured AI dependency ${binding} not found`);
    }
  }

  traverse(ast, {
    Class(classPath) {
      const methods = classPath.node.body.body.map((m) => m.key?.name).filter(Boolean);
      if (methods.includes("response") && methods.includes("emit")) {
        classPath.traverse({
          CallExpression(callPath) {
            if (
              callPath.node.callee?.property?.name === "addListener" &&
              generate(callPath.node.callee.object).code.includes("browserApi.runtime.onMessage")
            ) {
              const listener = callPath.node.arguments[0];
              if (listener && (t.isArrowFunctionExpression(listener) || t.isFunctionExpression(listener))) {
                const body = listener.body;
                if (t.isBlockStatement(body)) {
                  // Prepend e.frameId = t.frameId; e.tabid = t.tab?.id;
                  body.body.unshift(
                    ...parseStatements(`
                      if (t) {
                        e.frameId = t.frameId;
                        if (t.tab?.id) e.tabid = t.tab.id;
                        if (e.body?.learningSource) e.body.learningSource = { ...e.body.learningSource, sourceUrl: t.url || t.tab?.url || "" };
                      }
                    `),
                  );
                }
              }
            }
          },
        });
      }
    },
  });
  let adapterSignals = 0;
  let responseRecoveries = 0;
  traverse(ast, {
    ClassMethod(methodPath) {
      if (methodPath.node.key?.name === "makeRequest") {
        methodPath.traverse({
          VariableDeclarator(declPath) {
            if (
              t.isIdentifier(declPath.node.id, { name: "v" }) &&
              t.isNumericLiteral(declPath.node.init, { value: 3e4 })
            ) {
              declPath.node.init = parser.parseExpression("12e4");
            }
          },
        });
      }
    },
    ClassDeclaration(classPath) {
      if (
        ![
          "OpenAiChatAdapter",
          "AnthropicAdapter",
          "GeminiAdapter",
        ].includes(classPath.node.id?.name)
      )
        return;
      const execute = classPath
        .get("body.body")
        .find(
          (methodPath) =>
            methodPath.isClassMethod() &&
            t.isIdentifier(methodPath.node.key, { name: "execute" }),
        );
      const requestParam = execute?.node.params?.[1];
      if (!execute || !t.isIdentifier(requestParam)) {
        throw new Error(
          `background: ${classPath.node.id.name}.execute request parameter not found`,
        );
      }
      execute.traverse({
        CallExpression(callPath) {
          if (!t.isIdentifier(callPath.node.callee, { name: "ds" })) return;
          const options = callPath.node.arguments[1];
          if (!t.isObjectExpression(options)) return;
          if (
            options.properties.some(
              (property) =>
                t.isObjectProperty(property) &&
                t.isIdentifier(property.key, { name: "signal" }),
            )
          )
            return;
          options.properties.push(
            t.objectProperty(
              t.identifier("signal"),
              t.memberExpression(
                t.identifier(requestParam.name),
                t.identifier("signal"),
              ),
            ),
          );
          adapterSignals += 1;
        },
        ConditionalExpression(condPath) {
          // Find `P = null != (s = p.endpoint.timeoutMs) ? s : 3e4` or similar
          // and allow engine.timeoutMs or engine.requestTimeoutMs or extend default timeout
          const test = condPath.node.test;
          if (
            t.isBinaryExpression(test, { operator: "!=" }) &&
            t.isNullLiteral(test.left) &&
            t.isAssignmentExpression(test.right) &&
            t.isMemberExpression(test.right.right) &&
            test.right.right.property?.name === "timeoutMs"
          ) {
            const assign = test.right;
            if (t.isNumericLiteral(condPath.node.alternate, { value: 3e4 })) {
              condPath.replaceWith(
                parser.parseExpression(`
                  (null != (${generate(assign).code}) ? ${generate(assign.left).code} : (e.engine?.timeoutMs || 12e4))
                `)
              );
            }
          }
        },
        StringLiteral(literalPath) {
          if (literalPath.node.value !== "empty response text") return;
          const returnPath = literalPath.findParent((candidate) =>
            candidate.isReturnStatement(),
          );
          const ifPath = returnPath?.findParent((candidate) =>
            candidate.isIfStatement(),
          );
          const output =
            t.isUnaryExpression(ifPath?.node.test, { operator: "!" }) &&
            t.isIdentifier(ifPath.node.test.argument)
              ? ifPath.node.test.argument
              : null;
          const binding = output
            ? literalPath.scope.getBinding(output.name)
            : null;
          const initializer = binding?.path?.node?.init;
          const payload =
            t.isCallExpression(initializer) &&
            t.isIdentifier(initializer.arguments[0])
              ? initializer.arguments[0]
              : null;
          const consequent = ifPath?.get("consequent");
          if (!payload || !consequent?.isBlockStatement()) {
            throw new Error(
              `background: ${classPath.node.id.name} response recovery shape changed`,
            );
          }
          consequent.unshiftContainer(
            "body",
            parseStatements(`
              const lexihaloRecoveredText =
                globalThis.lexihaloExtractAiResponseText?.(${payload.name});
              if (lexihaloRecoveredText) {
                return { ok: true, rawText: lexihaloRecoveredText };
              }
            `),
          );
          responseRecoveries += 1;
        },
      });
    },
  });
  if (adapterSignals !== 3) {
    throw new Error(
      `background: expected 3 adapter abort-signal patches, got ${adapterSignals}`,
    );
  }
  if (responseRecoveries !== 3) {
    throw new Error(
      `background: expected 3 response recovery patches, got ${responseRecoveries}`,
    );
  }

  traverse(ast, {
    CallExpression(callPath) {
      if (
        callPath.node.callee?.property?.name === "on" &&
        callPath.node.arguments[0]?.value === "translateWithEngine"
      ) {
        callPath.traverse({
          ObjectProperty(propPath) {
            if (propPath.node.key?.name === "engine") {
              const val = propPath.node.value;
              if (
                t.isCallExpression(val) &&
                t.isIdentifier(val.arguments[1], { name: "l" }) &&
                t.isCallExpression(val.arguments[0]) &&
                t.isIdentifier(val.arguments[0].arguments[1], { name: "o" })
              ) {
                // Swap so stored engine `l` is base and caller engine `o` overrides:
                // gu(gu({}, l), o)
                val.arguments[0].arguments[1] = t.identifier("l");
                val.arguments[1] = t.identifier("o");
              }
            }
          },
        });
      }
    },
  });

  let fetchAbortPatched = false;
  traverse(ast, {
    FunctionDeclaration(functionPath) {
      if (!t.isIdentifier(functionPath.node.id, { name: "ds" })) return;
      functionPath.traverse({
        NewExpression(newPath) {
          if (
            fetchAbortPatched ||
            !t.isIdentifier(newPath.node.callee, { name: "AbortController" })
          )
            return;
          const declaration = newPath.findParent((candidate) =>
            candidate.isVariableDeclaration(),
          );
          const innerFunction = newPath.getFunctionParent();
          const controller = newPath.parentPath.node.id;
          const optionsParam = innerFunction?.node.params?.[1];
          const options = t.isAssignmentPattern(optionsParam)
            ? optionsParam.left
            : optionsParam;
          if (
            !declaration ||
            !t.isIdentifier(controller) ||
            !t.isIdentifier(options)
          )
            throw new Error("background: fetch abort controller shape changed");
          declaration.insertAfter(
            parseStatements(`
              const externalSignal = ${options.name}.signal;
              if (externalSignal) {
                if (externalSignal.aborted) ${controller.name}.abort();
                else externalSignal.addEventListener(
                  "abort",
                  () => ${controller.name}.abort(),
                  { once: true },
                );
              }
            `),
          );
          fetchAbortPatched = true;
        },
      });
    },
  });
  if (!fetchAbortPatched)
    throw new Error("background: fetch abort propagation was not installed");

  const bridgeSource = fs.readFileSync(
    path.join(root, "src", "background", "structured-ai-bridge.js"),
    "utf8",
  );
  const bridgeModule = parser.parse(bridgeSource, {
    sourceType: "module",
    plugins: ["jsx"],
  });
  const exported = bridgeModule.program.body.find(
    (node) =>
      t.isExportNamedDeclaration(node) &&
      t.isFunctionDeclaration(node.declaration),
  );
  const factory = exported?.declaration;
  if (!factory)
    throw new Error("background: structured-ai-bridge has no recover factory export");

  appPath.get("body").pushContainer("body", t.cloneNode(factory, true));
  appPath.get("body").pushContainer(
    "body",
    parseStatements(`
      ${factory.id.name}({
        TranslationEngineExecutor: TranslationEngineExecutor,
        ii: ii,
        Lo: Lo,
        es: es,
        di: di,
      });
    `),
  );
}

function patchReaderBrandIcons(ast) {
  const brandClasses = new Set([
    "icon-trancy-brand",
    "trancy-svg-brand",
    "outline-trancy",
  ]);
  const replacements = new Map(
    [...brandClasses].map((className) => [className, 0]),
  );
  const iconUrl = parser.parseExpression(`
    globalThis.chrome?.runtime?.getURL?.("assets/icons/ic48.png") ||
    globalThis.browser?.runtime?.getURL?.("assets/icons/ic48.png") ||
    "assets/icons/ic48.png"
  `);

  traverse(ast, {
    CallExpression(callPath) {
      const [element, props] = callPath.node.arguments;
      if (!t.isStringLiteral(element, { value: "svg" }) || !t.isObjectExpression(props))
        return;
      const classProperty = props.properties.find(
        (property) =>
          t.isObjectProperty(property) &&
          !property.computed &&
          t.isIdentifier(property.key, { name: "className" }) &&
          t.isStringLiteral(property.value) &&
          brandClasses.has(property.value.value),
      );
      if (!classProperty) return;

      const originalClass = classProperty.value.value;
      callPath.node.arguments = [
        t.stringLiteral("img"),
        t.objectExpression([
          t.objectProperty(
            t.identifier("className"),
            t.stringLiteral(`${originalClass} lexihalo-brand-icon`),
          ),
          t.objectProperty(t.identifier("src"), t.cloneNode(iconUrl, true)),
          t.objectProperty(t.identifier("alt"), t.stringLiteral("LexiHalo")),
          t.objectProperty(t.identifier("width"), t.stringLiteral("20")),
          t.objectProperty(t.identifier("height"), t.stringLiteral("20")),
          t.objectProperty(t.identifier("draggable"), t.booleanLiteral(false)),
        ]),
      ];
      replacements.set(originalClass, replacements.get(originalClass) + 1);
      callPath.skip();
    },
  });

  const expected = {
    "icon-trancy-brand": 1,
    "trancy-svg-brand": 2,
    "outline-trancy": 1,
  };
  for (const [className, count] of Object.entries(expected)) {
    if (replacements.get(className) !== count) {
      throw new Error(
        `reader: expected ${count} ${className} brand icon replacement(s), got ${replacements.get(className)}`,
      );
    }
  }
}

function installUiSourceFactories(
  ast,
  {
    area,
    sourceRoot,
    manualAliases = [],
    minimumComponents = 1,
    globals = [],
  },
) {
  const appPath = findPrimaryFunction(ast, area);
  if (!appPath)
    throw new Error(`${area}: primary application scope not found`);
  const collectFiles = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory()
        ? collectFiles(absolute)
        : entry.isFile() && entry.name.endsWith(".js")
          ? [absolute]
          : [];
    });
  const files = collectFiles(sourceRoot)
    .filter((filename) =>
      fs.readFileSync(filename, "utf8").includes("export function recover"),
    )
    .sort();
  const renameCandidates = JSON.parse(
    fs.readFileSync(path.join(root, "config", "symbols", `${area}.json`), "utf8"),
  ).highConfidenceRenames;
  const reverseRenames = new Map([
    ...Object.entries(renameCandidates).map(([original, semantic]) => [
      semantic,
      original,
    ]),
    ...manualAliases,
  ]);
  const resolveBinding = (semanticName, sourceFile) => {
    if (appPath.scope.hasBinding(semanticName)) return semanticName;
    const original = reverseRenames.get(semanticName);
    if (original && appPath.scope.hasBinding(original)) return original;
    throw new Error(
      `${area}: ${sourceFile} dependency/component ${semanticName} is not available in the bundle`,
    );
  };
  const browserGlobals = new Set(globals);
  const resolveDependencyExpression = (name, sourceFile) => {
    if (browserGlobals.has(name)) {
      return t.memberExpression(t.identifier("globalThis"), t.identifier(name));
    }
    return t.identifier(resolveBinding(name, sourceFile));
  };

  const installed = [];
  for (const absoluteFilename of files) {
    const filename = path.relative(sourceRoot, absoluteFilename);
    const source = fs.readFileSync(absoluteFilename, "utf8");
    const moduleAst = parser.parse(source, {
      sourceType: "module",
      plugins: ["jsx"],
    });
    const exported = moduleAst.program.body.find(
      (node) =>
        t.isExportNamedDeclaration(node) &&
        t.isFunctionDeclaration(node.declaration),
    );
    const factory = exported?.declaration;
    if (!factory?.id || !t.isIdentifier(factory.params[0])) {
      throw new Error(`${area}: ${filename} has no recover factory export`);
    }
    const dependenciesParameter = factory.params[0].name;
    const returnStatement = factory.body.body.find((node) =>
      t.isReturnStatement(node),
    );
    const component = returnStatement?.argument;
    if (!t.isIdentifier(component)) {
      throw new Error(`${area}: ${filename} factory does not return a component`);
    }

    const dependencies = new Set();
    t.traverseFast(factory, (node) => {
      if (
        t.isMemberExpression(node) &&
        !node.computed &&
        t.isIdentifier(node.object, { name: dependenciesParameter }) &&
        t.isIdentifier(node.property)
      ) {
        dependencies.add(node.property.name);
      }
    });
    const componentBinding = resolveBinding(component.name, filename);
    const binding = appPath.scope.getBinding(componentBinding);
    if (!binding?.path?.isVariableDeclarator()) {
      throw new Error(
        `${area}: ${filename} component ${component.name} is not a replaceable variable`,
      );
    }
    const dependencyProperties = [...dependencies].sort().map((name) =>
      t.objectProperty(
        t.identifier(name),
        resolveDependencyExpression(name, filename),
      ),
    );
    const cachedComponent = t.identifier(
      `lexihalo${component.name}Source`,
    );
    const componentArgs = t.identifier("componentArgs");
    binding.path.get("init").replaceWith(
      t.callExpression(
        t.arrowFunctionExpression(
          [],
          t.blockStatement([
            t.variableDeclaration("let", [
              t.variableDeclarator(cachedComponent),
            ]),
            t.returnStatement(
              t.arrowFunctionExpression(
                [t.restElement(componentArgs)],
                t.blockStatement([
                  t.expressionStatement(
                    t.assignmentExpression(
                      "=",
                      cachedComponent,
                      t.logicalExpression(
                        "||",
                        cachedComponent,
                        t.callExpression(t.identifier(factory.id.name), [
                          t.objectExpression(dependencyProperties),
                        ]),
                      ),
                    ),
                  ),
                  t.returnStatement(
                    t.callExpression(cachedComponent, [
                      t.spreadElement(componentArgs),
                    ]),
                  ),
                ]),
              ),
            ),
          ]),
        ),
        [],
      ),
    );
    appPath.get("body").pushContainer("body", t.cloneNode(factory, true));
    installed.push(component.name);
  }

  if (
    installed.length !== files.length ||
    installed.length < minimumComponents
  ) {
    throw new Error(
      `${area}: expected every UI source to be installed (${files.length}), got ${installed.length}`,
    );
  }
  return installed;
}

function patchExtensionClientEmit(ast, area) {
  let patched = 0;
  traverse(ast, {
    StringLiteral(path) {
      if (path.node.value === "Extension context invalidated.") {
        const method = path.findParent((p) => p.isClassMethod());
        if (method && t.isIdentifier(method.node.key, { name: "emit" })) {
          method.traverse({
            IfStatement(ifPath) {
              const test = ifPath.node.test;
              // Check if test is !(chrome.runtime?.id)
              if (
                t.isUnaryExpression(test, { operator: "!" }) &&
                ifPath.node.consequent
              ) {
                // Return safe empty object with data: {} so destructuring `const { data }` never throws
                ifPath.get("consequent").replaceWith(
                  t.returnStatement(
                    t.callExpression(t.identifier("e"), [
                      t.objectExpression([
                        t.objectProperty(t.identifier("message"), t.stringLiteral("invalidated")),
                        t.objectProperty(t.identifier("data"), t.objectExpression([])),
                      ]),
                    ]),
                  ),
                );
                patched += 1;
              }
            },
            CatchClause(catchPath) {
              // When chrome.runtime.sendMessage catch or error occurs
              const paramName = catchPath.node.param?.name;
              if (paramName) {
                catchPath.get("body").unshiftContainer(
                  "body",
                  parseStatements(`
                    if (!chrome.runtime?.id) {
                      e({ message: "invalidated", data: {} });
                      return;
                    }
                  `),
                );
                patched += 1;
              }
            },
            CallExpression(callPath) {
              // Intercept the .catch on sendMessage
              if (
                t.isMemberExpression(callPath.node.callee) &&
                t.isIdentifier(callPath.node.callee.property, { name: "catch" })
              ) {
                const catchFn = callPath.node.arguments[0];
                if (catchFn && (t.isArrowFunctionExpression(catchFn) || t.isFunctionExpression(catchFn))) {
                  const body = catchFn.body;
                  if (t.isBlockStatement(body)) {
                    body.body.unshift(
                      ...parseStatements(`
                        if (!chrome.runtime?.id || (e && String(e.message || e).includes("Extension context invalidated"))) {
                          e({ message: "invalidated", data: {} });
                          return;
                        }
                      `),
                    );
                    patched += 1;
                  }
                }
              }
            },
          });
        }
      }
    },
    ClassMethod(path) {
      if (path.node.key?.name === "getToken") {
        path.traverse({
          VariableDeclarator(varPath) {
            if (
              t.isObjectPattern(varPath.node.id) &&
              varPath.node.id.properties.some((p) => p.key?.name === "data") &&
              t.isYieldExpression(varPath.node.init)
            ) {
              varPath.node.init = t.logicalExpression(
                "||",
                varPath.node.init,
                t.objectExpression([
                  t.objectProperty(t.identifier("data"), t.objectExpression([])),
                ]),
              );
            }
          },
        });
      }
      if (path.node.key?.name === "getStateChunks") {
        path.traverse({
          VariableDeclarator(varPath) {
            if (
              t.isObjectPattern(varPath.node.id) &&
              varPath.node.id.properties.some((p) => p.key?.name === "data") &&
              t.isYieldExpression(varPath.node.init)
            ) {
              // (yield this.emit(...)) || {}
              varPath.node.init = t.logicalExpression(
                "||",
                varPath.node.init,
                t.objectExpression([
                  t.objectProperty(t.identifier("data"), t.objectExpression([])),
                ]),
              );
            }
          },
        });
      }
      if (path.node.key?.name === "getState") {
        path.traverse({
          VariableDeclarator(varPath) {
            if (
              t.isObjectPattern(varPath.node.id) &&
              varPath.node.id.properties.some((p) => p.key?.name === "data") &&
              t.isYieldExpression(varPath.node.init)
            ) {
              // (yield this.emit(...)) || {}
              varPath.node.init = t.logicalExpression(
                "||",
                varPath.node.init,
                t.objectExpression([
                  t.objectProperty(t.identifier("data"), t.objectExpression([])),
                ]),
              );
            }
          },
        });
      }
      if (path.node.key?.name === "getRuntime") {
        // Wrap getRuntime to fallback to local chrome.runtime when emit returns undefined or fails
        const block = path.get("body");
        if (block?.isBlockStatement()) {
          const areaHelper = area === "video" ? "Is" : "To";
          path.node.body = parser.parse(`
            function dummy() {
              return ${areaHelper}(this, null, function* () {
                try {
                  const res = yield this.emit("runtime", ["background"]);
                  if (res && res.data && res.data.version) return res;
                } catch (_) {}
                const ver = (typeof chrome !== "undefined" && chrome.runtime?.getManifest?.()?.version) || "8.3.0";
                const sc = (typeof chrome !== "undefined" && chrome.runtime?.getURL?.("").slice(0, -1)) || "";
                const rid = (typeof chrome !== "undefined" && chrome.runtime?.id) || "";
                return { message: "ok", data: { version: ver, scheme: sc, id: rid } };
              });
            }
          `).program.body[0].body;
        }
      }
    },
  });
  return patched;
}

function patchVideoNullChildNodes(ast) {
  let patched = 0;
  traverse(ast, {
    CallExpression(callPath) {
      if (
        !t.isMemberExpression(callPath.node.callee) ||
        !t.isIdentifier(callPath.node.callee.object, { name: "Array" }) ||
        !t.isIdentifier(callPath.node.callee.property, { name: "from" }) ||
        callPath.node.arguments.length !== 1
      )
        return;
      const childNodes = callPath.node.arguments[0];
      if (
        !t.isMemberExpression(childNodes) ||
        !t.isIdentifier(childNodes.object) ||
        !t.isIdentifier(childNodes.property, { name: "childNodes" })
      )
        return;
      const owner = t.cloneNode(childNodes.object);
      const safeChildNodes = t.logicalExpression(
        "||",
        t.logicalExpression(
          "&&",
          t.cloneNode(owner),
          t.memberExpression(t.cloneNode(owner), t.identifier("childNodes")),
        ),
        t.arrayExpression([]),
      );
      t.addComment(
        safeChildNodes,
        "leading",
        " LexiHalo: tolerate detached or malformed timed-text nodes. ",
      );
      callPath.node.arguments[0] = safeChildNodes;
      patched += 1;
    },
  });
  if (patched !== 1) {
    throw new Error(
      `video: expected one nullable childNodes traversal, patched ${patched}`,
    );
  }
}

function patchMixedLanguageDetection(ast) {
  const counts = { class: 0, sync: 0, dom: 0, eval: 0 };
  traverse(ast, {
    Class(path) {
      const methods = path.node.body.body;
      const named = (name) => methods.find((method) => method.key?.name === name);
      const detect = named("detectTextsLanguage");
      const sync = named("syncCorpusSameLang");
      const dom = named("domLineSameLang");
      const evaluate = named("evalSameLanguage");
      if (!detect || !sync || !dom || !evaluate || named("lineSameLanguage")) return;
      const helper = parser.parse(`class MixedLanguageHelper {
        lineSameLanguage(text, target = this.to) {
          if (!target) return false;
          const clean = String(text || "")
            .replace(/https?:\\/\\/\\S+|www\\.\\S+/gi, " ")
            .replace(/<[^>]*>|[\\d\\s\\p{P}\\p{S}]+/gu, "")
            .trim();
          if (!clean) return true;
          const count = (expression) => (clean.match(expression) || []).length;
          const scripts = {
            han: count(/\\p{Script=Han}/gu),
            kana: count(/[\\p{Script=Hiragana}\\p{Script=Katakana}]/gu),
            hangul: count(/\\p{Script=Hangul}/gu),
            latin: count(/\\p{Script=Latin}/gu),
            cyrillic: count(/\\p{Script=Cyrillic}/gu),
            arabic: count(/\\p{Script=Arabic}/gu),
            devanagari: count(/\\p{Script=Devanagari}/gu),
            thai: count(/\\p{Script=Thai}/gu),
          };
          const total = Object.values(scripts).reduce((sum, value) => sum + value, 0);
          if (!total) return true;
          const family = (value) => {
            const code = String(value || "").toLowerCase().replace(/_/g, "-").split("-")[0];
            return ["cmn", "yue", "zho"].includes(code) ? "zh" : code;
          };
          const languageKey = (value) => {
            const code = String(value || "").toLowerCase().replace(/_/g, "-");
            if (/^(zh|cmn|yue|zho)/.test(code)) {
              return /(?:hant|tw|hk|mo)/.test(code) ? "zh-hant" : "zh-cn";
            }
            return family(code);
          };
          const targetFamily = family(target);
          const targetKey = languageKey(target);
          const detectedValue = this.detectTextsLanguage([clean]);
          const detectedFamily = family(detectedValue);
          const detectedKey = languageKey(detectedValue);
          let targetCount;
          if (targetFamily === "zh") targetCount = scripts.han;
          else if (targetFamily === "ja") targetCount = scripts.han + scripts.kana;
          else if (targetFamily === "ko") targetCount = scripts.hangul;
          else if (["ru", "uk", "bg", "mk", "be"].includes(targetFamily)) targetCount = scripts.cyrillic;
          else if (["ar", "fa", "ur"].includes(targetFamily)) targetCount = scripts.arabic;
          else if (["hi", "mr", "ne"].includes(targetFamily)) targetCount = scripts.devanagari;
          else if (targetFamily === "th") targetCount = scripts.thai;
          else targetCount = scripts.latin;
          const foreignCount = total - targetCount;
          const targetRatio = targetCount / total;
          // A dominant target script wins over a detector biased by a few CJK
          // characters. Balanced mixed text remains translatable.
          const sameDetectedLanguage = targetFamily === "zh"
            ? detectedKey === targetKey
            : detectedFamily === targetFamily;
          if (foreignCount > 0 && targetRatio >= 0.72 && (targetFamily !== "zh" || sameDetectedLanguage)) return true;
          if (!detectedFamily) return targetRatio >= 0.9;
          return sameDetectedLanguage && (foreignCount <= 2 || targetRatio >= 0.72);
        }
      }`, { sourceType: "script" }).program.body[0].body.body[0];
      const detectIndex = methods.indexOf(detect);
      methods.splice(detectIndex + 1, 0, helper);
      sync.body = t.blockStatement(parseStatements(`
        const target = this.to;
        const lines = this.lines;
        if (!target || !lines.length) return false;
        let changed = false;
        const next = lines.map((line) => {
          const checkKey = target + "|" + String(line.text || "");
          const same = line.sameLangCheckKey === checkKey
            ? line.sameLangTo === target
            : this.lineSameLanguage(line.text, target);
          if (line.sameLangCheckKey === checkKey && (same ? line.sameLangTo === target : line.sameLangTo !== target)) return line;
          changed = true;
          return { ...line, sameLangCheckKey: checkKey, sameLangTo: same ? target : undefined };
        });
        const allSame = next.every((line) => line.sameLangTo === target);
        if (changed) {
          const cache = this.captionCache.get(this.id) || {};
          const updated = { ...cache };
          if (this.endableWhisper) updated.whisperLines = next;
          else updated.builtinLines = next;
          this.captionCache.set(this.id, updated);
          this.translatingIdx = [];
          this.event.emit("changed", { current: this.current, forceUpdate: true });
        }
        return allSame;
      `));
      dom.body = t.blockStatement(parseStatements(`
        const target = this.to;
        if (!target || !e) return false;
        if (this.domEchoKeys.has(target + "|" + t)) return true;
        return this.lineSameLanguage(e, target);
      `));
      evaluate.body = t.blockStatement(parseStatements(`
        const target = this.to;
        const lines = this.lines.filter((line) => String(line.text || "").trim());
        this.setSameLanguage(Boolean(target && lines.length && lines.every((line) =>
          line.sameLangTo === target || this.lineSameLanguage(line.text, target)
        )));
      `));
      counts.class += 1;
      counts.sync += 1;
      counts.dom += 1;
      counts.eval += 1;
      path.skip();
    },
  });
  for (const [name, count] of Object.entries(counts)) {
    if (count !== 1) throw new Error(`video: mixed-language ${name} patch expected 1, got ${count}`);
  }
}

function patchChineseSubtitleVariants(ast) {
  let patched = 0;
  let lookupPatched = 0;
  traverse(ast, {
    VariableDeclarator(declaratorPath) {
      if (
        !t.isIdentifier(declaratorPath.node.id, { name: "xf" }) ||
        !t.isArrowFunctionExpression(declaratorPath.node.init)
      )
        return;
      const left = t.identifier("left");
      const right = t.identifier("right");
      const leftFamily = t.identifier("leftFamily");
      const rightFamily = t.identifier("rightFamily");
      const replacement = t.arrowFunctionExpression(
        [left, right],
        t.blockStatement([
          t.variableDeclaration("const", [
            t.variableDeclarator(
              leftFamily,
              t.callExpression(t.identifier("wf"), [left]),
            ),
            t.variableDeclarator(
              rightFamily,
              t.callExpression(t.identifier("wf"), [right]),
            ),
          ]),
          t.ifStatement(
            t.logicalExpression(
              "||",
              t.unaryExpression("!", leftFamily),
              t.binaryExpression("!==", leftFamily, rightFamily),
            ),
            t.returnStatement(t.booleanLiteral(false)),
          ),
          t.ifStatement(
            t.binaryExpression("!==", leftFamily, t.stringLiteral("zh")),
            t.returnStatement(t.booleanLiteral(true)),
          ),
          t.returnStatement(
            t.binaryExpression(
              "===",
              t.callExpression(t.identifier("Pn"), [left]),
              t.callExpression(t.identifier("Pn"), [right]),
            ),
          ),
        ]),
      );
      t.addComment(
        replacement,
        "leading",
        " LexiHalo: distinguish Simplified and Traditional Chinese subtitles. ",
      );
      declaratorPath.get("init").replaceWith(replacement);
      patched += 1;
    },
    ClassMethod(methodPath) {
      if (!t.isIdentifier(methodPath.node.key, { name: "evalLookupAllowed" }))
        return;
      methodPath.node.body = t.blockStatement(
        parseStatements(`
          const source = this.sourceLang();
          const learningFamily = wf(this.learningLang);
          this.setLookupAllowed(
            !source || !learningFamily || wf(source) === learningFamily,
          );
        `),
      );
      lookupPatched += 1;
    },
  });
  if (patched !== 1 || lookupPatched !== 1)
    throw new Error(
      `video: expected one Chinese subtitle comparison and one lookup-family guard, patched ${patched}/${lookupPatched}`,
    );
}

function patchYouTubeCaptionStartup(ast) {
  let selfFetchPatches = 0;
  let trackWaitPatches = 0;
  traverse(ast, {
    ClassMethod(methodPath) {
      if (t.isIdentifier(methodPath.node.key, { name: "downloadJSON3Caption" })) {
        methodPath.traverse({
          ObjectProperty(propertyPath) {
            if (!t.isIdentifier(propertyPath.node.key, { name: "allowSelfFetch" }))
              return;
            const enabled = t.booleanLiteral(true);
            t.addComment(
              enabled,
              "leading",
              " LexiHalo: try the signed YouTube caption URL before waiting for interception. ",
            );
            propertyPath.get("value").replaceWith(enabled);
            selfFetchPatches += 1;
          },
        });
      }
      if (t.isIdentifier(methodPath.node.key, { name: "drivePlayerTrack" })) {
        methodPath.traverse({
          BinaryExpression(binaryPath) {
            if (
              binaryPath.node.operator !== "<" ||
              !t.isNumericLiteral(binaryPath.node.right, { value: 50 })
            )
              return;
            binaryPath.node.right = t.numericLiteral(10);
            trackWaitPatches += 1;
          },
        });
      }
    },
  });
  if (selfFetchPatches !== 1 || trackWaitPatches !== 1)
    throw new Error(
      `video: expected one YouTube self-fetch and track-wait patch, got ${selfFetchPatches}/${trackWaitPatches}`,
    );
}

function patchGenericHtml5Video(ast) {
  const counts = {
    detector: 0,
    context: 0,
    registry: 0,
    resolver: 0,
    initPlayer: 0,
    container: 0,
    button: 0,
    videoChange: 0,
    textTrack: 0,
    shortTrack: 0,
    contextId: 0,
    contextVid: 0,
    cleanup: 0,
    bootstrap: 0,
  };
  let helperInstalled = false;
  const generatorCase = (source) =>
    parser.parse(`function* __generic() { switch (true) { ${source} } }`)
      .program.body[0].body.body[0].cases[0];

  traverse(ast, {
    VariableDeclarator(path) {
      if (
        t.isIdentifier(path.node.id, { name: "Zt" }) &&
        t.isArrowFunctionExpression(path.node.init)
      ) {
        path.get("init.body").unshiftContainer("body", parseStatements(
          'if (globalThis.lexihaloSites?.siteOf(location.href)) return "html5";',
        ));
        path.traverse({
          SwitchCase(casePath) {
            if (casePath.node.test !== null) return;
            casePath.traverse({
              AssignmentExpression(assignmentPath) {
                if (!t.isStringLiteral(assignmentPath.node.right, { value: "und" })) return;
                assignmentPath.node.right = t.stringLiteral("html5");
                counts.detector += 1;
              },
            });
          },
        });
        if (!helperInstalled) {
          path.parentPath.insertAfter(
            parseStatements(`
              const lexihaloPickHtml5Video = () => {
                if (globalThis.lexihaloSites?.siteOf(location.href)) {
                  return globalThis.lexihaloSiteAdapters?.pickMedia() || null;
                }
                const videos = Array.from(document.querySelectorAll("video"))
                  .filter((video) => video?.isConnected);
                if (!videos.length) {
                  if (globalThis.lexihaloSiteAdapters?.hasPlayerFrame()) {
                    globalThis.lexihaloSiteAdapters.ensureHost(null);
                    return globalThis.lexihaloSiteAdapters.pickMedia();
                  }
                  return null;
                }
                const scored = videos.map((video) => {
                  const rect = video.getBoundingClientRect();
                  const visible = rect.width >= 160 && rect.height >= 90;
                  return {
                    video,
                    visible,
                    score: (visible ? rect.width * rect.height : 0) +
                      (!video.paused && !video.ended ? 1e9 : 0) +
                      (video.currentSrc || video.src || video.querySelector("source[src]") ? 1e6 : 0),
                  };
                }).sort((left, right) => right.score - left.score);
                return scored.find((item) => item.visible)?.video || scored[0]?.video || null;
              };
              const lexihaloFindHtml5PlayerHost = (video) => {
                if (!video || video.tagName === "AUDIO") {
                  return globalThis.lexihaloSiteAdapters?.ensureHost(video);
                }
                const fullscreen = document.fullscreenElement;
                if (fullscreen?.contains(video)) return fullscreen;
                if (globalThis.lexihaloSites?.siteOf(location.href)?.id === "x") {
                  return video.closest('[data-testid="videoPlayer"]') ||
                    video.closest('[data-testid="videoComponent"]') || video.parentElement;
                }
                const videoRect = video.getBoundingClientRect();
                let candidate = video.parentElement;
                let current = video.parentElement;
                for (let depth = 0; current && depth < 7; depth += 1) {
                  if (current === document.body || current === document.documentElement) break;
                  const rect = current.getBoundingClientRect();
                  const closeWidth = rect.width >= videoRect.width * 0.9 &&
                    rect.width <= videoRect.width * 1.4;
                  const closeHeight = rect.height >= videoRect.height * 0.9 &&
                    rect.height <= videoRect.height * 1.45;
                  if (!closeWidth || !closeHeight) break;
                  candidate = current;
                  const marker = (current.id || "") + " " + (current.className || "");
                  if (/player|video.?wrapper|mgp_/i.test(marker)) candidate = current;
                  current = current.parentElement;
                }
                return candidate || video.parentElement;
              };
            `),
          );
          helperInstalled = true;
        }
        return;
      }
      if (t.isIdentifier(path.node.id, { name: "dj" })) {
        path.traverse({
          LogicalExpression(logicalPath) {
            if (
              logicalPath.node.operator !== "||" ||
              !t.isMemberExpression(logicalPath.node.left) ||
              !t.isIdentifier(logicalPath.node.left.object, { name: "captionProvider" }) ||
              !t.isIdentifier(logicalPath.node.left.property, { name: "video" }) ||
              !t.isCallExpression(logicalPath.node.right) ||
              !t.isMemberExpression(logicalPath.node.right.callee) ||
              !t.isIdentifier(logicalPath.node.right.callee.object, { name: "document" }) ||
              !t.isIdentifier(logicalPath.node.right.callee.property, { name: "querySelector" }) ||
              !t.isStringLiteral(logicalPath.node.right.arguments[0], { value: "video" })
            )
              return;
            logicalPath.node.right = t.conditionalExpression(
              t.binaryExpression(
                "===",
                t.memberExpression(t.identifier("captionProvider"), t.identifier("platform")),
                t.stringLiteral("html5"),
              ),
              t.callExpression(t.identifier("lexihaloPickHtml5Video"), []),
              t.cloneNode(logicalPath.node.right, true),
            );
            counts.textTrack += 1;
            logicalPath.skip();
          },
        });
        return;
      }
      if (!t.isIdentifier(path.node.id, { name: "resolvePlatformPlayer" })) return;
      path.traverse({
        SwitchStatement(switchPath) {
          const index = switchPath.node.cases.findIndex((item) => item.test === null);
          if (index < 0 || switchPath.node.cases.some((item) => item.test?.value === "html5")) return;
          switchPath.node.cases.splice(
            index,
            0,
            generatorCase(`
              case "html5": {
                let video = lexihaloPickHtml5Video();
                if (!video && globalThis.lexihaloSites?.page(location.href)) {
                  globalThis.lexihaloSiteAdapters.ensureHost(null);
                  video = lexihaloPickHtml5Video();
                }
                if (!video) { yield yn("video"); video = lexihaloPickHtml5Video(); }
                if (!video) return;
                return new StandardHtml5Player(video, new Audio(video.currentSrc || video.src || ""));
              }
            `),
          );
          counts.resolver += 1;
          switchPath.skip();
        },
      });
    },
    AssignmentExpression(path) {
      if (
        t.isMemberExpression(path.node.left) &&
        t.isThisExpression(path.node.left.object) &&
        t.isIdentifier(path.node.left.property, { name: "platform" }) &&
        t.isStringLiteral(path.node.right, { value: "example" })
      ) {
        path.node.right = t.stringLiteral("html5");
        counts.context += 1;
      }
    },
    ObjectExpression(path) {
      if (
        !path.parentPath.isVariableDeclarator() ||
        !t.isIdentifier(path.parentPath.node.id, { name: "_f" })
      )
        return;
      path.node.properties.push(
        t.objectProperty(
          t.identifier("html5"),
          t.objectExpression([
            t.objectProperty(t.identifier("strategy"), t.stringLiteral("texttrack")),
            t.objectProperty(t.identifier("autoSubtitle"), t.booleanLiteral(true)),
          ]),
        ),
      );
      counts.registry += 1;
    },
    ClassMethod(path) {
      if (path.node.kind === "get" && ["id", "vid"].includes(path.node.key?.name) &&
          path.parentPath.node.body.some(method => method.key?.name === "addYoutubeListener")) {
        path.get("body").unshiftContainer("body", parseStatements(`
          const mediaItem = globalThis.lexihaloSiteAdapters?.currentItem?.() || globalThis.lexihaloSites?.page(location.href);
          if (this.platform === "html5" && mediaItem) return mediaItem.identity;
        `));
        counts[path.node.key.name === "id" ? "contextId" : "contextVid"] += 1;
      }
      if (t.isIdentifier(path.node.key, { name: "initPlayer" })) {
        path.traverse({
          SwitchStatement(switchPath) {
            if (
              !t.isMemberExpression(switchPath.node.discriminant) ||
              !t.isThisExpression(switchPath.node.discriminant.object) ||
              !t.isIdentifier(switchPath.node.discriminant.property, { name: "platform" })
            )
              return;
            const index = switchPath.node.cases.findIndex((item) => item.test === null);
            switchPath.node.cases.splice(
              index,
              0,
              generatorCase(`
                case "html5": {
                  let video = lexihaloPickHtml5Video();
                  if (!video && globalThis.lexihaloSites?.page(location.href)) {
                    globalThis.lexihaloSiteAdapters.ensureHost(null);
                    video = lexihaloPickHtml5Video();
                  }
                  if (!video) { yield yn("video"); video = lexihaloPickHtml5Video(); }
                  this.video = video;
                  break;
                }
              `),
            );
            counts.initPlayer += 1;
            switchPath.skip();
          },
        });
      }
      if (t.isIdentifier(path.node.key, { name: "queryContainerElement" })) {
        path.traverse({
          SwitchStatement(switchPath) {
            if (
              !t.isMemberExpression(switchPath.node.discriminant) ||
              !t.isThisExpression(switchPath.node.discriminant.object) ||
              !t.isIdentifier(switchPath.node.discriminant.property, { name: "platform" })
            )
              return;
            const index = switchPath.node.cases.findIndex((item) => item.test === null);
            switchPath.node.cases.splice(
              index,
              0,
              generatorCase(`
                case "html5": {
                  let video = lexihaloPickHtml5Video();
                  if (!video && globalThis.lexihaloSites?.page(location.href)) {
                    globalThis.lexihaloSiteAdapters.ensureHost(null);
                    video = lexihaloPickHtml5Video();
                  }
                  if (!video) { yield yn("video"); video = lexihaloPickHtml5Video(); }
                  if (!video) return {};
                  const element = video.tagName === "AUDIO"
                    ? globalThis.lexihaloSiteAdapters.ensureCaptionHost(video)
                    : video.parentElement || document.documentElement;
                  element.classList.add("lexihalo-html5-container");
                  return { element, video };
                }
              `),
            );
            counts.container += 1;
            switchPath.skip();
          },
        });
      }
      if (t.isIdentifier(path.node.key, { name: "appendStreamingLines" })) {
        path.traverse({
          BinaryExpression(binaryPath) {
            if (
              binaryPath.node.operator !== "<" ||
              !t.isMemberExpression(binaryPath.node.right) ||
              !t.isThisExpression(binaryPath.node.right.object) ||
              !t.isIdentifier(binaryPath.node.right.property, { name: "MIN_LANG_CUES" })
            )
              return;
            const original = t.cloneNode(binaryPath.node, true);
            binaryPath.replaceWith(
              t.logicalExpression(
                "&&",
                t.binaryExpression(
                  "!==",
                  t.memberExpression(t.thisExpression(), t.identifier("platform")),
                  t.stringLiteral("html5"),
                ),
                original,
              ),
            );
            counts.shortTrack += 1;
            binaryPath.skip();
          },
        });
      }
      if (t.isIdentifier(path.node.key, { name: "checkVideoChange" })) {
        path.node.body = t.blockStatement(
          parseStatements(`
            const video = captionProvider.platform === "html5"
              ? lexihaloPickHtml5Video()
              : document.querySelector("video");
            const item = globalThis.lexihaloSiteAdapters?.currentItem?.();
            const itemId = item?.id === "bandcamp" ? item.identity : null;
            const itemChanged = Boolean(itemId && this.lastHtml5ItemIdentity && itemId !== this.lastHtml5ItemIdentity);
            if (video && (video !== this.lastVideoEl || itemChanged)) {
              if (video !== this.lastVideoEl && captionProvider.platform === "html5" && this.lastVideoEl) {
                this.unmountButton();
                document.querySelector("#xt-toggle-button")?.remove();
                this.lastVideoEl.parentElement?.classList.remove("lexihalo-html5-container");
              }
              if (captionProvider.platform === "html5") captionProvider.video = video;
              this.lastVideoEl = video;
              this.lastHtml5ItemIdentity = itemId;
              if (itemChanged) captionProvider.event.emit("video.change");
              Ht("[video.element.changed] re-render caption");
              this.renderCaption();
              this.ensureQuickButtonInjected();
            }
          `),
        );
        counts.videoChange += 1;
      }
      if (
        t.isIdentifier(path.node.key, { name: "destroy" }) &&
        path.parentPath.node.body.some(
          (method) => method.key?.name === "addQuickButton",
        )
      ) {
        path.get("body").unshiftContainer(
          "body",
          parseStatements(`
            if (this.html5ButtonPositionTimer) {
              window.clearInterval(this.html5ButtonPositionTimer);
              this.html5ButtonPositionTimer = null;
            }
            if (this.html5FullscreenHandler) {
              document.removeEventListener("fullscreenchange", this.html5FullscreenHandler);
              this.html5FullscreenHandler = null;
            }
          `),
        );
        counts.cleanup += 1;
      }
      if (t.isIdentifier(path.node.key, { name: "addQuickButton" })) {
        path.traverse({
          SwitchStatement(switchPath) {
            switchPath.node.cases.push(
              generatorCase(`
                case "html5" === captionProvider.platform: {
                  let video = lexihaloPickHtml5Video();
                  if (!video && globalThis.lexihaloSites?.page(location.href)) {
                    globalThis.lexihaloSiteAdapters.ensureHost(null);
                    video = lexihaloPickHtml5Video();
                  }
                  const element = video?.tagName === "AUDIO"
                    ? globalThis.lexihaloSiteAdapters.ensureHost(video) : video?.parentElement;
                  if (video) captionProvider.video = video;
                  if (element) element.classList.add("lexihalo-html5-container");
                  const isPornhub = /(^|\\.)pornhub\\.com$/i.test(location.hostname);
                  const pornhubControls = isPornhub
                    ? document.querySelector(
                        "#mgp .mgp_controlBar .mgp_front, .mgp_container .mgp_controlBar .mgp_front, #mgp .mgp_controlsBar, #mgp .mgp_controlsContainer",
                      )
                    : null;
                  if (video && pornhubControls) {
                    const anchor = pornhubControls.querySelector(
                      ".mgp_fullscreen, .mgp_fullScreen, [class*='fullscreen' i]",
                    );
                    this.insertButton({
                      el: anchor || pornhubControls,
                      platform: platformContext.platform,
                      classNames: "trancy-pornhub-control",
                      insertType: anchor ? "before" : "append",
                    });
                    const button = document.querySelector("#xt-toggle-button.trancy-html5-button");
                    if (button) {
                      button.classList.remove("trancy-floating");
                      button.classList.add("trancy-pornhub-control");
                      if (anchor && button.nextElementSibling !== anchor) {
                        pornhubControls.insertBefore(button, anchor);
                      } else if (!anchor && button.parentElement !== pornhubControls) {
                        pornhubControls.appendChild(button);
                      }
                      button.removeAttribute("style");
                    }
                    if (this.html5ButtonPositionTimer) {
                      window.clearInterval(this.html5ButtonPositionTimer);
                      this.html5ButtonPositionTimer = null;
                    }
                    if (this.html5FullscreenHandler) {
                      document.removeEventListener(
                        "fullscreenchange",
                        this.html5FullscreenHandler,
                      );
                      this.html5FullscreenHandler = null;
                    }
                    this.html5ButtonPosition = null;
                    break;
                  }
                  if (video) {
                    const playerHost = lexihaloFindHtml5PlayerHost(video);
                    playerHost?.classList.add("lexihalo-html5-button-host");
                    if (playerHost && getComputedStyle(playerHost).position === "static") {
                      playerHost.classList.add("lexihalo-html5-position-static");
                    }
                    this.insertButton({
                      el: playerHost,
                      platform: platformContext.platform,
                      classNames: "trancy-floating",
                      insertType: "append",
                    });
                    this.html5ButtonPosition = () => {
                      const activeVideo = lexihaloPickHtml5Video();
                      const button = document.querySelector("#xt-toggle-button.trancy-html5-button");
                      if (!button) return;
                      if (!activeVideo) { button.style.display = "none"; return; }
                      const host = lexihaloFindHtml5PlayerHost(activeVideo);
                      if (!host) return;
                      host.classList.add("lexihalo-html5-button-host");
                      if (getComputedStyle(host).position === "static") {
                        host.classList.add("lexihalo-html5-position-static");
                      }
                      if (button.parentElement !== host) host.appendChild(button);
                      const rect = activeVideo.tagName === "AUDIO" ? host.getBoundingClientRect() : activeVideo.getBoundingClientRect();
                      const hostRect = host.getBoundingClientRect();
                      const size = 34;
                      const toolAnchor = activeVideo.hasAttribute?.("data-lexihalo-tool-anchor");
                      const floatingAudio = activeVideo.tagName === "AUDIO" && host.classList.contains("lexihalo-audio-tool-host");
                      const visible = toolAnchor || floatingAudio || (rect.width >= 160 &&
                        (rect.height >= 90 || activeVideo.tagName === "AUDIO") &&
                        rect.bottom > 0 && rect.right > 0 &&
                        rect.top < window.innerHeight && rect.left < window.innerWidth);
                      button.style.display = visible ? "flex" : "none";
                      button.style.position = "absolute";
                      button.style.top = Math.max(8, rect.top - hostRect.top + 12) + "px";
                      button.style.left = Math.max(8, Math.min(hostRect.width - size - 8, rect.right - hostRect.left - size - 12)) + "px";
                      button.style.right = "auto";
                      button.style.bottom = "auto";
                    };
                    this.html5ButtonPosition();
                    if (!this.html5ButtonPositionTimer) {
                      this.html5ButtonPositionTimer = window.setInterval(
                        () => this.html5ButtonPosition?.(),
                        250,
                      );
                    }
                    if (!this.html5FullscreenHandler) {
                      this.html5FullscreenHandler = () =>
                        window.requestAnimationFrame(() => this.html5ButtonPosition?.());
                      document.addEventListener("fullscreenchange", this.html5FullscreenHandler);
                    }
                  }
                  break;
                }
              `),
            );
            counts.button += 1;
            switchPath.skip();
          },
        });
      }
    },
  });

  traverse(ast, {
    ExpressionStatement(path) {
      const expression = path.node.expression;
      if (!t.isLogicalExpression(expression)) return;
      let runtime = null;
      path.traverse({
        NewExpression(newPath) {
          if (!t.isClassExpression(newPath.node.callee)) return;
          const methods = newPath.node.callee.body.body.map((item) => item.key?.name);
          if (methods.includes("bootstrap") && methods.includes("addQuickButton")) {
            runtime = t.cloneNode(newPath.node, true);
            newPath.stop();
          }
        },
      });
      if (!runtime) return;
      const guard = t.isLogicalExpression(expression.left)
        ? t.cloneNode(expression.left, true)
        : t.booleanLiteral(false);
      const boot = t.identifier("bootLexihaloVideoRuntime");
      const observer = t.identifier("lexihaloHtml5VideoObserver");
      path.replaceWith(
        t.ifStatement(
          t.unaryExpression("!", t.parenthesizedExpression(guard)),
          t.blockStatement([
            t.variableDeclaration("const", [
              t.variableDeclarator(
                boot,
                t.arrowFunctionExpression([], t.blockStatement([t.expressionStatement(runtime)])),
              ),
            ]),
            t.ifStatement(
              t.logicalExpression(
                "||",
                t.binaryExpression("!==", t.callExpression(t.identifier("Zt"), []), t.stringLiteral("html5")),
                parser.parseExpression('globalThis.lexihaloSiteAdapters?.ownsRuntime() !== false && (document.querySelector("video") || globalThis.lexihaloSites?.page(location.href) || globalThis.lexihaloSiteAdapters?.hasPlayerFrame())'),
              ),
              t.expressionStatement(t.callExpression(boot, [])),
              t.blockStatement([
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    observer,
                    t.newExpression(t.identifier("MutationObserver"), [
                      t.arrowFunctionExpression([], t.blockStatement([
                        t.ifStatement(
                          t.unaryExpression("!", parser.parseExpression('globalThis.lexihaloSiteAdapters?.ownsRuntime() !== false && (document.querySelector("video") || globalThis.lexihaloSites?.page(location.href) || globalThis.lexihaloSiteAdapters?.hasPlayerFrame())')),
                          t.returnStatement(),
                        ),
                        t.expressionStatement(t.callExpression(t.memberExpression(observer, t.identifier("disconnect")), [])),
                        t.expressionStatement(t.callExpression(boot, [])),
                      ])),
                    ]),
                  ),
                ]),
                t.expressionStatement(
                  t.callExpression(t.memberExpression(observer, t.identifier("observe")), [
                    t.memberExpression(t.identifier("document"), t.identifier("documentElement")),
                    t.objectExpression([
                      t.objectProperty(t.identifier("childList"), t.booleanLiteral(true)),
                      t.objectProperty(t.identifier("subtree"), t.booleanLiteral(true)),
                    ]),
                  ]),
                ),
              ]),
            ),
          ]),
        ),
      );
      counts.bootstrap += 1;
      path.skip();
    },
  });

  for (const [name, count] of Object.entries(counts)) {
    if (count !== 1)
      throw new Error(`video: generic HTML5 ${name} expected 1 patch, got ${count}`);
  }
}

function patchVideoAiRequests(ast) {
  let requestMetadataPatches = 0;
  let originalTextPatches = 0;
  let playerStateGuards = 0;
  let streamBucketPatches = 0;
  traverse(ast, {
    ClassMethod(methodPath) {
      if (t.isIdentifier(methodPath.node.key, { name: "renderActiveBucket" })) {
        methodPath.traverse({
          BinaryExpression(binPath) {
            if (
              binPath.node.operator === "===" &&
              t.isMemberExpression(binPath.node.left) &&
              t.isIdentifier(binPath.node.left.property, { name: "text" }) &&
              t.isMemberExpression(binPath.node.right) &&
              t.isIdentifier(binPath.node.right.property, { name: "text" })
            ) {
              const sObj = binPath.node.left.object;
              binPath.replaceWith(
                t.logicalExpression(
                  "||",
                  binPath.node,
                  t.logicalExpression(
                    "||",
                    t.binaryExpression(
                      "===",
                      t.memberExpression(sObj, t.identifier("originalText")),
                      binPath.node.right,
                    ),
                    t.unaryExpression(
                      "!",
                      t.unaryExpression(
                        "!",
                        t.memberExpression(sObj, t.identifier("AITranslation")),
                      ),
                    ),
                  ),
                ),
              );
              streamBucketPatches += 1;
              binPath.skip();
            }
          },
        });
      }
    },
  });
  traverse(ast, {
    ClassMethod(methodPath) {
      if (!t.isIdentifier(methodPath.node.key, { name: "dispatchTranslate" }))
        return;
      methodPath.traverse({
        CallExpression(callPath) {
          const callee = callPath.node.callee;
          if (
            !t.isMemberExpression(callee) ||
            !t.isIdentifier(callee.property, { name: "translateWithEngine" })
          )
            return;
          const request = callPath.node.arguments[0];
          if (!t.isObjectExpression(request)) return;
          request.properties.push(
            t.objectProperty(
              t.identifier("requestGroup"),
              t.memberExpression(t.thisExpression(), t.identifier("id")),
            ),
            t.objectProperty(t.identifier("learningSource"), parser.parseExpression("(globalThis.chengVideoBridge?.sourceHint?.() || { platform: this.platform, sourceId: String(window.metacontext?.vid || this.id || ''), sourceUrl: location.href })")),
            t.objectProperty(
              t.identifier("requestGeneration"),
              t.logicalExpression(
                "||",
                t.memberExpression(
                  t.thisExpression(),
                  t.identifier("translationGeneration"),
                ),
                t.numericLiteral(0),
              ),
            ),
          );
          requestMetadataPatches += 1;
        },
        ObjectExpression(objectPath) {
          const properties = objectPath.node.properties;
          const textProperty = properties.find(
            (property) =>
              t.isObjectProperty(property) &&
              t.isIdentifier(property.key, { name: "text" }),
          );
          if (
            !textProperty ||
            !properties.some(
              (property) =>
                t.isObjectProperty(property) &&
                t.isIdentifier(property.key, { name: "AITranslation" }),
            )
          )
            return;
          const fallback = textProperty.value;
          const lineText =
            t.isLogicalExpression(fallback) &&
            t.isMemberExpression(fallback.right) &&
            t.isIdentifier(fallback.right.property, { name: "text" })
              ? fallback.right
              : null;
          if (!lineText || !t.isIdentifier(lineText.object)) return;
          const line = lineText.object.name;
          properties.push(
            t.objectProperty(
              t.identifier("originalText"),
              t.logicalExpression(
                "||",
                t.memberExpression(
                  t.identifier(line),
                  t.identifier("originalText"),
                ),
                t.memberExpression(t.identifier(line), t.identifier("text")),
              ),
            ),
            t.objectProperty(
              t.identifier("translationGeneration"),
              t.logicalExpression(
                "||",
                t.memberExpression(
                  t.thisExpression(),
                  t.identifier("translationGeneration"),
                ),
                t.numericLiteral(0),
              ),
            ),
          );
          originalTextPatches += 1;
        },
      });
    },
  });
  traverse(ast, {
    TryStatement(path) {
      const block = path.get("block");
      const statements = block.node.body;
      const findEngineStmt = statements.find((s) => {
        const code = generate(s).code;
        return code.includes('only: ["translatorService"]') && code.includes("byok-");
      });
      if (findEngineStmt) {
        const index = statements.indexOf(findEngineStmt);
        const engineFunction = parser.parse(`
          function* dummy() {
            const { translatorService: r } = yield qs.getStateChunks({
              only: ["translatorService"],
            });
            const isAiEngine = (e) =>
              Boolean(e) &&
              ("user" === e.type ||
                String(e._id || "").startsWith("byok-") ||
                "built-in" !== e.type);
            const preferredEngine =
              [r?.sentence, r?.subtitle, r?.fulltext].find(
                (e) => isAiEngine(e) && r.engines?.some((x) => x._id === e._id),
              ) ||
              r.engines?.find(isAiEngine);
            const i =
              preferredEngine &&
              (r.engines?.find((e) => e._id === preferredEngine._id) || preferredEngine);
          }
        `, { sourceType: "module" });
        const engineNodes = engineFunction.program.body[0].body.body;
        block.node.body.splice(index, 1, ...engineNodes);
      }
      const parseStmt = statements.find((s) => {
        const code = generate(s).code;
        return code.includes("JSON.parse(c)") && code.includes("AI 返回格式无效");
      });
      if (parseStmt) {
        // Replace parsing logic with resilient json parsing and fallback
        const index = statements.indexOf(parseStmt);
        const setStmt = statements[index + 1]; // F(p)
        const setIdentifier =
          t.isExpressionStatement(setStmt) &&
          t.isCallExpression(setStmt.expression) &&
          t.isIdentifier(setStmt.expression.callee)
            ? setStmt.expression.callee.name
            : "F";
        const newNodes = parseStatements(`
          let p = null;
          if (u >= 0 && d > u) {
            try {
              p = JSON.parse(c.slice(u, d + 1));
            } catch (_) {}
          }
          if (!p) {
            try {
              p = JSON.parse(c);
            } catch (_) {}
          }
          if (!p || !Array.isArray(p.senses) || p.senses.length === 0) {
            const plain = c.replace(/[{}\\[\\]"]/g, "").trim();
            p = {
              syllables: [],
              pronunciations: [],
              senses: [
                {
                  pos: "",
                  definition: [
                    {
                      translations: [plain || l],
                      targetTranslation: "",
                      examples: [],
                    },
                  ],
                },
              ],
              inflections: [],
              etymology: "",
              examples: [],
              phrases: [],
              synonyms: [],
              relatedWords: [],
            };
          }
          ${setIdentifier}(p);
        `);
        block.node.body.splice(index, 2, ...newNodes);
      }
    },
  });
  traverse(ast, {
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      if (
        !t.isMemberExpression(callee) ||
        !t.isIdentifier(callee.property, { name: "addCase" }) ||
        !t.isIdentifier(callPath.node.arguments[0], {
          name: "setPlayerLinesAction",
        })
      )
        return;
      const reducer = callPath.get("arguments.1");
      const state = reducer.node?.params?.[0];
      const body = reducer.get("body");
      if (
        !reducer.isArrowFunctionExpression() ||
        !t.isIdentifier(state) ||
        !body.isBlockStatement()
      )
        throw new Error("video: setPlayerLines reducer shape changed");
      body.unshiftContainer(
        "body",
        parseStatements(`
          ${state.name}.player = ${state.name}.player || { lines: [] };
        `),
      );
      playerStateGuards += 1;
    },
  });
  if (playerStateGuards !== 1)
    throw new Error(
      `video: expected one player state guard, got ${playerStateGuards}`,
    );
  if (requestMetadataPatches !== 1)
    throw new Error(
      `video: expected one AI request metadata patch, got ${requestMetadataPatches}`,
    );
  if (originalTextPatches < 1)
    throw new Error("video: repaired subtitle originalText was not preserved");
}

const marker = (name) =>
  `\n;(() => {\n  globalThis.__lexihaloReadable${name} = true;\n  if (typeof document !== "undefined" && document.documentElement) document.documentElement.setAttribute("data-lexihalo-${name.toLowerCase()}-runtime", "readable");\n})();\n`;
const getPlatformCatalog = () => JSON.parse(
  fs.readFileSync(path.join(root, "config/media-platforms.json"), "utf8"),
);
const getBrowserSiteCatalog = () => getPlatformCatalog().filter(entry => entry.mode === "browser");
const getMediaSitePolicySource = () =>
  fs.readFileSync(path.join(root, "src/shared/media-sites.js"), "utf8").replace(
    "const CATALOG = [];",
    `const CATALOG = ${JSON.stringify(getBrowserSiteCatalog())};`,
  );
const getPlatformCapabilitySource = () =>
  fs.readFileSync(path.join(root, "src/shared/platform-capabilities.js"), "utf8").replace(
    "const PLATFORM_CATALOG = [];",
    `const PLATFORM_CATALOG = ${JSON.stringify(getPlatformCatalog())};`,
  );

const getCaptionSchedulerSource = () =>
  "\n" +
  fs.readFileSync(path.join(root, "src/video/media-task-registry.js"), "utf8") +
  "\n" +
  fs.readFileSync(path.join(root, "src/video/audio-source.js"), "utf8") +
  "\n" +
  fs.readFileSync(path.join(root, "src/video/media-workflow.js"), "utf8") +
  "\n" +
  fs.readFileSync(path.join(root, "src/video/browser-audio.js"), "utf8") +
  "\n" +
  fs.readFileSync(path.join(root, "src/video/caption-scheduler.js"), "utf8");
;

async function formatJs(source) {
  return prettier.format(source, {
    parser: "babel",
    printWidth: 100,
    semi: true,
    singleQuote: false,
  });
}

function patchSchemesDefault(ast, area) {
  const defaultSchemesAst = parser.parseExpression(`
    [
      {
        name: "Oxford",
        scheme: "https://www.oxfordlearnersdictionaries.com/definition/english/$TEXT",
        from: ["*"],
        to: ["*"],
        codes: { en: "english" },
        options: { width: 450, height: 750, type: "popup" }
      },
      {
        name: "Collins",
        scheme: "https://www.collinsdictionary.com/dictionary/english/$TEXT",
        from: ["*"],
        to: ["*"],
        codes: { en: "english" },
        options: { width: 450, height: 750, type: "popup" }
      },
      {
        name: "Longman",
        scheme: "https://www.ldoceonline.com/dictionary/$TEXT",
        from: ["*"],
        to: ["*"],
        codes: { en: "english" },
        options: { width: 450, height: 750, type: "popup" }
      },
      {
        name: "Youdao",
        scheme: "https://dict.youdao.com/w/$TEXT",
        from: ["*"],
        to: ["*"],
        codes: {},
        options: { width: 450, height: 750, type: "popup" }
      }
    ]
  `);

  traverse(ast, {
    ObjectProperty(path) {
      if (
        path.node.key?.name === "schemes" &&
        t.isArrayExpression(path.node.value) &&
        path.node.value.elements.length === 0 &&
        path.parentPath.isObjectExpression()
      ) {
        const propNames = path.parentPath.node.properties.map((p) => p.key?.name);
        if (propNames.includes("partOfSpeech") && propNames.includes("PRACTICE_LIMIT")) {
          path.node.value = t.cloneNode(defaultSchemesAst);
        }
      }
    },
  });

  if (area === "video") {
    traverse(ast, {
      MemberExpression(path) {
        if (
          path.node.property?.name === "schemes" &&
          path.node.object?.name === "f" &&
          path.parentPath.isMemberExpression() &&
          path.parentPath.node.property?.name === "map"
        ) {
          // Replace f.schemes with (f.schemes && f.schemes.length > 0 ? f.schemes : defaultSchemes)
          path.replaceWith(
            t.conditionalExpression(
              t.logicalExpression(
                "&&",
                t.memberExpression(t.identifier("f"), t.identifier("schemes")),
                t.binaryExpression(
                  ">",
                  t.memberExpression(
                    t.memberExpression(t.identifier("f"), t.identifier("schemes")),
                    t.identifier("length"),
                  ),
                  t.numericLiteral(0),
                ),
              ),
              t.memberExpression(t.identifier("f"), t.identifier("schemes")),
              t.cloneNode(defaultSchemesAst),
            ),
          );
        }
      },
    });
  }
}

function patchStandalonePlatformLinks(ast, area) {
  let patched = 0;
  traverse(ast, {
    VariableDeclarator(declaration) {
      if (!t.isIdentifier(declaration.node.id, { name: "__trancyStandaloneLinkGuard" })) return;
      const guard = declaration.get("init");
      if (!guard.isArrowFunctionExpression() || !guard.get("body").isBlockStatement()) return;
      const eventName = guard.node.params[0].name;
      // Both MAIN video and ISOLATED reader guards see the same click. Exempt
      // only catalogued platform cards with their exact configured homepage.
      guard.get("body").unshiftContainer("body", parseStatements(`
        const platformLink = ${eventName}.composedPath?.().find(node => node?.tagName === "A");
        if (platformLink?.matches(".support-platform .support-platform-item[data-platform-id]") &&
            globalThis.lexihaloPlatformCapabilities?.catalog.some(platform =>
              platform.id === platformLink.getAttribute("data-platform-id") &&
              platform.homepage === platformLink.href)) return;
      `));
      patched += 1;
    },
  });
  if (patched !== 1) throw new Error(`${area}: expected one standalone link guard, got ${patched}`);
}

function patchControlCenterAppearance(ast, area) {
  let defaults = 0;
  let reducers = 0;
  traverse(ast, {
    ObjectProperty(propertyPath) {
      if (propertyPath.node.key?.name !== "conrolCenter" ||
          !t.isObjectExpression(propertyPath.node.value)) return;
      const properties = propertyPath.node.value.properties;
      const opacity = properties.find((property) => property.key?.name === "opacity");
      if (!opacity || !t.isNumericLiteral(opacity.value, { value: 100 })) return;
      opacity.value = t.numericLiteral(25);
      properties.push(t.objectProperty(t.identifier("opacityVersion"), t.numericLiteral(1)));
      defaults += 1;
    },
    AssignmentExpression(assignmentPath) {
      const { left } = assignmentPath.node;
      if (!t.isMemberExpression(left) || left.property?.name !== "opacity" ||
          !t.isMemberExpression(left.object) || left.object.property?.name !== "conrolCenter") return;
      const statement = assignmentPath.parentPath;
      if (!statement.isExpressionStatement())
        throw new Error(`${area}: control-center opacity reducer shape changed`);
      statement.insertAfter(t.expressionStatement(t.assignmentExpression(
        "=",
        t.memberExpression(t.cloneNode(left.object, true), t.identifier("opacityVersion")),
        t.numericLiteral(1),
      )));
      reducers += 1;
    },
  });
  if (defaults !== 1 || reducers !== 1)
    throw new Error(`${area}: expected one control-center default/reducer, got ${defaults}/${reducers}`);
  if (area === "background") {
    const appPath = findPrimaryFunction(ast);
    for (const binding of ["getHydratedState", "store", "setControlCenterOpacityAction"]) {
      if (!appPath?.scope.hasBinding(binding))
        throw new Error(`background: opacity migration dependency ${binding} missing`);
    }
    appPath.get("body").pushContainer("body", parseStatements(`
      // Adopt the quiet default once for old profiles. Preserve non-default
      // custom values; later manual choices (including 100%) are versioned.
      getHydratedState().then((state) => {
        const center = state.setting?.conrolCenter;
        if (!center || center.opacityVersion >= 1) return;
        store.dispatch(setControlCenterOpacityAction(
          center.opacity == null || center.opacity === 100 ? 25 : center.opacity,
        ));
      });
    `));
  }
}

function patchControlCenterVisibility(ast) {
  let languageGate = 0, videoGate = 0, preferences = 0;
  traverse(ast, {
    ClassMethod(method) {
      if (method.node.key?.name !== "renderControlCenter") return;
      method.traverse({ IfStatement(statement) {
        if (generate(statement.node).code.includes('"control center is disabled in video"')) {
          statement.remove(); videoGate++; return;
        }
        let stateName;
        t.traverseFast(statement.node.test, node => {
          if (!t.isCallExpression(node) || node.callee?.property?.name !== "includes") return;
          const list = node.callee.object;
          if (list?.property?.name === "blackList" && list.object?.property?.name === "conrolCenter" && list.object.object?.property?.name === "setting" && t.isIdentifier(list.object.object.object)) stateName = list.object.object.object.name;
        });
        if (!stateName) return;
        statement.node.test = parser.parseExpression(`(${stateName}.setting.conrolCenter.enable === false || (Array.isArray(${stateName}.setting.conrolCenter.blackList) && ${stateName}.setting.conrolCenter.blackList.includes(window.location.host)))`);
        preferences++;
      } });
    },
    LogicalExpression(expression) {
      const node = expression.node;
      if (node.operator !== "&&" || !t.isCallExpression(node.right) || node.right.callee?.object?.name !== "controlCenter" || node.right.callee?.property?.name !== "renderControlCenter") return;
      const left = node.left;
      if (!t.isLogicalExpression(left, { operator: "&&" }) || !t.isUnaryExpression(left.right, { operator: "!" })) return;
      const check = left.right.argument;
      if (!t.isCallExpression(check) || check.callee?.property?.name !== "includes" || !t.isArrayExpression(check.callee.object) || !check.arguments.some(argument => t.isStringLiteral(argument, { value: "und" }))) return;
      // This is a settings/translation entry point, not an active translation.
      // Language onboarding and video-page detection must not remove the dock.
      node.left = left.left; languageGate++;
    },
  });
  if (languageGate !== 1 || videoGate !== 1 || preferences !== 1) throw new Error(`reader: control-center visibility hooks changed (${languageGate}/${videoGate}/${preferences})`);
}

function patchPartialStateTasks(ast, area) {
  let patched = 0;
  traverse(ast, { ObjectProperty(property) {
    if (!t.isIdentifier(property.node.key, { name: "preloadedState" }) || !t.isIdentifier(property.node.value)) return;
    const value = property.node.value.name;
    // A root reducer does not merge default fields into a partial preloaded
    // state. Control-center hydration can omit tasks, then video menus crash.
    property.node.value = parser.parseExpression(`(${value} == null ? ${value} : { ...${value}, tasks: Array.isArray(${value}.tasks) ? ${value}.tasks : [] })`);
    patched++;
  } });
  if (patched !== 1) throw new Error(`${area}: expected one partial-state tasks normalization, got ${patched}`);
}

async function buildMain(name, config) {
  const sourcePath = path.join(root, config.source);
  const source = fs.readFileSync(sourcePath, "utf8");
  for (const required of config.requiredMarkers || [])
    if (!source.includes(required))
      throw new Error(`${name}: baseline marker missing: ${required}`);
  const ast = parser.parse(source, {
    sourceType: "script",
    plugins: ["jsx"],
    errorRecovery: false,
  });
  if (name === "background") {
    traverse(ast, {
      ExpressionStatement(statementPath) {
        const expression = statementPath.node.expression;
        if (
          t.isCallExpression(expression) &&
          t.isIdentifier(expression.callee, { name: "importScripts" }) &&
          t.isStringLiteral(expression.arguments[0], {
            value: "subtitle-ai-background.js",
          })
        )
          statementPath.remove();
      },
    });
  }
  const applied = applySemanticRenames(name, ast);
  if (name === "reader" || name === "video") {
    patchStandalonePlatformLinks(ast, name);
    patchPartialStateTasks(ast, name);
  }
  if (name === "background" || name === "reader" || name === "video") {
    patchSchemesDefault(ast, name);
    patchControlCenterAppearance(ast, name);
  }
  let sourceComponents = [];
  if (name === "background") installBackgroundStructuredAiBridge(ast);
  if (name === "reader") {
    patchControlCenterVisibility(ast);
    patchExtensionClientEmit(ast, "reader");
    sourceComponents = installUiSourceFactories(ast, {
      area: "reader",
      sourceRoot: path.join(root, "src", "reader"),
      manualAliases: [
        ["WriterSettings", "rx"],
        ["SliderRoot", "jC"],
      ],
      minimumComponents: 33,
      globals: ["SpeechSynthesisUtterance"],
    });
    patchReaderBrandIcons(ast);
  }
  if (name === "video") {
    patchExtensionClientEmit(ast, "video");
    patchVideoNullChildNodes(ast);
    patchMixedLanguageDetection(ast);
    patchChineseSubtitleVariants(ast);
    patchYouTubeCaptionStartup(ast);
    patchGenericHtml5Video(ast);
    sourceComponents = installUiSourceFactories(ast, {
      area: "video",
      sourceRoot: path.join(root, "src", "video", "ui"),
      minimumComponents: 4,
    });
    patchVideoAiRequests(ast);
  }
  if (name === "popup") {
    sourceComponents = installUiSourceFactories(ast, {
      area: "popup",
      sourceRoot: path.join(root, "src", "popup", "ui"),
      minimumComponents: 1,
    });
  }
  if (["background", "reader", "video"].includes(name)) guardLegacyRuntimeMessages(ast, name);
  renameReport[name] = {
    source: config.source,
    output: config.output,
    applied,
    count: applied.length,
    ...(sourceComponents.length ? { sourceComponents } : {}),
  };
  const siteRuntime = ["background", "video"].includes(name)
    ? getMediaSitePolicySource() + "\n" +
      fs.readFileSync(path.join(root, "src/shared/media-contract.js"), "utf8") + "\n" +
      getPlatformCapabilitySource() + "\n" +
      fs.readFileSync(path.join(root, "src/shared/media-message-schema.js"), "utf8") + "\n" +
      fs.readFileSync(path.join(root, "src/shared/media-reader.js"), "utf8") + "\n" + (name === "video"
      ? fs.readFileSync(path.join(root, "src/video/native-audio-clock.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(root, "src/video/netease-playback.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(root, "src/video/ximalaya-playback.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(root, "src/video/soundcloud-playback.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(root, "src/video/bandcamp-media.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(root, "src/video/media-site-hooks.js"), "utf8") + "\n" +
        fs.readFileSync(path.join(root, "src/video/site-adapters.js"), "utf8") + "\n"
      : "")
    : name === "reader" ? getPlatformCapabilitySource() + "\n" : "";
  let output = `/* LexiHalo readable single bundle: ${name}. */\n${siteRuntime}${generate(ast, { comments: true, compact: false }).code}\n`;
  if (name === "background")
    output += ["schema.js", "store.js", "background.js", "ai.js", "media.js", "study-background.js"].map((file) => fs.readFileSync(path.join(root, "src/learning", file), "utf8")).join("\n") + "\n" + fs.readFileSync(path.join(root, "src/background/media-task-manager.js"), "utf8") + "\n" +
      fs.readFileSync(path.join(root, "src/background/media-capture.js"), "utf8") + "\n" +
      fs.readFileSync(path.join(root, "src/background/site-resolver.js"), "utf8") + "\n" +
      fs.readFileSync(
        path.join(root, "src/background/subtitle-ai.js"),
        "utf8",
      ) + marker("Background");
  else if (name === "reader")
    output +=
      fs
        .readFileSync(
          path.join(root, "src/shared/clearScopedCache.js"),
          "utf8",
        )
        .replace(
          "export async function clearScopedCache",
          "async function clearScopedCache",
        ) + marker("Reader");
  else if (name === "video") output += getCaptionSchedulerSource() + marker("Video");
  else {
    const markerName =
      {
        popup: "Popup",
        languageDetector: "Language",
        posTagger: "Pos",
        romanize: "Romanize",
      }[name] || name;
    output += marker(markerName);
  }
  output = await formatJs(output);
  if (contentBundleNames.has(name)) output = guardContentScript(output);
  fs.writeFileSync(path.join(root, config.output), output);
}

for (const [name, config] of Object.entries(baseline.entries))
  await buildMain(name, config);

// Independent learning workbench: new code stays outside recovered UI factories.
fs.mkdirSync(path.join(root, "assets/learning"), { recursive: true });
for (const file of ["schema.js", "store.js", "transfer.js", "workspace.js", "workspace.css", "understanding.js", "reading.js", "notes.js", "notes-library.js", "study.js", "study.css"]) {
  fs.copyFileSync(path.join(root, "src/learning", file), path.join(root, "assets/learning", file));
}
fs.copyFileSync(path.join(root, "node_modules/fflate/umd/index.js"), path.join(root, "assets/learning/fflate.js"));
fs.copyFileSync(path.join(root, "node_modules/fflate/LICENSE"), path.join(root, "assets/learning/fflate-LICENSE.txt"));

const directSources = {
  "src/video/onload.js": "assets/edvideo-onload.js",
  "src/content/site-rules-loader.js": "assets/site-rules-loader.js",
  "src/content/subtitle-ai-sidebar.js": "assets/subtitle-ai-sidebar.js",
  "src/options/byok.js": "assets/byok.js",
  "src/options/site-rules.js": "assets/site-rules.js",
  "src/background/asr-offscreen.js": "assets/asr-offscreen.js",
  "src/content/learning-entry.js": "assets/cheng-learning-entry.js",
  "src/video/learning-bridge.js": "assets/cheng-video-bridge.js",
};
for (const [input, output] of Object.entries(directSources)) {
  let source = fs
    .readFileSync(path.join(root, input), "utf8")
    .replaceAll("assets/semantic-video.js", "assets/edvideo-main.js")
    .replaceAll("assets/semantic-romanize.js", "assets/romanize-main.js")
    .replaceAll("assets/semantic-language-detector.js", "assets/ld-main.js")
    .replaceAll("assets/semantic-pos-tagger.js", "assets/tagger-main.js")
    .replaceAll('"semantic"', '"readable"');
  source = await formatJs(source);
  if (input.startsWith("src/content/") || input === "src/video/onload.js" || input === "src/video/learning-bridge.js")
    source = guardContentScript(source);
  fs.writeFileSync(path.join(root, output), source);
}
for (const filename of [
  "index.html",
  "popup.html",
  "byok.html",
  "site-rules.html",
  "offscreen.html",
  "workspace.html",
  "study.html",
]) {
  fs.copyFileSync(
    path.join(root, "src", "pages", filename),
    path.join(root, filename),
  );
}
const brand = JSON.parse(fs.readFileSync(path.join(root, "config/brand.json"), "utf8"));
for (const locale of fs.readdirSync(path.join(root, "src/locales"))) {
  const input = path.join(root, "src/locales", locale, "messages.json");
  const messages = JSON.parse(fs.readFileSync(input, "utf8").replaceAll("LexiHalo", brand.name));
  const chinese = locale === "zh_CN", traditional = locale === "zh_TW";
  messages.PKG_NAME.message = chinese ? brand.zhPackageName : traditional ? brand.zhTWPackageName : brand.packageName;
  messages.PKG_DESC.message = chinese ? brand.zhDescription : traditional ? brand.zhTWDescription : brand.description;
  fs.mkdirSync(path.join(root, "_locales", locale), { recursive: true });
  fs.writeFileSync(path.join(root, "_locales", locale, "messages.json"), JSON.stringify(messages, null, 2) + "\n");
}
for (const filename of [
  "cheng-theme.css",
  "byok.css",
  "edreader.css",
  "eduser.css",
  "edvideo.css",
  "popup-style.css",
  "site-rules.css",
  "subtitle-ai.css",
]) {
  fs.copyFileSync(
    path.join(root, "src", "styles", filename),
    path.join(root, "assets", filename),
  );
}

// Assemble clean, standalone dist/ distribution directory
const distDir = path.join(root, "dist");
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

// 1. Copy manifest.json
fs.copyFileSync(path.join(root, "manifest.json"), path.join(distDir, "manifest.json"));
fs.copyFileSync(path.join(root, "native/THIRD_PARTY_NOTICES.txt"), path.join(distDir, "THIRD_PARTY_NOTICES.txt"));

// 2. Copy HTML pages
for (const filename of ["index.html", "popup.html", "byok.html", "site-rules.html", "offscreen.html", "workspace.html", "study.html"]) {
  fs.copyFileSync(path.join(root, filename), path.join(distDir, filename));
}

// 3. Copy _locales
fs.cpSync(path.join(root, "_locales"), path.join(distDir, "_locales"), {
  recursive: true,
  force: true,
});

// 4. Copy assets directory
fs.cpSync(path.join(root, "assets"), path.join(distDir, "assets"), {
  recursive: true,
  force: true,
});

const reportsDir = path.join(root, "artifacts", "reports");
fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(
  path.join(reportsDir, "bundle-renames.json"),
  `${JSON.stringify(renameReport, null, 2)}\n`,
);
console.log(
  `Built ${Object.keys(baseline.entries).length} readable single bundles with ${Object.values(renameReport).reduce((sum, item) => sum + item.count, 0)} high-confidence renames.`,
);
