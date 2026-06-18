# Hash IA — Materiales para Google Play

**App:** Hash IA · **applicationId:** `cl.atikodigital.hashia` · **versionCode:** 43 · versionName: 1.0
**Artefacto a subir:** `gastos-app/android/app/build/outputs/bundle/release/app-release.aab` (AAB firmado, 5.4 MB)
**Política de privacidad (live):** https://gastos.atikodigital.cl/panel/privacidad.html
**Email de contacto:** atikodigital@gmail.com

---

## Ficha de tienda (textos listos para pegar)

**Nombre de la app (≤30):** `Hash IA`

**Descripción breve (≤80):**
`Contabilidad con IA: registra gastos, lee facturas y concilia tu banco y SII.`

**Descripción completa (≤4000):**
```
Hash IA es el asistente contable inteligente para pequeñas y medianas empresas de Chile. Toma una foto de tus facturas, boletas o cartolas y deja que la inteligencia artificial registre, clasifique y concilie tus movimientos por ti.

QUÉ PUEDES HACER
• Registrar gastos e ingresos con una foto: la IA lee el documento (RUT, folio, neto, IVA, total) y lo registra solo.
• Conciliación bancaria automática: sube tu cartola y Hash IA la cuadra con tu contabilidad (método de saldos correctos).
• Conciliación con el SII: cruza tu Libro de Compras y Ventas y calcula tu IVA.
• Contabilidad real de partida doble: Libro Diario, Mayor, Balance de Comprobación y Flujo de Caja, siempre cuadrados.
• Asientos manuales cuando los necesites.
• Auxiliares de insumos: sabe cuántos kilos de harina o cuántos kWh consumiste.
• VARAS, tu contador con IA: pregúntale por chat o por voz "¿cuánto debo?", "¿cuál es mi flujo de caja?", "¿cuánto gasté este mes?" y te responde con tus datos reales.
• Resúmenes por WhatsApp.

PARA QUIÉN
Para dueños de almacenes, pizzerías, peluquerías, ferreterías, servicios y cualquier pyme que quiera llevar sus números al día sin ser contador.

Hash IA es un producto de Atiko Digital.
```

**Categoría:** Finanzas (Finance)
**Etiquetas/tags:** contabilidad, finanzas, pyme, facturas, IVA
**Web del desarrollador:** https://hash.atikodigital.cl
**Países:** Chile (puede ampliarse luego)

---

## Seguridad de los datos (Data safety) — respuestas

- **¿Recopila o comparte datos?** Sí (recopila; comparte con proveedores de procesamiento).
- **¿Se cifran en tránsito?** Sí (HTTPS).
- **¿El usuario puede pedir eliminación?** Sí (vía atikodigital@gmail.com).

Tipos de datos:
| Categoría | Dato | Recopilado | Compartido | Propósito |
|---|---|---|---|---|
| Información personal | Nombre, email/usuario, RUT, datos de empresa | Sí | No | Funcionalidad de la app, cuenta |
| Información financiera | Documentos tributarios, montos, proveedores | Sí | Sí (proc. OCR/IA) | Funcionalidad de la app |
| Fotos | Imágenes de documentos | Sí | Sí (proc. OCR) | Funcionalidad de la app |
| Audio | Voz del asistente (solo al activarlo) | Sí | Sí (proc. transcripción/IA) | Funcionalidad de la app |
| Actividad de la app | Uso / diagnóstico | Sí | No | Análisis, rendimiento |

"Compartido" = se envía a Google (API de Gemini) para OCR y respuestas de IA. No se venden datos. No hay publicidad.

**Permisos sensibles a declarar:** CÁMARA (capturar documentos), RECORD_AUDIO/micrófono (asistente de voz), POST_NOTIFICATIONS, READ_MEDIA_IMAGES. (Nota: SYSTEM_ALERT_WINDOW, BIND_ACCESSIBILITY_SERVICE y NotificationListener pueden requerir declaración/justificación extra de Play; si Play los objeta, evaluar quitarlos del build de Play ya que son de features omnicanal opcionales.)

---

## Imágenes requeridas (assets) — checklist
- [ ] **Ícono** 512×512 PNG (32-bit, con alfa). → usar el `ic_launcher` actual escalado, o generar uno limpio.
- [ ] **Gráfico destacado (feature graphic)** 1024×500 PNG/JPG.
- [ ] **Capturas de teléfono:** mínimo 2 (recomendado 4–8), entre 320 y 3840 px por lado, ratio 16:9 o 9:16. → pestañas VARAS (chat), Conciliación (SCA/SBA), Diario/Balance, captura de factura.
- [ ] (Opcional) capturas de tablet.

> Puedo generar el ícono 512, el feature graphic y mockups de capturas si quieres (con la skill de imágenes).

---

## Pasos en Play Console (pista de PRUEBA INTERNA = la más rápida, sin revisión larga)
1. Crear la app → idioma es-CL, tipo App, gratis.
2. Completar: Ficha principal (textos de arriba) + ícono + feature graphic + capturas.
3. **Contenido de la app:** política de privacidad (URL de arriba), acceso a la app (si requiere login, dar credenciales de prueba a Google), anuncios (No), clasificación de contenido (cuestionario), público objetivo (mayores de edad), seguridad de los datos (tabla de arriba).
4. **Versiones → Pruebas → Prueba interna** → crear versión → subir `app-release.aab` → agregar testers (emails) → revisar y publicar.
5. Compartir el **enlace de aceptación** del tester → instalan desde Play → **Play Protect ya no bloquea**.

> Play App Signing: al subir el primer AAB, Google ofrece gestionar la firma. La llave actual (keystore "Atiko Digital / Hash IA") queda como **llave de subida**. Guardar el keystore y su contraseña a buen recaudo (sin él no se pueden subir futuras versiones).
