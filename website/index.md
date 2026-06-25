---
layout: home

hero:
  name: promise-fn-retry
  text: Retry a flaky promise, the right way
  tagline: A tiny, typed, isomorphic retry — exponential backoff, jitter, per-attempt timeouts, a total time budget, cancellation and polling. Zero dependencies.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Playground
      link: /playground
    - theme: alt
      text: GitHub
      link: https://github.com/felippemauricio/promise-fn-retry

features:
  - title: Just a function
    details: One call — retry(fn, options). No classes, no builders. The function receives the attempt number and a per-attempt AbortSignal.
  - title: Smart waiting
    details: Exponential backoff with a configurable factor, an optional cap, equal or full jitter, and a getDelay hook to honour Retry-After.
  - title: Bounded
    details: Time out a single hung attempt with attemptTimeout, and cap the total time spent retrying with maxElapsedTime — not just the attempt count.
  - title: Cancellable
    details: Pass an AbortSignal to stop pending retries, in the browser and in Node.
  - title: Selective & decisive
    details: Decide per error with shouldRetry, or throw a BailError to give up immediately on the result.
  - title: Polls, too
    details: Retry on the resolved value with until to wait for a condition — turning retry into a poll-until primitive.
---
