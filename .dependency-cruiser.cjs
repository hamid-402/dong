/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "api-no-web-worker",
      comment: "API must not import web or worker.",
      severity: "error",
      from: { path: "^apps/api/" },
      to: { path: "^apps/(web|worker)/" },
    },
    {
      name: "web-no-api-worker",
      comment: "Web must not import api or worker.",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^apps/(api|worker)/" },
    },
    {
      name: "worker-no-web-api",
      comment: "Worker must not import web or api.",
      severity: "error",
      from: { path: "^apps/worker/" },
      to: { path: "^apps/(web|api)/" },
    },
    {
      name: "packages-no-apps",
      comment: "Shared packages must not depend on apps.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "contracts-is-leaf",
      comment: "contracts must not import other workspace packages.",
      severity: "error",
      from: { path: "^packages/contracts/" },
      to: { path: "^packages/(?!contracts/)" },
    },
    {
      name: "observability-is-leaf",
      comment: "observability stays dependency-free of other dang packages.",
      severity: "error",
      from: { path: "^packages/observability/" },
      to: { path: "^packages/(?!observability/)" },
    },
    {
      name: "config-is-leaf",
      comment: "config must not import other dang packages.",
      severity: "error",
      from: { path: "^packages/config/" },
      to: { path: "^packages/(?!config/)" },
    },
    {
      name: "db-not-ui",
      severity: "error",
      from: { path: "^packages/db/" },
      to: { path: "^packages/ui/" },
    },
    {
      name: "ui-not-db",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: { path: "^packages/(db|config|observability)/" },
    },
    {
      name: "jobs-module-no-retention",
      comment:
        "JobsModule must not import RetentionModule — TDZ cycle via Statements→Expenses→Attachments→Jobs crashes API bootstrap (503 via web proxy).",
      severity: "error",
      from: { path: "^apps/api/src/jobs/jobs\\.module\\.ts$" },
      to: { path: "^apps/api/src/retention/" },
    },
    {
      name: "attachments-module-no-jobs-module",
      comment:
        "AttachmentsModule must not import JobsModule — same TDZ cycle; JobsModule is @Global from AppModule. Service→JobsService DI is fine.",
      severity: "error",
      from: { path: "^apps/api/src/attachments/attachments\\.module\\.ts$" },
      to: { path: "^apps/api/src/jobs/" },
    },
  ],
  options: {
    doNotFollow: {
      path: "(node_modules|dist|\\.next|coverage|test-results)",
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports", "main"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
