# Contributing

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer (npm 11.5.1 or newer for trusted publishing)

## Local workflow

```bash
npm install
npm run check
```

Write tests before or alongside behavior changes. Public APIs require JSDoc, type-level coverage,
and a changelog entry in the eventual release process.

## Design rules

1. Core must remain framework-independent and side-effect free at import time.
2. Adapters own UI lifecycle details; core never guesses animation durations.
3. New queue behavior must be deterministic under fake timers.
4. Public snapshots remain immutable and stable between changes.
5. Optional platform packages remain peer dependencies.
