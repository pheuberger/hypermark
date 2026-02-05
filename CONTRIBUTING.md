# Contributing to Hypermark

Thanks for your interest in contributing to Hypermark. This document covers the process for contributing and the guidelines to follow.

## Getting Started

1. Fork the repository
2. Clone your fork and install dependencies:
   ```bash
   git clone https://github.com/<your-username>/hypermark.git
   cd hypermark
   npm install
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. Start the dev server:
   ```bash
   make dev
   ```

See the [Getting Started guide](docs/getting-started.md) for more details on the development environment.

## Development Workflow

### Running Tests

Always run tests before submitting a pull request:

```bash
npm run test:run         # Run all tests once
npm run test:coverage    # Run with coverage report
npm run test:security    # Security-critical tests
```

### Code Style

- The project uses React 18 with JSX (`.jsx` files for components)
- Tailwind CSS v4 for styling (CSS-based config, not `tailwind.config.js`)
- Services are plain JavaScript modules in `src/services/`
- Hooks follow the `use*.js` naming convention in `src/hooks/`

### Project Structure

- **`src/components/`** -- React components, organized by feature domain
- **`src/hooks/`** -- Custom React hooks
- **`src/services/`** -- Business logic (crypto, sync, bookmarks, storage)
- **`src/test-utils/`** -- Shared test helpers and mocks
- **`services/`** -- Backend signaling server (separate Node.js project)

## Submitting Changes

1. Make your changes on a feature branch
2. Write or update tests for your changes
3. Ensure all tests pass: `npm run test:run`
4. Commit with a clear, descriptive message
5. Push to your fork and open a pull request against `main`

### Pull Request Guidelines

- Keep PRs focused -- one feature or fix per PR
- Include a clear description of what changed and why
- If your PR touches crypto or security code, note this explicitly
- Add tests for new functionality
- Update documentation if behavior changes

### Commit Messages

Write concise commit messages that explain the *why*, not just the *what*:

```
Add relay health scoring to prefer faster relays

Previously all relays were treated equally. This adds latency tracking
so the sync service prefers relays with lower response times.
```

## Security Considerations

Hypermark handles sensitive cryptographic operations. If your contribution touches any of the following, extra care is needed:

- **`src/services/crypto.js`** -- Core crypto primitives
- **`src/services/nostr-crypto.js`** -- Nostr keypair derivation
- **`src/services/key-storage.js`** -- Key persistence
- **`src/services/pairing-code.js`** -- Pairing code generation
- **`src/components/pairing/`** -- Pairing UI

Guidelines for security-related code:

- Never expose the raw LEK in logs, network requests, or localStorage
- Never use the raw LEK as a WebRTC password (always derive via HKDF)
- Never publish unencrypted content to Nostr relays
- Keep device keypairs non-extractable (`extractable: false`)
- Security-critical files require **95% test coverage**

See [Security Architecture](docs/security.md) for the full threat model and design constraints.

## Architecture Notes

Before making significant changes, read these docs:

- [Architecture](docs/architecture.md) -- system design and data flow
- [Nostr Sync Architecture](docs/nostr-sync-architecture.md) -- how sync works
- [AGENTS.md](AGENTS.md) -- code conventions and gotchas

Key things to know:

- **React, not Preact** -- despite some older docs, the codebase uses React 18
- **Tailwind v4** -- uses CSS-based `@config`, not `tailwind.config.js`
- **Yjs singleton** -- use `getYdocInstance()` from the useYjs hook; never create new `Y.Doc` instances
- **UndoManager origin** -- local bookmark operations must use `LOCAL_ORIGIN` for proper undo tracking
- **Nostr keypairs are deterministic** -- same LEK always produces the same Nostr keypair (by design)

## Reporting Issues

Open an issue on GitHub with:

- A clear description of the problem or feature request
- Steps to reproduce (for bugs)
- Browser and OS information (for bugs)
- Any relevant error messages or screenshots

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
