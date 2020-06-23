/**
 * intro - introductions, keys, registry URIs, avatars, icons, etc.
 */
// @flow

import makeBlockie from 'ethereum-blockies-base64';
import jazzicon from 'jazzicon';
import './vendor/qrcode/qrcode.js';  // ISSUE: global
// console.log(QRCode);

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

  const key2Field = inputElement('key2');
  const qr2 = getElementById('qr2');
  key2Field.addEventListener('change', async (event) => {
    console.log('key change! ' + key2Field.value);
    const imgData = await QRCode.toDataURL(key2Field.value);
    qr2.setAttribute('src', imgData);
  });


  const jazz = getElementById('jazz2');
  key2Field.addEventListener('change', async (event) => {

    // First remove the '0x' and convert the 8 digit hex number to
    // decimal with i.e. `parseInt('e30a34bc, 16)` to generate a
    // "jazzicon".
    // -- Parker Sep 2018
    //    https://www.reddit.com/r/ethdev/comments/9fwffj/wallet_ui_trick_mock_the_metamask_account_icon_by/
    const seed = parseInt(key2Field.value.replace('0x', '').slice(0, 8), 16);
    const el = jazzicon(100, seed);
    jazz.appendChild(el);
  });
}
