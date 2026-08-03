require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const { uploadDir } = require("./middleware/upload");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Uploaded documents/photos served statically. In production, prefer serving these from a
// signed-URL object store (S3, GCS) instead of the app server.
app.use("/uploads", express.static(uploadDir));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "vapms-backend", time: new Date().toISOString() }));

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/users.routes"));
app.use("/api/masters", require("./routes/masters.routes"));
app.use("/api/vehicles", require("./routes/vehicles.routes"));
app.use("/api/drivers", require("./routes/drivers.routes"));
app.use("/api/approvals", require("./routes/approvals.routes"));
app.use("/api/blocklist", require("./routes/blocklist.routes"));
app.use("/api/gate", require("./routes/gate.routes"));
app.use("/api/passes", require("./routes/passes.routes"));
app.use("/api/reports", require("./routes/reports.routes"));
app.use("/api/audit", require("./routes/audit.routes"));

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Centralized error handler - keeps stack traces out of API responses.
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === "Not allowed by CORS") return res.status(403).json({ error: "Origin not allowed" });
  res.status(err.status || 500).json({ error: err.expose ? err.message : "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`VAPMS backend listening on port ${PORT}`));

module.exports = app;
