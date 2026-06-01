---
name: cotizar-atiko
description: Genera una propuesta comercial personalizada para Atiko. Se activa cuando el usuario dice "cotiza", "cotizaciÃ³n para", "propuesta para", "cuÃ¡nto cobramos por", "arma propuesta", o describe un prospecto pidiendo precio. Usa el catÃ¡logo de planes Atiko (Start $89k, Pro $190k, 360Â° $390k) y el catÃ¡logo de automatizaciones para recomendar el plan correcto.
version: 1.0
author: Atiko
---

# Cotizar Atiko â€” Skill de generaciÃ³n de propuestas

## CuÃ¡ndo usar esta skill

Esta skill se invoca cuando JosÃ© (dueÃ±o de Atiko) necesita generar una propuesta comercial para un prospecto. Triggers tÃ­picos:

- "cotiza para [empresa/persona]"
- "arma propuesta para [empresa]"
- "cuÃ¡nto cobramos a [empresa]"
- "necesito cotizaciÃ³n para [cliente]"
- "respondo cotizaciÃ³n a [contacto]"

## InformaciÃ³n requerida (preguntar si falta)

Antes de generar, asegÃºrate de tener TODOS estos datos. Si falta alguno, pregunta al usuario:

1. **Nombre del prospecto** (persona) y **empresa**
2. **Sector / industria** (HORECA, Servicios Profesionales, E-commerce, Inmobiliaria, EducaciÃ³n, otro)
3. **TamaÃ±o** (empleados aprox o facturaciÃ³n mensual estimada)
4. **Dolor principal** identificado en discovery â€” 1-2 frases concretas
5. **Dolores secundarios** (opcional, mÃ¡x 2)
6. **Presupuesto declarado** (si el cliente lo mencionÃ³) o presupuesto que JosÃ© estima
7. **Urgencia** (cuÃ¡ndo quiere arrancar)
8. **CÃ³mo llegÃ³** (referido, instagram, web, ads, otro)

## CÃ³mo decidir quÃ© plan recomendar

Aplicar esta lÃ³gica de matching:

| Plan recomendado | CuÃ¡ndo |
|---|---|
| **Atiko Start â€” $89.000/mes** | Pyme de 1-5 empleados, presupuesto bajo (<$150k/mes), 1 dolor Ãºnico, "estÃ¡ empezando" |
| **Atiko Pro â€” $190.000/mes** (recomienda este por defecto) | Pyme 5-20 empleados, 2-3 dolores, busca crecer, presupuesto $150-300k/mes |
| **Atiko 360Â° â€” $390.000/mes** | Pyme 20+ empleados, dolores mÃºltiples, ya invierte en marketing, presupuesto >$400k/mes |
| **Add-on automatizaciÃ³n custom** | Cuando el dolor es muy especÃ­fico (voucherâ†’Sheets, cobranza, SII): aÃ±adir setup $290k-$590k + $19-59k/mes mantenciÃ³n al plan base |

## Estructura de la propuesta a generar

Genera un documento Markdown listo para convertir a PDF con esta estructura:

```markdown
# Propuesta Comercial â€” [Nombre Empresa]

**Para:** [Nombre contacto]
**Fecha:** [fecha actual en es-CL]
**Validez:** 15 dÃ­as corridos desde emisiÃ³n
**Preparado por:** Agencia Atiko Â· Santiago, Chile

---

## 1. Resumen ejecutivo

[Un pÃ¡rrafo de 3-4 lÃ­neas. Empezar con el dolor del cliente, no con "Atiko es...". Ejemplo: "Restaurante X invierte 3 horas diarias copiando vouchers de WhatsApp a Excel â€” son 90 horas al mes, equivalentes a $450.000 CLP en costo operativo. Esta propuesta detalla cÃ³mo eliminamos ese trabajo manual en 7 dÃ­as."]

## 2. DiagnÃ³stico

**Dolor principal:** [dolor 1 en concreto]
**Dolores secundarios:** [si aplica]
**Costo actual del problema:** [estimaciÃ³n en CLP/mes â€” calcular en base a horas Ã— $5.000/h]
**Costo en 6 meses si no se resuelve:** [costo Ã— 6]

## 3. SoluciÃ³n propuesta

### Plan recomendado: [ATIKO START / PRO / 360Â°]

[descripciÃ³n de quÃ© incluye el plan en 5-7 bullets, copiados textual del catÃ¡logo de planes Atiko]

### PersonalizaciÃ³n para [Empresa]

Adicionalmente a lo incluido en el plan, vamos a personalizar:
- [pieza personalizada 1 basada en el dolor]
- [pieza personalizada 2]
- [pieza personalizada 3]

## 4. Cronograma

| Semana | Entregable |
|---|---|
| 1 | Kickoff + descubrimiento + diseÃ±o |
| 2 | Desarrollo + chatbot + automatizaciones |
| 3 | Testing + lanzamiento + capacitaciÃ³n |
| 4 | Check-in + reporte mes 1 |

**Arranque comprometido:** lunes de la semana siguiente a firma del contrato.

## 5. InversiÃ³n

| Concepto | Costo |
|---|---|
| Plan [nombre] (suscripciÃ³n mensual) | $[monto] CLP/mes |
| [Si hay setup custom de automatizaciones] | $[monto] CLP (Ãºnico) |
| **Total primer mes** | **$[monto] CLP** |
| Mensualidades siguientes | $[monto] CLP/mes |

**Lo que NO incluye:** presupuesto publicitario (ad spend Meta/Google), licencias terceras (Cal.com Pro, plataformas SaaS especÃ­ficas si las requiere), iva/impuestos adicionales si emite factura.

## 6. Modalidad de pago

- **Primer mes:** 50% al firmar + 50% al lanzamiento (dÃ­a 14)
- **Meses siguientes:** facturado los dÃ­as 1 de cada mes vÃ­a Khipu
- **Permanencia:** [Sin permanencia / 3 meses / 6 meses segÃºn plan]
- **Forma de pago:** Transferencia bancaria, Khipu, Webpay (cuando estÃ© habilitado)

## 7. ROI estimado

Con esta soluciÃ³n, [Empresa] recupera la inversiÃ³n en **[X] meses** porque:

- Ahorro tiempo equipo: [X horas/mes Ã— $5.000] = $[monto] CLP/mes
- [Otro beneficio cuantificable, si aplica]

**Retorno neto en 12 meses:** $[monto] CLP (asumiendo no se contrata personal adicional).

## 8. PrÃ³ximos pasos

1. Tienes 15 dÃ­as para confirmar (validez de esta propuesta)
2. Si confirmas: te envÃ­o contrato digital para firmar
3. Coordinamos kickoff call (60 min) para empezar
4. Lanzamiento garantizado en 3 semanas

**Para confirmar o ajustar:** responde este mensaje, llama o escribe WhatsApp +56 9 2713 0792.

---

*Esta propuesta es confidencial. Toda la informaciÃ³n compartida estÃ¡ cubierta por NDA implÃ­cito.*

**JosÃ© Antonio OlguÃ­n**
Fundador Â· Agencia Atiko
atikodigital@gmail.com Â· atikodigital.cl
```

