import postcss from "prettier/plugins/postcss";

// Only extension-owned UI roots, never html/body or native player containers.
// :where keeps the legacy selector's specificity (including Material UI rules).
const uiScope =
  ":where(.trancy-container, .trancy-caption, #xt-toggle-button, trancy-caption-window, trancy-caption-setting, trancy-caption-summary)";
const ownedSelector = (node) => {
  if (!["selector-class", "selector-id", "selector-tag"].includes(node.type))
    return false;
  return /^(?:trancy-|lexihalo-|xtc-|xt-)/.test(node.value);
};

/** Compile legacy video CSS without exposing generic classes to host pages. */
export async function scopeVideoCss(source) {
  const ast = await postcss.parsers.css.parse(source);
  const insertions = [];
  const visit = (node) => {
    // Keyframe steps are not DOM selectors; leave their percentages untouched.
    if (node.type === "css-atrule" && /keyframes$/i.test(node.name)) return;
    if (node.type === "css-rule") {
      for (const selector of node.selector.nodes) {
        const first = selector.nodes[0];
        // A namespace later in the chain also confines the target, e.g.
        // .zh-CN .trancy-primary-subtitle. Don't require another UI ancestor:
        // the language class may live on the UI root itself.
        if (!first || selector.nodes.some(ownedSelector)) continue;
        const offset = node.source.start.offset + first.sourceIndex;
        if (source.startsWith(uiScope + " ", offset)) continue;
        insertions.push(offset);
      }
    }
    for (const child of node.nodes || []) visit(child);
  };
  visit(ast);
  // Insert back to front so offsets continue to refer to the original source.
  for (const offset of insertions.sort((a, b) => b - a)) {
    source = source.slice(0, offset) + uiScope + " " + source.slice(offset);
  }
  return source;
}
