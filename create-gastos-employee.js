// Crea un empleado de Atiko Gastos en el VPS (para probar la app).
// Uso: node create-gastos-employee.js <usuario> <clave> [nombre]
require('dotenv').config();
const { Client } = require('ssh2');

const USUARIO = process.argv[2];
const CLAVE = process.argv[3];
const NOMBRE = process.argv[4] || USUARIO;
if (!USUARIO || !CLAVE) { console.error('Uso: node create-gastos-employee.js <usuario> <clave> [nombre]'); process.exit(1); }

const REMOTE = '/root/atiko-gastos';
const JS = [
  'require("dotenv").config();',
  'const {getPool}=require("./src/db/pool");',
  'const {createEmployee}=require("./src/companies/repo");',
  'const {hashPassword}=require("./src/auth/password");',
  '(async()=>{',
  '  const db=getPool();',
  '  const c=await db.query("SELECT id,nombre FROM companies ORDER BY created_at LIMIT 1");',
  '  if(!c.rows[0]){console.error("NO_COMPANY");process.exit(1);}',
  '  const companyId=c.rows[0].id;',
  '  const ex=await db.query("SELECT id FROM employees WHERE usuario=$1",[process.env.EMP_USUARIO]);',
  '  if(ex.rows[0]){console.log("YA_EXISTE id="+ex.rows[0].id+" usuario="+process.env.EMP_USUARIO);await db.end();return;}',
  '  const ph=await hashPassword(process.env.EMP_PASS);',
  '  const e=await createEmployee(db,{company_id:companyId,nombre:process.env.EMP_NOMBRE,usuario:process.env.EMP_USUARIO,password_hash:ph,rol:"empleado",activo:true});',
  '  console.log("OK id="+e.id+" usuario="+e.usuario+" empresa="+c.rows[0].nombre+" ("+companyId+")");',
  '  await db.end();',
  '})().catch(e=>{console.error("FAIL:",e.message);process.exit(1);});',
].join('');

const conn = new Client();
function sh(cmd) {
  return new Promise((res, rej) => conn.exec(cmd, (e, s) => {
    if (e) return rej(e);
    let o = '', er = '';
    s.on('data', d => o += d).stderr.on('data', d => er += d);
    s.on('close', code => res({ code, o, er }));
  }));
}
conn.on('ready', async () => {
  const env = `EMP_USUARIO='${USUARIO}' EMP_PASS='${CLAVE}' EMP_NOMBRE='${NOMBRE}'`;
  const r = await sh(`cd ${REMOTE} && ${env} node -e '${JS}'`);
  console.log(r.o.trim());
  if (r.er.trim()) console.log('stderr:', r.er.trim());
  conn.end();
}).on('error', e => { console.error('SSH error:', e.message); process.exit(1); })
  .connect({ host: process.env.VPS_IP, port: 22, username: 'root', password: process.env.VPS_PASSWORD });
