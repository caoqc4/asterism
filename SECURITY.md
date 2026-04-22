# Security Policy

## Supported Builds

This project is currently in active prototype development. Security fixes will be applied on the latest mainline development version.

## Reporting a Vulnerability

Please do not open a public GitHub issue for sensitive security problems.

Until a dedicated security contact is published, report vulnerabilities privately to the project maintainers through the repository's private contact channel or other trusted maintainer contact path.

When reporting, include:

- affected version or commit
- reproduction steps
- impact summary
- any proof-of-concept details needed to verify the issue

## Sensitive Areas

Please use extra care around:

- keychain access
- local config loading
- scheduler-triggered execution
- AI provider credentials
- shell or filesystem operations
