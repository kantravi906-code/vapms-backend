const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { logAudit } = require("../utils/audit");

const router = express.Router();
router.use(requireAuth);

router.post("/scan", async (req, res) => {
  const { query } = req.body || {};
  if (!query || !query.trim()) return res.status(400).json({ error: "query is required" });
  const q = query.trim().toUpperCase();

  const { rows } = await pool.query(
    `SELECT * FROM vehicles WHERE upper(vehicle_number) = $1 OR upper(pass_number) = $1`,
    [q]
  );
  const vehicle = rows[0];

  let status, reason, driver = null;
  if (!vehicle) {
    status = "Invalid"; reason = "No matching vehicle or pass number found.";
  } else {
    if (vehicle.assigned_driver_id) {
      const d = await pool.query(`SELECT * FROM drivers WHERE id = $1`, [vehicle.assigned_driver_id]);
      driver = d.rows[0] || null;
    }
    if (vehicle.blocked) { status = "Blocked"; reason = `Vehicle blocked: ${vehicle.block_reason}`; }
    else if (vehicle.status !== "Approved" || !vehicle.pass_number) { status = "Invalid"; reason = "No active pass — approval not completed."; }
    else if (new Date(vehicle.pass_valid_till) < new Date(new Date().toDateString())) { status = "Expired"; reason = `Pass expired on ${vehicle.pass_valid_till}.`; }
    else if (driver && driver.blacklisted) { status = "Blocked"; reason = `Driver blacklisted: ${driver.blacklist_reason}`; }
    else { status = "Valid"; reason = "Pass verified successfully."; }
  }

  await pool.query(`INSERT INTO scan_log (query, result, by_user) VALUES ($1,$2,$3)`, [q, status, req.user.id]);
  await logAudit(req.user.id, "QR Scan", `${q} -> ${status}`);

  res.json({ status, reason, vehicle, driver });
});

router.post("/log", async (req, res) => {
  const { vehicleNumber, type, gate } = req.body || {};
  if (!vehicleNumber || !["Entry", "Exit"].includes(type)) return res.status(400).json({ error: "vehicleNumber and a valid type (Entry/Exit) are required" });

  const { rows } = await pool.query(
    `INSERT INTO entry_exit_log (vehicle_number, type, gate, by_user) VALUES ($1,$2,$3,$4) RETURNING *`,
    [vehicleNumber.toUpperCase(), type, gate || "Gate 1", req.user.id]
  );
  await logAudit(req.user.id, `Vehicle ${type}`, `${vehicleNumber} logged ${type}`);
  res.status(201).json({ log: rows[0] });
});

router.get("/scans", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, u.name AS by_name FROM scan_log s LEFT JOIN users u ON u.id = s.by_user ORDER BY ts DESC LIMIT 50`
  );
  res.json({ scans: rows });
});

router.get("/logs", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.*, u.name AS by_name FROM entry_exit_log l LEFT JOIN users u ON u.id = l.by_user ORDER BY ts DESC LIMIT 100`
  );
  res.json({ logs: rows });
});

module.exports = router;
