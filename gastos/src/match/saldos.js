// gastos/src/match/saldos.js
// Método de saldos correctos: SCA (contable ajustado) vs SBA (bancario ajustado).
// Taxonomía de partidas:
//  - nota_debito (cargo del banco no registrado, ej. comisión): ajusta el SALDO CONTABLE hacia abajo.
//  - nota_credito (abono del banco no registrado): ajusta el SALDO CONTABLE hacia arriba.
//  - deposito_transito (registrado por empresa, aún no en banco): suma al SALDO BANCARIO.
//  - cheque_no_cobrado (registrado por empresa, aún no en banco): resta del SALDO BANCARIO.
//  - error_empresa_mas / error_empresa_menos: ajustan el contable.
//  - error_banco_mas / error_banco_menos: ajustan el bancario.
function _int(n) { return Math.round(Number(n) || 0); }

function calcularSaldos({ bancoContable = 0, saldoFinalCartola = 0, partidas = [] } = {}) {
  let sca = _int(bancoContable);
  let sba = _int(saldoFinalCartola);
  for (const p of (partidas || [])) {
    const m = _int(p.monto);
    switch (p.tipo) {
      case 'nota_credito': sca += m; break;
      case 'nota_debito': sca -= m; break;
      case 'error_empresa_mas': sca += m; break;
      case 'error_empresa_menos': sca -= m; break;
      case 'deposito_transito': sba += m; break;
      case 'cheque_no_cobrado': sba -= m; break;
      case 'error_banco_mas': sba += m; break;
      case 'error_banco_menos': sba -= m; break;
      default: break; // 'matched'/desconocidas no ajustan saldos
    }
  }
  const cuadrado = sca === sba;
  return { sca, sba, cuadrado, brecha: Math.abs(sca - sba) };
}

module.exports = { calcularSaldos };
