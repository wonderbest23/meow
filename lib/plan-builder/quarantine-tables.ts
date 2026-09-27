// Table names only. This module has no credentials, database client, or execution code.
export function projectReadTable() {
  return process.env.PLAN_QUARANTINE_ENABLED === "1" ? "projects_accessible" : "projects";
}
