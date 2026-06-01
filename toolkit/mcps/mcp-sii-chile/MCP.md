# MCP: SII Chile (Documentos Tributarios Electrónicos)

**Tipo:** MCP custom (wrapper de API de proveedor habilitado SII)
**Propósito:** Permite a Claude emitir facturas, boletas, notas de crédito y consultar estado del SII automáticamente, sin que tengas que entrar al portal cada vez
**Esfuerzo de implementación:** ~8-12 horas
**Costo operacional:** USD $20-50/mes (según proveedor + volumen)

## Por qué este MCP

Cuando Atiko tenga 5+ clientes recurrentes:
- Emisión manual = 5 min × cliente × mes = 25 min/mes solo emitiendo
- + tiempo de re-emisión si hay error
- + tiempo de archivo y registro
- + tiempo de seguimiento si cliente no recibe

Con este MCP, Claude:
- "Emite factura mensual a todos los clientes activos"
- "Reemite la factura X corrigiendo el RUT"
- "Genera nota de crédito por el monto Y al cliente Z"
- "Cuáles facturas están vencidas y no pagadas?"
- "Cuánto IVA debe Atiko al SII este mes?"

## El SII no tiene API pública directa

⚠️ **Importante:** El SII de Chile NO ofrece API REST pública para emisión directa. Para automatizar, necesitas un proveedor habilitado por el SII como intermediario.

### Proveedores habilitados (elegir uno)

| Proveedor | Costo aprox | Mejor para |
|-----------|-------------|------------|
| **Acepta.cl** | USD $20/mes + por documento | Más conocido, buena documentación |
| **Haulmer (Bsale/Openfactura)** | CLP $9.990/mes plan básico | Más barato, API moderna |
| **DTECloud** | Variable | Más técnico, más opciones |
| **Toteat (orientado a restaurantes)** | Caro | Solo si nicho es HORECA |

**Recomendación para Atiko:** **Haulmer / OpenFactura** — más económico, API REST moderna, buena documentación.

## Setup con OpenFactura (Haulmer)

### 1. Registrarse

