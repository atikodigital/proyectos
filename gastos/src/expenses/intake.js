const { extractExpense } = require('../ocr/extract');
const { createExpense } = require('./repo');

async function intakeFromImage({ db, companyId, employeeId, imageBuffer, mimeType = 'image/jpeg', canal = 'whatsapp', waMessageId, fotoPath, extract }) {
  const run = extract || extractExpense;
  const extracted = await run({ imageBuffer, mimeType });
  return createExpense(db, {
    ...extracted,
    company_id: companyId,
    employee_id: employeeId,
    canal,
    wa_message_id: waMessageId,
    foto_path: fotoPath,
  });
}

module.exports = { intakeFromImage };
