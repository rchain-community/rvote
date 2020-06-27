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
interface LightBlockInfo {
  blockHash: string,
  blockNumber: number,
}

interface BlockInfo extends LightBlockInfo {
  blockNumber: number,
  blockHash: string,
  deploys: DeployInfo[],
}

// ISSUE: inexact Promise...
export type DeployInfo = {
  deployer: string,
  term: string,
  timestamp: number,
  sig: string,
  sigAlgorithm: string,
  phloPrice: number,
  phloLimit: number,
  validAfterBlockNumber: number,
  cost: number,
  errored: bool,
  systemDeployError: string,
}

export type DeployData = {|
    term: string,
    timestamp: number, // milliseconds
    phloPrice: number,
    phloLimit: number,
    validAfterBlockNumber: number,
|}

export type DeployRequest = {|
  data: DeployData,
  sigAlgorithm: 'secp256k1',
  signature: string, // hex
  deployer: string, // hex
|}

export interface RNode {
  getBlocks(depth: number): Promise<LightBlockInfo[]>,
}

export type RhoExpr = {| ExprString: {| data: string |} |} |
            {| ExprInt: {| data: number |} |} |
            {| ExprUri: {| data: string |} |} |
            {| ExprMap: {| data: { [string]: RhoExpr } |} |};
// ... others; see https://github.com/rchain/rchain/blob/dev/node/src/main/scala/coop/rchain/node/api/WebApi.scala#L120

export type ExploratoryDeployResponse = {
  expr: RhoExpr[],
  block: LightBlockInfo,
}


export type DataRequest = {|
  name: RhoUnforg,
  depth: number,
|};
export type RhoUnforg = {| UnforgDeploy: {| data: string |} |}; // | ...
export type DataResponse = {|
  exprs: RhoExprWithBlock[],
  length: number,
|};
export type RhoExprWithBlock = {|
  expr: RhoExpr,
  block: LightBlockInfo
|}

export interface Observer extends RNode {
  listenForDataAtName(request: DataRequest): Promise<DataResponse>,
  getBlock(hash: string): Promise<BlockInfo>,
  findDeploy(deployId: string): Promise<LightBlockInfo>,
  exploratoryDeploy(string): Promise<ExploratoryDeployResponse>,
}

export interface Validator extends Observer {
  deploy(DeployRequest): Promise<string>
}

*/

export function Node(
  fetch /*: typeof fetch */,
  apiBase /*: string */,
) /* : Validator */ {
  async function finish(resp) {
    const result = await resp.json();
    // Add status if server error
    if (!resp.ok) {
      const ex = new Error(result);
      // $FlowFixMe$ kludge...
      ex.status = resp.status;
      throw ex;
    }
    return result;
  }

  return harden({
    async deploy(request /*: DeployRequest */) /*: Promise<string> */ {
      const methodUrl = `${apiBase}/api/deploy`;
      console.log({ methodUrl, request });
      return finish(
        await fetch(methodUrl, {
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    },
    async listenForDataAtName(
      request /*: DataRequest*/,
    ) /*: Promise<DataResponse> */ {
      const methodUrl = `${apiBase}/api/data-at-name`;
      console.log({ methodUrl, request });
      return finish(
        await fetch(methodUrl, {
          method: 'POST',
          body: JSON.stringify(request),
        }),
      );
    },
    async getBlock(hash /*: string */) /*: Promise<BlockInfo> */ {
      const methodUrl = `${apiBase}/api/block/${hash}`;
      console.log({ methodUrl });
      return finish(await fetch(methodUrl));
    },
    async getBlocks(depth /*: number */) /*: Promise<LightBlockInfo[]> */ {
      return finish(await fetch(`${apiBase}/api/blocks/${depth}`));
    },
    async findDeploy(deployId /*: string */) /*: Promise<BlockInfo> */ {
      const methodUrl = `${apiBase}/api/deploy/${deployId}`;
      console.log({ methodUrl });
      return finish(await fetch(methodUrl, { method: 'GET' }));
    },
    async exploratoryDeploy(
      term /*: string */,
    ) /*: Promise<ExploratoryDeployResponse> */ {
      const methodUrl = `${apiBase}/api/explore-deploy`;
      console.log({ methodUrl, term });
      return finish(
        await fetch(methodUrl, {
          method: 'POST',
          body: term,
        }),
      );
    },
  });
}

export function sign(
  keyHex /*: string */,
  info /*: DeployData */,
) /*: DeployRequest */ {
  const key = secp256k1.keyFromPrivate(keyHex);
  const { term, timestamp, phloPrice, phloLimit, validAfterBlockNumber } = info;
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

export function extractBalance(
  result /*: ExploratoryDeployResponse */,
) /*: number */ {
  const {
    expr: [e],
  } = result;
  if (!e || !e.ExprInt) {
    throw new Error(e && e.ExprString && e.ExprString.data);
  }
  return e && e.ExprInt && e.ExprInt.data;
}
