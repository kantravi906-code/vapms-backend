const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { APPROVAL_STAGES } = require("../utils/constants");
const { logAudit } = require("../utils/audit");

const router = express.Router();
router.use(requireAuth);

const TABLES = { vehicle: "vehicles", driver: "drivers" };

function labelFor(entityType, row) {
  return entityType === "vehicle" ? row.vehicle_number : row.name;
}

const DOC_TABLE = { vehicle: "vehicle_documents", driver: "driver_documents" };
const DOC_FK = { vehicle: "vehicle_id", driver: "driver_id" };

// Queue of items awaiting a decision. If the caller's role matches a specific approval
// stage, only items currently at that stage are actionable (still returned for visibility,
// the frontend disables the buttons based on `actionable`).
router.get("/:entityType/queue", async (req, res) => {
  const entityType = req.params.entityType;
  const table = TABLES[entityType];
  if (!table) return res.status(400).json({ error: "entityType must be vehicle or driver" });

  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE status IN ('Pending','Sent Back') ORDER BY created_at ASC`);
  const ids = rows.map((r) => r.id);

  let docsByEntity = {};
  let logsByEntity = {};
  if (ids.length > 0) {
    const docRows = await pool.query(
      `SELECT * FROM ${DOC_TABLE[entityType]} WHERE ${DOC_FK[entityType]} = ANY($1::uuid[])`,
      [ids]
    );
    docRows.rows.forEach((d) => {
      const key = d[DOC_FK[entityType]];
      (docsByEntity[key] = docsByEntity[key] || {})[d.doc_type] = { number: d.number, issueDate: d.issue_date, expiryDate: d.expiry_date, fileName: d.file_path };
    });

    const logRows = await pool.query(
      `SELECT al.*, u.name AS by_name FROM approval_log al LEFT JOIN users u ON u.id = al.by_user
       WHERE entity_type = $1 AND entity_id = ANY($2::uuid[]) ORDER BY al.created_at ASC`,
      [entityType, ids]
    );
    logRows.rows.forEach((l) => { (logsByEntity[l.entity_id] = logsByEntity[l.entity_id] || []).push(l); });
  }

  const withFlags = rows.map((r) => ({
    ...r,
    documents: docsByEntity[r.id] || {},
    approvalLog: logsByEntity[r.id] || [],
    stageName: APPROVAL_STAGES[r.current_stage],
    actionable: req.user.role === "System Administrator" || (req.user.role === APPROVAL_STAGES[r.current_stage] && r.status !== "Sent Back"),
  }));
  res.json({ items: withFlags });
});

router.post("/:entityType/:id/decision", async (req, res) => {
  const entityType = req.params.entityType;
  const table = TABLES[entityType];
  if (!table) return res.status(400).json({ error: "entityType must be vehicle or driver" });

  const { action, remarks } = req.body || {};
  if (!["Approve", "Reject", "Send Back"].includes(action)) return res.status(400).json({ error: "action must be Approve, Reject or Send Back" });
  if ((action === "Reject" || action === "Send Back") && !remarks) return res.status(400).json({ error: "Remarks are required to reject or send back" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const record = rows[0];
    if (!record) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
    if (!["Pending", "Sent Back"].includes(record.status)) { await client.query("ROLLBACK"); return res.status(409).json({ error: `Already ${record.status}` }); }

    const stageName = APPROVAL_STAGES[record.current_stage];
    const authorized = req.user.role === "System Administrator" || req.user.role === stageName;
    if (!authorized) { await client.query("ROLLBACK"); return res.status(403).json({ error: `Only ${stageName} can act on this item right now` }); }

    await client.query(
      `INSERT INTO approval_log (entity_type, entity_id, stage, action, by_user, remarks) VALUES ($1,$2,$3,$4,$5,$6)`,
      [entityType, record.id, stageName, action === "Approve" ? "Approved" : action === "Reject" ? "Rejected" : "Sent Back", req.user.id, remarks || null]
    );

    let updated;
    if (action === "Reject") {
      ({ rows: [updated] } = await client.query(`UPDATE ${table} SET status = 'Rejected' WHERE id = $1 RETURNING *`, [record.id]));
    } else if (action === "Send Back") {
      ({ rows: [updated] } = await client.query(`UPDATE ${table} SET status = 'Sent Back' WHERE id = $1 RETURNING *`, [record.id]));
    } else if (record.current_stage >= APPROVAL_STAGES.length - 1) {
      // Final stage (Security HOD) approved -> issue the pass (vehicles only).
      if (entityType === "vehicle") {
        const seq = await client.query(`SELECT nextval('pass_number_seq') AS n`);
        const passNumber = `VAP-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(4, "0")}`;
        ({ rows: [updated] } = await client.query(
          `UPDATE ${table} SET status = 'Approved', pass_number = $1, pass_issue_date = CURRENT_DATE, pass_valid_till = CURRENT_DATE + INTERVAL '365 days'
           WHERE id = $2 RETURNING *`,
          [passNumber, record.id]
        ));
      } else {
        ({ rows: [updated] } = await client.query(`UPDATE ${table} SET status = 'Approved' WHERE id = $1 RETURNING *`, [record.id]));
      }
    } else {
      ({ rows: [updated] } = await client.query(`UPDATE ${table} SET current_stage = current_stage + 1 WHERE id = $1 RETURNING *`, [record.id]));
    }

    await client.query("COMMIT");
    await logAudit(req.user.id, `${entityType === "vehicle" ? "Vehicle" : "Driver"} ${action}`, `${stageName} ${action.toLowerCase()} ${labelFor(entityType, updated)}`);
    res.json({ item: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to record decision" });
  } finally {
    client.release();
  }
});

// Contractor resubmits after a "Send Back" - restarts from the Safety stage.
router.post("/:entityType/:id/resubmit", async (req, res) => {
  const table = TABLES[req.params.entityType];
  if (!table) return res.status(400).json({ error: "entityType must be vehicle or driver" });
  if (!["Contractor/User", "System Administrator"].includes(req.user.role)) return res.status(403).json({ error: "Not allowed" });

  const { rows } = await pool.query(
    `UPDATE ${table} SET status = 'Pending', current_stage = 0 WHERE id = $1 AND status = 'Sent Back' RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(409).json({ error: "Item is not in Sent Back status" });
  res.json({ item: rows[0] });
});

module.exports = router;
