# Releasing

1. Reserve the `@layerflow` npm scope (or rename every package to a scope you own).
2. Replace all `REPLACE_ME` repository placeholders in `packages/*/package.json`.
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

The publish workflow uses Node.js 24, npm 11, `id-token: write`, and npm trusted publishing. After
bootstrapping, no long-lived npm publish token is expected.
