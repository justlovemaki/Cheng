/* Observe service-worker exceptions too: pageerror alone misses background failures. */
export async function monitorExtensionErrors(context, worker, errors) {
  context.on("page", (page) =>
    page.on("pageerror", (error) =>
      errors.push(`page ${page.url()}: ${error.stack || error.message}`),
    ),
  );
  const session = await context.newCDPSession(
    context.pages()[0] || (await context.newPage()),
  );
  const { targetInfos } = await session.send("Target.getTargets");
  const target = targetInfos.find(
    (target) => target.type === "service_worker" && target.url === worker.url(),
  );
  if (!target) throw new Error("Extension service-worker target not found");
  const { sessionId } = await session.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  session.on("Target.receivedMessageFromTarget", (event) => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      errors.push(
        `background: ${details.exception?.description || details.text} (${details.url || worker.url()}:${details.lineNumber + 1})`,
      );
    }
  });
  await session.send("Target.sendMessageToTarget", {
    sessionId,
    message: JSON.stringify({ id: 1, method: "Runtime.enable" }),
  });
  return session;
}
