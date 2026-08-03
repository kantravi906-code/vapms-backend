const express = require("express");
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAudit } = require("../utils/audit");

const router = express.Router();
router.use(requireAuth);

const TYPES = ["department", "contractor", "company", "vehicle_type"];

router.get("/", async (req, res) => {
  const { rows } = await pool.query(`SELECT type, value FROM masters ORDER BY type, value`);
  const grouped = { departments: [], contractors: [], companies: [], vehicleTypes: [] };
  const keyFor = { department: "departments", contractor: "contractors", company: "companies", vehicle_type: "vehicleTypes" };
  rows.forEach((r) => grouped[keyFor[r.type]].push(r.value));
  res.json(grouped);
});

router.post("/:type", requireRole("System Administrator"), async (req, res) => {
  const type = req.params.type;
  const { value } = req.body || {};
  if (!TYPES.includes(type)) return res.status(400).json({ error: "Invalid master type" });
  if (!value || !value.trim()) return res.status(400).json({ error: "value is required" });

  await pool.query(`INSERT INTO masters (type, value) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [type, value.trim()]);
  await logAudit(req.user.id, "Master Added", `${type}: ${value.trim()}`);
  res.status(201).json({ ok: true });
});

router.delete("/:type", requireRole("System Administrator"), async (req, res) => {
  const type = req.params.type;
  const { value } = req.body || {};
  if (!TYPES.includes(type)) return res.status(400).json({ error: "Invalid master type" });
  await pool.query(`DELETE FROM masters WHERE type = $1 AND value = $2`, [type, value]);
  res.json({ ok: true });
});

module.exports = router;
