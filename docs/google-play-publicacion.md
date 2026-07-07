# Publicación en Google Play — Hash IA

Guía lista para copiar/pegar en **Play Console**. La app se llama **Hash IA**,
paquete `cl.atikodigital.hashia`, versión **3.79 (versionCode 113)**.

> 📈 **Optimización ASO/SEO/keywords → ver [google-play-aso.md](google-play-aso.md)** (análisis de mercado Chile + textos optimizados). Los textos de abajo ya están alineados con ese análisis.

> ⚠️ **DOS builds por flavor de distribución (2026-07-07):** el `AndroidManifest` main YA NO trae el `PedidoAccessibilityService` (política de accesibilidad de Google Play prohíbe usar la API para leer otras apps). Se separó en `productFlavors`:
> - **`play`** → AAB para la tienda, SIN el servicio de accesibilidad. **Este es el que se sube a Play.** `gradlew bundlePlayRelease` → `app/build/outputs/bundle/playRelease/app-play-release.aab`
> - **`direct`** → APK que se instala directo a clientes, CON la función "Crear pedido" (accesibilidad). El servicio se agrega vía `src/direct/AndroidManifest.xml`. `gradlew assembleDirectRelease` → `app/build/outputs/apk/direct/release/HashIA-direct-release-v3.79.apk`

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

**Nombre de la app (30):** `Hash IA: Gastos y Finanzas` *(26 chars — con keywords para ASO. Alt: `Hash IA: Control de Gastos`.)*

> **Enfoque: PERSONAL primero.** La ficha lidera con finanzas personales (público amplio: cualquier persona) y menciona el negocio/pyme como uso secundario. Título/descrip optimizados para keywords — ver [google-play-aso.md](google-play-aso.md).

**Descripción corta (80):**
`Finanzas personales con IA: anota gastos por voz o foto y sabe cuánto te queda.`

**Descripción completa (pegar tal cual):**
```
Hash IA es la app chilena para controlar tus gastos y ordenar tus finanzas personales con inteligencia artificial. Su asistente se llama KALY: háblale o escríbele y registra tu plata al instante.

CONTROL DE GASTOS SIN PLANILLAS
• Anota tus gastos e ingresos por foto de la boleta, por voz o escribiéndole a KALY.
• Registra tu sueldo y mira cuánto te queda del mes, en tiempo real.
• Entiende en qué se te va la plata y ordena tu presupuesto, sin Excel ni cálculos a mano.

KALY, TU ASISTENTE DE FINANZAS CON IA
• Dile “gasté 12 mil en el súper” y KALY lo registra y te dice cuánto llevas.
• Saca una foto a la boleta y la IA extrae el monto, la fecha y el comercio.
• Todo en segundos, desde tu teléfono.

POR QUÉ HASH IA
• Hecha en Chile, pensada en pesos, boletas y la forma en que gastamos acá.
• Registro por voz, foto o texto: tú eliges cómo anotar tus gastos.
• Simple para partir hoy: no necesitas conectar el banco ni saber de finanzas.

¿TIENES UN NEGOCIO, PYME O EMPRENDIMIENTO?
Hash IA también le lleva la contabilidad y las ventas a tu negocio: calcula el IVA, concilia con el SII y el banco, arma tu catálogo de productos, toma pedidos y genera un PDF para enviar por WhatsApp, y cobra el delivery por comuna. Un solo lugar para tus finanzas personales y las de tu pyme.

PLANES
• Plan gratis para partir.
• Planes con más “shots” cuando los necesites (1 shot = 1 movimiento registrado por la IA: foto, voz o texto).
• La suscripción se contrata desde la web. Cancela cuando quieras.

Ideal si buscas: control de gastos, app de finanzas personales, registrar gastos e ingresos, presupuesto mensual, ahorrar plata, llevar las cuentas del negocio, calcular IVA o rendir boletas.

Descarga Hash IA y empieza a controlar tu plata hoy.
```

**Category / Categoría:** `Finanzas` (Finance). **Tags (hasta 5):** Finanzas personales, Presupuestos, Gestión de gastos. **Idioma:** Español (Chile). *(Encaja con el enfoque personal.)*

