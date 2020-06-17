/* global Buffer */
import assert from 'assert';

import rnode_grpc_js from '@tgrospic/rnode-grpc-js';
import grpcLib from '@grpc/grpc-js'; //@@ AMBIENT

// requires --experimental-json-modules
import protoSchema from '../rchain-proto/rnode-grpc-gen/js/pbjs_generated.json';
import '../rchain-proto/rnode-grpc-gen/js/DeployServiceV1_pb.js'; // proto global

async function ensureDeploy(secretKey, validafterblocknumber, { deployService }) {
  const keyInfo = rnode_grpc_js.getAddrFromPrivateKey(secretKey.toString('hex'));
  console.log({deployKey: keyInfo.pubKey, eth: keyInfo.ethAddr });

  const deployData = {
    term: `
      new log(\`rho:io:stderr\`) in {
        log!("hi from rv2020")
      }
      `,
    phloprice: 1,
    phlolimit: 1000,  //@@
    validafterblocknumber,
  };
  const { signDeploy } = rnode_grpc_js;
  const signed = signDeploy(secretKey, deployData);
  console.log({ signedDeploy: signed });
  console.log({ deployService });
  const result = await deployService.doDeploy(signed);
  console.log({ deployResponse: result });
}

function integrationTest(env, { grpcLib }) {
  const rnodeExternalUrl = env.RNODE || '127.0.0.1:40401';
  const { rnodeDeploy } = rnode_grpc_js;
  const deployService = rnodeDeploy({ grpcLib, host: rnodeExternalUrl, protoSchema });
  //assert(!!(env.SECRET_KEY), 'env.SECRET_KEY');
  const secretKey = Buffer.from(env.SECRET_KEY, 'hex');
  ensureDeploy(secretKey, env.BLOCKNUM || -1, { deployService });
}

/* global process */
if (process.env.TEST) {
  integrationTest(process.env, { grpcLib });
}
