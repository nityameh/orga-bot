# Security Policy

Orga stores personal messages and, from Phase 3, connected Google account data.
We take that seriously.

## Reporting a vulnerability
Please **do not open a public issue.** Email the maintainer at the address on the
GitHub profile of [@nityameh](https://github.com/nityameh), or use GitHub's
"Report a vulnerability" (private advisory) on this repository.

Include: what you found, how to reproduce it, and the impact. You will get an
acknowledgement within 72 hours.

## Supported versions
Only the latest commit on `main` (the deployed version) receives fixes.

## How we keep Orga secure
- Threat model: [docs/security/THREAT_MODEL.md](docs/security/THREAT_MODEL.md)
- Security decisions: [ADR-006](docs/adr/ADR-006-dashboard-authentication.md) (auth),
  [ADR-010](docs/adr/ADR-010-security-baseline-third-party-data.md) (third-party data, agent actions)
- CI on every change: dependency audit, secret scanning (gitleaks), CodeQL static analysis
- Dependabot weekly dependency updates
