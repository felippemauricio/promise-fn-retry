---
title: Playground
---

# Playground

Tune the core options against a simulated flaky request and watch every attempt
land on the backoff timeline, to scale, in real time. Each feature also has its
own focused demo in the guides — this one puts the main knobs together.

<RetryDemo
  :controls="['times', 'initialDelayTime', 'backoffFactor', 'maxDelayTime', 'jitter', 'forever', 'attemptTimeout', 'maxElapsedTime', 'failUntil', 'bailAt']"
  :preset="{ times: 5, initialDelayTime: 250, failUntil: 3, bailAt: 0 }"
  caption="failUntil sets how many attempts fail before success; bailAt throws a BailError on that attempt." />

::: tip
For the polling (`until`), hung-attempt (`attemptTimeout`) and `Retry-After`
(`getDelay`) behaviours, see the dedicated demos on the
[Poll until done](/guide/until), [Per-attempt timeout](/guide/attempt-timeout)
and [Server-driven delay](/guide/get-delay) pages.
:::
