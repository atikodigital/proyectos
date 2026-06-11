const { randomUUID } = require("crypto");
const { assertTransition } = require("./status");

function newItem(input) {
  return {
    id: randomUUID(),
    clientId: input.clientId,
    format: input.format,
    network: input.network,
    mediaUrl: input.mediaUrl || null,
    caption: input.caption || null,
    hashtags: input.hashtags || [],
    status: "draft",
    scheduledAt: null,
    publishedAt: null,
    externalId: null,
    error: null,
    createdAt: new Date().toISOString(),
  };
}

function createMemoryContentStore() {
  const map = new Map();
  return {
    async create(input) {
      const item = newItem(input);
      map.set(item.id, item);
      return item;
    },
    async get(id) {
      return map.get(id) || null;
    },
    async list({ clientId, status } = {}) {
      return [...map.values()].filter(
        (i) => (!clientId || i.clientId === clientId) && (!status || i.status === status)
      );
    },
    async updateStatus(id, newStatus, patch = {}) {
      const item = map.get(id);
      if (!item) throw new Error("content item no encontrado: " + id);
      assertTransition(item.status, newStatus);
      Object.assign(item, patch, { status: newStatus });
      return item;
    },
    async due(now) {
      const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
      return [...map.values()].filter(
        (i) => i.status === "scheduled" && i.scheduledAt && new Date(i.scheduledAt).getTime() <= t
      );
    },
  };
}

function rowToItem(r) {
  return {
    id: r.id, clientId: r.client_id, format: r.format, network: r.network,
    mediaUrl: r.media_url, caption: r.caption, hashtags: r.hashtags || [],
    status: r.status, scheduledAt: r.scheduled_at, publishedAt: r.published_at,
    externalId: r.external_id, error: r.error, createdAt: r.created_at,
  };
}

function createPgContentStore({ pool }) {
  return {
    async create(input) {
      const item = newItem(input);
      await pool.query(
        `INSERT INTO content_items
           (id, client_id, format, network, media_url, caption, hashtags, status, scheduled_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [item.id, item.clientId, item.format, item.network, item.mediaUrl, item.caption,
         JSON.stringify(item.hashtags), item.status, item.scheduledAt, item.createdAt]
      );
      return item;
    },
    async get(id) {
      const { rows } = await pool.query("SELECT * FROM content_items WHERE id=$1", [id]);
      return rows.length ? rowToItem(rows[0]) : null;
    },
    async list({ clientId, status } = {}) {
      const where = [];
      const params = [];
      if (clientId) { params.push(clientId); where.push("client_id=$" + params.length); }
      if (status) { params.push(status); where.push("status=$" + params.length); }
      const sql = "SELECT * FROM content_items" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY created_at DESC";
      const { rows } = await pool.query(sql, params);
      return rows.map(rowToItem);
    },
    async updateStatus(id, newStatus, patch = {}) {
      const current = await this.get(id);
      if (!current) throw new Error("content item no encontrado: " + id);
      assertTransition(current.status, newStatus);
      await pool.query(
        `UPDATE content_items SET status=$2, scheduled_at=$3, published_at=$4, external_id=$5, error=$6
         WHERE id=$1`,
        [id, newStatus,
         patch.scheduledAt !== undefined ? patch.scheduledAt : current.scheduledAt,
         patch.publishedAt !== undefined ? patch.publishedAt : current.publishedAt,
         patch.externalId !== undefined ? patch.externalId : current.externalId,
         patch.error !== undefined ? patch.error : current.error]
      );
      return this.get(id);
    },
    async due(now) {
      const iso = (now instanceof Date ? now : new Date(now)).toISOString();
      const { rows } = await pool.query(
        "SELECT * FROM content_items WHERE status='scheduled' AND scheduled_at <= $1", [iso]);
      return rows.map(rowToItem);
    },
  };
}

module.exports = { createMemoryContentStore, createPgContentStore };
