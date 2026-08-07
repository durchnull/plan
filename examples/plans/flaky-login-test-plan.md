---
description: Fix the intermittent 401 in the login integration test caused by a shared rate limiter.
date: 2026-07-12
status: partially-implemented
type: bug
importance: medium
---

# Flaky login test

## Goal

The login integration test fails ~1 in 20 runs with a 401 because the auth rate limiter carries
state between tests in the same file. Reset it per test.

## Steps

1. Expose a test-only limiter reset hook.
2. Call it in `beforeEach` for the auth suite.

## Verification

100 consecutive runs of the auth suite are green.
