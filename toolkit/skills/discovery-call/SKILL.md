---
name: discovery-call
description: Guía a José en una llamada de descubrimiento (discovery) con un prospecto. Proporciona guion de 10 preguntas, ayuda a anotar respuestas en tiempo real, identifica el dolor principal, y al final genera notas estructuradas listas para alimentar la skill cotizar-atiko. Se activa con "discovery con [empresa]", "tengo call con prospecto", "prepara discovery", "voy a llamar a [contacto]".
version: 1.0
author: Atiko
---

# Discovery Call — Skill de descubrimiento de prospecto

## Cuándo usar esta skill

Esta skill apoya a José en 3 momentos:

1. **Antes** de la llamada (preparación)
2. **Durante** la llamada (toma de notas en vivo)
3. **Después** de la llamada (estructuración para cotización)

Triggers:
- "discovery con [empresa]"
- "tengo call con [contacto]"
- "prepárame discovery"
- "voy a llamar a [prospecto]"
- "ayúdame con call de hoy a las [hora]"

## Información requerida

Antes de empezar, asegúrate de tener:

- **Nombre del prospecto** (persona y empresa)
- **Hora de la llamada**
- **Cómo llegó el lead** (referido, Instagram, web, ads, cold outreach)
- **Lo poco que sabes ya** (sector, lo que dijo en el mensaje inicial)

## Modo 1: PREPARACIÓN (antes de la llamada)

Cuando José pide "prepara discovery para [X]", entrega:

### A. Investigación previa rápida (10 min de trabajo)

Sugerirle revisar:
- [ ] **Web del prospecto** — qué hace, a quién atiende, qué calidad tiene el sitio
- [ ] **Instagram/LinkedIn del prospecto** — frecuencia de posts, engagement, estética
- [ ] **Google Maps** (si es local) — reseñas, fotos, horario
- [ ] **WhatsApp Business** (si lo tiene) — catálogo, respuesta automática
- [ ] **Anotar 3 hipótesis de dolor** antes de hablar (las vas a verificar en la llamada)

### B. Cosas a NO hacer en la llamada

- ❌ Cotizar precio (responder "te mando propuesta en 48h")
- ❌ Prometer fechas/funciones específicas
- ❌ Hablar más del 30% del tiempo (deja que el prospecto hable)
- ❌ Hacer asunciones sobre su presupuesto
- ❌ Mostrar 100 features (escucha primero el dolor)

### C. Setup pre-call

- [ ] Abrir documento de notas en limpio: `03-Clientes/[Empresa]/discovery-notes.md`
- [ ] Vaso de agua
- [ ] Audífonos
- [ ] Cámara on si es videollamada
- [ ] WhatsApp/email en mute por 30 min

## Modo 2: GUIÓN EN VIVO (durante la llamada)

Las 10 preguntas en orden estricto. NO saltar ni mezclar.

### Apertura (2 min)

> "Hola [Nombre], gracias por agendar. Para que el tiempo nos rinda, te explico cómo funciona esta llamada: 30 min, yo te hago preguntas para entender bien tu negocio, después decidimos si hay match para trabajar juntos. Si no hay match, perfecto, te digo y nos despedimos amigos. ¿Te parece?"

### Pregunta 1: Foto del negocio

> "Cuéntame en 2 frases qué hace [Empresa] y desde cuándo."

**Anotar:** años operando, sector exacto, tamaño aproximado.

### Pregunta 2: El cliente del cliente

> "¿Quién es tu cliente típico hoy? Si pudieras clonarlo, ¿cómo es?"

**Anotar:** segmento, frecuencia de compra, ticket promedio si lo menciona.

### Pregunta 3: Adquisición actual

> "¿Cómo te llegan hoy los clientes?"

**Anotar:** referidos %, redes %, web %, ads %, físico %. Si dice "no sé", anotar como ALERTA.

### Pregunta 4: El dolor real

> "Si pudiéramos resolver UNA cosa que hoy te quita tiempo o plata, ¿cuál sería?"

**Anotar EN TEXTUAL las palabras del cliente.** Esta es la pregunta más importante.

### Pregunta 5: Cuantificar el dolor

> "¿Cuánto tiempo te toma eso hoy? ¿O cuánta plata calculas que pierdes?"

**Anotar:** horas/semana, $/mes perdidos, cantidad de errores. Si no tiene número, ayúdalo a estimar.

### Pregunta 6: Intentos previos

> "¿Intentaste resolverlo antes? ¿Qué pasó?"

**Anotar:** qué intentó, por qué no funcionó. Esta info evita que repitas la misma propuesta fallida.

### Pregunta 7: Otros dolores

> "Además de eso, ¿hay otras 2 cosas que te tienen agobiado del día a día?"

**Anotar:** dolores 2 y 3. Limite es 3 dolores totales — no más.

### Pregunta 8: Visión futuro

> "Si esto se resuelve, ¿cómo cambia tu día a día? ¿Qué harías con el tiempo/plata que recuperás?"

**Anotar:** motivación profunda. Esto se usa en el resumen ejecutivo de la propuesta.

