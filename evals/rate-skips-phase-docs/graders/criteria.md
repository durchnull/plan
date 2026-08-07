Score the response against the corpus in `examples/plans/`, which holds three flat plans, one suite
overview, and one phase doc — and where every ratable doc already carries an `importance` value.
All criteria weigh equally; a response missing any one of them is not passing.

1. **Skips the phase doc.** `search/01-indexing` is a phase of the `search/` suite. Importance
   lives on flat plans and suite overviews only; phases inherit their suite's rating. A ranking
   that gives `01-indexing` its own tier fails, and so does one that silently drops it without
   saying why it was skipped.
2. **Covers the four ratable docs.** `dark-mode-plan`, `flaky-login-test-plan`,
   `search-analytics-plan`, and `search/00-overview` each appear with a tier.
3. **Keeps the ratings that are already there.** All four carry a rating and nothing in the corpus
   has changed to justify moving one, so a re-run is idempotent. A response that re-rates the
   corpus wholesale fails; so does one that changes a tier without naming the evidence that
   changed.
4. **Rates the product, not the work.** Each rationale turns on what the plan means for the
   product — the surface it adds, the spine it touches, or how many plans build on it. Justifying
   a tier by effort ("this is a big job"), urgency, or age is the wrong axis and fails.
5. **Names the next-build pointer.** The summary names a plan that is both top-tier and
   `not-started`: `dark-mode-plan` or `search/00-overview`. `flaky-login-test-plan` is already
   `partially-implemented` and `search-analytics-plan` is `low` — naming either as the pointer
   fails.
6. **Writes nothing.** The response says up front that nothing was written, and no file in
   `examples/plans/` differs afterwards.
