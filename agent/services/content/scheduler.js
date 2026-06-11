// tick(): publica los content items "scheduled" vencidos vía el Publicador (Fase 1).
// now y publisher inyectables → testeable sin reloj ni red.

function buildPublishArgs(item) {
  const base = { clientId: item.clientId, platform: item.network, caption: item.caption };
  if (item.format === "reel") return { ...base, videoUrl: item.mediaUrl };
  if (item.format === "post") return { ...base, imageUrl: item.mediaUrl };
  // story u otros: no soportado todavía
  return null;
}

function createScheduler({ store, publisher, now = () => new Date() }) {
  async function publishOne(item) {
    // pasar SIEMPRE por "publishing" (la máquina de estados no permite scheduled→failed directo)
    await store.updateStatus(item.id, "publishing");
    const args = buildPublishArgs(item);
    if (!args) {
      await store.updateStatus(item.id, "failed", {
        error: "Formato '" + item.format + "' aún no soportado (llega en Fase 4c)",
      });
      return "failed";
    }
    try {
      const res = await publisher.publish(args);
      await store.updateStatus(item.id, "published", {
        publishedAt: now().toISOString(),
        externalId: (res && (res.id || res.externalId)) || null,
      });
      return "published";
    } catch (err) {
      await store.updateStatus(item.id, "failed", { error: err.message });
      return "failed";
    }
  }

  async function tick() {
    const due = await store.due(now());
    let published = 0, failed = 0;
    for (const item of due) {
      const r = await publishOne(item);
      if (r === "published") published++; else failed++;
    }
    return { published, failed };
  }

  return { tick };
}

function startScheduler(scheduler, { intervalMs = 60000, log = console } = {}) {
  const timer = setInterval(async () => {
    try {
      const s = await scheduler.tick();
      if (s.published || s.failed) log.log("[scheduler] publicados=" + s.published + " fallidos=" + s.failed);
    } catch (e) {
      log.error("[scheduler] error en tick:", e.message);
    }
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { createScheduler, startScheduler, buildPublishArgs };
