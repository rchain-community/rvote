// @flow

import blake from 'blakejs';
import elliptic from 'elliptic';
import casper from 'rchain-proto';

import { Base16 } from './hex.js';
import { testVector } from './rgate_test.js';

console.log({ casper });

const { DeployDataProto } = casper;
const secp256k1 = new elliptic.ec('secp256k1');

const harden = (x) => Object.freeze(x); // @agoric/harden

console.log({ secp256k1 });

/*::
interface Doc {
    fetch: typeof fetch,
    getElementById: typeof document.getElementById,
    inputElement: (string) => ?HTMLInputElement,
    clock: () => Date
}

type BlockInfo = {
  blockNumber: number,
}

type DeployInfo = {|
    term: string,
    timestamp: number, // milliseconds
    phloprice: number,
    phlolimit: number,
    validafterblocknumber: number,
|}

type WebDeploy = {|
  data: {|
    term: string,
    timestamp: number,
    phloPrice: number,
    phloLimit: number,
    validAfterBlockNumber: number,
  |},
  sigAlgorithm: 'secp256k1',
  signature: string, // hex
  deployer: string, // hex
|}

interface RNode {
  blocks(number): Promise<BlockInfo[]>
}

type Expr = {| ExprString: {| data: string |} |} |
            {| ExprInt: {| data: number |} |};

type Process = {
  expr: Expr[]
}

interface Observer extends RNode {
  exploreDeploy(string): Promise<Process>
}

interface Validator extends Observer {
  deploy(WebDeploy): Promise<mixed>
}

*/

const defaultPhloInfo = {
  phloprice: 1,
  phlolimit: 10e3,
};

export default function ui(
  { getElementById, inputElement, clock, fetch } /*: Doc */,
) {
  const formValue = (id) => the(inputElement(id)).value;
  async function handleDeploy(_ /*: Event */) {
    const node = Node(fetch, formValue('apiBase'));
    const [{ blockNumber }] = await node.blocks(1);
    console.log({ blockNumber });
    const testing = false;
    const deployInfo /*: DeployInfo */ = testing
      ? testVector[0].input.deployObj
      : {
          ...defaultPhloInfo,
          term: formValue('term'),
          timestamp: clock().valueOf(),
          validafterblocknumber: blockNumber,
        };
    alert(JSON.stringify(deployInfo));
    const keyHex = testing ? testVector[0].input.keyHex : formValue('account');
    const apiBase = formValue('apiBase');
    const data = sign(keyHex, deployInfo);
    const result = node.deploy(data);
    console.log({ result });
  }

  const deployButton = the(getElementById('deploy'));
  deployButton.addEventListener('click', handleDeploy);
}

export function Node(fetch /*: typeof fetch */, apiBase /*: string */) /* : Validator */ {
  return harden({
    async blocks(n /*: number */) /*: Promise<BlockInfo[]> */ {
      const reply = await fetch(`${apiBase}/api/blocks/${n}`);
      return await reply.json();
    },
    async deploy(data /*: WebDeploy */) /*: Promise<mixed> */ {
      const methodUrl = `${apiBase}/api/deploy`;
      console.log({ methodUrl, data });
      const reply = await fetch(methodUrl, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return await reply.json();
    },
    async exploreDeploy(term /*: string */) /*: Promise<Process> */ {
      const methodUrl = `${apiBase}/api/explore-deploy`;
      console.log({ methodUrl, term });
      const reply = await fetch(methodUrl, {
        method: 'POST',
        body: term,
      });
      return await reply.json();
    },
  });
}

function sign(keyHex /*: string */, info /*: DeployInfo */) /*: WebDeploy */ {
  const key = secp256k1.keyFromPrivate(keyHex);
  const {
    term,
    timestamp,
    phloprice: phloPrice,
    phlolimit: phloLimit,
    validafterblocknumber: validAfterBlockNumber,
  } = info;
  const dd = new DeployDataProto();
  // boring imperative style; why can't I use fromObject(info)?
  dd.setTerm(term);
  dd.setTimestamp(timestamp);
  dd.setPhloprice(phloPrice);
  dd.setPhlolimit(phloLimit);
  dd.setValidafterblocknumber(validAfterBlockNumber);
  const deploySerialized = dd.serializeBinary();
  const hashed = blake.blake2bHex(deploySerialized, void 666, 32);
  const deployer = Uint8Array.from(key.getPublic('array'));
  const sigArray = key.sign(hashed, { canonical: true }).toDER('array');
  const sig = Uint8Array.from(sigArray);
  const signedDeploy = { ...info, sig, deployer };
  console.log({ deploySerialized, key, sigArray, sig, signedDeploy });

  return {
    data: {
      term,
      timestamp,
      phloPrice,
      phloLimit,
      validAfterBlockNumber,
    },
    sigAlgorithm: 'secp256k1',
    signature: Base16.encode(sig),
    deployer: Base16.encode(deployer),
  };
}

function the /*:: <T> */(x /*: ?T */) /*: T */ {
  if (!x) {
    throw new TypeError();
  }
  return x;
}

const checkBalance_rho = (addr) => `
  new return, rl(\`rho:registry:lookup\`), RevVaultCh, vaultCh in {
    rl!(\`rho:rchain:revVault\`, *RevVaultCh) |
    for (@(_, RevVault) <- RevVaultCh) {
      @RevVault!("findOrCreate", "${addr}", *vaultCh) |
      for (@maybeVault <- vaultCh) {
        match maybeVault {
          (true, vault) => @vault!("balance", *return)
          (false, err)  => return!(err)
        }
      }
    }
  }
`;


export async function checkBalance(node /*: Observer */, revAddr /*: string */) /*: Promise<number> */ {
  console.log({ revAddr });
  const deloyCode = checkBalance_rho(revAddr);
  const result /*: Process */ = await node.exploreDeploy(deloyCode);
  console.log({ result });
  const {
    expr: [e],
  } = result;
  if (e && e.ExprString) {
    throw new Error(e.ExprString.data);
  }
  return e && e.ExprInt && e.ExprInt.data;
}
