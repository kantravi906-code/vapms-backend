const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { logAudit } = require("../utils/audit");

const router = express.Router();

// Slow down brute-force attempts against the login endpoint.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password are required" });

  const { rows } = await pool.query(`SELECT * FROM users WHERE lower(username) = lower($1)`, [username.trim()]);
  const user = rows[0];
  // Same generic error whether the username or password is wrong, to avoid username enumeration.
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid username or password" });
  if (user.status !== "Active") return res.status(403).json({ error: "This account is inactive. Contact your System Administrator." });

  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
  });

  await logAudit(user.id, "Login", `${user.name} signed in`);

  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post("/logout", requireAuth, async (req, res) => {
  // Stateless JWTs can't be revoked server-side without a blocklist table; the frontend
  // simply discards the token. Logged here for the audit trail.
  await logAudit(req.user.id, "Logout", `${req.user.name} signed out`);
  res.json({ ok: true });
});

module.exports = router;
