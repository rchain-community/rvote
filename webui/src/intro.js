/**
 * intro - introductions, keys, registry URIs, avatars, icons, etc.
 */
/* global Intl */
// @flow strict

import makeBlockie from 'ethereum-blockies-base64';
import jazzicon from 'jazzicon';

import { getAddrFromPrivateKey } from './vendor/rnode-address.js';
import './vendor/qrcode/qrcode.js'; // ISSUE: global
import { Base16 } from './hex.js';
import { Node, checkBalance_rho, extractBalance, sign } from './rgate.js';

const eckeylen = 32; // rnode-address.js#L69

/*::
import type { Process, DeployInfo, Observer } from './rgate.js';

type AddrInfo = {
  ethAddr: string,
  revAddr: string,
};

interface DocAccess {
  getElementById: typeof window.getElementById,
  inputElement: (string) => ?HTMLInputElement
}
interface WebAccess {
  fetch: typeof fetch
}
interface ClockAccess {
  clock: () => Date
}
interface RandomAccess {
  getRandomValues: (Uint8Array) => void
}
interface LocalStorageAccess {
  localStorage: typeof localStorage
}
*/

const harden = (x) => Object.freeze(x); // ISSUE: recursive a la @agoric/harden

function the /*:: <T> */(x /*: ?T */) /*: T */ {
  if (!x) {
    throw new TypeError('BUG! assumed truthy');
  }
  return x;
}

/*::
type Deferred<T> = {|
 promise: Promise<T>,
 resolve: (T) => void,
 reject: (mixed) => void
|};
*/

function makeDeferred /*:: <T>*/() /*: Deferred<T> */ {
  let resolve, reject;
  const promise /*: Promise<T> */ = new Promise((win, lose) => {
    resolve = win;
    reject = lose;
  });
  if (!resolve) {
    throw new Error('unreachable');
  }
  if (!reject) {
    throw new Error('unreachable');
  }
  return { promise, resolve, reject };
}

function disable(elt /*: HTMLElement*/) {
  elt.setAttribute('disabled', 'true');
}

function enable(elt /*: HTMLElement*/) {
  elt.removeAttribute('disabled');
}

export function observerUI(
  { inputElement, fetch } /*: DocAccess & WebAccess */,
) {
  console.log('setting up observer ui...');

  const observerControl = the(inputElement('observerApiBase'));
  return harden({
    async exploreDeploy(term /*: string*/) /*: Promise<Process> */ {
      const node = Node(fetch, observerControl.value);
      console.log(observerControl.value);
      disable(observerControl);
      const result = node.exploreDeploy(term);
      enable(observerControl);
      console.log({ result });
      return result;
    },
  });
}

function showAddr(
  info /*: AddrInfo*/,
  imgHolder,
  addrField /*: HTMLInputElement */,
) {
  // First remove the '0x' and convert the 8 digit hex number to
  // decimal with i.e. `parseInt('e30a34bc, 16)` to generate a
  // "jazzicon".
  // -- Parker Sep 2018
  //    https://www.reddit.com/r/ethdev/comments/9fwffj/wallet_ui_trick_mock_the_metamask_account_icon_by/
  console.log(info);
  addrField.value = info.revAddr;
  const seed = parseInt(info.ethAddr.slice(0, 8), 16);
  const el = jazzicon(100, seed);
  imgHolder.appendChild(el);
}

