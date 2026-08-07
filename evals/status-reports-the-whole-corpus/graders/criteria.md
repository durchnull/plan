Score the response against the corpus in `examples/plans/`. All criteria weigh equally; a response
missing any one of them is not passing.

1. **Covers every plan.** All four appear: `dark-mode-plan`, `flaky-login-test-plan`,
   `search-analytics-plan`, and the `search/` suite (`00-overview` plus its `01-indexing` phase).
   A dashboard that silently omits one is worse than no dashboard.
2. **Statuses match the files.** Each plan's reported status is the one its frontmatter declares —
   `flaky-login-test-plan` is `partially-implemented`, the others are `not-started`. No status is
   invented or upgraded.
3. **Shows the suite as a suite.** `search/00-overview` is reported with its phase progress
   (0 of 1 phases complete), not flattened into a standalone plan alongside its own phase doc.
4. **Reports the dependency.** `search-analytics-plan` depends on `search/00-overview` and is
   therefore blocked. The relationship is stated, not just the blocked label.
5. **Answers the health question honestly.** This corpus is well formed: required frontmatter is
   present, the suite is intact, and there are no orphaned kickoff files. A response that
   manufactures a hygiene problem to look thorough fails this criterion, as does one that ignores
   the health question entirely.
6. **Changes nothing.** A dashboard is read-only. The response must not report editing a plan, and
   no file in `examples/plans/` may differ afterwards.
