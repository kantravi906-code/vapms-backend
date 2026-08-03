require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

const DEMO_USERS = [
  { name: "Deepak Mehta", empId: "EMP-1000", department: "IT", designation: "System Administrator", username: "deepak.mehta", password: "admin123", role: "System Administrator" },
  { name: "Ramesh Kumar", empId: "EMP-2001", department: "Logistics", designation: "Fleet Contractor", username: "ramesh.kumar", password: "contractor123", role: "Contractor/User" },
  { name: "Priya Nair", empId: "EMP-1003", department: "Safety", designation: "Safety Officer", username: "priya.nair", password: "safety123", role: "Safety" },
  { name: "Anita Sharma", empId: "EMP-1001", department: "Production", designation: "Plant Head", username: "anita.sharma", password: "plant123", role: "Plant HOD" },
  { name: "Harpreet Singh", empId: "EMP-1004", department: "Traffic", designation: "Traffic Marshal", username: "harpreet.singh", password: "traffic123", role: "Traffic Marshal" },
  { name: "Vikram Rao", empId: "EMP-1002", department: "Utilities", designation: "Security Head", username: "vikram.rao", password: "security123", role: "Security HOD" },
  { name: "Salim Khan", empId: "EMP-1005", department: "Security", designation: "Security Supervisor", username: "salim.khan", password: "super123", role: "Security Supervisor" },
  { name: "Rakesh Yadav", empId: "EMP-1006", department: "Security", designation: "Gate Operator", username: "rakesh.yadav", password: "gate123", role: "Gate Operator" },
];

const MASTERS = {
  department: ["Production", "Maintenance", "Logistics", "Utilities", "Civil"],
  contractor: ["Shree Balaji Enterprises", "Ganpati Logistics", "Modern Engineering Works"],
  company: ["ABC Infra Pvt Ltd", "Reliable Transport Co.", "Metro Movers Ltd"],
  vehicle_type: ["Truck", "Trailer", "Dumper", "Tanker", "Car", "Two-Wheeler", "Crane", "JCB / Excavator"],
};

async function main() {
  console.log("Seeding demo users...");
  for (const u of DEMO_USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    await pool.query(
      `INSERT INTO users (name, emp_id, department, designation, username, password_hash, role, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Active')
       ON CONFLICT (username) DO NOTHING`,
      [u.name, u.empId, u.department, u.designation, u.username, hash, u.role]
    );
  }

  console.log("Seeding masters...");
  for (const [type, values] of Object.entries(MASTERS)) {
    for (const value of values) {
      await pool.query(`INSERT INTO masters (type, value) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [type, value]);
    }
  }

  console.log("Done. Demo logins:");
  DEMO_USERS.forEach((u) => console.log(`  ${u.role.padEnd(22)} ${u.username} / ${u.password}`));
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
