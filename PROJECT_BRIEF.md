# OpenCentravity v0.2.0 — Project Brief
This repository contains the OpenCentravity v0.2.0 backend, an AI-powered Agentic IDE with hierarchical swarms, messaging, file locking, cost caps, and SQLite-backed multi-agent support.

## Status
- All database layer, CLI command redundancy, and test issues have been fully resolved.
- The test suite is 100% green with 146 tests passing.
- The previous issues recorded in KNOWN_ISSUES.md and HANDOFF.md regarding the tests and migration runner have all been fully resolved.

## Current Priorities
- Implement missing configuration limits (e.g., Cost Cap Enforcement and Retention crons).
- Build the Manager UI dashboard (React + Vite).
- Further develop parallel `delegate_task` capabilities.
