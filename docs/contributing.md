# Contributing to `plan`

Everything here runs from a clone of this repo. The scripts have no dependencies beyond Node's
standard library, so there is nothing to install first.

## Unit tests

Each bundled script carries its own self-test:

```bash
PLANS_DIR=examples/plans node scripts/plan-registry.mjs --self-test
node scripts/check-plan-docs.mjs --self-test
node scripts/resolve-plan-config.mjs --self-test
```

The registry self-test asserts against a real corpus, so it needs `PLANS_DIR` pointed at
[`examples/plans/`](../examples/plans/) — exactly how CI runs it. The other two run anywhere.

## Evals

Some behavior no assertion can check: whether the model picks the right plan and explains why.
That lives in [`evals/`](../evals/) as prompt-and-grader cases over the same example corpus — one
per command:

```bash
claude plugin eval . \
  --allow-tools Bash Write Edit \
  --output-dir .dev/eval-results \
  --max-cost-usd 5
```

A model grades these rather than an assertion, so a run costs money. That is why they are not part
of CI, and why the cost ceiling is there — the graders are billed per run.

Three flags carry weight here:

- **`--allow-tools`** is the operator grant for gated tools; without it the cases that need them
  cannot run. Every case needs `Bash` (each command resolves this project's config through a
  bundled script). The `new`, `revise`, and `handoff` cases additionally need `Write` and `Edit`,
  because those commands exist to write plan docs — there is nothing to grade if they can't.
- **`--output-dir`** keeps the run's results out of the tree. The default is
  `./evals/results/<timestamp>/`, which this repo does not ignore, so a plain run leaves untracked
  result files behind. `.dev/` is the one ignored path here.
- **`--max-cost-usd`** is a hard ceiling, not an estimate. Eight cases at three runs each is a
  bigger bill than the two this suite started with.

The three write-cases copy [`examples/plans/`](../examples/plans/) into `.dev/` first and point
`PLANS_DIR` at the copy, so the tracked corpus stays byte-identical no matter how a run goes. That
copy is instructed in the prompt rather than a `scaffold_script`, so no case needs `--scaffold`.
If you add a write-case, follow the same pattern — a fixture the graders depend on must not be
editable by the thing being graded.

## Validate both manifests

`claude plugin validate .` checks only **one** manifest. When both are present, `marketplace.json`
wins and `plugin.json` is silently skipped. So validate them by path:

```bash
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
```

Both must exit 0.

## Before opening a pull request

1. Run the three self-tests above; all must pass.
2. Validate both manifests by path; both must exit 0.
3. Describe the change in the pull request. Leave `version` in
   [`plugin.json`](../.claude-plugin/plugin.json) and the [`CHANGELOG.md`](../CHANGELOG.md)
   heading alone — both are set when the release is cut, and a bump inside a pull request
   collides with the next one. See [`CONTRIBUTING.md`](../CONTRIBUTING.md).

CI runs the self-tests, both manifest checks, and a few extra guards — that the README documents
exactly the commands that ship, and that every bundled path is written as
`${CLAUDE_PLUGIN_ROOT}/…` rather than a bare relative path.
