/* eslint-disable no-multi-assign */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-use-before-define */
// usage: ./tally.sh [ballotfile] [transaction-server:port]
// https://github.com/rchain-community/rv2020/issues/35
// an account is counted only once for a choice.
// The case of a person voting for multiple choices the most recent is used.
// the check for the account being allowed to vote is not handled.

// @ts-check

const { assert } = require('console');

const jq = JSON.parse;

/** @type { (items: string[]) => string[] } */
const uniq = (items) => Array.from(new Set(items).values());

/**
 * @param {string[]} argv
 * @param {{
 *   fsp: typeof import('fs').promises,
 *   http: typeof import('http'),
 *   echo: (txt: string) => void
 * }} io
 */
async function main(argv, { fsp, http, echo }) {
  // console.log(argv);
  // TODO: consider docopt if this gets more complex
  const ballot = argv.length >= 3 ? argv[2] : '../web/ballotexample.json';
  const server = argv.length >= 4 ? argv[3] : 'kc-strip.madmode.com:7070';

  const ballotData = JSON.parse(await fsp.readFile(ballot, 'utf8'));

  let whichCurl = (url) => nodeCurl(url, { http });

  if (argv.includes('--test')) {
    runTests(ballotData, { fsp });
    return;
  } else if (argv.includes('--cache')) {
    whichCurl = cachingCurl(',cache', { fsp, http });
  }

  const txByAddr = await download(ballotData, server, {
    curl: whichCurl,
  });

  if (argv.includes('--save')) {
    const dest = argv.slice(-1)[0];
    await fsp.writeFile(dest, JSON.stringify(txByAddr, null, 2));
    return;
  }

  const perItem = tally(ballotData, txByAddr, { echo });
  console.log(perItem);
}

function cachingCurl(dirname, { fsp, http }) {
  const toCache = (url) => `${dirname}/${url.slice(-20)}`;

  return async (url) => {
    console.log('cachingCurl', { url, fn: toCache(url) });
    const contents = await nodeCurl(url, { http });
    assert(url.match('/api/transfer/') && !url.match('undefined'));
    await fsp.writeFile(toCache(url), contents);
    return contents;
  };
}

function curlFromCache(dirname, { fsp }) {
  const toCache = (url) => `../../test/${dirname}/${url.slice(-20)}`;
  const curl = async (url, _powers) => {
    // console.log('look ma, no network!', url);
    try {
      const content = await fsp.readFile(toCache(url), 'utf8');
      return content;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return '[]';
      }
      throw err;
    }
  };
  return curl;
}

// TODO: move this from ./src to ./test
const testSuite = [
  {
    dirname: 'test-dup-order',
    expected: {
      'Member Swag': { yes: 1, no: 1 },
      'Board: DaD': { yes: 1, no: 2 },
      'Board: DoD': { yes: 1, no: 2 },
      'Board: WEC': { yes: 2, no: 2 },
      'Board: RR': { yes: 2, no: 1 },
    },
  },
];

// TODO: move this from ./src to ./test
/**
 * @typedef {{[refID: string]: { shortDesc: string, docLink?: string, yesAddr: string, noAddr: string, abstainAddr: string }}} QAs
 * @param {QAs} ballotData
 */
async function runTests(ballotData, { fsp }) {
  // TODO: ballot data should be part of test input
  for (const testCase of testSuite) {
    let result = 'pass';
    const { dirname, expected } = testCase;
    const curl = curlFromCache(dirname, { fsp });

    const txByAddr = await download(ballotData, 'TEST_SERVER', {
      curl,
    });

    const actual = tally(ballotData, txByAddr, {
      echo: console.log,
    });
    // console.log(JSON.stringify({ actual, expected }, null, 2));
    for (const [id, value] of Object.entries(expected)) {
      if (actual[id].yes !== value.yes) {
        console.error({
          id,
          field: 'yes',
          expected: value.yes,
          actual: actual[id].yes,
        });
        result = 'FAIL';
      }
      if (actual[id].no !== value.no) {
        console.error({
          id,
          field: 'no',
          expected: value.no,
          actual: actual[id].no,
        });
        result = 'FAIL';
      }
    }
    console.log({ dirname, result });
  }
}

