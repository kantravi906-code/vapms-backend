const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const { VEHICLE_DOC_TYPES } = require("../utils/constants");
const { logAudit } = require("../utils/audit");

const router = express.Router();
router.use(requireAuth);

async function attachDocuments(vehicle) {
  const { rows } = await pool.query(`SELECT doc_type, number, issue_date, expiry_date, file_path FROM vehicle_documents WHERE vehicle_id = $1`, [vehicle.id]);
  vehicle.documents = {};
  rows.forEach((d) => { vehicle.documents[d.doc_type] = { number: d.number, issueDate: d.issue_date, expiryDate: d.expiry_date, filePath: d.file_path }; });
  return vehicle;
}

const VEHICLE_SELECT = `
  SELECT v.*, d.name AS driver_name, d.emergency_contact, d.blacklisted AS driver_blacklisted,
         bu.name AS block_by_name
  FROM vehicles v
  LEFT JOIN drivers d ON d.id = v.assigned_driver_id
  LEFT JOIN users bu ON bu.id = v.block_by
`;

// Contractor/User only ever sees vehicles they registered; every other role sees everything.
router.get("/", async (req, res) => {
  const isContractor = req.user.role === "Contractor/User";
  const { rows } = await pool.query(
    isContractor ? `${VEHICLE_SELECT} WHERE v.created_by = $1 ORDER BY v.created_at DESC` : `${VEHICLE_SELECT} ORDER BY v.created_at DESC`,
    isContractor ? [req.user.id] : []
  );
  const vehicles = await Promise.all(rows.map(attachDocuments));
  res.json({ vehicles });
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(`${VEHICLE_SELECT} WHERE v.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Vehicle not found" });
  const vehicle = await attachDocuments(rows[0]);
  const { rows: log } = await pool.query(
    `SELECT al.*, u.name AS by_name FROM approval_log al LEFT JOIN users u ON u.id = al.by_user
     WHERE entity_type = 'vehicle' AND entity_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.json({ vehicle, approvalLog: log });
});

router.post("/", async (req, res) => {
  if (!["Contractor/User", "System Administrator"].includes(req.user.role)) {
    return res.status(403).json({ error: "Only Contractor/User or Admin can register vehicles" });
  }
  const { vehicleNumber, vehicleType, company, contractor, ownerName, department, purpose, gpsInstalled, assignedDriverId, documents } = req.body || {};
  if (!vehicleNumber || !vehicleType) return res.status(400).json({ error: "vehicleNumber and vehicleType are required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO vehicles (vehicle_number, vehicle_type, company, contractor, owner_name, department, purpose, gps_installed, assigned_driver_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [vehicleNumber.toUpperCase().trim(), vehicleType, company || null, contractor || null, ownerName || null, department || null, purpose || null, !!gpsInstalled, assignedDriverId || null, req.user.id]
    );
    const vehicle = rows[0];

    if (documents && typeof documents === "object") {
      for (const docType of VEHICLE_DOC_TYPES) {
        const d = documents[docType];
        if (!d) continue;
        await client.query(
          `INSERT INTO vehicle_documents (vehicle_id, doc_type, number, issue_date, expiry_date) VALUES ($1,$2,$3,$4,$5)`,
          [vehicle.id, docType, d.number || null, d.issueDate || null, d.expiryDate || null]
        );
      }
    }
    await client.query("COMMIT");
    await logAudit(req.user.id, "Vehicle Registered", `${vehicle.vehicle_number} submitted for approval`);
    res.status(201).json({ vehicle: await attachDocuments(vehicle) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "Vehicle number already registered" });
    console.error(err);
    res.status(500).json({ error: "Failed to register vehicle" });
  } finally {
    client.release();
  }
});

// Upload/replace the file for one mandatory document (field name: "file")
router.post("/:id/documents/:docType/file", upload.single("file"), async (req, res) => {
  const { docType } = req.params;
  if (!VEHICLE_DOC_TYPES.includes(docType)) return res.status(400).json({ error: "Invalid document type" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  await pool.query(
    `INSERT INTO vehicle_documents (vehicle_id, doc_type, file_path) VALUES ($1,$2,$3)
     ON CONFLICT (vehicle_id, doc_type) DO UPDATE SET file_path = EXCLUDED.file_path`,
    [req.params.id, docType, req.file.filename]
  );
  res.json({ ok: true, filePath: req.file.filename });
});

router.post("/:id/photo", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const { rows } = await pool.query(`UPDATE vehicles SET photo_path = $1 WHERE id = $2 RETURNING id, photo_path`, [req.file.filename, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Vehicle not found" });
  res.json({ ok: true, photoPath: rows[0].photo_path });
});

module.exports = router;
