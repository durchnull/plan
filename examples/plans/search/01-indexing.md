---
description: Build the inverted index and backfill it from existing catalog rows.
date: 2026-07-08
status: not-started
type: feature
part-of: 00-overview.md
---

# Search — phase 1: indexing

## Goal

Stand up the inverted index and populate it from the existing catalog, then keep it current on
writes.

## Steps

1. Create the index schema.
2. Backfill from existing rows.
3. Update the index on catalog create/update/delete.

## Verification

Every existing catalog row is retrievable by a keyword it contains; a new row is indexed within one
write cycle.
