# ðŸ—ï¸ Estructura del repo `atiko-platform`

**Repo:** github.com/[tu-usuario]/atiko-platform (privado)
**Stack:** Node.js 20 + TypeScript 5 + Fastify 5 + Supabase + pnpm workspaces
**Por quÃ© este stack:** rÃ¡pido, escalable, type-safe, multi-tenant nativo, deploy 1-click a Fly.io

---

## ðŸ“ Estructura completa

```
atiko-platform/
â”‚
â”œâ”€â”€ apps/
â”‚   â”œâ”€â”€ api/                          # Backend Fastify Â· puerto 3000
â”‚   â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”‚   â”œâ”€â”€ index.ts              # Entry point
â”‚   â”‚   â”‚   â”œâ”€â”€ server.ts             # Setup Fastify
â”‚   â”‚   â”‚   â”œâ”€â”€ routes/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ health.ts         # GET /health
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ webhooks.ts       # POST /api/v1/hooks/:client/:module
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ clients.ts        # CRUD clientes
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ modules.ts        # Listar/configurar mÃ³dulos
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ metrics.ts        # Dashboard data
â”‚   â”‚   â”‚   â”œâ”€â”€ middleware/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ auth.ts           # Verifica JWT Supabase
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ tenant.ts         # Resuelve cliente activo
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ rateLimit.ts      # Rate limiting por cliente
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ logger.ts         # Logging unificado
â”‚   â”‚   â”‚   â””â”€â”€ plugins/
â”‚   â”‚   â”‚       â””â”€â”€ supabase.ts       # Supabase client
â”‚   â”‚   â”œâ”€â”€ tests/
â”‚   â”‚   â”œâ”€â”€ package.json
â”‚   â”‚   â””â”€â”€ tsconfig.json
â”‚   â”‚
â”‚   â”œâ”€â”€ dashboard/                    # Next.js 15 Â· panel.atikodigital.cl
â”‚   â”‚   â”œâ”€â”€ app/
â”‚   â”‚   â”‚   â”œâ”€â”€ (auth)/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ login/
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ signup/
â”‚   â”‚   â”‚   â”œâ”€â”€ (dashboard)/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ page.tsx          # Overview con mÃ©tricas
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ automatizaciones/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ logs/
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ settings/
â”‚   â”‚   â”‚   â””â”€â”€ layout.tsx
â”‚   â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ lib/
â”‚   â”‚   â”œâ”€â”€ package.json
â”‚   â”‚   â””â”€â”€ next.config.ts
â”‚   â”‚
â”‚   â””â”€â”€ worker/                       # Cron jobs + tareas async
â”‚       â”œâ”€â”€ src/
â”‚       â”‚   â”œâ”€â”€ index.ts
â”‚       â”‚   â””â”€â”€ jobs/
â”‚       â”‚       â”œâ”€â”€ cobranza-vencidos.ts
â”‚       â”‚       â”œâ”€â”€ reportes-mensuales.ts
â”‚       â”‚       â””â”€â”€ reminders.ts
â”‚       â””â”€â”€ package.json
â”‚
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ core/                         # Tipos compartidos + schema
â”‚   â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”‚   â”œâ”€â”€ types/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ client.ts
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ module.ts
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ execution.ts
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ index.ts
â”‚   â”‚   â”‚   â”œâ”€â”€ schema/               # Migraciones Supabase
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ 001-initial.sql
â”‚   â”‚   â”‚   â””â”€â”€ constants.ts
â”‚   â”‚   â””â”€â”€ package.json
â”‚   â”‚
â”‚   â”œâ”€â”€ modules/                      # Cada automatizaciÃ³n = 1 paquete
â”‚   â”‚   â”œâ”€â”€ voucher-to-sheets/
â”‚   â”‚   â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ index.ts          # Export del mÃ³dulo
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ handler.ts        # LÃ³gica principal
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ ocr.ts            # Llama a Claude Vision
â”‚   â”‚   â”‚   â”‚   â”œâ”€â”€ sheets.ts         # Append a Google Sheets
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ confirm.ts        # Responde por WhatsApp
â”‚   â”‚   â”‚   â”œâ”€â”€ tests/
â”‚   â”‚   â”‚   â”œâ”€â”€ README.md             # Docs del mÃ³dulo
â”‚   â”‚   â”‚   â””â”€â”€ package.json
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ cobranza-whatsapp/
â”‚   â”‚   â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”‚   â”œâ”€â”€ tests/
â”‚   â”‚   â”‚   â””â”€â”€ package.json
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ boletas-sii/
â”‚   â”‚   â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”‚   â”œâ”€â”€ tests/
â”‚   â”‚   â”‚   â””â”€â”€ package.json
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ agendamiento-whatsapp/
â”‚   â”‚   â”‚   â””â”€â”€ ...
â”‚   â”‚   â”‚
â”‚   â”‚   â”œâ”€â”€ agente-ia-conversacional/
â”‚   â”‚   â”‚   â””â”€â”€ ...
â”‚   â”‚   â”‚
â”‚   â”‚   â””â”€â”€ ... (un folder por automatizaciÃ³n del catÃ¡logo)
â”‚   â”‚
â”‚   â”œâ”€â”€ integrations/                 # Wrappers de APIs externas
â”‚   â”‚   â”œâ”€â”€ twilio/
â”‚   â”‚   â”‚   â””â”€â”€ src/index.ts          # Cliente WhatsApp Business
â”‚   â”‚   â”œâ”€â”€ anthropic/
â”‚   â”‚   â”‚   â””â”€â”€ src/index.ts          # Claude API + Vision
â”‚   â”‚   â”œâ”€â”€ openai/
â”‚   â”‚   â”‚   â””â”€â”€ src/index.ts
â”‚   â”‚   â”œâ”€â”€ google-sheets/
â”‚   â”‚   â”‚   â””â”€â”€ src/index.ts
â”‚   â”‚   â”œâ”€â”€ google-calendar/
â”‚   â”‚   â”‚   â””â”€â”€ src/index.ts
â”‚   â”‚   â”œâ”€â”€ openfactura/               # SII Chile
â”‚   â”‚   â”‚   â””â”€â”€ src/index.ts
â”‚   â”‚   â”œâ”€â”€ haulmer/                   # SII Chile alt
â”‚   â”‚   â”‚   â””â”€â”€ src/index.ts
â”‚   â”‚   â”œâ”€â”€ fintoc/                    # Banca chilena
â”‚   â”‚   â”‚   â””â”€â”€ src/index.ts
â”‚   â”‚   â””â”€â”€ supabase/
â”‚   â”‚       â””â”€â”€ src/index.ts
â”‚   â”‚
â”‚   â””â”€â”€ ui/                           # Componentes compartidos dashboard
â”‚       â”œâ”€â”€ src/
â”‚       â”‚   â”œâ”€â”€ components/
â”‚       â”‚   â””â”€â”€ styles/
â”‚       â””â”€â”€ package.json
â”‚
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ ARCHITECTURE.md               # Decisiones tÃ©cnicas
â”‚   â”œâ”€â”€ DEPLOYMENT.md                 # CÃ³mo deployar
â”‚   â”œâ”€â”€ ADD-NEW-CLIENT.md             # Onboarding nuevo cliente
â”‚   â”œâ”€â”€ ADD-NEW-MODULE.md             # CÃ³mo crear mÃ³dulo nuevo
â”‚   â””â”€â”€ SECURITY.md
â”‚
â”œâ”€â”€ scripts/
â”‚   â”œâ”€â”€ setup.sh                      # Setup inicial dev
â”‚   â”œâ”€â”€ seed-db.ts                    # Seed para desarrollo
â”‚   â””â”€â”€ new-module.ts                 # Generador de mÃ³dulo nuevo
â”‚
â”œâ”€â”€ .github/
â”‚   â””â”€â”€ workflows/
â”‚       â”œâ”€â”€ test.yml                  # CI: tests on every PR
â”‚       â””â”€â”€ deploy.yml                # CD: deploy on main
â”‚
â”œâ”€â”€ .env.example                      # Plantilla de variables
â”œâ”€â”€ .gitignore
â”œâ”€â”€ .nvmrc                            # Node 20
â”œâ”€â”€ package.json                      # Root workspace
â”œâ”€â”€ pnpm-workspace.yaml
â”œâ”€â”€ tsconfig.base.json
â”œâ”€â”€ README.md
â””â”€â”€ fly.toml                          # Config Fly.io
```

