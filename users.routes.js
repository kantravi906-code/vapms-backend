const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { ROLES } = require("../utils/constants");
const { logAudit } = require("../utils/audit");

const router = express.Router();
router.use(requireAuth);

router.get("/", requireRole("System Administrator"), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, emp_id, department, designation, email, mobile, username, role, status, created_at
     FROM users ORDER BY created_at DESC`
  );
  res.json({ users: rows });
});

router.post("/", requireRole("System Administrator"), async (req, res) => {
  const { name, empId, department, designation, email, mobile, username, password, role, status } = req.body || {};
  if (!name || !empId || !username || !password || !role) {
    return res.status(400).json({ error: "name, empId, username, password and role are required" });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const dupe = await pool.query(`SELECT 1 FROM users WHERE lower(username) = lower($1) OR emp_id = $2`, [username, empId]);
  if (dupe.rowCount > 0) return res.status(409).json({ error: "Username or Employee ID already exists" });

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name, emp_id, department, designation, email, mobile, username, password_hash, role, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, name, emp_id, department, designation, email, mobile, username, role, status, created_at`,
    [name, empId, department || null, designation || null, email || null, mobile || null, username.trim(), passwordHash, role, status || "Active"]
  );

  await logAudit(req.user.id, "User Registered", `${name} (${empId}) added as ${role}`);
  res.status(201).json({ user: rows[0] });
});

router.patch("/:id/status", requireRole("System Administrator"), async (req, res) => {
  const { status } = req.body || {};
  if (!["Active", "Inactive"].includes(status)) return res.status(400).json({ error: "status must be Active or Inactive" });
  const { rows } = await pool.query(
    `UPDATE users SET status = $1 WHERE id = $2 RETURNING id, name, status`,
    [status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  await logAudit(req.user.id, "User Status Changed", `${rows[0].name} set to ${status}`);
  res.json({ user: rows[0] });
});

// A user can change their own password; an admin can reset anyone's.
router.post("/:id/change-password", async (req, res) => {
  const { newPassword } = req.body || {};
  const isSelf = req.user.id === req.params.id;
  if (!isSelf && req.user.role !== "System Administrator") return res.status(403).json({ error: "Not allowed" });
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const { rowCount } = await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "User not found" });
  await logAudit(req.user.id, "Password Changed", `Password updated for user ${req.params.id}`);
  res.json({ ok: true });
});

module.exports = router;
