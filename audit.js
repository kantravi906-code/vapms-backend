const { pool } = require("../config/db");

async function logAudit(userId, action, details) {
  try {
    await pool.query(
      `INSERT INTO audit_log (by_user, action, details) VALUES ($1, $2, $3)`,
      [userId || null, action, details || null]
    );
  } catch (err) {
    // Audit logging must never break the primary request.
    console.error("Failed to write audit log:", err.message);
  }
}

module.exports = { logAudit };
