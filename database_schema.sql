-- 001-initial.sql
-- Esquema inicial de base de datos para Atiko Platform en Supabase (PostgreSQL)

-- Clientes (cada pyme contratante)
CREATE TABLE IF NOT EXISTS clients (
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

-- Catálogo de módulos disponibles
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,  -- ej: 'voucher-to-sheets'
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  min_plan TEXT NOT NULL,
  version TEXT DEFAULT '1.0.0',
  config_schema JSONB,  -- JSON Schema de configuración
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automatizaciones activas por cliente
CREATE TABLE IF NOT EXISTS client_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id),
  config JSONB DEFAULT '{}',  -- Config específica del cliente
  enabled BOOLEAN DEFAULT TRUE,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, module_id)
);

-- Registro de ejecuciones
CREATE TABLE IF NOT EXISTS executions (
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

CREATE INDEX IF NOT EXISTS idx_executions_client_module ON executions(client_id, module_id);
CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at DESC);

-- Métricas pre-calculadas (para dashboard rápido)
CREATE TABLE IF NOT EXISTS client_metrics_daily (
  client_id UUID REFERENCES clients(id),
  date DATE,
  module_id TEXT,
  executions_total INT DEFAULT 0,
  executions_success INT DEFAULT 0,
  executions_failed INT DEFAULT 0,
  hours_saved NUMERIC DEFAULT 0,  -- estimación
  PRIMARY KEY (client_id, date, module_id)
);

-- API Keys para webhooks (cada cliente tiene su key)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,  -- bcrypt hash
  name TEXT,  -- ej: "Production WhatsApp"
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Habilitar RLS Policies (Row Level Security)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS: Cliente solo ve sus propios datos
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