---

## ðŸ—„ï¸ Schema de base de datos (Supabase / PostgreSQL)

```sql
-- 001-initial.sql

-- Clientes (cada pyme contratante)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rut TEXT,
  email TEXT NOT NULL,
  whatsapp TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('start', 'pro', '360')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CatÃ¡logo de mÃ³dulos disponibles
CREATE TABLE modules (
  id TEXT PRIMARY KEY,  -- ej: 'voucher-to-sheets'
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  min_plan TEXT NOT NULL,
  version TEXT DEFAULT '1.0.0',
  config_schema JSONB,  -- JSON Schema de configuraciÃ³n
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automatizaciones activas por cliente
CREATE TABLE client_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id),
  config JSONB DEFAULT '{}',  -- Config especÃ­fica del cliente
  enabled BOOLEAN DEFAULT TRUE,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, module_id)
);

-- Registro de ejecuciones
CREATE TABLE executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  module_id TEXT REFERENCES modules(id),
  trigger_source TEXT,  -- 'webhook', 'cron', 'manual'
  status TEXT CHECK (status IN ('running', 'success', 'failed')),
  input JSONB,
  output JSONB,
  error TEXT,
  duration_ms INT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_executions_client_module ON executions(client_id, module_id);
CREATE INDEX idx_executions_started_at ON executions(started_at DESC);

-- MÃ©tricas pre-calculadas (para dashboard rÃ¡pido)
CREATE TABLE client_metrics_daily (
  client_id UUID REFERENCES clients(id),
  date DATE,
  module_id TEXT,
  executions_total INT DEFAULT 0,
  executions_success INT DEFAULT 0,
  executions_failed INT DEFAULT 0,
  hours_saved NUMERIC DEFAULT 0,  -- estimaciÃ³n
  PRIMARY KEY (client_id, date, module_id)
);

-- API Keys para webhooks (cada cliente tiene su key)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,  -- bcrypt hash
  name TEXT,  -- ej: "Production WhatsApp"
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- RLS Policies (Row Level Security)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

-- Cliente solo ve sus propios datos
CREATE POLICY "clients_own_data" ON clients
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "client_modules_own" ON client_modules
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE auth.uid()::text = id::text)
  );

CREATE POLICY "executions_own" ON executions
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE auth.uid()::text = id::text)
  );
```

