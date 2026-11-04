# ADR-014: Expose Orga's tools as an MCP server

**Status:** Proposed
**Date:** 2026-11-04
**Deciders:** Nitya

## Context
The Model Context Protocol (MCP) is the standard way for AI clients (Claude
Desktop, Claude Code, IDEs) to use external tools and data. Orga's tool registry
(ADR-004) already defines tools with names, descriptions and schemas.

## Decision
Publish the same tool registry over MCP (remote server, OAuth-protected) so a
user can ask any MCP client "what did I promise Acme this week?" and get Orga
data. Tool definitions are written once and served to both the internal agent
and MCP clients (Adapter pattern).

## Consequences
- Requires the session/OAuth work in ADR-006 first.
- Read tools ship first; write tools follow the same approval tiers (ADR-010).

## Revisit When
After the agent loop and auth are stable (Phase 4+).