- Crear cuenta en [openfactura.cl](https://www.openfactura.cl) o [haulmer.com](https://www.haulmer.com)
- Plan recomendado: "API Empresarial" (~CLP $25.000/mes incluye API + 100 docs)
- Activar para tu RUT empresa o persona

### 2. Generar API key

- Dashboard → API → Generate token
- Anotar en gestor de contraseñas

### 3. Configurar empresa emisora

- Datos del giro (los que tienes en SII)
- Folios autorizados (los provee el SII gratis)
- Firma electrónica avanzada (Acepta o e-Token según corresponda)

## Construcción del MCP wrapper

### Estructura

```bash
mkdir mcp-sii-chile
cd mcp-sii-chile
npm init -y
npm install @modelcontextprotocol/sdk axios dotenv
```

### `mcp-sii.js` (estructura principal)

```javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import "dotenv/config";

const OF_BASE = "https://api.haulmer.com/openfactura/v1";
const OF_TOKEN = process.env.OPENFACTURA_TOKEN;
const EMISOR_RUT = process.env.EMISOR_RUT; // tu RUT empresa

const of = axios.create({
  baseURL: OF_BASE,
  headers: { "apikey": OF_TOKEN, "Content-Type": "application/json" }
});

const server = new Server(
  { name: "sii-chile", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "sii_emit_factura",
      description: "Emite una factura electrónica afecta a IVA (DTE tipo 33). Para clientes empresa con RUT.",
      inputSchema: {
        type: "object",
        properties: {
          receptor: {
            type: "object",
            properties: {
              rut: { type: "string", description: "RUT cliente formato 12345678-9" },
              razonSocial: { type: "string" },
              giro: { type: "string" },
              direccion: { type: "string" },
              comuna: { type: "string" },
              email: { type: "string" }
            },
            required: ["rut", "razonSocial", "giro", "direccion", "comuna"]
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                descripcion: { type: "string" },
                cantidad: { type: "number" },
                precioUnitarioNeto: { type: "number", description: "Precio neto sin IVA" }
              },
              required: ["descripcion", "cantidad", "precioUnitarioNeto"]
            }
          },
          formaPago: { type: "string", enum: ["contado", "credito"] },
          observaciones: { type: "string", description: "Notas adicionales que aparecen en la factura" }
        },
        required: ["receptor", "items"]
      }
    },
    {
      name: "sii_emit_boleta",
      description: "Emite una boleta electrónica (DTE tipo 39) para consumidor final persona natural.",
      inputSchema: {
        type: "object",
        properties: {
          items: { type: "array" },
          rutReceptor: { type: "string", description: "Opcional. Si lo agrega, sale en la boleta" }
        }
      }
    },
    {
      name: "sii_emit_nota_credito",
      description: "Emite nota de crédito (DTE tipo 61) para anular o reducir monto de factura previa.",
      inputSchema: {
        type: "object",
        properties: {
          facturaReferencia: { type: "string", description: "Folio de la factura a corregir" },
          motivo: { type: "string", enum: ["anula", "corrige_monto", "corrige_texto"] },
          montoNeto: { type: "number" }
        },
        required: ["facturaReferencia", "motivo"]
      }
    },
    {
      name: "sii_get_documento",
      description: "Obtiene PDF y XML de un DTE emitido por su folio.",
      inputSchema: {
        type: "object",
        properties: {
          folio: { type: "string" },
          tipo: { type: "number", description: "33=Factura, 39=Boleta, 61=Nota Crédito" }
        },
        required: ["folio", "tipo"]
      }
    },
    {
      name: "sii_list_documentos_emitidos",
      description: "Lista DTEs emitidos en un período.",
      inputSchema: {
        type: "object",
        properties: {
          desde: { type: "string", description: "YYYY-MM-DD" },
          hasta: { type: "string", description: "YYYY-MM-DD" },
          tipo: { type: "number" }
        },
        required: ["desde", "hasta"]
      }
    },
    {
      name: "sii_iva_mensual",
      description: "Calcula el IVA débito (a pagar) y crédito (recuperable) del mes para preparar F29.",
      inputSchema: {
        type: "object",
        properties: {
          mes: { type: "number", minimum: 1, maximum: 12 },
          year: { type: "number" }
        },
        required: ["mes", "year"]
      }
    },
    {
      name: "sii_consultar_rut",
      description: "Verifica si un RUT está activo y autorizado en SII, devuelve razón social y giro.",
      inputSchema: {
        type: "object",
        properties: {
          rut: { type: "string" }
        },
        required: ["rut"]
      }
    }
  ]
}));

// Implementación
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "sii_emit_factura": {
      // Calcular totales
      const subtotalNeto = args.items.reduce((s, i) => s + (i.cantidad * i.precioUnitarioNeto), 0);
      const iva = Math.round(subtotalNeto * 0.19);
      const total = subtotalNeto + iva;

      const payload = {
        Encabezado: {
          IdDoc: { TipoDTE: 33, FchEmis: new Date().toISOString().split("T")[0] },
          Emisor: { RUTEmisor: EMISOR_RUT },
          Receptor: {
            RUTRecep: args.receptor.rut,
            RznSocRecep: args.receptor.razonSocial,
            GiroRecep: args.receptor.giro,
            DirRecep: args.receptor.direccion,
            CmnaRecep: args.receptor.comuna,
            CorreoRecep: args.receptor.email
          },
          Totales: { MntNeto: subtotalNeto, IVA: iva, MntTotal: total }
        },
        Detalle: args.items.map((item, idx) => ({
          NroLinDet: idx + 1,
          NmbItem: item.descripcion,
          QtyItem: item.cantidad,
          PrcItem: item.precioUnitarioNeto,
          MontoItem: item.cantidad * item.precioUnitarioNeto
        })),
        ...(args.observaciones && {
          Referencia: [{ TpoDocRef: "SET", FolioRef: "1", RazonRef: args.observaciones }]
        })
      };

      const res = await of.post("/dte/document", payload);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            folio: res.data.folio,
            tipo: 33,
            urlPdf: res.data.urlPdf,
            urlXml: res.data.urlXml,
            totales: { neto: subtotalNeto, iva, total },
            mensaje: `Factura ${res.data.folio} emitida correctamente. Total $${total.toLocaleString("es-CL")}`
          }, null, 2)
        }]
      };
    }

    case "sii_iva_mensual": {
      const desde = `${args.year}-${String(args.mes).padStart(2, "0")}-01`;
      const ultimoDia = new Date(args.year, args.mes, 0).getDate();
      const hasta = `${args.year}-${String(args.mes).padStart(2, "0")}-${ultimoDia}`;

      // Sumar IVA débito (facturas emitidas)
      const emitidas = await of.get(`/dte/list?from=${desde}&to=${hasta}&type=33`);
      const ivaDebito = emitidas.data.reduce((s, dte) => s + dte.iva, 0);

      // Sumar IVA crédito (facturas recibidas — gastos)
      const recibidas = await of.get(`/dte/received?from=${desde}&to=${hasta}`);
      const ivaCredito = recibidas.data.reduce((s, dte) => s + dte.iva, 0);

      const ivaPagar = Math.max(0, ivaDebito - ivaCredito);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            periodo: `${args.mes}/${args.year}`,
            ivaDebito,
            ivaCredito,
            ivaPagar,
            mensaje: `IVA a pagar al SII en F29: $${ivaPagar.toLocaleString("es-CL")} CLP. Vencimiento día 12 de ${args.mes + 1}/${args.year}.`
          }, null, 2)
        }]
      };
    }

    // ... resto de tools
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
    "sii-chile": {
      "command": "node",
      "args": ["/path/to/mcp-sii-chile/mcp-sii.js"],
      "env": {
        "OPENFACTURA_TOKEN": "<tu_token>",
        "EMISOR_RUT": "<tu_rut>"
      }
    }
  }
}
```

## Casos de uso con Claude

### "Emite factura mensual a todos los clientes activos"

Claude:
1. Lee CRM → 5 clientes con stage=customer
2. Por cada uno, ejecuta `sii_emit_factura` con sus datos
3. Genera resumen: "5 facturas emitidas, total facturado $X CLP, $Y IVA débito"

### "Cuánto IVA pago este mes al SII?"

Claude ejecuta `sii_iva_mensual` con el mes/año y entrega:
```
Período: 5/2026
IVA débito: $190.000
IVA crédito: $32.000
IVA a pagar el día 12: $158.000
```

### "Verifica RUT 76.123.456-7 antes de emitirle"

Claude usa `sii_consultar_rut` y devuelve:
```
✓ RUT activo
Razón social: Empresa XYZ Limitada
Giro: Servicios de restaurante
Habilitado para recibir factura electrónica: SÍ
```

## Manejo de errores SII

Errores comunes y cómo manejarlos en el MCP:

| Error SII | Causa | Acción del MCP |
|-----------|-------|----------------|
| `RUT_NO_AUTORIZADO` | Cliente no habilitado | Avisar a Claude: "Pide al cliente habilitar facturación electrónica primero" |
| `FOLIO_AGOTADO` | Folios CAF agotados | Auto-solicitar nuevos folios al SII via API |
| `IVA_INCORRECTO` | Cálculo IVA mal | Recalcular y reintentar |
| `FIRMA_INVALIDA` | Certificado vencido | Avisar a José: "Renueva certificado digital" |

## Calendario fiscal incorporado

El MCP debería tener un cron interno que:

- **Día 10 de cada mes:** ejecuta `sii_iva_mensual` y avisa a José por WhatsApp
- **Día 11:** recordatorio "Mañana vence F29"
- **Día 1:** ofrece ejecutar facturación mensual masiva

## Backup y conciliación

El MCP guarda en una base local SQLite:
- Cada DTE emitido (folio, RUT, monto, fecha, estado)
- Cada DTE recibido (gastos Atiko)
- Histórico para reportes y auditoría

## ROI del MCP

- **Tiempo ahorrado:** 30-45 min/mes (cuando tienes 5+ clientes)
- **Errores fiscales reducidos:** menos chance de equivocar IVA o RUT
- **Costo:** USD $25/mes (OpenFactura) + 8-12h implementación
- **Payback:** 2-3 meses de operación normal

## Cuándo construir este MCP

NO antes de tener al menos 3 clientes recurrentes pagando mensual. Si tienes 1 cliente, emitir manual desde SII gratis es más eficiente.

Trigger para construir: cuando emitas más de 5 documentos/mes y empiece a doler hacerlo a mano.
