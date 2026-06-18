CREATE TABLE IF NOT EXISTS companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  rut          text,
  wa_phone_number_id text UNIQUE,
  wa_token     text,
  owner_nombre text,
  owner_whatsapp text,
  resumen_frecuencia text NOT NULL DEFAULT 'mensual',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  phone        text,
  usuario      text,
  password_hash text,
  rol          text NOT NULL DEFAULT 'empleado',
  activo       boolean NOT NULL DEFAULT true,
  agent_prefs  jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  wa_message_id text,
  foto_path    text,
  canal        text NOT NULL DEFAULT 'app',
  tipo_documento text,
  rut_emisor   text,
  proveedor    text,
  folio        text,
  direccion_emisor text,
  fecha        date,
  neto         bigint NOT NULL DEFAULT 0,
  iva          bigint NOT NULL DEFAULT 0,
  total        bigint NOT NULL DEFAULT 0,
  moneda       text NOT NULL DEFAULT 'CLP',
  categoria    text,
  cuenta_sii_codigo text,
  cuenta_sii_nombre text,
  glosa        text,
  estado       text NOT NULL DEFAULT 'pendiente_confirmacion',
  tipo         text NOT NULL DEFAULT 'gasto',
  nro_operacion text,
  image_hash   text,
  estado_pago  text NOT NULL DEFAULT 'registrada',
  dedup_override boolean NOT NULL DEFAULT false,
  wa_sender_name text,
  wa_sender_phone text,
  raw_ocr      jsonb,
  confianza    int,
  created_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  email        text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  rol          text NOT NULL DEFAULT 'owner',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_estado ON expenses(estado);

CREATE TABLE IF NOT EXISTS kaly_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'hecho',
  contenido text NOT NULL,
  origen text NOT NULL DEFAULT 'kaly',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
