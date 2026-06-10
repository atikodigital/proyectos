function key(clientId, platform) {
  return clientId + ":" + platform;
}

function createMemoryTokenStore() {
  const map = new Map();
  return {
    async save(conn) {
      map.set(key(conn.clientId, conn.platform), conn);
    },
    async get(clientId, platform) {
      return map.get(key(clientId, platform)) || null;
    },
    async list(clientId) {
      return [...map.values()].filter((c) => c.clientId === clientId);
    },
  };
}

function createPgTokenStore({ pool }) {
  return {
    async save(conn) {
      await pool.query(
        `INSERT INTO social_connections
           (client_id, platform, account_id, account_name, access_token, token_expires_at, meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (client_id, platform)
         DO UPDATE SET account_id=$3, account_name=$4, access_token=$5,
                       token_expires_at=$6, meta=$7, updated_at=now()`,
        [conn.clientId, conn.platform, conn.accountId, conn.accountName,
         conn.accessToken, conn.tokenExpiresAt, conn.meta]
      );
    },
    async get(clientId, platform) {
      const { rows } = await pool.query(
        `SELECT client_id, platform, account_id, account_name, access_token,
                token_expires_at, meta
         FROM social_connections WHERE client_id=$1 AND platform=$2`,
        [clientId, platform]
      );
      if (rows.length === 0) return null;
      return rowToConn(rows[0]);
    },
    async list(clientId) {
      const { rows } = await pool.query(
        `SELECT client_id, platform, account_id, account_name, access_token,
                token_expires_at, meta
         FROM social_connections WHERE client_id=$1`,
        [clientId]
      );
      return rows.map(rowToConn);
    },
  };
}

function rowToConn(r) {
  return {
    clientId: r.client_id, platform: r.platform, accountId: r.account_id,
    accountName: r.account_name, accessToken: r.access_token,
    tokenExpiresAt: r.token_expires_at, meta: r.meta || {},
  };
}

module.exports = { createMemoryTokenStore, createPgTokenStore };
