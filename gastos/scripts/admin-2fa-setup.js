#!/usr/bin/env node
// Genera un secreto TOTP para el 2FA del admin de Hash IA.
//
// Uso:
//   node scripts/admin-2fa-setup.js
//
// Pasos:
//   1. Corré este script → te da un SECRETO y una URL otpauth://.
//   2. En Google Authenticator / Authy → "Agregar" → "Ingresar clave de configuración"
//      → pegá el SECRETO (cuenta: atiko, tipo: basado en tiempo). (O escaneá la URL como QR.)
//   3. En el .env del servidor agregá:  GASTOS_ADMIN_TOTP_SECRET=<el secreto>
//   4. Reiniciá:  pm2 restart atiko-gastos --update-env
//   5. Desde ahora el login del admin pide el código de 6 dígitos.
//
// Verificar que quedó bien antes de activar:
//   node scripts/admin-2fa-setup.js <SECRETO> <CODIGO_DE_6_DIGITOS>
const { randomBase32, otpauthUrl, totp, verifyTotp } = require('../src/auth/totp');

const [, , arg1, arg2] = process.argv;

if (arg1 && arg2) {
  const ok = verifyTotp(arg1, arg2);
  console.log(ok ? '✅ Código VÁLIDO — el secreto está bien configurado.' : '❌ Código inválido — revisá el secreto o la hora del teléfono.');
  process.exit(ok ? 0 : 1);
}

const secret = randomBase32(20);
const url = otpauthUrl(secret, { issuer: 'Hash IA Admin', account: 'atiko' });
console.log('\n=== 2FA del admin de Hash IA ===\n');
console.log('SECRETO (pegá esto en el Authenticator, entrada manual):');
console.log('  ' + secret + '\n');
console.log('URL otpauth (para QR):');
console.log('  ' + url + '\n');
console.log('Código actual (para probar ahora mismo): ' + totp(secret));
console.log('\nLuego en el .env del server:  GASTOS_ADMIN_TOTP_SECRET=' + secret);
console.log('y:  pm2 restart atiko-gastos --update-env\n');
console.log('Verificá con:  node scripts/admin-2fa-setup.js ' + secret + ' <codigo>\n');
