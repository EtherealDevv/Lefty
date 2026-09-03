# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.1.x   | ✅        |

## Reporting a Vulnerability

Email: `security@lefty.dev` or open a private security advisory on GitHub.

We use `WH_KEYBOARD_LL` low-level hook and `SendInput` — flagged as keylogger by some AV, it's expected (standard low-level technique). No network, no telemetry.

## Admin

Lefty requests `requireAdministrator` for games that run elevated. No UAC bypass.