## CÃ¡lculos automÃ¡ticos a hacer

Cuando generes el documento, calcula automÃ¡ticamente:

- **Costo del dolor:** horas/dÃ­a Ã— dÃ­as laborales/mes (22) Ã— tarifa estimada ($5.000 CLP/h chileno standard) = costo CLP/mes
- **ROI meses:** costo total propuesta primer mes / ahorro CLP/mes = meses de payback
- **Retorno 12 meses:** (ahorro Ã— 12) - (inversiÃ³n 12 meses) = beneficio neto anual

## Tono de la propuesta

- **Directo y especÃ­fico** â€” no usar adjetivos vacÃ­os ("excelente", "innovador", "premium")
- **Foco en cliente** â€” empieza con TÃš tienes este problema, no con NOSOTROS hacemos esto
- **Cifras concretas** â€” todo dolor cuantificado, todo beneficio cuantificado
- **Sin tecnicismos** â€” no menciones "n8n", "API REST", "Webhook" en la propuesta (eso es interno)
- **AcciÃ³n clara** â€” el cliente debe terminar la lectura sabiendo quÃ© hacer (decir sÃ­, ajustar, decir no)

## DespuÃ©s de generar

1. Mostrar la propuesta en pantalla al usuario
2. Preguntar: "Â¿la guardo como `03-Clientes/[Empresa]/propuesta-v1.md`?"
3. Si confirma, escribir el archivo y ofrecer convertir a PDF
4. Recordar al usuario: "Anota en CRM/Notion: estado = Propuesta enviada, fecha = hoy + 5 dÃ­as para follow-up"

## Plantillas de mensaje de envÃ­o

Cuando el usuario pida cÃ³mo enviar la propuesta al cliente, ofrecer 3 plantillas:

### Plantilla WhatsApp (corta)

```
Hola [Nombre], como conversamos te dejo la propuesta.

Resumen: [Plan recomendado] por $[X]/mes para resolver [dolor].
Te ahorra [X horas/mes] = $[Y]/mes en costo operativo.

3 opciones:
1. Si tiene sentido, firmamos esta semana y arrancamos el lunes.
2. Si querÃ©s ajustar algo, agendamos 15 min.
3. Si no es el momento, estÃ¡ OK â€” avÃ­same.

Saludos,
JosÃ©
```

### Plantilla Email (formal)

```
Asunto: Propuesta Atiko para [Empresa] â€” [Plan]

[Nombre],

Adjunto la propuesta que conversamos. Resumen en una lÃ­nea: resolvemos [dolor] con [soluciÃ³n] por $[X]/mes, recuperando la inversiÃ³n en [Y] meses.

La propuesta tiene validez de 15 dÃ­as. Si querÃ©s profundizar algÃºn punto antes de decidir, agendamos 15-20 min cuando te acomode.

Quedo atento.

Saludos cordiales,
JosÃ© Antonio OlguÃ­n
Fundador Â· Agencia Atiko
+56 9 2713 0792 Â· atikodigital.cl
```

### Plantilla LinkedIn DM (informal-pro)

```
Hola [Nombre], te mandÃ© la propuesta por email/WhatsApp.

TL;DR: $[X]/mes, payback en [Y] meses, lanzamos en 3 semanas.

Cualquier duda, escribime por acÃ¡ o WhatsApp ðŸ‘‡
+56 9 2713 0792
```

## Errores a evitar

- âŒ No cotizar sin haber hecho discovery (preguntar antes si lo hubo)
- âŒ No prometer fechas imposibles (mÃ­nimo 3 semanas para entrega completa)
- âŒ No bajar del plan Start ($89k) â€” si el prospecto no califica para ese, decir educadamente "no es el momento"
- âŒ No incluir "descuento por amistad" automÃ¡tico â€” eso lo decide JosÃ© manualmente
- âŒ No usar "$" con punto decimal estilo US ($89.00) â€” usa CLP con punto miles ($89.000)

