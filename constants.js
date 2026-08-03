const APPROVAL_STAGES = ["Safety", "Plant HOD", "Traffic Marshal", "Security HOD"];

const VEHICLE_DOC_TYPES = ["RC", "Insurance", "PUC", "Fitness Certificate", "Permit", "Safety Checklist", "Service Record", "GPS Certificate"];
const DRIVER_DOC_TYPES = ["Driving Licence", "Medical Certificate", "Gate Pass", "Driver Assessment", "VDSS Training Certificate"];

const ROLES = [
  "System Administrator", "Contractor/User", "Safety", "Plant HOD",
  "Traffic Marshal", "Security HOD", "Security Supervisor", "Gate Operator",
];

const VEHICLE_BLOCK_REASONS = ["Document Expired", "Safety Violation", "Unauthorized Entry", "Accident", "Blacklisted Contractor", "Security Concern", "Other"];
const DRIVER_BLOCK_REASONS = ["Safety Violation", "Fake Documents", "Security Misconduct", "Unauthorized Activity", "Licence Expired", "Other"];

module.exports = { APPROVAL_STAGES, VEHICLE_DOC_TYPES, DRIVER_DOC_TYPES, ROLES, VEHICLE_BLOCK_REASONS, DRIVER_BLOCK_REASONS };
