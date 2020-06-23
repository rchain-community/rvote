/**
 * intro - introductions, keys, registry URIs, avatars, icons, etc.
 */
// @flow

import makeBlockie from 'ethereum-blockies-base64';

export function ui({ getElementById, inputElement, QRCode }) {
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
}