export function acctUI(
  addrInfoP /*: Promise<AddrInfo> */,
  observer /*: Observer */,
  { getElementById, inputElement } /*: DocAccess */,
) {
  console.log('setting up account (read-access) ui...');

  const imgHolder = getElementById('devKeyViz');
  const addrField = the(inputElement('devAddr'));
  const balanceField = the(inputElement('devBal'));
  const balanceButton = getElementById('checkBalance');
  const acctForm = getElementById('deviceKeyForm');

  // don't submit
  acctForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
  addrInfoP.then((info) => {
    showAddr(info, imgHolder, addrField);
  });

  const nf = new Intl.NumberFormat();

  async function showBalance() {
    disable(balanceField);
    disable(balanceButton);
    const info = await addrInfoP;
    console.log({ revAddr: info.revAddr });
    try {
      const result = await observer.exploreDeploy(
        checkBalance_rho(info.revAddr),
      );
      const balance = extractBalance(result);
      balanceField.value = nf.format(balance);
      enable(balanceField);
    } catch (oops) {
      console.log(oops);
      // ISSUE: hmm... now what?
    }
    enable(balanceButton);
  }

  showBalance().then(() => {
    balanceButton.addEventListener('click', showBalance);
  });
}

export function walletUI(
  {
    getElementById,
    inputElement,
    localStorage,
    getRandomValues,
  } /*: DocAccess & RandomAccess & LocalStorageAccess */,
) {
  console.log('setting up wallet ui...');

  const storeKey = 'deviceKey';

  const keyGenButton = getElementById('devKeyGen');

  const keyHexD = makeDeferred/*:: <string> */();

  ((contents) => {
    if (contents) {
      keyHexD.resolve(contents);
    }
  })(localStorage.getItem(storeKey));

  keyGenButton.addEventListener('click', (event) => {
    const buf = new Uint8Array(eckeylen);
    const keyHex = Base16.encode(getRandomValues(buf));
    localStorage.setItem(storeKey, keyHex);
    keyHexD.resolve(keyHex);
  });
  keyHexD.promise.then(() => {
    disable(keyGenButton);
  });

  return harden({
    async getKeyHex() /*: Promise<string> */ {
      const keyHex = await keyHexD.promise;
      return keyHex;
    },
    async getAddrInfo() /*: Promise<AddrInfo> */ {
      const keyHex = await keyHexD.promise;
      const info = getAddrFromPrivateKey(keyHex);
      return { ethAddr: info.ethAddr, revAddr: info.revAddr };
    },
  });
}

export function introUI({ getElementById, inputElement } /*: DocAccess */) {
  console.log('setting up intro ui...');

  // don't submit
  getElementById('intro1').addEventListener('submit', (event) => {
    event.preventDefault();
  });

  const nickField = the(inputElement('nickname'));
  const blockie1 = the(getElementById('blockie1'));
  nickField.addEventListener('change', (event /*: Event*/) => {
    // console.log('change!' + nickField.value);
    const png = makeBlockie(nickField.value);
    blockie1.setAttribute('src', png);
  });
}

const defaultPhloInfo = {
  phloprice: 1,
  phlolimit: 10e3, // ISSUE: default phloLimit?
};

export function validatorUI(
  keyHexP /*: Promise<string> */,
  {
    getElementById,
    inputElement,
    clock,
    fetch,
  } /*: DocAccess & WebAccess & ClockAccess */,
) {
  console.log('setting up validator ui...');

  const validatorControl = the(inputElement('validatorApiBase'));
  const termField = the(inputElement('term'));
  const deployButton = the(getElementById('deploy'));

  async function handleDeploy(_ /*: Event */) {
    const keyHex = await keyHexP;
    const node = Node(fetch, validatorControl.value);
    disable(validatorControl);
    try {
      // TODO: cache blockNumber with TTL ~30sec
      const [{ blockNumber }] = await node.blocks(1);
      console.log({ blockNumber });
      const deployInfo /*: DeployInfo */ = {
        ...defaultPhloInfo,
        term: termField.value,
        timestamp: clock().valueOf(),
        validafterblocknumber: blockNumber,
      };
      const data = sign(keyHex, deployInfo);
      const result = node.deploy(data);
      console.log({ result });
    } catch (oops) {
      console.log(oops);
      // ISSUE: now what?
    }
    enable(validatorControl);
  }

  deployButton.addEventListener('click', handleDeploy);
}
