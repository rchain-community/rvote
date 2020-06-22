// @flow

import blake from 'blakejs';
import elliptic from 'elliptic';
import casper from 'rchain-proto';
console.log({ casper });

const { DeployDataProto } = casper;
const secp256k1 = new elliptic.ec('secp256k1');

const harden = x => Object.freeze(x); // @agoric/harden

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

type DeployInfo = {
    term: string,
    timestamp: number, // milliseconds
    phloprice: number,
    phlolimit: number,
    validafterblocknumber: number,
}

type WebDeploy = {
  data: {
    term: string,
    timestamp: number,
    phloPrice: number,
    phloLimit: number,
    validAfterBlockNumber: number,
  },
  sigAlgorithm: 'secp256k1',
  signature: string, // hex
  deployer: string, // hex
}
*/

const defaultPhloInfo = {
  phloprice: 1,
  phlolimit: 10e3,
};

const testVector = [
  {
    input: {
      keyHex: "fd894a416f7157075c5dade8a914099f8d7ab1d0d50533420f67139370f8f562",
      deployObj: {
        "term": "new deployId(`rho:rchain:deployId`),\nlog(`rho:io:stdout`)\nin {\n  log!(\"hello\") |\n  deployId!(1 + 1)\n}\n",
        "phlolimit":250000,
        "phloprice":1,
        "validafterblocknumber":216617,
        "timestamp":1592863933369,
      },
    },
    expected: {
      deploySerialized: [
         18, 102, 110, 101, 119,  32, 100, 101, 112, 108,
        111, 121,  73, 100,  40,  96, 114, 104, 111,  58,
        114,  99, 104,  97, 105, 110,  58, 100, 101, 112,
        108, 111, 121,  73, 100,  96,  41,  44,  10, 108,
        111, 103,  40,  96, 114, 104, 111,  58, 105, 111,
         58, 115, 116, 100, 111, 117, 116,  96,  41,  10,
        105, 110,  32, 123,  10,  32,  32, 108, 111, 103,
         33,  40,  34, 104, 101, 108, 108, 111,  34,  41,
         32, 124,  10,  32,  32, 100, 101, 112, 108, 111,
        121,  73, 100,  33,  40,  49,  32,  43,  32,  49,
         41,  10, 125,  10,  24, 185, 135, 219, 240, 173,
         46,  56,   1,  64, 144, 161,  15,  80, 169, 156,
         13
      ],
      hashed: "e92f8b886c9c39f7c6b8673d83c7b1d9102702c6fc04a0d9a8aac8c1f489604b",
    },
  },
  {
    input: {
      keyHex: "fd894a416f7157075c5dade8a914099f8d7ab1d0d50533420f67139370f8f562",
      deployObj: {
        term: "new deployId!(`rho:rchain:deployId`),\nlog(`rho:io:stdout`)\nin {\n  log!(\"hello\") |\n  deployId!(1 + 1)\n}\n",
        phlolimit: 250000,
        phloprice: 1,
        validafterblocknumber: 216586,
        timestamp: 1592862572365,
      },
    },
    expected: {
      key: {
        ec: "...",
        priv: [
          16315746, 29680860, 53747958, 54744084, 59603633, 38077031,
          31121034, 22814065, 37842801, 4153938, 0,
        ]
      },
      sigArray: [
        48, 69, 2, 33, 0, 206, 27, 248, 53, 92, 55, 253, 130, 244, 127,
        168, 200, 123, 90, 38, 76, 9, 191, 83, 23, 224 , 199, 212, 178,
        169, 210, 67, 201, 145, 214, 146, 130, 2, 32, 51, 128, 230, 77,
        143, 48, 241, 149, 197, 241, 175, 132, 41, 176, 37, 64, 1, 93,
        209, 175, 206, 54, 165, 179, 228, 185, 81, 172, 255, 182, 136, 87,
      ],
    },
  },
];

export default function ui({ getElementById, inputElement, clock, fetch } /*: Doc */) {
  const formValue = (id) => the(inputElement(id)).value;
  async function handleDeploy(_ /*: Event */) {
    const node = Node(fetch, formValue('apiBase'));
    const [{ blockNumber }] = await node.blocks(1);
    console.log({ blockNumber });
    const testing = false;
    const deployInfo /*: DeployInfo */ = testing ? testVector[0].input.deployObj : {
      ...defaultPhloInfo,
      term: formValue("term"),
      timestamp: clock().valueOf(),
      validafterblocknumber: blockNumber,
      sigalgorithm: 'secp256k1',
    };
    alert(JSON.stringify(deployInfo));
    const keyHex = testing ? testVector[0].input.keyHex : formValue("account");
    const apiBase = formValue('apiBase');
    const data = sign(keyHex, deployInfo);
    const result = node.deploy(data);
    console.log({ result });
  }

  const deployButton = the(getElementById("deploy"));
  deployButton.addEventListener("click", handleDeploy);
}

function Node(fetch, apiBase) {
  return harden({
    async blocks(n /*: number */) /*: Promise<BlockInfo[]> */{
      const reply = await fetch(`${apiBase}/api/blocks/${n}`);
      return await reply.json();
    },
    async deploy(data /*: WebDeploy */) /*: Promise<mixed> */ {
      console.log({ url: `${apiBase}/api/deploy`, data });
      const reply = await fetch(`${apiBase}/api/deploy`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return await reply.json();
    },
  });
}


const encodeBase16 = bytes =>
      Array.from(bytes).map(x => (x & 0xff).toString(16).padStart(2, '0')).join('');


function sign(keyHex /*: string*/, info /*: DeployInfo */) /*: WebDeploy */ {
  const key = secp256k1.keyFromPrivate(keyHex);
  const {
    term, timestamp,
    phloprice: phloPrice,
    phlolimit: phloLimit,
    validafterblocknumber: validAfterBlockNumber,
  } = info;
  const dd = new DeployDataProto(info);
  // boring imperative style; why can't I use fromObject(info)?
  dd.setTerm(term);
  dd.setTimestamp(timestamp);
  dd.setPhloprice(phloPrice);
  dd.setPhlolimit(phloLimit);
  dd.setValidafterblocknumber(validAfterBlockNumber);
  const deploySerialized = dd.serializeBinary();
  const hashed = blake.blake2bHex(deploySerialized, void 666, 32);
  const deployer = Uint8Array.from(key.getPublic('array'));
  const sigArray = key.sign(hashed, {canonical: true}).toDER('array');
  const sig      = Uint8Array.from(sigArray);
  const signedDeploy = { ...info, sig, deployer };
  console.log({ deploySerialized, key, sigArray, sig, signedDeploy });

  return {
    data: {
      term, timestamp,
      phloPrice, phloLimit,
      validAfterBlockNumber,
    },
    sigAlgorithm: 'secp256k1',
    signature: encodeBase16(sig),
    deployer: encodeBase16(deployer),
  };
}

function the /*:: <T> */(x /*: ?T */) /*: T */ {
  if (!x) {
    throw new TypeError();
  }
  return x;
}
