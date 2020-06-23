/**
 * intro - introductions, keys, registry URIs, avatars, icons, etc.
 */
// @flow

import makeBlockie from 'ethereum-blockies-base64';
import jazzicon from 'jazzicon';
import { Base16 } from './hex.js';
import './vendor/qrcode/qrcode.js';  // ISSUE: global
// console.log(QRCode);

export function keyUI({ getElementById, inputElement, localStorage, getRandomValues }) {
  console.log('setting up key ui...');

  // don't submit
  getElementById('deployKey3').addEventListener('submit', (event) => {
    event.preventDefault();
  });

  const storeKey = 'deployKeyHex';

  const imgHolder = getElementById('jazz3');
  const keyGenButton = getElementById('keygen3');

  // BUG: jazzicon should be based on eth addr
  // TODO: display REV addr with option to copy to clipboard
  let deployKeyHex = localStorage.getItem(storeKey);

  if (deployKeyHex) {
    keyGenButton.setAttribute('disabled', true);
    showKey(imgHolder, deployKeyHex);
  } else {
    keyGenButton.addEventListener('click', (event) => {
      const eckeylen = 32; // based on https://github.com/tgrospic/rnode-grpc-js/blob/master/src/rnode-address.js#L69
      const buf = new Uint8Array(eckeylen);
      getRandomValues(buf);
      deployKeyHex = Base16.encode(buf);
      localStorage.setItem(storeKey, deployKeyHex);
      showKey(imgHolder, deployKeyHex);
      keyGenButton.setAttribute('disabled', true);
    });
  }
}

function showKey(imgHolder, keyHex) {
  // First remove the '0x' and convert the 8 digit hex number to
  // decimal with i.e. `parseInt('e30a34bc, 16)` to generate a
  // "jazzicon".
  // -- Parker Sep 2018
  //    https://www.reddit.com/r/ethdev/comments/9fwffj/wallet_ui_trick_mock_the_metamask_account_icon_by/
  const seed = parseInt(keyHex.replace('0x', '').slice(0, 8), 16);
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
