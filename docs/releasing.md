# Releasing

1. Packages publish under the `@yonas-valentin-dev/*` scope (the `@layerflow` scope on npm belongs
   to an unrelated project). To use a different scope, rename every package and its cross-references.
2. Confirm each `packages/*/package.json` points `repository.url` at the real repository
   (`npm run release:check` fails if any is missing or still a placeholder).
3. Generate and commit the lockfile with the selected package manager.
4. Run `npm run check` on both Node.js 22 and Node.js 24.
5. Run `npm run release:check` and resolve every reported item.
6. Publish each package once (see "Bootstrapping the first publish" below).
7. Configure npm trusted publishing for every published workspace package and `publish.yml`.
8. Require two-factor authentication and disallow long-lived publish tokens.
9. Create a GitHub release after versions and changelog are updated.

## Bootstrapping the first publish

A trusted publisher is configured per package at **npmjs.com → Packages → YOUR_PACKAGE → Settings →
Trusted publishing**, a page that only exists once the package has been published. Per the
[official npm docs](https://docs.npmjs.com/trusted-publishers/) there is no way to pre-register a
trusted publisher for a package name that has never been published, so the first release of each
package cannot use the tokenless flow.

For that one release, publish with a short-lived granular access token (or `npm publish` locally
with 2FA), then configure trusted publishing and revoke the token. Every later release runs through
`publish.yml` with no token at all.

Provenance can only be generated inside a supported CI runner, so a local bootstrap publish must
opt out of it explicitly (the packages set `publishConfig.provenance`, which otherwise applies
everywhere):

```bash
npm publish --workspace @yonas-valentin-dev/layerflow-core --access public --provenance=false
```

Once every package exists and trusted publishing is configured, the `publish.yml` workflow adds
provenance automatically via `scripts/publish-changed.mjs`, which publishes only the packages whose
`name@version` is not already on the registry — so re-running a release is safe and idempotent.

The publish workflow uses Node.js 24, npm 11, `id-token: write`, and npm trusted publishing. After
bootstrapping, no long-lived npm publish token is expected.
