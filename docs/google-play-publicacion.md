# Publicación en Google Play — Hash IA

Guía lista para copiar/pegar en **Play Console**. La app se llama **Hash IA**,
paquete `cl.atikodigital.hashia`, versión **3.73 (versionCode 107)**.

> **El artefacto a subir es el AAB** (Android App Bundle), no el APK:
> `gastos-app/android/app/build/outputs/bundle/release/app-release.aab`

---

## 0. Prerrequisitos (los hace José)
- [ ] Cuenta de **Google Play Console** (pago único US$25). Con `atikodigital@gmail.com`.
- [ ] Aceptar el acuerdo para desarrolladores.
- [ ] Al subir el primer AAB, **activar Play App Signing** (Google guarda la clave de firma de app; nuestro `hashia-release.jks` queda como *upload key*). Recomendado y por defecto.

## 1. Firma
- El AAB ya sale **firmado** con `android/hashia-release.jks` (upload key). No cambiar de keystore entre releases o Play rechaza la subida.

## 2. Ficha de Play Store (Store listing)

**Nombre de la app (30):** `Hash IA`

**Descripción corta (80):**
`Cuentas y ventas de tu pyme con IA: gastos, IVA, SII y KALY, tu asistente de voz.`

**Descripción completa (pegar tal cual):**
```
Hash IA es la inteligencia artificial que le lleva las cuentas y las ventas a las pymes de Chile. Su asistente se llama KALY.

CUENTAS (finanzas)
• Registra gastos e ingresos por foto de la boleta/factura, por voz o escribiéndole a KALY.
• Calcula el IVA automáticamente (neto + 19%).
• Concilia con el SII y con la cartola del banco (Match) para que tu mes cuadre.
• Reportes y flujo de caja al día.

VENTAS
• Arma tu catálogo por voz o con la foto del menú.
• Toma pedidos en el chat y genera el PDF para enviar por WhatsApp.
• Cobra el delivery por comuna.

KALY, TU ASISTENTE
• Háblale o escríbele: registra movimientos, te responde dudas y te ayuda a ordenar el negocio.

PLANES
• Plan gratis para partir, y planes de pago con más "shots" (1 shot = 1 movimiento registrado por la IA).

Hecha en Chile, para pymes de Chile. Cancela cuando quieras.
```

**Category / Categoría:** `Empresa` (Business). *(También válido: Finanzas.)*

**Correo de contacto:** `atikodigital@gmail.com`
**Sitio web:** `https://hash.atikodigital.cl`

**URL Política de privacidad:** `https://hash.atikodigital.cl/privacidad.html`

### Gráficos — ✅ LISTOS en `docs/play-assets/`
- [x] **Ícono** 512×512 → `docs/play-assets/icon-512.png`
- [x] **Gráfico destacado (Feature graphic)** 1024×500 → `docs/play-assets/feature-graphic-1024x500.png`
- [x] **Capturas de teléfono** (1080×1920, 4): `screenshot-1-foto.png`, `screenshot-2-kaly.png`, `screenshot-3-cuadre.png`, `screenshot-4-pedido.png`
  - Son capturas de marketing (marca + función). Opcional: reemplazar/sumar capturas reales tomadas en tu teléfono con la app instalada (aún más auténtico).

## 3. App access / Acceso a la app (login para el revisor)
La app exige iniciar sesión, así que hay que darle credenciales de prueba a Google:
- [ ] Crear una **cuenta demo** y ponerla en *App access → All functionality → add instructions*.
- ⚠️ **Ojo:** el botón "Eliminar mi cuenta" es solo para **dueño** (login con Google). Para que el revisor lo pueda ver, la cuenta demo debe ser de dueño. Opciones: (a) dar un Gmail de prueba dedicado con su clave, o (b) usar una cuenta **personal** de Hash IA. Definir con José antes de enviar.

## 4. Data safety (Seguridad de los datos) — respuestas

- ¿Recopila o comparte datos del usuario? **Sí.**
- ¿Datos cifrados en tránsito? **Sí.**
- ¿El usuario puede pedir que se eliminen sus datos? **Sí.**
  **URL de eliminación de cuenta:** `https://hash.atikodigital.cl/eliminar-cuenta.html`

**Tipos de datos recopilados** (todos: propósito = *Funcionalidad de la app*; procesados por Google Gemini como *proveedor de servicio*, no se "comparten/venden" en el sentido de Play):

| Tipo | Se recopila | Nota |
|---|---|---|
| Nombre | Sí | Cuenta / empresa |
| Correo electrónico | Sí | Login (Google) |
| User IDs | Sí | Identificar la cuenta |
| Info financiera del usuario ("Other financial info") | Sí | Gastos/ingresos que registra el propio usuario |
| Historial de compras | Sí | Suscripción (MercadoPago/Lemon Squeezy) |
| Fotos | Sí | Fotos de documentos para OCR |
| Grabaciones de voz/audio | Sí | Solo mientras el asistente está activo — **procesado de forma efímera**, no se almacena |
| Actividad en la app | Sí | Funcionamiento y seguridad |
| Device/other IDs | Sí | Seguridad / prevención de fraude |

- Marcar **"Datos procesados de forma efímera"** para el audio.
- No hay datos recopilados para **publicidad**.
- Pago con tarjeta: lo procesan MercadoPago/Lemon Squeezy; **Atiko no guarda números de tarjeta**.

## 5. Content rating (Clasificación de contenido)
- Cuestionario IARC. La app **no** tiene violencia, sexo, apuestas, drogas ni contenido para adultos.
- Responder **No** a todo → resultado esperado: **Todos / Everyone (PEGI 3)**.
- ¿Contiene anuncios? **No.**

## 6. Target audience / Público objetivo
- Edad objetivo: **18+** (herramienta de negocios). No está dirigida a niños.

## 7. Ads / Anuncios
- ¿La app contiene anuncios? **No.**

## 8. Government / Financial features
- No es una app de institución financiera ni de préstamos/inversiones. Si Play pregunta por "financial features", declarar que es **software de gestión contable** (no maneja dinero de terceros ni ejecuta transacciones bancarias). Los cobros de suscripción se hacen fuera de la app (web).

## 9. Pagos dentro de la app (importante para no violar la política)
- La app **no** vende bienes digitales con Google Play Billing: la mejora de plan **abre el navegador** (MercadoPago/Lemon Squeezy). Es un SaaS de negocios; la compra ocurre en la web. Mantener así para evitar el requisito de Play Billing.

## 10. Release
- [ ] Recomendado: subir primero a **Testing interno** (internal testing) → instalar y probar login + captura + KALY + "Eliminar mi cuenta".
- [ ] Luego promover a **Producción**.
- [ ] Países: Chile (y los que quieras).

---

### Checklist final antes de "Enviar a revisión"
- [ ] AAB subido (v3.73 / 107)
- [ ] Ficha completa + ícono 512 + feature graphic 1024×500 + 2–8 capturas
- [ ] Política de privacidad URL
- [ ] Data safety completo (con URL de borrado)
- [ ] Content rating hecho
- [ ] App access con cuenta demo (de **dueño**, para el botón de borrado)
- [ ] Target audience 18+
- [ ] Sin anuncios declarado
