/* Native side-panel WebContents are not included in Playwright context.pages(). */
export async function attachExtensionPanel(context, url, errors = []) {
  const root = await context.newCDPSession(context.pages()[0]);
  let target;
  for (let attempt = 0; attempt < 100; attempt++) {
    target = (await root.send("Target.getTargets")).targetInfos.find(
      (item) => item.type === "page" && item.url === url,
    );
    if (target) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!target) throw new Error(`Native learning panel did not open: ${url}`);
  const { sessionId } = await root.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  let sequence = 0;
  const pending = new Map();
  root.on("Target.receivedMessageFromTarget", (event) => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    if (message.method === "Runtime.exceptionThrown")
      errors.push(
        `study panel: ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`,
      );
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    message.error
      ? reject(new Error(message.error.message))
      : resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Panel CDP timeout: ${method}`));
        }, 15000);
      pending.set(id, { resolve, reject, timer });
      root
        .send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch((error) => {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        });
    });
  await send("Runtime.enable");
  const evaluate = async (fn, argument) => {
    const value = await send("Runtime.evaluate", {
      expression: `(${fn.toString()})(${argument === undefined ? "undefined" : JSON.stringify(argument)})`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (value.exceptionDetails)
      throw new Error(
        value.exceptionDetails.exception?.description ||
          value.exceptionDetails.text,
      );
    return value.result?.value;
  };
  const waitFor = async (fn, argument, label = "panel condition") => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(fn, argument)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out: ${label}`);
  };
  return {
    evaluate,
    waitFor,
    screenshot: async () =>
      (await send("Page.captureScreenshot", { format: "png" })).data,
    close: async () => {
      await root.send("Target.closeTarget", { targetId: target.targetId });
      await root.detach();
    },
  };
}
