const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Powers the dashboard KPI cards in one round trip.
router.get("/dashboard", async (req, res) => {
  const q = (sql, params) => pool.query(sql, params).then((r) => r.rows[0]);

  const [
    totalVehicles, activePasses, pendingVehicleApprovals, pendingDriverApprovals,
    registeredDrivers, blockedVehicles, blockedDrivers, todayEntries, todayExits, qrScansToday,
    expiredVehicleDocs, expiredDriverDocs, expiring7, expiring15, expiring30,
  ] = await Promise.all([
    q(`SELECT count(*)::int AS n FROM vehicles`),
    q(`SELECT count(*)::int AS n FROM vehicles WHERE status='Approved' AND NOT blocked AND pass_valid_till >= CURRENT_DATE`),
    q(`SELECT count(*)::int AS n FROM vehicles WHERE status IN ('Pending','Sent Back')`),
    q(`SELECT count(*)::int AS n FROM drivers WHERE status IN ('Pending','Sent Back')`),
    q(`SELECT count(*)::int AS n FROM drivers`),
    q(`SELECT count(*)::int AS n FROM vehicles WHERE blocked`),
    q(`SELECT count(*)::int AS n FROM drivers WHERE blacklisted`),
    q(`SELECT count(*)::int AS n FROM entry_exit_log WHERE type='Entry' AND ts::date = CURRENT_DATE`),
    q(`SELECT count(*)::int AS n FROM entry_exit_log WHERE type='Exit' AND ts::date = CURRENT_DATE`),
    q(`SELECT count(*)::int AS n FROM scan_log WHERE ts::date = CURRENT_DATE`),
    q(`SELECT count(DISTINCT vehicle_id)::int AS n FROM vehicle_documents WHERE expiry_date < CURRENT_DATE`),
    q(`SELECT count(DISTINCT driver_id)::int AS n FROM driver_documents WHERE expiry_date < CURRENT_DATE`),
    q(`SELECT count(DISTINCT vehicle_id)::int AS n FROM vehicle_documents WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`),
    q(`SELECT count(DISTINCT vehicle_id)::int AS n FROM vehicle_documents WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 15`),
    q(`SELECT count(DISTINCT vehicle_id)::int AS n FROM vehicle_documents WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30`),
  ]);

  res.json({
    totalVehicles: totalVehicles.n, activePasses: activePasses.n,
    pendingApprovals: pendingVehicleApprovals.n + pendingDriverApprovals.n,
    registeredDrivers: registeredDrivers.n, blockedVehicles: blockedVehicles.n, blockedDrivers: blockedDrivers.n,
    todayEntries: todayEntries.n, todayExits: todayExits.n, qrScansToday: qrScansToday.n,
    expiredDocuments: expiredVehicleDocs.n + expiredDriverDocs.n,
    expiring7: expiring7.n, expiring15: expiring15.n, expiring30: expiring30.n,
  });
});

router.get("/vehicles-by-month", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS vehicles FROM vehicles GROUP BY 1 ORDER BY 1`
  );
  res.json({ data: rows });
});

router.get("/vehicles-by-department", async (req, res) => {
  const { rows } = await pool.query(`SELECT department, count(*)::int AS count FROM vehicles GROUP BY department`);
  res.json({ data: rows });
});

router.get("/approval-status", async (req, res) => {
  const { rows } = await pool.query(`SELECT status AS name, count(*)::int AS value FROM vehicles GROUP BY status`);
  res.json({ data: rows });
});

router.get("/entry-exit-trend", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT to_char(d, 'MM-DD') AS day,
       (SELECT count(*) FROM entry_exit_log WHERE type='Entry' AND ts::date = d)::int AS entries,
       (SELECT count(*) FROM entry_exit_log WHERE type='Exit' AND ts::date = d)::int AS exits
     FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') AS d
     ORDER BY d`
  );
  res.json({ data: rows });
});

module.exports = router;
