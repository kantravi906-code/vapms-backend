const express = require("express");
const QRCode = require("qrcode");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const isContractor = req.user.role === "Contractor/User";
  const { rows } = await pool.query(
    `SELECT v.*, d.name AS driver_name, d.emergency_contact, d.blacklisted AS driver_blacklisted
     FROM vehicles v LEFT JOIN drivers d ON d.id = v.assigned_driver_id
     WHERE v.status = 'Approved' AND v.pass_number IS NOT NULL ${isContractor ? "AND v.created_by = $1" : ""}
     ORDER BY v.pass_issue_date DESC`,
    isContractor ? [req.user.id] : []
  );
  res.json({ passes: rows });
});

// Real, scannable QR containing the pass number + vehicle number as JSON.
// A gate scanner app can decode this and hit POST /api/gate/scan with the payload.
router.get("/:id/qr.png", async (req, res) => {
  const { rows } = await pool.query(`SELECT pass_number, vehicle_number FROM vehicles WHERE id = $1`, [req.params.id]);
  const vehicle = rows[0];
  if (!vehicle || !vehicle.pass_number) return res.status(404).json({ error: "No active pass for this vehicle" });

  const payload = JSON.stringify({ pass: vehicle.pass_number, vehicle: vehicle.vehicle_number });
  res.setHeader("Content-Type", "image/png");
  QRCode.toFileStream(res, payload, { width: 320, margin: 1 });
});

module.exports = router;
