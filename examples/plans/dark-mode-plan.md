---
description: Add a dark theme with a persisted preference and a system-preference default.
date: 2026-07-10
status: not-started
type: feature
importance: high
---

# Dark mode

## Goal

Let users switch between light and dark themes, defaulting to their OS preference and remembering
an explicit choice across sessions.

## Steps

1. Add a `theme` token layer (CSS variables) and a `prefers-color-scheme` default.
2. Add a toggle in the top bar that writes the choice to local storage.
3. Persist server-side for signed-in users so the choice follows them across devices.

## Verification

Toggle flips instantly with no flash-of-wrong-theme on reload; the OS default applies for a fresh
visitor.

## Out of scope

Per-component theme overrides; high-contrast mode.
