// usage: ./tally.sh [ballotfile] [transaction-server:port]
// # https://github.com/rchain-community/rv2020/issues/35
// # an account is counted only once for a choice.
// # The case of a person voting for multiple choices the most recent is used.
// # the check for the account being allowed to vote is not handled.

const { assert } = require('console');

const jq = JSON.parse;

async function main(argv, { fsp, http, echo }) {
  // console.log(argv);
  // TODO: consider docopt if this gets more complex
  const ballot = argv.length >= 3 ? argv[2]: 'ballotexample.json';
  const server = argv.length >= 4 ? argv[3]: 'kc-strip.madmode.com:7070';

  const toCache = url => `,cache/${url.slice(-20)}`;
  let whichCurl = curl;

  const ballotData = JSON.parse(await fsp.readFile(ballot, 'utf8'));

  if (argv.includes('--test')) {
    runTests(ballotData, { fsp });
    return;
  } else if (argv.includes('--cache')) {
    const plainCurl = curl;
    const cachingCurl = async (url, { http }) => {
      const contents = await plainCurl(url, { http });
      assert(url.match('/api/transfer/'));
      await fsp.writeFile(toCache(url), contents);
      return contents;
    }
    whichCurl = cachingCurl;
  }

  const perItem = await tally(ballotData, server, { curl: whichCurl, echo });
  console.log(perItem);
}

function curlFromCache(dirname, { fsp }) {
  const toCache = url => `../../test/${dirname}/${url.slice(-20)}`;
  const curl = async (url, _powers) => {
    console.log('look ma, no network!', url);
   return await fsp.readFile(toCache(url), 'utf8');
  }
  return curl;
}

const testSuite = [
  {
    dirname: 'test-dup-order',
    expected: {
      'Member Swag': { yes: 1, no: 2 },
      'Board: DaD': { yes: 1, no: 2 },
      'Board: DoD': { yes: 1, no: 2 },
      'Board: WEC': { yes: 1, no: 2 },
      'Board: RR': { yes: 1, no: 1 },
    }
  },
];

async function runTests(ballotData, { fsp }) {
  // TODO: ballot data should be part of test input
  for (testCase of testSuite) {
    const { dirname, expected } = testCase;
    curl = curlFromCache(dirname, { fsp });
    const actual = await tally(ballotData, 'TEST_SERVER', { curl, echo: console.log });
    // console.log(JSON.stringify({ actual, expected }, null, 2));
    for ([id, value] of Object.entries(expected)) {
      if (actual[id].yes !== value.yes) {
        console.error({ id, field: 'yes', expected: value.yes, actual: actual[id].yes });
      }
      if (actual[id].no !== value.no) {
        console.error({ id, field: 'no', expected: value.no, actual: actual[id].no });
      }
    }
  }
}

async function tally(ballotData, server, { curl, echo }) {
  // console.log('ballot:', ballotData);

  const lastblock = '???????'; // when election is over

  const voteData = await voteTransactions(ballotData, server, { curl });

  const perItem = {};

  for ([id, item] of Object.entries(ballotData)) {
    const { shortDesc: desc, yesAddr, noAddr } = item;
    echo(desc);

    const yesVotes = uniq(voteData[id].yes
                          .map(tx => tx.fromAddr));
    const yes = yesVotes.length;
    const noVotes = uniq(voteData[id].no
                         .map(tx => tx.fromAddr));
    let no = noVotes.length;
    perItem[id] = { yes: yes, no: no };
    echo(`  ${yes} yes votes ${yesAddr}`);
    echo(`  ${no} no votes ${noAddr}`);

    const double = Array.from(new Set([...yesVotes].filter(x => new Set(noVotes).has(x))));
    if (double.length !== 0) {
      echo(` ALERT: ${double} voted both yes and no.`);
      const doubleVotes = await voterTransactions(double, server, { curl });
      const tac = items => items.reverse();
      for (voter of double) {
        for (acct in tac(doubleVotes[voter]).map(tx => tx.toAddr)) {
          if (acct === yesAddr ) {
            // echo(`yes found`)
            no = no - 1;
            perItem[id].no = no;
            break;
          } else if (acct === noAddr) {
            //  echo no found
            yes = yes - 1;
            perItem[id].yes = no;
            break;
          }
        }
      }
      echo(`  ${yes} yes votes ${yesAddr}`);echo(`  ${no} no votes ${noAddr}`);
    }
  }
  return perItem;
}

async function voteTransactions(ballotData, server, { curl }) {
  const votes = {};
  for ([id, item] of Object.entries(ballotData)) {
    const { shortDesc, yesAddr, noAddr } = item;

    votes[id] = {
      yes: jq(await curl(`http://${server}/api/transfer/${yesAddr}`)),
      no: jq(await curl(`http://${server}/api/transfer/${noAddr}`)),
    };
  }
  return votes;
}

async function voterTransactions(fromAddrs, server, { curl }) {
  const byVoter = {};
  for (voter of fromAddrs) {
    byVoter[voter] = jq(await curl(`http://${server}/api/transfer/${voter}`));
  }
  return byVoter;
}


function curl(url, { http }) {
  // console.log('get', { url });
  return new Promise((resolve, reject) => {
    const req = http.get(url, response => {
      let str = '';
      // console.log('Response is ' + response.statusCode);
      response.on('data', chunk => {
          str += chunk;
      });
      response.on('end', () => resolve(str));
    });
    req.end();
    req.on('error', reject);
  })
}

function uniq(items) {
  const s = new Set(items);
  return Array.from(s.values());
}

main(process.argv, {
  fsp: require('fs').promises,
  http: new require('http'),
  echo: console.log,
}).catch(err => console.error(err));
