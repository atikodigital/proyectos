---
name: reporte-mensual-cliente
description: Genera el reporte mensual de Atiko para enviar a cada cliente activo. Recoge mÃ©tricas del mes (visitas, conversaciones chatbot, leads, ROI ads, automatizaciones ejecutadas, ahorro de tiempo), las interpreta en lenguaje claro, propone acciÃ³n y exporta a PDF listo para enviar. Se activa con "reporte de [cliente]", "report mensual [empresa]", "reporte mes [X]", "necesito armar el reporte de [cliente]".
version: 1.0
author: Atiko
---

# Reporte Mensual Cliente â€” Skill

## CuÃ¡ndo usar esta skill

A fin de mes (dÃ­as 28-30) para cada cliente activo. Es la pieza que justifica la siguiente factura mensual.

Triggers:
- "reporte de [cliente]"
- "report mes [mes] [empresa]"
- "armar reporte mensual [X]"
- "genera reporte de [cliente] mes pasado"

## InformaciÃ³n requerida

Pedir antes de generar:

1. **Cliente** (nombre empresa)
2. **Plan contratado** (Start / Pro / 360Â°)
3. **PerÃ­odo del reporte** (mes/aÃ±o)
4. **MÃ©tricas crudas** del cliente â€” preguntar una por una:

### Para todos los planes
- Visitas al sitio web (total + por fuente: orgÃ¡nico / social / directo / ads)
- Mejor dÃ­a (con nÃºmero)
- Bounce rate %
- Tiempo promedio en sitio
- Top 5 pÃ¡ginas visitadas

### Si tiene chatbot (Plan Pro y 360Â°)
- Conversaciones del mes
- Leads generados desde chatbot
- Tasa de resoluciÃ³n sin intervenciÃ³n humana
- Top 3 preguntas frecuentes

### Si tiene automatizaciones activas
- CuÃ¡ntas automatizaciones corrieron
- CuÃ¡ntas ejecuciones exitosas
- CuÃ¡ntos errores (y motivo)
- Horas ahorradas estimadas

### Si tiene marketing (Plan 360Â°)
- Spend Meta Ads y Google Ads
- Impresiones, clicks, CTR
- Conversiones / leads generados
- Costo por lead (CPL)
- ROI estimado

## Estructura del reporte

```markdown
# Reporte Atiko Â· [Empresa] Â· [Mes AÃ±o]

**Cliente:** [Empresa]
**PerÃ­odo:** 1 al [Ãºltimo dÃ­a] de [mes] de [aÃ±o]
**Plan vigente:** Atiko [plan]
**Preparado por:** Agencia Atiko Â· Santiago, Chile

---

## TL;DR Â· Resumen ejecutivo en 3 lÃ­neas

[3 lÃ­neas mÃ¡ximo, en lenguaje del cliente, NO tÃ©cnico]

> Ejemplo: "Este mes recibiste 1.247 visitas (+18% vs mes pasado). Tu chatbot resolviÃ³ 89 conversaciones, generando 23 leads cualificados. La automatizaciÃ³n de vouchers te ahorrÃ³ 38 horas, equivalentes a $190.000 en costo operativo."

---

## 1. Tu sitio web Â· Visibilidad

### Visitas
- **Total mes:** [X] (vs [X] mes pasado Â· [+/-]%)
- **Mejor dÃ­a:** [fecha] con [X] visitas â€” [hipÃ³tesis del por quÃ©]
- **Fuentes principales:**
  - BÃºsqueda orgÃ¡nica: [X]% â€” [implicaciÃ³n]
  - Redes sociales: [X]%
  - Directo: [X]%
  - Ads pagados: [X]% (si aplica)
- **Bounce rate:** [X]% â€” [comparar con benchmark]
- **Tiempo promedio:** [X] min â€” [comparar con benchmark]

### Top pÃ¡ginas visitadas
1. [/ pÃ¡gina] â€” [X] visitas
2. [/ pÃ¡gina] â€” [X] visitas
3. [/ pÃ¡gina] â€” [X] visitas

### ðŸŸ¢ QuÃ© funcionÃ³
- [hallazgo positivo 1 en una lÃ­nea]
- [hallazgo positivo 2]

### ðŸŸ  QuÃ© hay que vigilar
- [hallazgo neutro o de atenciÃ³n]

### ðŸ”´ QuÃ© hay que arreglar
- [problema concreto identificado, si lo hay]

---

## 2. Tu chatbot WhatsApp Â· AtenciÃ³n automatizada
*(Si plan incluye chatbot)*

- **Conversaciones del mes:** [X]
- **Leads cualificados generados:** [X]
- **ResoluciÃ³n sin humano:** [X]% â€” [interpretaciÃ³n]
- **Horas que NO tuviste que estar en WhatsApp:** ~[X] horas

### Top preguntas frecuentes este mes
1. "[pregunta textual]" â€” [X] veces
2. "[pregunta textual]" â€” [X] veces
3. "[pregunta textual]" â€” [X] veces

### RecomendaciÃ³n
[1-2 lÃ­neas: si una pregunta sale mucho, sugerir mejorar el flujo del bot o crear nueva FAQ]

---

## 3. Tus automatizaciones Â· Trabajo que se hizo solo
*(Si plan incluye automatizaciones)*

### Automatizaciones activas: [X]

| AutomatizaciÃ³n | Ejecuciones | Exitosas | Errores | Horas ahorradas |
|----------------|-------------|----------|---------|------------------|
| [Nombre auto 1] | [X] | [X] | [X] | [X]h |
| [Nombre auto 2] | [X] | [X] | [X] | [X]h |
| **Total** | **[X]** | **[X]** | **[X]** | **[X]h** |

### ConversiÃ³n a CLP
**[X] horas Ã— $5.000 CLP/hora estÃ¡ndar = $[Y] CLP ahorrados este mes**

Equivalente a [Z] meses del costo de tu plan Atiko.

### Errores y soluciones
[Si hubo errores, listar y explicar quÃ© se hizo]

---

## 4. Marketing Digital Â· Plata invertida vs plata generada
*(Solo Plan 360Â°)*

### Meta Ads (Facebook + Instagram)
- **Spend:** $[X] CLP
- **Impresiones:** [X]
- **Clicks:** [X] Â· **CTR:** [X]%
- **Leads:** [X] Â· **CPL:** $[Y] CLP por lead
- **Conversiones ventas (declaradas):** [X]
- **ROI estimado:** [+/- X%]

### Google Ads
[Misma estructura]

### Redes sociales orgÃ¡nicas
- Posts publicados: [X]
- Mejor post: [link/descripciÃ³n] â€” [engagement]
- Crecimiento seguidores: [+X]

---

## 5. Tu inversiÃ³n en Atiko este mes

| Concepto | Costo |
|----------|-------|
| Plan [nombre] | $[monto] CLP |
| Add-ons (si aplica) | $[monto] |
| **Total facturado** | **$[monto] CLP** |

### Valor entregado este mes
- Horas ahorradas: [X]h Ã— $5.000 = $[A] CLP
- Leads cualificados generados: [X] Ã— $[valor lead estimado] = $[B] CLP
- (Otros beneficios cuantificables)
- **Valor estimado total: $[C] CLP**

**Tu mÃºltiplo de retorno este mes: [C/factura]x**

---

## 6. Plan de acciÃ³n Â· PrÃ³ximo mes

### Cosas que YA voy a hacer (incluidas en tu plan)
- [ ] [acciÃ³n 1 especÃ­fica]
- [ ] [acciÃ³n 2]
- [ ] [acciÃ³n 3]

### Recomendaciones que tÃº deberÃ­as validar
- ðŸ’¡ [recomendaciÃ³n que requiere su input â€” ej: "Mejorar la pÃ¡gina de servicios con mÃ¡s casos"]
- ðŸ’¡ [recomendaciÃ³n 2]

### Oportunidades (opcional, requieren decisiÃ³n)
- ðŸš€ [add-on sugerido â€” ej: "Sumar automatizaciÃ³n de cobranza, ROI estimado $XXX/mes"]

---

## 7. Algo personal

[1-2 lÃ­neas humanas: agradecimiento, observaciÃ³n, comentario relevante para el cliente]

Ejemplo:
> "Felicitaciones por el aumento en visitas â€” vi que el post del 12 funcionÃ³ muy bien. Si quieres replicar esa fÃ³rmula, te paso 3 ideas similares la prÃ³xima semana."

---

*Â¿Dudas sobre algÃºn nÃºmero? RespÃ³ndeme este mensaje o llÃ¡mame al WhatsApp.*

**JosÃ© Antonio OlguÃ­n Â· Agencia Atiko**
+56 9 2713 0792 Â· atikodigital.cl
```

