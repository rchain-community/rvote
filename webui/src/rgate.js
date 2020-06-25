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
type BlockInfo = {
  blockNumber: number,
}

export type DeployInfo = {|
    term: string,
    timestamp: number, // milliseconds
    phloprice: number,
    phlolimit: number,
    validafterblocknumber: number,
|}

export type WebDeploy = {|
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

export interface RNode {
  blocks(number): Promise<BlockInfo[]>
}

export type Expr = {| ExprString: {| data: string |} |} |
            {| ExprInt: {| data: number |} |};

export type Process = {
  expr: Expr[]
}

export interface Observer extends RNode {
  exploreDeploy(string): Promise<Process>
}

export interface Validator extends Observer {
  deploy(WebDeploy): Promise<mixed>
}

*/

export function Node(
  fetch /*: typeof fetch */,
  apiBase /*: string */,
) /* : Validator */ {
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

export function sign(
  keyHex /*: string */,
  info /*: DeployInfo */,
) /*: WebDeploy */ {
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

export const checkBalance_rho = (addr /*: string*/) => `
  new return, rl(\`rho:registry:lookup\`), RevVaultCh, vaultCh in {
    rl!(\`rho:rchain:revVault\`, *RevVaultCh) |
    for (@(_, RevVault) <- RevVaultCh) {
      @RevVault!("findOrCreate", ${JSON.stringify(addr)}, *vaultCh) |
      for (@maybeVault <- vaultCh) {
        match maybeVault {
          (true, vault) => @vault!("balance", *return)
          (false, err)  => return!(err)
        }
      }
    }
  }
`;

export function extractBalance(result /*: Process */) /*: number */ {
  const {
    expr: [e],
  } = result;
  if (e && e.ExprString) {
    throw new Error(e.ExprString.data);
  }
  return e && e.ExprInt && e.ExprInt.data;
}
