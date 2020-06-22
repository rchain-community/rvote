// @flow

import blake from 'blakejs';
import elliptic from 'elliptic';
import * as rchain from 'rchain-proto';

const { DeployDataProto } = rchain.casper;
const secp256k1 = new elliptic.ec('secp256k1');

console.log({ secp256k1 });

/*::
interface Doc {
    getElementById: typeof document.getElementById,
    inputElement: (string) => ?HTMLInputElement,
    clock: () => Date
}

type DeployInfo = {
    term: string,
    timestamp: number, // milliseconds
    phloprice: number,
    phlolimit: number,
    validafterblocknumber: number,
}
*/

const defaultPhloInfo = {
  phloprice: 1,
  phlolimit: 10e3,
};

export default function ui({ getElementById, inputElement, clock } /*: Doc */) {
  const formValue = (id) => the(inputElement(id)).value;
  function handleDeploy(_ /*: Event */) {
    const deployInfo /*: DeployInfo */ = {
      ...defaultPhloInfo,
      term: formValue("term"),
      timestamp: clock().valueOf(),
      validafterblocknumber: -1,
      sigalgorithm: 'secp256k1',
    };
    alert(JSON.stringify(deployInfo));
    const msg = DeployDataProto.encode(deployInfo).finish();
    const hashed = blake.blake2bHex(msg, void 666, 32);
    const key = secp256k1.keyFromPrivate(formValue("account"));
    const deployer = Uint8Array.from(key.getPublic('array'));
    const sigArray = key.sign(hashed, {canonical: true}).toDER('array');
    const sig      = Uint8Array.from(sigArray);
    const signedDeploy = { ...deployInfo, sig, deployer };
    console.log({ msg, key, sigArray, sig, signedDeploy });
  }

  const deployButton = the(getElementById("deploy"));
  deployButton.addEventListener("click", handleDeploy);
}

function the /*:: <T> */(x /*: ?T */) /*: T */ {
  if (!x) {
    throw new TypeError();
  }
  return x;
}
