/** keyPair -- RChain deploy signing keys as Capper persistent objects

    key parts (publicKey, seed) are persisted in hex
    curve is secp256k1, following RChain rnode v0.9.24 9f3a002
*/
/* global Buffer */
// ISSUE: flow typing hasn't been kept up-to-date. TODO: migrate to typescript / JSDoc
// @flow strict

// for customizing the way objects appear in logs
// ref https://nodejs.org/api/util.html#util_custom_inspection_functions_on_objects
// ack: https://stackoverflow.com/a/46870568
import { inspect } from 'util';

import elliptic from 'elliptic';
import rchain from '@tgrospic/rnode-grpc-js';
// Import generated protobuf types (in global scope)
import '../../rnode-grpc-gen/js/DeployService_pb.js';
import '../../rnode-grpc-gen/js/ProposeService_pb.js';

import { once } from '../../capper_start.js';

/*::  // ISSUE: belongs in rchain-api?

export opaque type Hex<T> = string;
export opaque type Signature = Uint8Array;
export opaque type PublicKey = Uint8Array;

export interface SigningKey {
 signBytes(message: Uint8Array): Signature,
 signBytesHex(message: Uint8Array): Hex<Signature>,
 signText(text: string): Signature,
 signTextHex(text: string): Hex<Signature>,
 publicKey(): Hex<PublicKey>,
 label(): string,
};


*/

/*::
import type { Persistent, Context } from '../../capper_start';

export interface DataSigningKey extends SigningKey {
 signDataHex(data: mixed): Hex<Signature>, // ISSUE: belongs in rchain-api?
};

interface KeyP extends Persistent, DataSigningKey {
 init(label: mixed): void,
}

type KeyGenPowers = {
 randomBytes(number): Uint8Array
}
*/

const def = Object.freeze; // cf. ocap design note
const { utils: { toHex } } = elliptic;


export
function appFactory({ randomBytes } /*: KeyGenPowers */) {
  const ec = new elliptic.ec('secp256k1');
  return def({ keyPair });

  function keyPair(context /*: Context<*> */) {
    const state = context.state;

    function init(label /*: string*/) {
      once(state);
      const seed = randomBytes(32);
      const key = ec.keyPair({ priv: seed });

      state.label = label;
      state.publicKey = key.getPublic('hex');
      state.seed = toHex(seed);
    }

    const toString = () => `<keyPair ${state.label}: ${state.publicKey.substring(0, 12)}...>`;

    return def({
      init,
      toString,
      signDeploy: deployObj => rchain.signDeploy(getKey(), deployObj),
      publicKey: () => state.publicKey,
      label: () => state.label,
      [inspect.custom]: toString,
    });

    function getKey() {
      return ec.keyPair({ priv: state.seed });
    }
  }
}


export
function verifyDataSigHex(data /*: Json */, sigHex /*: string */, pubKeyHex /*: string */) {
  const message = toByteArray(fromJSData(data));
  console.log({ sigHex, pubKeyHex, dataHex: b2h(message) });
  return verify(message, h2b(sigHex), h2b(pubKeyHex));
}


function integrationTest({ randomBytes }) {
  const kpApp = appFactory({ randomBytes });

  const deploy1 = {
    term: 'new x in { Nil }',
    timestamp: 1586400683530,
    phloprice: 1,
    phlolimit: 1000000,
    validafterblocknumber: 101,
  };

  // $FlowFixMe: too lazy to stub drop, make
  const context1 /*: Context<*> */ = { state: {} };
  const pair1 = kpApp.keyPair(context1);
  pair1.init('k1');
  console.log('inspect keyPair:', pair1);
  console.log('keyPair.toString():', pair1.toString());
  console.log('public key:', pair1.publicKey());
  const signed1 = pair1.signDeploy(deploy1);
  console.log('signed deploy:', signed1);

  // TODO: with a fixed key, this is a unit test; move it to The Right Place.
  // $FlowFixMe: too lazy to stub drop, make
  const context2 /*: Context<*> */ = {
    state: {
      label: 'fixed',
      publicKey: '0410296587b197be8c96ca5c16f5725160643eecedf433ab478c121dec6d6dd76c3f81558b4744285d44aac9ea175de70e4d6759d9dc1550797b76b8e8a3474102',
      seed: '824ebe64a4a301f932e7c7e13431c51ca463b0bb33ba42c077999b3285d8cf2c'
    }
  };
  const pair2 = kpApp.keyPair(context2);
  // pair1.init('k2');
  console.log('inspect keyPair:', pair2);
  console.log('keyPair.toString():', pair2.toString());
  console.log('public key:', pair2.publicKey());
  const signed2 = pair1.signDeploy(deploy1);
  console.log('signed deploy:', signed2);
}


export
function run(require) {
  // ocap: Import powerful references only when invoked as a main module.
  /* eslint-disable global-require */
  integrationTest({ randomBytes: require('crypto').randomBytes });
}
