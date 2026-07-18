# Mini AI Encyclopedia: Direct Gemini + Pagination

Gemini now loads directly through a Vercel Function instead of reading a committed `data/gemini.json` file.

## Request flow

```text
Browser app.js
  -> /api/gemini
  -> Google Gemini API release-notes HTML
  -> Cheerio parser
  -> normalized JSON response
  -> frontend cards
```

## Gemini source mapping

Source: `https://ai.google.dev/gemini-api/docs/changelog`

The adapter restricts parsing to the article body so navigation lists are ignored.

- Dated `h2`/`h3` release sections are detected through `span.devsite-heading`, `span.devsite-heading-text`, heading `data-text`, or heading text fallbacks.
- The top-level `<ul>` elements after a dated heading and before the next dated heading become `changeSummary`.
- Nested lists are retained as indented bullet lines.
- The first five words from the summary become `changeTitle`.
- The dated heading becomes `changeDate`.

## Pagination

- 25 entries are rendered per page.
- Previous and Next controls appear only when more than 25 filtered entries exist.
- Selecting any hero orb or dock orb resets the archive to page 1.
- Changing the tag filter or sort order also resets page 1.

## Required Vercel structure

```text
api/gemini.js
scripts/sources/fetch-gemini.js
```

The Gemini provider endpoint is:

```js
endpoint: "/api/gemini"
```

## Deployment

1. Push the complete project to GitHub.
2. Import that repository into Vercel.
3. Ensure Vercel's Root Directory points to the folder containing `index.html`, `package.json`, and `api/`.
4. Deploy.
5. Open `/api/gemini` on the deployed domain to verify the adapter before testing the Gemini orb.

The endpoint is cached at Vercel's CDN for 24 hours and may serve stale data while revalidating for up to seven days.