### Pregunta 9: Presupuesto

> "Para ser sincero contigo: ¿tienes un presupuesto en mente para esto? Aunque sea rango. Para no perder tu tiempo proponiéndote algo fuera de tu alcance."

**Anotar:** rango CLP/mes. Si dice "no sé", proponer rangos: "¿estás pensando en algo tipo $50k? $200k? $500k?"

### Pregunta 10: Decisión

> "Si te enviamos la propuesta y te convence, ¿de quién más depende decir que sí? ¿Y en qué plazo te gustaría tomar la decisión?"

**Anotar:** decisores (socio, contador, gerente), plazo (esta semana, este mes, sin urgencia).

### Cierre (2 min)

> "Excelente, gracias por la apertura. Lo que sigue: te mando propuesta personalizada en 48h hábiles. Adentro vas a encontrar el plan recomendado, inversión, cronograma y próximos pasos. ¿Te queda alguna pregunta antes de cortar?"

**NO cotizar precio acá.** Si el prospecto presiona, decir: "Te lo paso por escrito en la propuesta para que veas todo junto, así no se queda nada al aire."

## Modo 3: ESTRUCTURACIÓN (después de la llamada)

Cuando José termine la call y vuelva a Claude, recibir el dump bruto de notas y producir esta estructura:

```markdown
# Discovery: [Empresa] · [Nombre]
**Fecha:** [fecha]
**Duración:** [X min]
**Canal:** [WhatsApp / Zoom / Meet / Presencial]

## Snapshot
- **Sector:** [HORECA / Profesional / E-commerce / etc]
- **Tamaño:** [empleados o facturación]
- **Años operando:** [X]
- **Cómo llegó:** [referido / IG / web / ads]
- **Decisor:** [solo / + socio / + contador]
- **Plazo decisión:** [esta semana / este mes / sin urgencia]

## Dolor principal (textual)
> "[copia textual de pregunta 4]"

## Dolor cuantificado
- **Tiempo perdido:** [X horas/sem]
- **Costo estimado:** $[Y] CLP/mes
- **Equivalente 6 meses:** $[6Y] CLP

## Dolores secundarios
1. [dolor 2]
2. [dolor 3]

## Lo que intentó antes
[qué intentó y por qué no funcionó]

## Visión post-solución
[qué haría con el tiempo/plata recuperado]

## Presupuesto declarado
- **Rango:** $[X] - $[Y] CLP/mes
- **Comentario:** [si dijo algo relevante sobre presupuesto]

## Notas adicionales relevantes
[cualquier cosa que José anotó que no encaje en lo anterior]

## Plan recomendado (inicial)
- [Atiko Start / Pro / 360°]
- [Si necesita automatización custom, indicarlo]

## Próximos pasos
- [ ] Enviar propuesta antes de [fecha + 48h hábiles]
- [ ] Follow-up el [fecha + 5 días si no responde]
- [ ] Estado CRM: "Propuesta pendiente"

## Score del lead (1-10)
**[X]/10** — [breve justificación]

Criterios:
- ¿Tiene presupuesto? (+2)
- ¿Reconoce el dolor? (+2)
- ¿Es el decisor? (+2)
- ¿Hay urgencia? (+2)
- ¿Encaja en nicho prioritario? (+2)
```

## Después de generar el resumen

1. Guardar como `03-Clientes/[Empresa]/discovery-notes.md`
2. Si el score es ≥7: ofrecer inmediatamente: "¿genero la propuesta con `cotizar-atiko`?"
3. Si el score es 4-6: sugerir un follow-up call con preguntas adicionales
4. Si el score es <4: sugerir archivar — no es buen fit ahora

## Indicadores de "ESTE LEAD ES ORO" 🟢

Si en la call detectas 3 o más de estos, el lead es altísima prioridad:

- Dijo un costo $/mes concreto del dolor
- El dolor es uno de los del catálogo de automatizaciones (voucher, cobranza, SII, agendamiento)
- Decisor único (no necesita pedir permiso)
- Plazo "esta semana" o "este mes"
- Mencionó que ya pagó por intentarlo antes
- Tiene 5-20 empleados (pyme calza con Atiko)
- Sector HORECA o Servicios Profesionales

## Indicadores de "CUIDADO, ESTE LEAD VA A SER PROBLEMA" 🔴

Si detectas 2 o más, advertirle a José ANTES de cotizar:

- "Quiero algo barato porque es para empezar nomás"
- "Tengo a otra agencia cotizando, mándame algo rápido"
- "¿Cuánto cobras por todo?" (no quiere proceso, quiere precio chamuyado)
- Hace cambios constantes en lo que pide durante la call
- No responde claramente quién decide
- Dice "no tengo presupuesto pensado" 3 veces
- Se compara con freelancer junior ($70k landing) repetidamente

En ese caso, decirle a José: **"Lead amarillo. Recomiendo subir un escalón el precio o filtrarlo con condiciones (50% adelanto, contrato firmado antes de cualquier diseño)."**
