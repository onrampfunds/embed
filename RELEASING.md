# Releasing

Both packages publish **at the same version, from the same release, in one workflow run**, and
`@onrampfunds/embed-react` depends on the exact core version rather than a range. A partner never
has to work out which wrapper pairs with which core, and `npm run check:versions` fails the build
if the two ever drift.

## Publishing setup — done

Publishing uses **trusted publishing**: the workflow proves its own identity to npm over OIDC, so
there is no long-lived `NPM_TOKEN` in repository secrets to leak or rotate.

This is configured and no longer needs doing. Recorded here because it is the part that cannot be
done from this repository — it needs admin on the `@onrampfunds` npm org — and because anyone
adding a **third** package will hit the same sequence.

**What is in place:**

| | |
| --- | --- |
| `@onrampfunds/embed` | published, trusted publisher configured |
| `@onrampfunds/embed-react` | published, trusted publisher configured |
| GitHub environment | `npm-publish`, with a protection rule |
| Automation tokens | none, deliberately |

**The trusted publisher on each package** is a GitHub Actions publisher pointing at
`onrampfunds` / `embed` / `release.yml` / `npm-publish`, allowed to **publish only** — the
workflow performs no other registry action, and a credential should not carry permissions no code
path uses. **Publishing access** on each is set to *require two-factor authentication and disallow
bypass 2fa tokens*, the stricter option; npm confirms on that screen that every publishing-access
option is compatible with OIDC, so it costs the workflow nothing.

**Do not add an `NPM_TOKEN` secret.** If one ever appears, delete it — it defeats the point.

### If you add a third package

npm attaches a trusted publisher to a package, and its documentation does not say whether one can
be attached to a name that has never been published. It could not be done for these two, so both
names were created by hand first:

```sh
npm publish --workspace @onrampfunds/<new> --provenance=false --access public
```

`--provenance=false` is required for that one bootstrap publish: provenance can only be generated
from a supported CI with an OIDC token, so a publish from a laptop fails outright with it enabled.
That first version therefore carries no attestation. Configure the trusted publisher immediately
afterwards, and never publish by hand again.

## Cutting a release

```sh
# 1. Set the version everywhere at once. Both packages and the repo move together.
npm version 0.0.2 --workspaces --include-workspace-root --no-git-tag-version

# 2. Update the wrapper's pin on the core and the exported constant.
#    check:versions will tell you if you miss one.
#    - packages/embed-react/package.json  → dependencies["@onrampfunds/embed"]
#    - packages/embed/src/constants.ts    → VERSION

# 3. Prove it.
npm run verify

# 4. Tag and push. The tag drives the release.
git commit -am "Release 0.0.2"
git tag v0.0.2
git push origin main --tags
```

The workflow checks the tag matches the package version, runs the full verification again, then
publishes the core first and the wrapper second.

You can also run it from the Actions tab with **Run workflow**; it defaults to a dry run that
packs and verifies without publishing.

## Release history

`0.0.1` of both packages was published **by hand**, to create the two names so that trusted
publishing could be configured against them. It carries no provenance attestation, because
provenance requires a supported CI with an OIDC token and a publish from a laptop cannot produce
one.

`0.0.2` is the first release through the workflow, and the one that proves the pipeline end to
end. Once it lands, both packages show npm's *"Built and signed on GitHub Actions"* badge — that
badge is the confirmation that trusted publishing is working, and `0.0.1` will not have it.

`@onrampfunds/embed` is the core library and `@onrampfunds/embed-react` is the React wrapper
around it. Both are real as of CTO-344, and they publish together at a matching version.

## The CDN build

The release summary prints the `integrity` hash for `onramp-embed.umd.js`. Publish the bundle to
the Onramp-controlled origin at an **immutable, version-pinned path**, and update the `v1` alias
separately:

```
https://js.onrampfunds.com/embed/0.0.2/onramp-embed.umd.js   ← immutable, hashed, SRI-pinnable
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
