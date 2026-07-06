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

> **Enfoque: PERSONAL primero.** La ficha lidera con finanzas personales (público amplio: cualquier persona) y menciona el negocio/pyme como uso secundario.

**Descripción corta (80):**
`Controla tu plata con IA: anota gastos por foto o voz y sabe cuánto te queda.`

**Descripción completa (pegar tal cual):**
```
Hash IA es la app que te ayuda a controlar tu plata con inteligencia artificial. Su asistente se llama KALY.

TUS FINANZAS PERSONALES
• Anota tus gastos e ingresos por foto de la boleta, por voz o escribiéndole a KALY.
• Registra tu sueldo y mira cuánto te queda del mes, en tiempo real.
• Entiende en qué se te va la plata, sin planillas ni Excel.

KALY, TU ASISTENTE
• Háblale o escríbele: registra lo que gastaste y te dice cuánto llevas.

¿TIENES UN NEGOCIO O EMPRENDIMIENTO?
Hash IA también le lleva las cuentas y las ventas a tu pyme: calcula el IVA, concilia con el SII y el banco, arma tu catálogo, toma pedidos con PDF para WhatsApp y cobra delivery por comuna.

PLANES
• Plan gratis para partir, y planes con más "shots" (1 shot = 1 movimiento registrado por la IA).

Hecha en Chile. Cancela cuando quieras.
```

**Category / Categoría:** `Finanzas` (Finance). *(Encaja con el enfoque personal.)*

**Correo de contacto:** `atikodigital@gmail.com`
**Sitio web:** `https://hash.atikodigital.cl`

**URL Política de privacidad:** `https://hash.atikodigital.cl/privacidad.html`

### Gráficos — ✅ LISTOS en `docs/play-assets/`
- [x] **Ícono** 512×512 → `docs/play-assets/icon-512.png`
- [x] **Gráfico destacado (Feature graphic)** 1024×500 → `docs/play-assets/feature-graphic-1024x500.png`
- [x] **Capturas de teléfono** (1080×1920, 4, enfoque PERSONAL): `screenshot-1-foto.png` (anota gastos por foto), `screenshot-2-balance.png` (cuánto te queda del mes), `screenshot-3-kaly.png` (KALY por voz), `screenshot-4-sueldo.png` (sueldo vs gastos)
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