/**
 * @param {QAs} ballotData
 * @param {string} server
 * @param {{ curl: (url: string) => Promise<string> }} io
 * @returns {Promise<{[revAddr: string]: TX[]}>}
 */
async function download(ballotData, server, io) {
  const choiceAddrs = Object.values(ballotData)
    .map(({ yesAddr, noAddr, abstainAddr }) => [yesAddr, noAddr, abstainAddr])
    .flat();
  console.log(
    `downloading transactions from ${choiceAddrs.length} choices listed in the ballot...`,
  );
  const voteData = await getTransactions(choiceAddrs, server, io);
  const voters = uniq(
    Object.values(voteData)
      .map((txs) => txs.map((tx) => [tx.fromAddr, tx.toAddr]).flat())
      .flat(),
  );
  console.log(`downloading transactions from ${voters.length} voters...`);
  const voterData = await getTransactions(voters, server, io);
  return { ...voteData, ...voterData };
}

/**
 * @param {QAs} ballotData
 * @param {{[addr: string]: TX[]}} txByAddr
 * @param {{ echo: (txt: string) => void }} io
 */
function tally(ballotData, txByAddr, { echo }) {
  // console.log('ballot:', ballotData);

  // const lastblock = '???????'; // when election is over

  const perItem = {};

  /** @type { (as: string[], bs: string[]) => Set<string> } */
  const intersection = (as, bs) =>
    ((bss) => new Set(as.filter((x) => bss.has(x))))(new Set(bs));

  for (const [id, item] of Object.entries(ballotData)) {
    const { shortDesc: desc, yesAddr, noAddr } = item;
    echo(desc);

    const yesVotes = uniq(txByAddr[yesAddr].map((tx) => tx.fromAddr));
    let yes = yesVotes.length;
    const noVotes = uniq(txByAddr[noAddr].map((tx) => tx.fromAddr));
    let no = noVotes.length;
    perItem[id] = { yes, no };
    echo(`  ${yes} yes votes ${yesAddr}`);
    echo(`  ${no} no votes ${noAddr}`);

    const double = Array.from(intersection(yesVotes, noVotes));
    if (double.length !== 0) {
      echo(` ALERT: ${double} voted both yes and no.`);
      for (const voter of double) {
        for (const acct of txByAddr[voter].map((tx) => tx.toAddr)) {
          if (acct === yesAddr) {
            // echo(`yes found`)
            perItem[id].no = no -= 1;
            break;
          } else if (acct === noAddr) {
            //  echo no found
            perItem[id].yes = yes -= 1;
            break;
          }
        }
      }
      echo(`  ${yes} yes votes ${yesAddr}`);
      echo(`  ${no} no votes ${noAddr}`);
    }
  }
  return perItem;
}

/**
 * @param {string[]} revAddrs
 * @param {string} server
 * @param {{ curl: (url: string) => Promise<string> }} powers
 * @returns { Promise<{[addr: string]: TX[] }>}
 *
 * @typedef {{ fromAddr: string, toAddr: string }} TX
 */
async function getTransactions(revAddrs, server, { curl }) {
  return Object.fromEntries(
    await Promise.all(
      revAddrs.map((addr) =>
        curl(`http://${server}/api/transfer/${addr}`).then((txt) => [
          addr,
          jq(txt),
        ]),
      ),
    ),
  );
}

/**
 * @param {string} url
 * @param {{ http: any }} powers
 * @returns {Promise<string>}
 */
function nodeCurl(url, { http }) {
  // console.log('get', { url });
  return new Promise((resolve, reject) => {
    const req = http.get(url, (response) => {
      let str = '';
      // console.log('Response is ' + response.statusCode);
      response.on('data', (chunk) => {
        str += chunk;
      });
      response.on('end', () => resolve(str));
    });
    req.end();
    req.on('error', reject);
  });
}

if (require.main === module) {
  main(process.argv, {
    // eslint-disable-next-line global-require
    fsp: require('fs').promises,
    // eslint-disable-next-line global-require
    http: require('http'),
    echo: console.log,
  }).catch((err) => console.error(err));
}
