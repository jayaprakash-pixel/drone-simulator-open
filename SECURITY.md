# Security policy

Please report security problems privately, not in a public issue.

- **How:** use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability").
- **What to include:** what you found, how to reproduce it, and what it could affect. Do not include real tokens or
  personal data; if a token was exposed, say where, not what it is.
- **What happens next:** we acknowledge reports within 7 days and keep you informed until the problem is fixed or
  explained.

## Scope notes
- The app and bridge are meant to run on your own computer: the bridge listens on 127.0.0.1 only, and the simulator is
  started bound to loopback. Exposing either to a network is not supported.
- Tokens belong in `web/.env.local` (git-ignored). Values with the `VITE_` prefix are built into the web page, so anyone
  who can load a deployed build can read them: do not deploy a build that contains your tokens.
