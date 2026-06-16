// Busca un movimiento existente que sea duplicado del candidato.
// Devuelve { nivel: 'fuerte'|'suave', motivo, existente } o null.
// Nunca considera filas en estado 'rechazado'. Acotado por company_id.
async function findDuplicate(db, companyId, c = {}) {
  // Capa 1 — documento (fuerte)
  if (c.tipo === 'ingreso') {
    if (c.nro_operacion) {
      const r = await db.query(
        "SELECT * FROM expenses WHERE company_id=$1 AND nro_operacion=$2 AND estado <> 'rechazado' ORDER BY created_at DESC LIMIT 1",
        [companyId, c.nro_operacion]
      );
      if (r.rows[0]) return { nivel: 'fuerte', motivo: 'nro_operacion', existente: r.rows[0] };
    }
  } else if (c.rut_emisor && c.folio) {
    const r = await db.query(
      "SELECT * FROM expenses WHERE company_id=$1 AND rut_emisor=$2 AND folio=$3 AND estado <> 'rechazado' ORDER BY created_at DESC LIMIT 1",
      [companyId, c.rut_emisor, c.folio]
    );
    if (r.rows[0]) return { nivel: 'fuerte', motivo: 'folio', existente: r.rows[0] };
  }

  // Capa 2 — imagen idéntica (fuerte)
  if (c.image_hash) {
    const r = await db.query(
      "SELECT * FROM expenses WHERE company_id=$1 AND image_hash=$2 AND estado <> 'rechazado' ORDER BY created_at DESC LIMIT 1",
      [companyId, c.image_hash]
    );
    if (r.rows[0]) return { nivel: 'fuerte', motivo: 'imagen', existente: r.rows[0] };
  }

  // Capa 3 — coincidencia probable (suave)
  if (c.total && c.fecha && c.proveedor) {
    const r = await db.query(
      "SELECT * FROM expenses WHERE company_id=$1 AND total=$2 AND fecha=$3 AND proveedor=$4 AND estado <> 'rechazado' ORDER BY created_at DESC LIMIT 1",
      [companyId, c.total, c.fecha, c.proveedor]
    );
    if (r.rows[0]) return { nivel: 'suave', motivo: 'monto_fecha_proveedor', existente: r.rows[0] };
  }

  return null;
}

module.exports = { findDuplicate };
