# Demos

Two ways to see `promise-fn-retry` working.

## Browser playground

An interactive page that runs the library against a simulated flaky request and
plots each attempt on a backoff timeline, to scale, as it happens. Tune `times`,
`initialDelayTime`, `backoffFactor`, `maxDelayTime` and `jitter`, and hit
**Abort** to cancel in-flight retries.

Run it locally (builds the library, then serves `demo/browser/`):

```bash
npm run demo:browser
# → http://localhost:8080
```

It's also deployed to GitHub Pages on every push to `main`:
<https://felippemauricio.github.io/promise-fn-retry/>

The page imports the real ESM build at `/promise-fn-retry.js` — locally that's
mapped by `demo/serve.mjs`; on Pages the build is copied in by the workflow.

## Backend (Node)

A tiny flaky HTTP server plus a `retry()` client that calls it. It shows two
scenarios: recovering through exponential backoff with jitter, and cancelling
in-flight retries with an `AbortSignal`.

```bash
npm run demo:backend
```

Needs Node 18+ (for global `fetch`). The script builds the library first, then
runs `demo/backend/server.mjs`.
