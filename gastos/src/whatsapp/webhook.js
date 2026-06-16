const express = require('express');
const { getCompanyByPhoneNumberId, getEmployeeByPhone } = require('../companies/repo');
const { intakeFromImage } = require('../expenses/intake');
const { getLatestPending, confirmExpense, updateExpense, rejectExpense, getExpense } = require('../expenses/repo');
const { aplicarContabilidad } = require('../contabilidad/contabilizar');
const { monthlySummary } = require('../expenses/summary');
const { interpretText } = require('./interpret');
const { formatConfirmation, formatSummary, formatDuplicateBlock } = require('./format');
const realClient = require('./client');
const realExtract = require('../ocr/extract');

// Inyección de deps para test; en producción usa las reales.
function createWebhookRouter({ db, verifyToken, sendText, downloadMedia, extractExpense, now } = {}) {
  const _send = sendText || realClient.sendText;
  const _download = downloadMedia || realClient.downloadMedia;
  const _extract = extractExpense || realExtract.extractExpense;
  const _now = now || (() => new Date());
  const router = express.Router();

  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (verifyToken || process.env.WHATSAPP_VERIFY_TOKEN)) {
      return res.status(200).send(String(challenge || ''));
    }
    return res.sendStatus(403);
  });

  router.post('/', async (req, res) => {
    // Procesamos y LUEGO respondemos 200 (síncrono): así es testeable con supertest
    // y, para el MVP, el trabajo (download+OCR+DB) cae bien dentro del timeout de Meta.
    // El dedup por wa_message_id (índice único) cubre un eventual reintento de Meta.
    try {
      const changes = req.body?.entry?.flatMap((e) => e.changes || []) || [];
      for (const ch of changes) {
        const value = ch.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages || [];
        if (!phoneNumberId || !messages.length) continue;

        const contacts = value.contacts || [];
        const senderName = (waid) => {
          const c = contacts.find((x) => x.wa_id === waid);
          return (c && c.profile && c.profile.name) || '';
        };

        const company = await getCompanyByPhoneNumberId(db, phoneNumberId);
        if (!company) continue;

        for (const msg of messages) {
          const reply = (body) => _send({ to: msg.from, body, token: company.wa_token, phoneNumberId });
          const employee = await getEmployeeByPhone(db, company.id, msg.from);
          if (!employee) {
            await reply('No estás registrado para rendir gastos. Pídele a tu jefe que te agregue.');
            continue;
          }

          if (msg.type === 'image' && msg.image?.id) {
            const media = await _download({ mediaId: msg.image.id, token: company.wa_token });
            const { expense, duplicado, documento } = await intakeFromImage({
              db, companyId: company.id, employeeId: employee.id,
              imageBuffer: media.buffer, mimeType: media.mimeType, canal: 'whatsapp',
              waMessageId: msg.id, fotoPath: null, extract: _extract,
              waSenderName: senderName(msg.from), waSenderPhone: msg.from,
            });
            if (documento) {
              await reply('Detecté ' + (documento === 'cartola' ? 'una cartola bancaria' : 'un libro de compra/venta del SII') + ', señor. El módulo Match se activará aquí próximamente.');
              continue;
            }
            if (!expense) {
              await reply(formatDuplicateBlock(duplicado.existente));
              continue;
            }
            const aviso = duplicado && duplicado.nivel === 'suave'
              ? '\n⚠️ Hay algo muy parecido ya registrado; revisa que no sea repetido.'
              : '';
            await reply(formatConfirmation(expense) + aviso);
            continue;
          }

          if (msg.type === 'text' && msg.text?.body) {
            const intent = interpretText(msg.text.body);

            if (intent.kind === 'summary') {
              const d = _now();
              const s = await monthlySummary(db, company.id, { year: d.getFullYear(), month: d.getMonth() + 1 });
              const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
              await reply(formatSummary({ ...s, periodo: `${meses[d.getMonth()]} ${d.getFullYear()}` }));
              continue;
            }

            const pending = await getLatestPending(db, company.id, employee.id);
            if (!pending) {
              await reply('No tengo un gasto pendiente. Mándame la foto de una boleta o escribe "resumen".');
              continue;
            }
            if (intent.kind === 'confirm') {
              await confirmExpense(db, pending.id);
              const _expConf = await getExpense(db, pending.id);
              if (_expConf) await aplicarContabilidad(db, _expConf.company_id, _expConf, 'confirmar');
              await reply('✅ Gasto guardado. ¡Gracias!');
            } else if (intent.kind === 'cancel') {
              await rejectExpense(db, pending.id);
              await reply('❌ Gasto descartado.');
            } else if (intent.kind === 'correction') {
              const upd = await updateExpense(db, pending.id, { [intent.field]: intent.value });
              await reply(formatConfirmation(upd));
            } else {
              await reply('No te entendí. Responde *SÍ*, *NO*, o corrige (ej: "monto 30000").');
            }
          }
        }
      }
    } catch (err) {
      console.error('[gastos/webhook] error:', err.message);
    } finally {
      res.sendStatus(200); // Meta siempre recibe 200 (no reintenta en bucle)
    }
  });

  return router;
}

module.exports = { createWebhookRouter };