---

## ðŸ“¦ Variables de entorno (`.env.example`)

```bash
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx  # Solo backend

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL_DEFAULT=claude-haiku-4-5

# OpenAI (opcional)
OPENAI_API_KEY=sk-xxxxx

# Twilio (WhatsApp Business)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Google (Sheets, Calendar, Drive)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=https://api.atikodigital.cl/oauth/google/callback

# OpenFactura (SII Chile)
OPENFACTURA_API_KEY=xxxxx
OPENFACTURA_ENV=production

# Fintoc (banca Chile)
FINTOC_SECRET_KEY=sk_live_xxxxx
FINTOC_PUBLIC_KEY=pk_live_xxxxx

# Webhook security
WEBHOOK_SECRET_SALT=random-string-here

# Frontend dashboard
DASHBOARD_URL=https://panel.atikodigital.cl
```

---

## ðŸ§© AnatomÃ­a de un mÃ³dulo (ejemplo: `voucher-to-sheets`)

```typescript
// packages/modules/voucher-to-sheets/src/index.ts

import { AtikoModule, ModuleContext } from '@atiko/core';
import { extractVoucherData } from './ocr';
import { appendToSheet } from './sheets';
import { confirmToClient } from './confirm';

export const voucherToSheetsModule: AtikoModule = {
  id: 'voucher-to-sheets',
  name: 'Voucher WhatsApp â†’ Google Sheets',
  category: 'pagos',
  minPlan: 'start',
  version: '1.0.0',

  configSchema: {
    type: 'object',
    required: ['sheetId', 'whatsappNumber'],
    properties: {
      sheetId: { type: 'string', description: 'ID del Google Sheet' },
      whatsappNumber: { type: 'string', description: 'WhatsApp del negocio' },
      worksheetName: { type: 'string', default: 'Pagos' },
      confirmTemplate: { type: 'string' },
    },
  },

  async handle(ctx: ModuleContext, input: VoucherInput) {
    const { config, client, log, integrations } = ctx;

    // 1. Validar input
    if (!input.imageUrl) {
      throw new Error('No image URL provided');
    }

    // 2. Extraer datos con Claude Vision
    const voucherData = await extractVoucherData({
      imageUrl: input.imageUrl,
      anthropic: integrations.anthropic,
      log,
    });

    if (!voucherData.isValid) {
      // Pedirle al cliente que reenvÃ­e
      await integrations.twilio.sendMessage({
        to: input.from,
        body: 'No pude leer tu comprobante. Â¿PodrÃ­as reenviarlo con mejor iluminaciÃ³n?',
      });
      return { status: 'invalid_voucher' };
    }

    // 3. Validar duplicado
    const isDuplicate = await checkDuplicate({
      sheetId: config.sheetId,
      operationNumber: voucherData.numero_operacion,
      integrations,
    });

    if (isDuplicate) {
      await integrations.twilio.sendMessage({
        to: input.from,
        body: 'Este pago ya estÃ¡ registrado. Â¡Gracias!',
      });
      return { status: 'duplicate' };
    }

    // 4. Append a Sheets
    await appendToSheet({
      sheetId: config.sheetId,
      worksheetName: config.worksheetName || 'Pagos',
      row: {
        timestamp: new Date().toISOString(),
        monto: voucherData.monto,
        fecha: voucherData.fecha,
        banco: voucherData.banco_origen,
        rut: voucherData.rut_depositante,
        nombre: voucherData.nombre_depositante,
        numero_operacion: voucherData.numero_operacion,
      },
      integrations,
    });

    // 5. Confirmar al cliente
    await confirmToClient({
      to: input.from,
      voucherData,
      template: config.confirmTemplate,
      integrations,
    });

    return {
      status: 'success',
      data: voucherData,
      hoursSaved: 0.05, // ~3 minutos manuales
    };
  },
};
```

