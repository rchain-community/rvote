/**
 * intro - introductions, keys, registry URIs, avatars, icons, etc.
 */
/* global Intl */
// @flow

import makeBlockie from 'ethereum-blockies-base64';
import jazzicon from 'jazzicon';
import rnode from '@tgrospic/rnode-grpc-js';

import './vendor/qrcode/qrcode.js';  // ISSUE: global
import { Base16 } from './hex.js';
import { Node, checkBalance } from './rgate.js';

// console.log(QRCode);

export function acctUI({ setTimeout,
                         getElementById, inputElement,
                         localStorage,
                         getRandomValues,
                         fetch }) {
  console.log('setting up key ui...');

  // don't submit
  getElementById('deployKey3').addEventListener('submit', (event) => {
    event.preventDefault();
  });

  const storeKey = 'deviceKey';

  const imgHolder = getElementById('devKeyViz');
  const addrField = getElementById('devAddr');
  const balanceField = getElementById('devBal');
  const balanceButton = getElementById("checkBalance");
  const keyGenButton = getElementById('devKeyGen');

  let deviceKeyHex = localStorage.getItem(storeKey);

  if (deviceKeyHex) {
    keyGenButton.setAttribute('disabled', true);
    showKey(deviceKeyHex, imgHolder, addrField);
  } else {
    keyGenButton.addEventListener('click', (event) => {
      const eckeylen = 32; // based on https://github.com/tgrospic/rnode-grpc-js/blob/master/src/rnode-address.js#L69
      const buf = new Uint8Array(eckeylen);
      getRandomValues(buf);
      deviceKeyHex = Base16.encode(buf);
      localStorage.setItem(storeKey, deviceKeyHex);
      showKey(deviceKeyHex, imgHolder, addrField);
      keyGenButton.setAttribute('disabled', true);
    });
  }

  const nf = new Intl.NumberFormat();
  const formValue = (id) => inputElement(id).value;

  async function showBalance() {
    const node = Node(fetch, formValue('observerApiBase'));
    if (deviceKeyHex) {
      try {
        balanceField.setAttribute('disabled', true);
        balanceButton.setAttribute('disabled', true);
        const info = rnode.getAddrFromPrivateKey(deviceKeyHex);
        const balance = await checkBalance(node, info.revAddr);
        balanceField.value = nf.format(balance);
        balanceField.removeAttribute('disabled');
      } catch (oops) {
        console.log(oops);
        // ISSUE: hmm... now what?
      }
      balanceButton.removeAttribute('disabled');
    }
  }

  showBalance();
  balanceButton.addEventListener('click', showBalance);
}

function showKey(keyHex, imgHolder, addrField) {
  // First remove the '0x' and convert the 8 digit hex number to
  // decimal with i.e. `parseInt('e30a34bc, 16)` to generate a
  // "jazzicon".
  // -- Parker Sep 2018
  //    https://www.reddit.com/r/ethdev/comments/9fwffj/wallet_ui_trick_mock_the_metamask_account_icon_by/
  const info = rnode.getAddrFromPrivateKey(keyHex);
  console.log(info);
  addrField.value = info.revAddr;
  const seed = parseInt(info.ethAddr.slice(0, 8), 16);
  const el = jazzicon(100, seed);
  imgHolder.appendChild(el);
}

export function ui({ getElementById, inputElement }) {
  console.log('setting up intro ui...');

  // don't submit
  getElementById('intro1').addEventListener('submit', (event) => {
    event.preventDefault();
  });

  const nickField = inputElement('nickname');
  const blockie1 = getElementById('blockie1');
  nickField.addEventListener('change', (event) => {
    console.log('change!' + nickField.value);
    const png = makeBlockie(nickField.value);
    blockie1.setAttribute('src', png);
  });
}
