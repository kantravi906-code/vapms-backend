const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

// Verifies the Bearer token and attaches the current user (re-read from the DB, not just
// the token payload) to req.user. Re-reading on every request means a deactivated account
// or role change takes effect immediately instead of waiting for the token to expire.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT id, name, emp_id, department, designation, email, mobile, username, role, status
       FROM users WHERE id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Account no longer exists" });
    if (user.status !== "Active") return res.status(403).json({ error: "Account is inactive" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Usage: requireRole("Security HOD") or requireRole("Security HOD", "System Administrator")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
