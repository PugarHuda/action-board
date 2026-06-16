## What & why

<!-- What does this change and what problem does it solve? -->

## Checklist

- [ ] `npm test` is green (6 suites)
- [ ] `anna-app validate --strict` passes
- [ ] New behavior has a test
- [ ] If UI text changed: keys added to **both** `en` and `id` in `bundle/i18n.js`
- [ ] If parser/date logic changed: kept Node + Python tool flavours in sync
- [ ] `CHANGELOG.md` updated under **Unreleased**
- [ ] Logic kept in pure modules (`parser`/`board`/`i18n`), not buried in `app.js`

## Screenshots / notes

<!-- For UI changes, attach before/after. Regenerate with `npm run shots` if relevant. -->
