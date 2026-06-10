function createMemoryAvatarProfiles() {
  const map = new Map();
  return {
    async save(p) { map.set(p.clientId, p); },
    async get(clientId) { return map.get(clientId) || null; },
    // Gate legal: solo devuelve el perfil si el consentimiento está firmado.
    async getAuthorized(clientId) {
      const p = map.get(clientId) || null;
      return p && p.consentSigned ? p : null;
    },
  };
}

function createPgAvatarProfiles({ pool }) {
  function rowToProfile(r) {
    return {
      clientId: r.client_id, displayName: r.display_name,
      heygenAvatarId: r.heygen_avatar_id,
      consentSigned: r.consent_signed, consentDate: r.consent_date,
    };
  }
  return {
    async save(p) {
      await pool.query(
        `INSERT INTO avatar_profiles (client_id, display_name, heygen_avatar_id, consent_signed, consent_date)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (client_id)
         DO UPDATE SET display_name=$2, heygen_avatar_id=$3, consent_signed=$4, consent_date=$5`,
        [p.clientId, p.displayName, p.heygenAvatarId, p.consentSigned, p.consentDate]
      );
    },
    async get(clientId) {
      const { rows } = await pool.query(
        `SELECT client_id, display_name, heygen_avatar_id, consent_signed, consent_date
         FROM avatar_profiles WHERE client_id=$1`, [clientId]);
      return rows.length ? rowToProfile(rows[0]) : null;
    },
    async getAuthorized(clientId) {
      const { rows } = await pool.query(
        `SELECT client_id, display_name, heygen_avatar_id, consent_signed, consent_date
         FROM avatar_profiles WHERE client_id=$1 AND consent_signed=true`, [clientId]);
      return rows.length ? rowToProfile(rows[0]) : null;
    },
  };
}

module.exports = { createMemoryAvatarProfiles, createPgAvatarProfiles };
