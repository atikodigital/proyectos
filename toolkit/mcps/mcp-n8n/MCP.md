# MCP: n8n self-hosted

**Tipo:** MCP custom (servidor wrapper de n8n API)
**PropÃ³sito:** Permite a Claude listar, crear, editar, ejecutar y monitorear flujos de n8n directamente â€” el motor de las automatizaciones que vendes a clientes
**Esfuerzo de implementaciÃ³n:** ~3-4 horas
**Costo operacional:** USD $6/mes (servidor DigitalOcean)

## Por quÃ© este MCP

Cuando vendas automatizaciones (voucherâ†’Sheets, cobranza, etc.) vas a tener N flujos corriendo en n8n. Sin este MCP, gestionarlos significa:
- Abrir n8n en el navegador
- Buscar el flow correcto
- Ver logs manualmente
- Re-ejecutar fallos manualmente

Con este MCP, Claude puede:
- "MuÃ©strame los errores de las Ãºltimas 24h en todos los clientes"
- "Re-ejecuta el flow X con este input"
- "Crea un nuevo flow para el cliente Y basado en el template Z"
- "CuÃ¡ntas ejecuciones del flow voucher-restaurante-X tuvimos este mes?"

## Setup del servidor n8n

### 1. Crear droplet DigitalOcean

- Tier: Basic regular SSD
- vCPU: 1
- RAM: 2GB (1GB tambiÃ©n funciona, 2GB es safer)
- Storage: 50GB
- OS: Ubuntu 22.04
- Datacenter: NYC3 (mÃ¡s cercano a Chile en tÃ©rminos de latencia)
- Costo: USD $12/mes (o $6 con 1GB RAM)

### 2. Conectar por SSH y configurar

```bash
ssh root@<ip-droplet>

# Update
apt update && apt upgrade -y

# Instalar Docker + Docker Compose
apt install docker.io docker-compose -y
systemctl enable docker

# Crear carpeta n8n
mkdir -p /opt/n8n
cd /opt/n8n
```

### 3. Docker Compose para n8n + PostgreSQL

`docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: <CAMBIA_ESTO>
      POSTGRES_DB: n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -h localhost -U n8n -d n8n']
      interval: 5s
      timeout: 5s
      retries: 10

  n8n:
    image: n8nio/n8n:latest
    restart: always
    ports:
      - "5678:5678"
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: <SAME_AS_POSTGRES>
      N8N_BASIC_AUTH_ACTIVE: "true"
      N8N_BASIC_AUTH_USER: jose
      N8N_BASIC_AUTH_PASSWORD: <PASSWORD_FUERTE>
      N8N_HOST: automations.atikodigital.cl
      N8N_PROTOCOL: https
      WEBHOOK_URL: https://automations.atikodigital.cl/
      GENERIC_TIMEZONE: America/Santiago
      N8N_ENCRYPTION_KEY: <random_32_chars>
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
  n8n_data:
```

```bash
docker-compose up -d
```

### 4. Configurar dominio + SSL con Caddy

`/etc/caddy/Caddyfile`:

```
automations.atikodigital.cl {
  reverse_proxy localhost:5678
}
```

```bash
apt install caddy
systemctl reload caddy
```

Configurar DNS A record en Cloudflare apuntando `automations.atikodigital.cl` al IP del droplet.

### 5. Login en n8n

- Abrir https://automations.atikodigital.cl
- Usuario: jose / Password: el que pusiste en docker-compose
- Setup inicial: crear cuenta admin

### 6. Habilitar API de n8n

