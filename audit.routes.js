const express = require("express");
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", requireRole("System Administrator", "Security HOD"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await pool.query(
    `SELECT a.*, u.name AS by_name FROM audit_log a LEFT JOIN users u ON u.id = a.by_user ORDER BY ts DESC LIMIT $1`,
    [limit]
  );
  res.json({ auditLog: rows });
});

module.exports = router;
