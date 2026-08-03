const express = require("express");
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { VEHICLE_BLOCK_REASONS, DRIVER_BLOCK_REASONS } = require("../utils/constants");
const { logAudit } = require("../utils/audit");

const router = express.Router();
router.use(requireAuth);

// Per spec section 9-10: only Security HOD may block a vehicle or blacklist a driver.
// requireRole checks the live DB role on every request (see middleware/auth.js), so a
// demoted or deactivated account loses this power immediately, not just at next login.
router.post("/vehicles/:id/block", requireRole("Security HOD"), async (req, res) => {
  const { reason, remarks } = req.body || {};
  if (!VEHICLE_BLOCK_REASONS.includes(reason)) return res.status(400).json({ error: "Invalid block reason" });

  const { rows } = await pool.query(
    `UPDATE vehicles SET blocked = true, block_reason = $1, block_by = $2, block_date = CURRENT_DATE, block_remarks = $3
     WHERE id = $4 RETURNING id, vehicle_number, blocked`,
    [reason, req.user.id, remarks || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Vehicle not found" });
  await logAudit(req.user.id, "Vehicle Blocked", `${rows[0].vehicle_number} — ${reason}`);
  res.json({ vehicle: rows[0] });
});

router.post("/vehicles/:id/unblock", requireRole("Security HOD"), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE vehicles SET blocked = false, block_reason = NULL, block_by = NULL, block_date = NULL, block_remarks = NULL
     WHERE id = $1 RETURNING id, vehicle_number, blocked`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Vehicle not found" });
  await logAudit(req.user.id, "Vehicle Unblocked", `${rows[0].vehicle_number} — access restored`);
  res.json({ vehicle: rows[0] });
});

router.post("/drivers/:id/blacklist", requireRole("Security HOD"), async (req, res) => {
  const { reason, remarks } = req.body || {};
  if (!DRIVER_BLOCK_REASONS.includes(reason)) return res.status(400).json({ error: "Invalid blacklist reason" });

  const { rows } = await pool.query(
    `UPDATE drivers SET blacklisted = true, blacklist_reason = $1, blacklist_by = $2, blacklist_date = CURRENT_DATE, blacklist_remarks = $3
     WHERE id = $4 RETURNING id, name, blacklisted`,
    [reason, req.user.id, remarks || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Driver not found" });
  await logAudit(req.user.id, "Driver Blacklisted", `${rows[0].name} — ${reason}`);
  res.json({ driver: rows[0] });
});

router.post("/drivers/:id/unblacklist", requireRole("Security HOD"), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE drivers SET blacklisted = false, blacklist_reason = NULL, blacklist_by = NULL, blacklist_date = NULL, blacklist_remarks = NULL
     WHERE id = $1 RETURNING id, name, blacklisted`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Driver not found" });
  await logAudit(req.user.id, "Driver Unblacklisted", `${rows[0].name} — access restored`);
  res.json({ driver: rows[0] });
});

module.exports = router;