---

## ðŸš€ README.md del repo

```markdown
# Atiko Platform

Backend + dashboard de Atiko Â· agencia de IA y automatizaciÃ³n para pymes chilenas.

## Stack

- Node.js 20 + TypeScript 5
- Fastify 5 (API)
- Next.js 15 (dashboard)
- Supabase (PostgreSQL + Auth)
- Fly.io (hosting)

## Quick start

```bash
# Clonar
git clone https://github.com/atiko/atiko-platform.git
cd atiko-platform

# Instalar (requiere pnpm 9+ y Node 20)
pnpm install

# Setup Supabase local (Docker)
pnpm db:up
pnpm db:migrate

# Variables de entorno
cp .env.example .env.local
# Editar .env.local con tus keys

# Dev
pnpm dev
# API â†’ http://localhost:3000
# Dashboard â†’ http://localhost:3001
```

## Estructura

Ver `docs/ARCHITECTURE.md`.

## Crear un mÃ³dulo nuevo

```bash
pnpm new:module mi-modulo-nuevo
```

Ver `docs/ADD-NEW-MODULE.md`.

## Deploy

```bash
fly deploy --app atiko-api
```

Ver `docs/DEPLOYMENT.md`.

## Tests

```bash
pnpm test
```

## License

UNLICENSED Â· Propiedad de Agencia Atiko
```

---

## ðŸ“‹ Checklist para crear el repo HOY

Cuando tengas dominio + GitHub + cuentas, hacemos esto:

1. [ ] Crear repo `atiko-platform` en GitHub (privado)
2. [ ] `git clone` localmente
3. [ ] Yo te entrego (en sesiÃ³n nuestra):
   - `package.json` root
   - `pnpm-workspace.yaml`
   - `tsconfig.base.json`
   - `apps/api/` con servidor base + health check + auth middleware
   - `packages/core/` con tipos
   - `.env.example` completo
   - `docs/ARCHITECTURE.md`
4. [ ] Vos hacÃ©s:
   - `pnpm install`
   - `pnpm dev` â†’ ver que corre localmente
   - Crear proyecto Supabase (gratis)
   - Aplicar migraciones
5. [ ] Test: `curl http://localhost:3000/health` debe devolver `{"status":"ok"}`

Esto te toma **2-3 horas** la primera vez (mucha de la cual es esperar instalaciones).

---

## ðŸ” Cuentas que necesitÃ¡s crear (orden recomendado)

1. **GitHub** (gratis) â€” necesaria sÃ­ o sÃ­
2. **Supabase** (free tier) â€” DB y auth
3. **Fly.io** (gratis hasta cierto uso) â€” hosting backend
4. **Anthropic** ([console.anthropic.com](https://console.anthropic.com)) â€” Claude API Â· agregÃ¡s USD $20 de crÃ©dito inicial
5. **Twilio** ([twilio.com](https://twilio.com)) â€” WhatsApp Business Â· te dan USD $15 crÃ©dito al registrarte
6. **Google Cloud** ([console.cloud.google.com](https://console.cloud.google.com)) â€” APIs Sheets/Calendar/Drive (gratis)
7. **OpenFactura** ([openfactura.cl](https://openfactura.cl)) â€” SII Chile Â· pago cuando primer cliente
8. **Fintoc** ([fintoc.com](https://fintoc.com)) â€” banca Â· pago cuando primer cliente que lo necesite

---

**PrÃ³ximo paso:** cuando tengas dominio comprado + GitHub + Gmail Atiko + Supabase free tier, avisame y arrancamos a llenar el repo en sesiones de 1-2 horas.

