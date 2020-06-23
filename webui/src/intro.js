/**
 * intro - introductions, keys, registry URIs, avatars, icons, etc.
 */

import makeBlockie from 'ethereum-blockies-base64';

export function ui({ getElementById, inputElement }) {
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
