/* global document, window */
import Shepherd from 'shepherd.js';

import { ethereumAddress } from './vendor/rnode-client-js/src/eth/eth-wrapper.js';
import { addTour } from './web/tour-help.js';
import { buildUI } from './web/ballot.js';

window.addEventListener('DOMContentLoaded', (_event) => {
  buildUI({
    ethereumAddress,
    fetch: window.fetch,
    now: Date.now,
    createElement: (tag) => document.createElement(tag),
    getElementById: (id) => document.getElementById(id),
    querySelectorAll: (selector) => document.querySelectorAll(selector),
  });

  console.log('adding tour...');
  addTour((...args) => new Shepherd.Tour(...args), {
    $: (selector) => document.querySelector(selector),
    $all: (selector) => document.querySelectorAll(selector),
  });
});
