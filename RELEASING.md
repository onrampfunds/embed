# Releasing

Both packages publish **at the same version, from the same release, in one workflow run**, and
`@onrampfunds/embed-react` depends on the exact core version rather than a range. A partner never
has to work out which wrapper pairs with which core, and `npm run check:versions` fails the build
if the two ever drift.

## One-time setup on npmjs.com

This is the part that cannot be done from this repository — it needs someone with **admin on the
`@onrampfunds` npm org**. Until it is done, the release workflow will fail at the publish step.

Publishing uses **trusted publishing**: the workflow proves its own identity to npm over OIDC, so
there is no long-lived `NPM_TOKEN` in repository secrets to leak or rotate. For a public package
that loads into partner dashboards, this is worth doing before the first publish rather than
retrofitting.

Neither package exists on the registry yet — both `@onrampfunds/embed` and
`@onrampfunds/embed-react` currently 404 — so the very first publish has a chicken-and-egg
problem worth understanding before you start.

**Trusted publishing is configured per package, in that package's settings.** npm's documentation
does not say whether a trusted publisher can be attached to a name that has never been published.
It may be possible from the org's package screen; it may not. Try the clean path first and fall
back if npm refuses.

### The clean path — try this first

For **each** of `@onrampfunds/embed` and `@onrampfunds/embed-react`:

1. On npmjs.com, open the package settings → **Publishing access** → **Trusted publisher**. If the
   package does not exist yet, look for the org's **Add package** / **Create package** flow.
2. Add a **GitHub Actions** publisher with:
   - Organization or user: `onrampfunds`
   - Repository: `embed`
   - Workflow filename: `release.yml`
   - Environment: `npm-publish`
3. Set **Publishing access** to *Require two-factor authentication and disallow bypass 2fa tokens*
   — the stricter of the two options — and delete any automation token that exists.

   npm notes on that screen that every publishing-access option is compatible with OIDC trusted
   publishers, so this does not affect the release workflow. What it removes is the class of
   credential that can publish with no human present, which is the entire reason for preferring
   trusted publishing in the first place. Nothing is lost: publishing by hand with interactive 2FA
   still works.

If npm lets you do that for an unpublished name, you are done — skip to **Cutting a release**.

### The fallback — one manual publish to create the name

If npm will not configure a trusted publisher for a package that does not exist, bootstrap each
name once by hand, then switch to OIDC permanently.

```sh
npm login                      # your own account; the org requires 2FA, so expect an OTP prompt
npm publish --workspace @onrampfunds/embed      --provenance=false --access public
npm publish --workspace @onrampfunds/embed-react --provenance=false --access public
```

Two things about that command:

- **`--provenance=false` is required.** Both manifests set `"provenance": true`, and provenance can
  only be generated from a supported CI with an OIDC token — a publish from your laptop fails
  outright with it enabled. The `0.0.1` bootstrap therefore has no attestation; every release from
  the workflow afterwards does.
- **Publish the core first.** The wrapper depends on the exact core version and npm will reject it
  if that version does not exist yet.

Then go back and add the trusted publisher to each package as above. Once that is in place, never
publish from a laptop again.

### GitHub side

In GitHub → Settings → Environments, create an environment named **`npm-publish`** and add
whatever reviewers you want gating a release. The workflow already references it, and the name has
to match what you entered on npm.

**Do not add an `NPM_TOKEN` secret.** If one exists, delete it — it defeats the point.

## Cutting a release

```sh
# 1. Set the version everywhere at once. Both packages and the repo move together.
npm version 0.0.1 --workspaces --include-workspace-root --no-git-tag-version

# 2. Update the wrapper's pin on the core and the exported constant.
#    check:versions will tell you if you miss one.
#    - packages/embed-react/package.json  → dependencies["@onrampfunds/embed"]
#    - packages/embed/src/constants.ts    → VERSION

# 3. Prove it.
npm run verify

# 4. Tag and push. The tag drives the release.
git commit -am "Release 0.0.1"
git tag v0.0.1
git push origin main --tags
```

The workflow checks the tag matches the package version, runs the full verification again, then
publishes the core first and the wrapper second.

You can also run it from the Actions tab with **Run workflow**; it defaults to a dry run that
packs and verifies without publishing.

## The first release

`0.0.1` of **both** packages is a placeholder, published to lock both names and prove the pipeline
end to end before anyone depends on either.

`@onrampfunds/embed` at `0.0.1` is the real library. `@onrampfunds/embed-react` at `0.0.1` is a
name-locking stub — the wrapper itself is CTO-344.

## The CDN build

The release summary prints the `integrity` hash for `onramp-embed.umd.js`. Publish the bundle to
the Onramp-controlled origin at an **immutable, version-pinned path**, and update the `v1` alias
separately:

```
https://js.onrampfunds.com/embed/0.0.1/onramp-embed.umd.js   ← immutable, hashed, SRI-pinnable
https://js.onrampfunds.com/embed/v1/onramp-embed.umd.js      ← mutable alias, no SRI
```

Put the hash in the GitHub release notes. Partners who pin get subresource integrity; partners who
cannot pin get the alias and accept that it moves.

## What must never happen

- **A published package with a runtime dependency.** `check:deps` enforces it. The whole security
  argument to a partner's platform team is that this thing has no supply chain.
- **The two packages at different versions**, or the wrapper depending on a range.
- **A bundle over the 40KB gzipped budget.** It runs in someone else's page.
- **Regulated copy compiled into a release as the only source.** The strings are served; what
  ships is the fallback, and it carries the same compliance sign-off (CTO-404).
