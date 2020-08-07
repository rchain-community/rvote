// @flow
import { signPrep } from './rgate.js';
import { Base16 } from './hex.js';

export const testVector = [
  {
    input: {
      keyHex:
        'fd894a416f7157075c5dade8a914099f8d7ab1d0d50533420f67139370f8f562',
      deployObj: {
        term:
          'new deployId(`rho:rchain:deployId`),\nlog(`rho:io:stdout`)\nin {\n  log!("hello") |\n  deployId!(1 + 1)\n}\n',
        phloLimit: 250000,
        phloPrice: 1,
        validAfterBlockNumber: 216617,
        timestamp: 1592863933369,
      },
    },
    expected: {
      deploySerialized: '12666e6577206465706c6f794964286072686f3a72636861696e3a6465706c6f79496460292c0a6c6f67286072686f3a696f3a7374646f757460290a696e207b0a20206c6f6721282268656c6c6f2229207c0a20206465706c6f794964212831202b2031290a7d0a18b987dbf0ad2e38014090a10f50a99c0d',
      hashed:
        'e92f8b886c9c39f7c6b8673d83c7b1d9102702c6fc04a0d9a8aac8c1f489604b',
    },
  },
  {
    input: {
      keyHex:
        'fd894a416f7157075c5dade8a914099f8d7ab1d0d50533420f67139370f8f562',
      deployObj: {
        term:
          'new deployId!(`rho:rchain:deployId`),\nlog(`rho:io:stdout`)\nin {\n  log!("hello") |\n  deployId!(1 + 1)\n}\n',
        phloLimit: 250000,
        phloPrice: 1,
        validAfterBlockNumber: 216586,
        timestamp: 1592862572365,
      },
    },
    expected: {
      sigArray: '3045022100ce1bf8355c37fd82f47fa8c87b5a264c09bf5317e0c7d4b2a9d243c991d6928202203380e64d8f30f195c5f1af8429b02540015dd1afce36a5b3e4b951acffb68857',
    },
  },
];

function test1() {
  function check(label, expected, actual) {
    if (typeof expected !== 'string') {
      console.log('expected decoded', expected);
      expected = Base16.encode(expected);
      console.log('expected encoded', expected);
    }
    if (typeof actual !== 'string') {
      actual = Base16.encode(actual);
    }
    
    if (actual === expected) {
      console.log(label, 'OK');
    } else {
      console.log(label, { actual, expected });
      throw new Error(label);
    }
  }

  for (const { input, expected } of testVector) {
    console.log('=== Next test:', input.deployObj.validAfterBlockNumber);
    // console.log({ expected });
    const deployInfo = input.deployObj;
    const keyHex = input.keyHex;
    const actual = signPrep(keyHex, deployInfo);
    // console.log({ actual });
    if (expected.sigArray) {
      check('sigArray', expected.sigArray, actual.sigArray);
    }
    if (expected.sig) {
      check('sig hex', expected.sig, actual.sig);
    }
    if (expected.deploySerialized){
      check('deploySerialized hex', expected.deploySerialized, actual.deploySerialized);
    }
    if (expected.hashed) {
      check('hashed', expected.hashed, actual.hashed);
    }
  }
}

/* global process */
if (process.env.TEST) {
  test1();
}