**Correo de contacto:** `atikodigital@gmail.com`
**Sitio web:** `https://hash.atikodigital.cl`

**URL Política de privacidad:** `https://hash.atikodigital.cl/privacidad.html`

### Gráficos — ✅ LISTOS en `docs/play-assets/`
- [x] **Ícono** 512×512 → `docs/play-assets/icon-512.png`
- [x] **Gráfico destacado (Feature graphic)** 1024×500 → `docs/play-assets/feature-graphic-1024x500.png`
- [x] **Capturas de teléfono** (1080×1920, 4, enfoque PERSONAL): `screenshot-1-foto.png` (anota gastos por foto), `screenshot-2-balance.png` (cuánto te queda del mes), `screenshot-3-kaly.png` (KALY por voz), `screenshot-4-sueldo.png` (sueldo vs gastos)
  - Son capturas de marketing (marca + función). Opcional: reemplazar/sumar capturas reales tomadas en tu teléfono con la app instalada (aún más auténtico).

## 3. App access / Acceso a la app (login para el revisor) — ✅ CUENTA DEMO CREADA
La app exige iniciar sesión → hay que darle credenciales a Google (Google NO crea cuentas).
**✅ Cuenta demo de DUEÑO creada y verificada (2026-07-07)** vía `POST /api/onboarding/register`, login confirmado en `POST /api/panel/login` (HTTP 200, rol owner):
- **Usuario/email:** `revisor.play@atikodigital.cl`
- **Contraseña:** `RevisorPlay2026!`
- Empresa: "Demo Revisión Play" · companyId c047ee97-a88f-4d7a-aa7d-3b2a96c43523

**En Play Console → Contenido de la app → Datos de inicio de sesión (App access):**
- [ ] "¿Alguna parte restringida?" → **Sí** → **Añade detalles**:
  - **Nombre de las instrucciones:** `Cuenta demo (dueño)`
  - **Nombre de usuario:** `revisor.play@atikodigital.cl`
  - **Contraseña:** `RevisorPlay2026!`
  - **Instrucciones:** `App en español. Inicia sesión con el correo y la contraseña de arriba (login de dueño con email+contraseña; también hay opción "Continuar con Google", NO usarla). Una vez dentro verás KALY (asistente IA), registro de gastos por foto/voz/texto, Movimientos y VARAS (contabilidad). El botón "Eliminar mi cuenta" está en "Mi Plan".`
- [ ] Guardar. ⚠️ El form de Play congela el render con automatización; llenarlo a mano es trivial.

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

## 5. Content rating (Clasificación de contenido) — respuestas EXACTAS
- Paso 1 **Categoría**: email `atikodigital@gmail.com` · categoría **"Todos los demás tipos de aplicaciones"** · ☑ acepto términos IARC → Siguiente.
- Paso 2 **Cuestionario** (categoría "Todos los demás"): **responder NO a TODAS**:
  - Aplicación descargada (contenido clasificable) → **No**
  - Uso compartido de contenido del usuario → **No**
  - **Contenido en línea → No** (⚠️ NO poner "Sí": aunque KALY genera texto con IA, es funcional; poner "Sí" dejó el botón "Siguiente" trabado en pruebas)
  - Violencia → No · Sexualidad → No · Lenguaje → No · Sustancias reguladas → No
  - Promoción/venta con restricción de edad → No
  - Varios: comparte ubicación con otros → No · comprar contenido digital → No (la suscripción es en la web) · recompensas metálico/cripto/NFT → No · navegador/buscador → No · informativa o educativa → No
  - → Siguiente → Paso 3 **Resumen** → **Enviar/Aplicar**. Resultado esperado: **Todos / Everyone (PEGI 3)**.
- ⚠️ Hacerlo en **un solo tirón sin recargar** (recargar reinicia el cuestionario).

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
- [ ] AAB subido (v3.78 / 112)
- [ ] Ficha completa + ícono 512 + feature graphic 1024×500 + 2–8 capturas
- [ ] Política de privacidad URL
- [ ] Data safety completo (con URL de borrado)
- [ ] Content rating hecho
- [ ] App access con cuenta demo (de **dueño**, para el botón de borrado)
- [ ] Target audience 18+
- [ ] Sin anuncios declarado