n8n viene con API REST en `/api/v1`. DocumentaciÃ³n: [docs.n8n.io/api](https://docs.n8n.io/api/)

Settings â†’ API â†’ Generate API Key â†’ guardar para usar en el MCP wrapper.

## ConstrucciÃ³n del MCP wrapper

Un MCP es un servidor que expone tools a Claude vÃ­a protocolo MCP. Para n8n:

### 1. Estructura del proyecto

```bash
mkdir mcp-n8n-atiko
cd mcp-n8n-atiko
npm init -y
npm install @modelcontextprotocol/sdk axios dotenv
```

### 2. `mcp-n8n.js`

```javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import "dotenv/config";

const N8N_URL = process.env.N8N_URL; // https://automations.atikodigital.cl/api/v1
const N8N_API_KEY = process.env.N8N_API_KEY;

const client = axios.create({
  baseURL: N8N_URL,
  headers: { "X-N8N-API-KEY": N8N_API_KEY }
});

const server = new Server(
  { name: "n8n-atiko", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Lista de tools que expongo a Claude
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "n8n_list_workflows",
      description: "Lista todos los workflows en n8n. Ãštil para ver quÃ© automatizaciones estÃ¡n corriendo por cada cliente.",
      inputSchema: {
        type: "object",
        properties: {
          active: { type: "boolean", description: "Filtrar solo activos" }
        }
      }
    },
    {
      name: "n8n_get_workflow",
      description: "Obtiene un workflow especÃ­fico por ID con todos sus nodos y conexiones.",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string" }
        },
        required: ["workflowId"]
      }
    },
    {
      name: "n8n_list_executions",
      description: "Lista las ejecuciones recientes de uno o todos los workflows. Ãštil para ver errores.",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string" },
          status: { type: "string", enum: ["success", "error", "running", "waiting"] },
          limit: { type: "number", default: 20 }
        }
      }
    },
    {
      name: "n8n_get_execution",
      description: "Obtiene el detalle de una ejecuciÃ³n especÃ­fica incluyendo el output de cada nodo y errores.",
      inputSchema: {
        type: "object",
        properties: {
          executionId: { type: "string" }
        },
        required: ["executionId"]
      }
    },
    {
      name: "n8n_execute_workflow",
      description: "Ejecuta un workflow manualmente con datos de entrada opcionales.",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string" },
          data: { type: "object", description: "Datos a pasar al workflow" }
        },
        required: ["workflowId"]
      }
    },
    {
      name: "n8n_create_workflow",
      description: "Crea un nuevo workflow a partir de una definiciÃ³n JSON.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          nodes: { type: "array" },
          connections: { type: "object" },
          active: { type: "boolean", default: false }
        },
        required: ["name", "nodes", "connections"]
      }
    },
    {
      name: "n8n_update_workflow",
      description: "Actualiza un workflow existente.",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string" },
          updates: { type: "object" }
        },
        required: ["workflowId", "updates"]
      }
    },
    {
      name: "n8n_activate_workflow",
      description: "Activa o desactiva un workflow.",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string" },
          active: { type: "boolean" }
        },
        required: ["workflowId", "active"]
      }
    },
    {
      name: "n8n_clone_workflow",
      description: "Clona un workflow existente con un nuevo nombre. Ãštil para usar templates para clientes nuevos.",
      inputSchema: {
        type: "object",
        properties: {
          sourceWorkflowId: { type: "string" },
          newName: { type: "string" }
        },
        required: ["sourceWorkflowId", "newName"]
      }
    },
    {
      name: "n8n_workflow_metrics",
      description: "Obtiene mÃ©tricas agregadas de un workflow: ejecuciones totales, exitosas, fallidas, tiempo promedio.",
      inputSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string" },
          days: { type: "number", default: 30 }
        },
        required: ["workflowId"]
      }
    }
  ]
}));

// ImplementaciÃ³n de cada tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "n8n_list_workflows": {
      const params = args.active !== undefined ? `?active=${args.active}` : "";
      const res = await client.get(`/workflows${params}`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(res.data.data.map(w => ({
            id: w.id,
            name: w.name,
            active: w.active,
            updatedAt: w.updatedAt
          })), null, 2)
        }]
      };
    }

    case "n8n_get_workflow": {
      const res = await client.get(`/workflows/${args.workflowId}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }

    case "n8n_list_executions": {
      const params = new URLSearchParams();
      if (args.workflowId) params.append("workflowId", args.workflowId);
      if (args.status) params.append("status", args.status);
      params.append("limit", args.limit || 20);
      const res = await client.get(`/executions?${params}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data.data, null, 2) }] };
    }

    case "n8n_execute_workflow": {
      const res = await client.post(`/workflows/${args.workflowId}/execute`, { data: args.data || {} });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }

    case "n8n_workflow_metrics": {
      const since = new Date(Date.now() - (args.days * 86400000)).toISOString();
      const res = await client.get(`/executions?workflowId=${args.workflowId}&startedAfter=${since}&limit=250`);
      const executions = res.data.data;
      const total = executions.length;
      const success = executions.filter(e => e.finished && !e.stoppedAt).length;
      const failed = executions.filter(e => e.stoppedAt && e.data?.resultData?.error).length;
      const avgTime = executions.reduce((sum, e) => {
        const start = new Date(e.startedAt).getTime();
        const stop = e.stoppedAt ? new Date(e.stoppedAt).getTime() : start;
        return sum + (stop - start);
      }, 0) / total;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            workflowId: args.workflowId,
            period: `${args.days} dÃ­as`,
            total,
            success,
            failed,
            successRate: total > 0 ? (success / total * 100).toFixed(2) + "%" : "N/A",
            avgExecutionTimeMs: Math.round(avgTime)
          }, null, 2)
        }]
      };
    }

    // ... implementar el resto de tools de manera similar
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 3. Conectar a Claude

En el archivo de config de Claude (Claude Code o Claude Desktop):

```json
{
  "mcpServers": {
    "n8n-atiko": {
      "command": "node",
      "args": ["/path/to/mcp-n8n-atiko/mcp-n8n.js"],
      "env": {
        "N8N_URL": "https://automations.atikodigital.cl/api/v1",
        "N8N_API_KEY": "<tu_api_key>"
      }
    }
  }
}
```

Reiniciar Claude y los tools `n8n_*` aparecen disponibles.

## Casos de uso con Claude

Una vez instalado el MCP, podrÃ¡s pedirle a Claude cosas como:

### "MuÃ©strame los errores de las Ãºltimas 24h"

Claude ejecutarÃ¡:
```
n8n_list_executions({status: "error", limit: 50})
```
Y te darÃ¡ un reporte tipo:
```
3 errores en Ãºltimas 24h:
- Workflow "voucher-restaurante-x" Â· ejec 4523 Â· 14:32 Â· Error: Anthropic 429 rate limit
- Workflow "cobranza-clinica-y" Â· ejec 4520 Â· 09:11 Â· Error: Twilio number suspended
- Workflow "leads-atiko" Â· ejec 4501 Â· 02:45 Â· Error: Google Sheets quota exceeded
```

### "Health check semanal de todos los clientes"

Claude usarÃ¡ `n8n_workflow_metrics` para cada workflow y entregarÃ¡ dashboard.

### "Crea un nuevo flow para el cliente X igual al de Y"

Claude usarÃ¡ `n8n_clone_workflow` y luego `n8n_update_workflow` para ajustar las credenciales.

## Seguridad

- âœ… API Key con scope mÃ­nimo (solo lectura para queries, escritura solo para tools especÃ­ficos)
- âœ… Servidor n8n con HTTPS obligatorio
- âœ… Backup diario de PostgreSQL a S3/Backblaze
- âœ… Firewall: solo puertos 80, 443, 22 abiertos
- âœ… Fail2ban activo en SSH

## ROI del MCP

- **Tiempo ahorrado:** 30-60 min/semana de revisar n8n manualmente
- **Errores detectados antes:** Claude alerta cuando ve patrones (ej: "el flow X tiene 30% de fallos esta semana, antes era 2%")
- **Costo:** USD $6/mes (servidor) + 3-4h de implementaciÃ³n inicial

## PrÃ³ximas mejoras (V2)

- Tool `n8n_setup_voucher_to_sheets` que automatiza el setup completo de la skill `voucher-to-sheets` para un cliente nuevo en <5 min
- Tool `n8n_monthly_report` que genera el reporte mensual de automatizaciones de un cliente
- IntegraciÃ³n con `reporte-mensual-cliente` skill: las mÃ©tricas vienen del MCP automÃ¡ticamente

