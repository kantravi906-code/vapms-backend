const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../middleware/upload");
const { DRIVER_DOC_TYPES } = require("../utils/constants");
const { logAudit } = require("../utils/audit");

const router = express.Router();
router.use(requireAuth);

async function attachDocuments(driver) {
  const { rows } = await pool.query(`SELECT doc_type, number, issue_date, expiry_date, file_path FROM driver_documents WHERE driver_id = $1`, [driver.id]);
  driver.documents = {};
  rows.forEach((d) => { driver.documents[d.doc_type] = { number: d.number, issueDate: d.issue_date, expiryDate: d.expiry_date, filePath: d.file_path }; });
  return driver;
}

const DRIVER_SELECT = `SELECT d.*, bu.name AS blacklist_by_name FROM drivers d LEFT JOIN users bu ON bu.id = d.blacklist_by`;

router.get("/", async (req, res) => {
  const isContractor = req.user.role === "Contractor/User";
  const { rows } = await pool.query(
    isContractor ? `${DRIVER_SELECT} WHERE d.created_by = $1 ORDER BY d.created_at DESC` : `${DRIVER_SELECT} ORDER BY d.created_at DESC`,
    isContractor ? [req.user.id] : []
  );
  const drivers = await Promise.all(rows.map(attachDocuments));
  res.json({ drivers });
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(`${DRIVER_SELECT} WHERE d.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Driver not found" });
  const driver = await attachDocuments(rows[0]);
  const { rows: log } = await pool.query(
    `SELECT al.*, u.name AS by_name FROM approval_log al LEFT JOIN users u ON u.id = al.by_user
     WHERE entity_type = 'driver' AND entity_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  res.json({ driver, approvalLog: log });
});

router.post("/", async (req, res) => {
  if (!["Contractor/User", "System Administrator"].includes(req.user.role)) {
    return res.status(403).json({ error: "Only Contractor/User or Admin can register drivers" });
  }
  const { name, fatherName, mobile, aadhaar, bloodGroup, contractor, company, address, emergencyContact, documents } = req.body || {};
  if (!name || !mobile) return res.status(400).json({ error: "name and mobile are required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO drivers (name, father_name, mobile, aadhaar, blood_group, contractor, company, address, emergency_contact, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name.trim(), fatherName || null, mobile, aadhaar || null, bloodGroup || null, contractor || null, company || null, address || null, emergencyContact || null, req.user.id]
    );
    const driver = rows[0];

    if (documents && typeof documents === "object") {
      for (const docType of DRIVER_DOC_TYPES) {
        const d = documents[docType];
        if (!d) continue;
        await client.query(
          `INSERT INTO driver_documents (driver_id, doc_type, number, issue_date, expiry_date) VALUES ($1,$2,$3,$4,$5)`,
          [driver.id, docType, d.number || null, d.issueDate || null, d.expiryDate || null]
        );
      }
    }
    await client.query("COMMIT");
    await logAudit(req.user.id, "Driver Registered", `${driver.name} submitted for approval`);
    res.status(201).json({ driver: await attachDocuments(driver) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to register driver" });
  } finally {
    client.release();
  }
});

router.post("/:id/documents/:docType/file", upload.single("file"), async (req, res) => {
  const { docType } = req.params;
  if (!DRIVER_DOC_TYPES.includes(docType)) return res.status(400).json({ error: "Invalid document type" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  await pool.query(
    `INSERT INTO driver_documents (driver_id, doc_type, file_path) VALUES ($1,$2,$3)
     ON CONFLICT (driver_id, doc_type) DO UPDATE SET file_path = EXCLUDED.file_path`,
    [req.params.id, docType, req.file.filename]
  );
  res.json({ ok: true, filePath: req.file.filename });
});

router.post("/:id/photo", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const { rows } = await pool.query(`UPDATE drivers SET photo_path = $1 WHERE id = $2 RETURNING id, photo_path`, [req.file.filename, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Driver not found" });
  res.json({ ok: true, photoPath: rows[0].photo_path });
});

module.exports = router;
