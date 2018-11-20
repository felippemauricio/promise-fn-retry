# Promise Retry
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/felippemauricio/promise-fn-retry/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/promise-fn-retry.svg?style=flat)](https://www.npmjs.com/package/promise-fn-retry)
[![Build Status](https://travis-ci.org/felippemauricio/promise-fn-retry.svg?branch=master)](https://travis-ci.org/felippemauricio/promise-fn-retry)
[![devDependencies Status](https://david-dm.org/felippemauricio/promise-fn-retry/dev-status.svg)](https://david-dm.org/felippemauricio/promise-fn-retry?type=dev)
[![Coverage Status](https://coveralls.io/repos/github/felippemauricio/promise-fn-retry/badge.svg?branch=master)](https://coveralls.io/github/felippemauricio/promise-fn-retry?branch=master)
[![Code Style](https://badgen.net/badge/code%20style/airbnb/fd5c63)](https://github.com/airbnb/javascript)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/felippemauricio/promise-fn-retry/pulls)

Abstraction for exponential and custom retry strategies to failed promises.

## Installation

Using Yarn

```
yarn add promise-fn-retry
```

Using NPM

```
npm install promise-fn-retry
```

## Examples

```
  import fetch from 'node-fetch';
  import retry from 'promise-fn-retry';

  const requestUser = () => {
    const promiseFn = () => fetch('https://api.github.com/users/14');

    return retry(promiseFn)
      .then(res => res.json());
  };

  export default requestUser;

```
