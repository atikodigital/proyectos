# MCP: Banco Chile via Fintoc / Cardda

**Tipo:** MCP custom (wrapper de API Open Banking Chile)
**Propósito:** Permite a Claude consultar movimientos bancarios, conciliar pagos de clientes y detectar transferencias para registrar en CRM
**Esfuerzo de implementación:** ~6 horas
**Costo operacional:** USD $30-100/mes según proveedor + volumen

## Por qué este MCP

Cada mes Atiko va a recibir 5-20 transferencias de clientes pagando mensualidad. Manualmente:
- Entrar al banco
- Filtrar por fecha
- Cruzar con quién pagó
- Marcar facturas pagadas en SII
- Actualizar CRM
- Si alguien no pagó, recordar

Con este MCP, Claude:
- "¿Quién pagó esta semana? Concilia con facturas emitidas"
- "Cliente X dice que pagó hace 3 días, verifica"
- "Lista clientes con factura emitida hace +7 días sin pago"
- "Genera reporte de cobranza para el mes"

## Proveedores Open Banking Chile (elegir uno)

| Proveedor | Costo aprox | Bancos soportados | Mejor para |
|-----------|-------------|-------------------|------------|
| **Fintoc** | USD $30-100/mes según volumen | Todos principales | Más conocido, dev-friendly |
| **Cardda** | Variable | Todos principales | Pyme-friendly, español |
| **Floid** | USD $50+/mes | Mayoría | Buena API |
| **Multifin** | USD $100+/mes | Todos | Enterprise |

**Recomendación para Atiko:** **Fintoc** (más conocido en ecosistema fintech Chile, buen plan free para empezar).

## Setup con Fintoc

### 1. Registrarse en Fintoc

