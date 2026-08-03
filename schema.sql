-- VAPMS database schema (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================== USERS ==============================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  emp_id TEXT UNIQUE NOT NULL,
  department TEXT,
  designation TEXT,
  email TEXT,
  mobile TEXT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'System Administrator','Contractor/User','Safety','Plant HOD',
    'Traffic Marshal','Security HOD','Security Supervisor','Gate Operator'
  )),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================== MASTERS ==============================
CREATE TABLE IF NOT EXISTS masters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('department','contractor','company','vehicle_type')),
  value TEXT NOT NULL,
  UNIQUE (type, value)
);

-- ============================== DRIVERS ==============================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  father_name TEXT,
  mobile TEXT NOT NULL,
  aadhaar TEXT,
  blood_group TEXT,
  contractor TEXT,
  company TEXT,
  address TEXT,
  emergency_contact TEXT,
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Sent Back','Approved','Rejected')),
  current_stage INT NOT NULL DEFAULT 0,
  blacklisted BOOLEAN NOT NULL DEFAULT false,
  blacklist_reason TEXT,
  blacklist_by UUID REFERENCES users(id),
  blacklist_date DATE,
  blacklist_remarks TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'Driving Licence','Medical Certificate','Gate Pass','Driver Assessment','VDSS Training Certificate'
  )),
  number TEXT,
  issue_date DATE,
  expiry_date DATE,
  file_path TEXT,
  UNIQUE (driver_id, doc_type)
);

-- ============================== VEHICLES ==============================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT UNIQUE NOT NULL,
  vehicle_type TEXT NOT NULL,
  company TEXT,
  contractor TEXT,
  owner_name TEXT,
  department TEXT,
  purpose TEXT,
  gps_installed BOOLEAN DEFAULT false,
  photo_path TEXT,
  assigned_driver_id UUID REFERENCES drivers(id),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Sent Back','Approved','Rejected')),
  current_stage INT NOT NULL DEFAULT 0,
  blocked BOOLEAN NOT NULL DEFAULT false,
  block_reason TEXT,
  block_by UUID REFERENCES users(id),
  block_date DATE,
  block_remarks TEXT,
  pass_number TEXT UNIQUE,
  pass_issue_date DATE,
  pass_valid_till DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'RC','Insurance','PUC','Fitness Certificate','Permit','Safety Checklist','Service Record','GPS Certificate'
  )),
  number TEXT,
  issue_date DATE,
  expiry_date DATE,
  file_path TEXT,
  UNIQUE (vehicle_id, doc_type)
);

-- ============================== APPROVALS ==============================
CREATE TABLE IF NOT EXISTS approval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('vehicle','driver')),
  entity_id UUID NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('Safety','Plant HOD','Traffic Marshal','Security HOD')),
  action TEXT NOT NULL CHECK (action IN ('Approved','Rejected','Sent Back')),
  by_user UUID REFERENCES users(id),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_log_entity ON approval_log(entity_type, entity_id);

-- ============================== GATE / QR ==============================
CREATE TABLE IF NOT EXISTS entry_exit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Entry','Exit')),
  gate TEXT DEFAULT 'Gate 1',
  by_user UUID REFERENCES users(id),
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('Valid','Expired','Blocked','Invalid')),
  by_user UUID REFERENCES users(id),
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================== AUDIT ==============================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  by_user UUID REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================== NOTIFICATIONS ==============================
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('Email','SMS','Dashboard')),
  recipient TEXT,
  subject TEXT,
  body TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Sent','Failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================== SEQUENCES ==============================
CREATE SEQUENCE IF NOT EXISTS pass_number_seq START 1;

CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_number ON vehicles(vehicle_number);
