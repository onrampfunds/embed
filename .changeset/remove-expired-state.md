---
"@onrampfunds/embed": minor
"@onrampfunds/embed-react": minor
---

Remove the expired state. The partner API serves no expiry field and no
`expiredDisclosure` string, so the state was unreachable through a conformant
integration. `validUntil` is no longer accepted, `CardState` and `EmbedEvent`
drop `'expired'`, and `ServedCopy` drops `expiredDisclosure`.
