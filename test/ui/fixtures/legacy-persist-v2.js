// Persist originale della base ab9410b0865af1963bd723e3cfa95f59e4bcdc16.
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    profile: state.profile,
    deadlines: state.deadlines,
    planner: state.planner,
    migrationNotice: state.migrationNotice,
    notificationsEnabled: state.notificationsEnabled,
    notifiedKeys: state.notifiedKeys.slice(-500),
  }));
}