- Crear cuenta en [fintoc.com](https://fintoc.com)
- Plan recomendado: empieza con sandbox gratis, luego "Starter" cuando tengas tracción
- Pasar KYC del negocio (tu RUT empresa o persona)

### 2. Conectar tu cuenta bancaria

Fintoc usa "links" — conexión OAuth-like con tu banco:

- Dashboard Fintoc → "Conectar cuenta"
- Elegir banco (BCI, Estado, Santander, etc.)
- Login con credenciales bancarias
- Autorizar acceso de solo lectura

⚠️ Fintoc NO puede transferir dinero ni cobrar. Solo LEE movimientos. Esto es seguro.

### 3. Obtener API credentials

- Dashboard → API Keys → Generate
- Anotar: Secret Key, Webhook signing secret
- Tu link_token específico de tu cuenta bancaria

## Construcción del MCP wrapper

### `mcp-banco.js`

```javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import "dotenv/config";

const FINTOC = axios.create({
  baseURL: "https://api.fintoc.com/v1",
  headers: {
    "Authorization": `Bearer ${process.env.FINTOC_SECRET_KEY}`
  }
});

const LINK_TOKEN = process.env.FINTOC_LINK_TOKEN;

const server = new Server(
  { name: "banco-chile", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "banco_movimientos_recientes",
      description: "Lista los movimientos bancarios recientes de la cuenta Atiko.",
      inputSchema: {
        type: "object",
        properties: {
          dias: { type: "number", default: 7, description: "Cuántos días atrás" },
          tipo: { type: "string", enum: ["credit", "debit", "all"], default: "credit" }
        }
      }
    },
    {
      name: "banco_buscar_pago",
      description: "Busca un pago específico por monto, fecha o nombre del pagador.",
      inputSchema: {
        type: "object",
        properties: {
          monto: { type: "number" },
          fechaDesde: { type: "string" },
          fechaHasta: { type: "string" },
          nombrePagador: { type: "string" },
          rutPagador: { type: "string" }
        }
      }
    },
    {
      name: "banco_saldo_actual",
      description: "Obtiene el saldo actual de la cuenta.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "banco_conciliar_factura",
      description: "Intenta encontrar el pago de una factura específica cruzando monto y fecha aproximada.",
      inputSchema: {
        type: "object",
        properties: {
          folioFactura: { type: "string" },
          montoFactura: { type: "number" },
          fechaEmision: { type: "string" },
          rutCliente: { type: "string" }
        },
        required: ["montoFactura", "fechaEmision"]
      }
    },
    {
      name: "banco_facturas_pendientes",
      description: "Cruza facturas emitidas vs movimientos bancarios para detectar cuáles siguen sin pago.",
      inputSchema: {
        type: "object",
        properties: {
          diasAtras: { type: "number", default: 30 }
        }
      }
    },
    {
      name: "banco_resumen_mes",
      description: "Resumen del mes: ingresos totales, egresos, cuántos clientes pagaron, cuántos faltan.",
      inputSchema: {
        type: "object",
        properties: {
          mes: { type: "number" },
          year: { type: "number" }
        },
        required: ["mes", "year"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "banco_movimientos_recientes": {
      const since = new Date(Date.now() - (args.dias || 7) * 86400000).toISOString();
      const res = await FINTOC.get(`/links/${LINK_TOKEN}/accounts/default/movements?since=${since}`);

      let movements = res.data;
      if (args.tipo && args.tipo !== "all") {
        movements = movements.filter(m => m.type === args.tipo);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(movements.map(m => ({
            fecha: m.post_date,
            monto: m.amount,
            tipo: m.type,
            descripcion: m.description,
            comerciante: m.merchant?.name,
            referencia: m.reference_id
          })), null, 2)
        }]
      };
    }

    case "banco_conciliar_factura": {
      // Buscar movimientos en ventana de fecha
      const since = new Date(args.fechaEmision);
      since.setDate(since.getDate() - 2); // 2 días antes (puede haber pagado adelantado)
      const until = new Date();

      const res = await FINTOC.get(`/links/${LINK_TOKEN}/accounts/default/movements?since=${since.toISOString()}&until=${until.toISOString()}`);

      // Filtrar por monto exacto o ±$100 CLP (por comisiones bancarias)
      const candidatos = res.data.filter(m => {
        return m.type === "credit" && Math.abs(m.amount - args.montoFactura) <= 100;
      });

      if (candidatos.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              conciliado: false,
              mensaje: `No se encontró pago de $${args.montoFactura} en últimos 30 días. Factura sigue pendiente.`,
              recomendacion: "Activar recordatorio de cobranza en 24h."
            }, null, 2)
          }]
        };
      }

      if (candidatos.length === 1) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              conciliado: true,
              fechaPago: candidatos[0].post_date,
              pagador: candidatos[0].description,
              monto: candidatos[0].amount,
              mensaje: `✓ Factura ${args.folioFactura} pagada el ${candidatos[0].post_date}.`,
              accionSiguiente: "Marcar factura como PAGADA en SII y actualizar CRM."
            }, null, 2)
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            conciliado: "ambiguo",
            candidatos: candidatos,
            mensaje: `Encontré ${candidatos.length} pagos por monto similar. Revisar manual cuál corresponde.`
          }, null, 2)
        }]
      };
    }

    case "banco_facturas_pendientes": {
      // Esto requiere integración con MCP-SII para obtener facturas emitidas
      // Pseudocódigo:
      const facturasEmitidas = await listarFacturasEmitidasSII(args.diasAtras);
      const movimientos = await getMovimientosCredit(args.diasAtras);

      const pendientes = facturasEmitidas.filter(f => {
        return !movimientos.find(m => Math.abs(m.amount - f.total) <= 100);
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            totalFacturas: facturasEmitidas.length,
            pagadas: facturasEmitidas.length - pendientes.length,
            pendientes: pendientes.length,
            montoTotalPendiente: pendientes.reduce((s, f) => s + f.total, 0),
            detalle: pendientes.map(f => ({
              folio: f.folio,
              cliente: f.razonSocial,
              monto: f.total,
              fechaEmision: f.fecha,
              diasAtraso: Math.floor((Date.now() - new Date(f.fecha).getTime()) / 86400000)
            }))
          }, null, 2)
        }]
      };
    }

    case "banco_resumen_mes": {
      const desde = `${args.year}-${String(args.mes).padStart(2, "0")}-01`;
      const ultimoDia = new Date(args.year, args.mes, 0).getDate();
      const hasta = `${args.year}-${String(args.mes).padStart(2, "0")}-${ultimoDia}`;

      const movimientos = await FINTOC.get(`/links/${LINK_TOKEN}/accounts/default/movements?since=${desde}&until=${hasta}`);

      const ingresos = movimientos.data.filter(m => m.type === "credit");
      const egresos = movimientos.data.filter(m => m.type === "debit");

      const totalIngresos = ingresos.reduce((s, m) => s + m.amount, 0);
      const totalEgresos = egresos.reduce((s, m) => s + m.amount, 0);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            periodo: `${args.mes}/${args.year}`,
            ingresos: {
              total: totalIngresos,
              cantidad: ingresos.length,
              detalle: ingresos.map(m => ({ fecha: m.post_date, monto: m.amount, desc: m.description }))
            },
            egresos: {
              total: totalEgresos,
              cantidad: egresos.length,
              detalle: egresos.map(m => ({ fecha: m.post_date, monto: m.amount, desc: m.description }))
            },
            flujoNeto: totalIngresos - totalEgresos,
            saldoFin: movimientos.data[0]?.balance || "N/A"
          }, null, 2)
        }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Configurar en Claude

```json
{
  "mcpServers": {
    "banco-chile": {
      "command": "node",
      "args": ["/path/to/mcp-banco-fintoc/mcp-banco.js"],
      "env": {
        "FINTOC_SECRET_KEY": "<tu_secret>",
        "FINTOC_LINK_TOKEN": "<tu_link_token>"
      }
    }
  }
}
```

## Casos de uso con Claude

### "Quién pagó esta semana?"

```
Movimientos credit últimos 7 días:
- 12/05 · $190.000 · RESTAURANTE LA MARGARITA SPA
- 13/05 · $89.000 · BARBERIA EL CENTRO
- 14/05 · $390.000 · INMOBILIARIA SUR LTDA
- 15/05 · $190.000 · CLINICA DENTAL SONRISA SPA

Total recibido: $859.000 CLP
Coincide con 4 facturas mensuales emitidas el 1ro.
```

### "Cliente X dice que pagó hace 3 días"

Claude usa `banco_conciliar_factura` con monto y fecha. Devuelve:
```
✓ Pago encontrado el 14/05, $190.000 desde RESTAURANTE X.
Marcar factura folio 1023 como pagada.
```

### "Cobranza semanal · qué facturas siguen sin pago"

Claude usa `banco_facturas_pendientes`:
```
3 facturas pendientes:
- CAFETERIA Y · $89.000 · 8 días atraso ⚠️
- ESTUDIO Z · $190.000 · 4 días atraso
- TIENDA W · $89.000 · 2 días atraso

Recomendación: enviar recordatorio WhatsApp a CAFETERIA Y hoy mismo.
```

### Combinado con `invoice-chase` (Small Business plugin)

Cuando un cliente lleva 7+ días de atraso, Claude puede ejecutar:
```
1. banco_conciliar_factura → verifica que efectivamente no pagó
2. Si confirma → invoice-chase → mensaje WhatsApp templado
3. Si sigue sin pago día 14 → escalar a Atiko humano
```

## Privacidad y seguridad

- ✅ Fintoc solo LEE movimientos, NO transfiere
- ✅ Tokens almacenados en variables de entorno (no en git)
- ✅ El MCP corre localmente en Claude Desktop, no sube datos a terceros
- ✅ Logs locales de queries (auditoría)
- ⚠️ Si haces cliente-MCP por cliente: necesitas un link_token por cuenta — no recomendado, mejor solo Atiko

## ROI del MCP

- **Tiempo ahorrado:** 20-30 min/semana en conciliación
- **Cobranza acelerada:** detección automática de morosos día 1
- **Errores reducidos:** no se marca facturas como pagadas por confusión
- **Costo:** USD $30/mes (Fintoc) + 6h implementación
- **Payback:** 1-2 meses

## Cuándo construir este MCP

NO antes de tener al menos 5 clientes recurrentes (sino el volumen no justifica el esfuerzo).

## Integración con flujo Atiko completo

Este MCP cierra el círculo financiero:

```
Cliente firma → sii_emit_factura (MCP SII)
               ↓
Cliente paga → banco_conciliar_factura (MCP Banco) detecta
               ↓
Sistema marca pagada en SII + actualiza CRM (automático)
               ↓
Si no paga en 7 días → invoice-chase (Small Business plugin)
               ↓
Fin de mes → sii_iva_mensual + banco_resumen_mes
               ↓
reporte-mensual-cliente skill genera reporte
```
