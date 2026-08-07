---
description: Log and chart what users search for, to prioritize catalog gaps.
date: 2026-07-15
status: not-started
type: feature
importance: low
depends-on: search/00-overview.md
---

# Search analytics

## Goal

Capture search queries (and zero-result queries especially) and surface the top terms so the team
can see what the catalog is missing.

## Assumptions

- The search feature (see `depends-on`) ships first — there is nothing to log until then.

## Steps

1. Record each query + result count behind a feature flag.
2. A weekly rollup of top terms and top zero-result terms.

## Verification

The rollup lists the top 20 terms for the last 7 days, with zero-result terms flagged.