## CÃ¡lculos automÃ¡ticos

- **ComparaciÃ³n mes anterior:** ((mes actual - mes anterior) / mes anterior) Ã— 100 = %
- **Horas ahorradas â†’ CLP:** horas Ã— $5.000 (tarifa base pyme chilena)
- **Valor entregado / factura:** total beneficios / monto facturado = mÃºltiplo X

## Tono del reporte

- **Idioma del cliente:** sin tecnicismos. "Conversaciones" no "interacciones". "Vio tu sitio" no "sesiÃ³n Ãºnica".
- **Storytelling sobre datos:** cada nÃºmero viene con un "quÃ© significa"
- **AcciÃ³n siempre clara:** el cliente termina sabiendo quÃ© hace Ã©l y quÃ© hace Atiko
- **Cortar lo que no agrega valor:** si el chatbot tuvo 3 conversaciones, no hagas 2 pÃ¡ginas sobre eso

## Plantilla de envÃ­o

Cuando estÃ© listo el PDF, generar este mensaje:

```
Hola [Nombre],

AcÃ¡ va tu reporte de [mes].

ðŸ“ˆ Highlights:
- [highlight 1 en 1 lÃ­nea]
- [highlight 2 en 1 lÃ­nea]
- [highlight 3 en 1 lÃ­nea]

ðŸŽ¯ Para discutir en nuestra prÃ³xima reuniÃ³n:
- [punto 1 que requiere su input]

ðŸ“Ž Adjunto: reporte-atiko-[empresa]-[mes].pdf

Â¿Conversamos esta semana? Te dejo agenda ðŸ‘‰ cal.com/atiko-jose

Saludos,
JosÃ©
```

## CuÃ¡ndo generar el reporte

- DÃ­as 28-30 del mes (antes del Ãºltimo dÃ­a)
- Antes de facturar el mes siguiente (importante: factura DESPUÃ‰S de mandar reporte = mejor recepciÃ³n)
- Si el cliente reporta problema mid-mes: generar mini-reporte ad-hoc

## DespuÃ©s de generar

1. Guardar PDF en `03-Clientes/[Empresa]/06-Reportes-mensuales/reporte-[YYYY-MM].pdf`
2. Guardar el .md fuente al lado
3. Crear tarea en CRM: "Enviar reporte a [cliente] Â· [fecha]"
4. Agendar follow-up a 7 dÃ­as: "Â¿revisÃ³ el reporte? Â¿alguna duda?"
5. Si NO es plan 360Â°, ofrecer al cliente la posibilidad de discusiÃ³n de 30 min â€” convierte a mayor retenciÃ³n

