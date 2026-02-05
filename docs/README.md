# Documentation

## For Users

| Document | Description |
|----------|-------------|
| [Sync Guide](sync-guide.md) | Device pairing, relay configuration, troubleshooting sync issues |

## For Developers

| Document | Description |
|----------|-------------|
| [Getting Started](getting-started.md) | Development setup, Makefile workflow, environment variables |
| [Architecture](architecture.md) | System design, tech stack, data flow, component overview |
| [Security](security.md) | Threat model, pairing protocol, encryption layers, attack scenarios |
| [Nostr Sync Architecture](nostr-sync-architecture.md) | Hybrid sync design, CRDT integration, Nostr event structure |
| [Testing](testing/README.md) | Test infrastructure, coverage requirements, patterns |

## Design Documents

Implementation plans and design decisions are archived in [plans/](plans/):

- [Phases 7-8-9](plans/phases-7-8-9-implementation.md) -- Error handling, polish, PWA features
- [Phase 5 Sync Protocol](plans/2025-12-27-phase-5-sync-protocol.md)
- [Yjs Migration](plans/2025-12-27-yjs-migration-plan.md)
- [Pairing Flow](plans/2025-12-26-pairingflow-component-design.md)
- [QR Scanner](plans/2025-12-27-qrscanner-component-design.md)
- [QR Display](plans/2025-12-27-qrcodedisplay-component-design.md)
- [LEK Password Derivation](plans/2025-12-27-derive-yjs-password-from-lek.md)

## Other

- [AGENTS.md](../AGENTS.md) -- AI agent guidelines and code conventions
- [CONTRIBUTING.md](../CONTRIBUTING.md) -- How to contribute
