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
npm version 0.0.4 --workspaces --include-workspace-root --no-git-tag-version

# 2. Update the wrapper's pin on the core and the exported constant.
#    check:versions will tell you if you miss one.
#    - packages/embed-react/package.json  → dependencies["@onrampfunds/embed"]
#    - packages/embed/src/constants.ts    → VERSION

# 3. Prove it.
npm run verify

# 4. Tag and push. The tag drives the release.
git commit -am "Release 0.0.4"
git tag v0.0.4
git push origin main --tags
```

The workflow checks the tag matches the package version, runs the full verification again, then
publishes the core first and the wrapper second.

You can also run it from the Actions tab with **Run workflow**; it defaults to a dry run that
packs and verifies without publishing.

## Release history

| | |
| --- | --- |
| `0.0.1` | Published **by hand**, to create the two names so trusted publishing could be configured against them. No provenance attestation — provenance requires a supported CI with an OIDC token, and a publish from a laptop cannot produce one. |
| `0.0.2` | The first release through the workflow. Both packages carry SLSA provenance and npm's *"Built and signed on GitHub Actions"* badge, which is the confirmation trusted publishing works end to end. `@onrampfunds/embed-react` at this version is still the name-locking stub. |
| `0.0.3` | The React wrapper proper (CTO-344). |
| `0.0.4` | First release to publish the CDN bundle (CTO-406). The `embed/releases/` and `embed/v0/` paths begin here; earlier versions exist on npm only. |

## The CDN build

Uploaded automatically by the release workflow after npm publish succeeds — npm first, so a failed
publish never leaves an immutable, undeletable bundle for a version that does not exist.

```
embed/releases/<version>/onramp-embed.umd.js       immutable, SRI-pinnable
embed/releases/<version>/onramp-embed.umd.js.map   sourcemap
embed/v<major>/onramp-embed.umd.js                 moving alias
embed/v<major>/onramp-embed.umd.js.map             sourcemap
```

The release summary prints the `integrity` hash and both URLs. Put the hash in the GitHub release
notes; that is where the README tells partners to look for it.

**The alias tracks the major version, so today it is `v0`, not `v1`.** Under semver a 0.x minor may
break compatibility, which means the `v0` alias moves across breaking changes — the README says so
and tells pre-1.0 partners to pin. It becomes a real stability promise at 1.0.

**A version path can never be rewritten.** The bucket lock rule (`embed/releases/`, 365 days)
enforces it at the storage layer, and the workflow checks before uploading so a re-run fails
cleanly rather than being rejected halfway. If a release does half-upload, that version is spent —
cut a new one rather than trying to repair it.

## What must never happen

- **A published package with a runtime dependency.** `check:deps` enforces it. The whole security
  argument to a partner's platform team is that this thing has no supply chain.
- **The two packages at different versions**, or the wrapper depending on a range.
- **A bundle over the 40KB gzipped budget.** It runs in someone else's page.
- **Regulated copy compiled into a release as the only source.** The strings are served; what
  ships is the fallback, and it carries the same compliance sign-off (CTO-404).
