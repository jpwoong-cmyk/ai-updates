# Mini AI Encyclopedia: Gemini Live Data

This version connects the Gemini provider to Google's official Gemini API release-notes page while leaving the OpenAI and Anthropic providers on the existing preview data.

## Current Gemini mapping

Source: `https://ai.google.dev/gemini-api/docs/changelog`

Each release date becomes one changelog card:

- `span.devsite-heading` date text becomes the entry `date` used by `.changeDate`.
- The first `<ul>` following that dated heading becomes the full `changeSummary`.
- Nested list items are retained as indented bullet lines.
- The first five words from that list become `changeTitle`.
- Gemini entries currently receive the `API` tag.
- The official dated section is retained in `sourceUrl` when the heading has an ID.

## Added files

```text
scripts/sources/fetch-gemini.js
scripts/update-gemini.js
data/gemini.json
.github/workflows/update-gemini.yml
tests/fetch-gemini.test.js
tests/fixtures/gemini-changelog.html
package.json
```

## How it works

1. GitHub Actions runs at 23:59 in the `Asia/Singapore` timezone.
2. `scripts/update-gemini.js` downloads the official page.
3. Cheerio reads each dated heading and its following release-note list.
4. The updater validates the result before replacing `data/gemini.json`.
5. If the page structure breaks or fewer than 20 entries are found, the workflow fails and the previous valid JSON remains untouched.
6. If nothing changed, no commit is created.
7. If data changed, GitHub Actions commits `data/gemini.json`; Vercel then redeploys from the repository.

## Frontend configuration

Gemini now uses:

```js
api: {
  id: "gemini_API",
  endpoint: "./data/gemini.json"
}
```

`previewMode` remains enabled so OpenAI and Anthropic continue using their preview entries while Gemini uses the real JSON endpoint.

## First GitHub run

After uploading the files to the repository:

1. Open the repository's **Actions** tab.
2. Select **Update Gemini changelog**.
3. Choose **Run workflow**.
4. The workflow fetches the current release notes and commits `data/gemini.json` when successful.

## Local commands

```bash
npm install
npm run test:gemini
npm run update:gemini
```

The live fetch command requires internet access. The included fixture test does not.
