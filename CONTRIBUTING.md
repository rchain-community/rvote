# Design and Development notes for Contributors

## Code style and quality

Style is based on Airbnb's JS style guide. We recommend vs-code with "lint on save".

Contributions should pass `npm run lint`.

We use [ES6 modules][esm], thanks to webpack.

We try to use [`@ts-check`][tsc], that is: typescript checking of JSDoc comments.

[tsc]: https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html#supported-jsdoc
[esm]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules

## RChain APIs

We're using a fork of [@tgrospic/rnode-client-js][rcj] as a git submodule.

We're also thinking about using an update of rchain-community/RChain-API.

[rcj]: https://github.com/tgrospic/rnode-client-js

## Web Dev: bootstrap, mithril

plus

- shepherd.js
- htm

## Continuous deployment with Netlify

... is under dckc's account.

## Roads not taken

The current edb6ec3 rev results from porting work from
https://github.com/rchain-community/rnode-client-js/tree/ballot-ui
git format-patch e4d97ee..c480f4c

after rebasing away history of other designs:

- o2r thru e76e7b64cdc2
- rchat thru cb1055f75c91
- webui thru 252964964f08

We've migrated from [flow comments][fc] to typescript.

[fc]: https://flow.org/en/docs/types/comments/

For bundlers, snowpack looked pretty cool but was a bit flakey so we've switched to webpack.
