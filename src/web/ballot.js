/* eslint-disable no-use-before-define */
/* eslint-disable camelcase */
/* global HTMLButtonElement, HTMLInputElement, HTMLTextAreaElement */
// @ts-check
import jazzicon from 'jazzicon';
import m from 'mithril'; // WARNING: Ambient access to Dom
import htm from 'htm';

import { rhoExprToJson, getAddrFromEth } from '@tgrospic/rnode-http-js'
import { makeRNodeWeb } from '../vendor/rnode-client-js/src/rnode-web';
import { makeRNodeActions } from '../vendor/rnode-client-js/src/web/rnode-actions';
import {
  mainNet,
  testNet,
  getNodeUrls,
} from '../vendor/rnode-client-js/src/rchain-networks';

import { transferMulti_rho } from '../rho/transfer-multi';

const VOTERS_URI =
  'rho:id:zr9yi5xaswi1cpmdbqjp6ijxe94fnb8r13ofiea437mn8rps1h11sj';

const DUST = 1;
const REV = 1e8;

const { freeze, entries, values } = Object;

const html = htm.bind(m); // WARNING: Ambient access to Dom

/** @type {(elt: HTMLElement) => unknown } */
const unDom = (elt) => m.trust(elt.outerHTML);

const check = {
  /**
   * @param {T?} x
   * @param { string= } context
   * @returns { T }
   * @template T
   */
  notNull(x, context) {
    if (!x) {
      throw new Error(`null/undefined ${context}`);
    }
    return x;
  },

  /** @type { (elt: unknown) => HTMLButtonElement } */
  theButton(elt) {
    if (!(elt instanceof HTMLButtonElement)) {
      throw new Error('not Button');
    }
    return elt;
  },

  /** @type { (elt: unknown) => HTMLInputElement } */
  theInput(elt) {
    if (!(elt instanceof HTMLInputElement)) {
      throw new Error('not input');
    }
    return elt;
  },

  /** @type { (elt: unknown) => HTMLTextAreaElement } */
  theTextArea(elt) {
    if (!(elt instanceof HTMLTextAreaElement)) {
      throw new Error('not input');
    }
    return elt;
  },
};

/** @type { (form: Element) => void } */
const turnOffSubmit = (form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
  });
};

/**
 * @param {{
 *  getElementById: typeof document.getElementById,
 *  fetch: typeof window.fetch,
 *  now: typeof Date.now,
 *  ethereumAddress: () => Promise<string>,
 *  }} powers
 *
 * @typedef {{[refID: string]: { shortDesc: string, docLink?: string, yesAddr: string, noAddr: string, abstainAddr: string }}} QAs
 * @typedef {{label: string, info?: any, rest?: any[], timestamp?: number }} LogEvent
 */
export function buildUI({ ethereumAddress, getElementById, fetch, now }) {
  const rnodeWeb = makeRNodeWeb({ fetch, now });

  const theElt = (id) => check.notNull(getElementById(id));

  turnOffSubmit(theElt('ballotForm'));

  const state = (() => {
    /** @type { Account? } */
    let account = null;
    let agenda = check.theInput(theElt('agendaURI')).value;
    /** @type {{[id: string]: string}?} */
    const answers = {};
    return {
      /** @type {LogEvent[]} */
      events: [],
      // @ts-ignore
      get event() {
        return state.events.length > 0
          ? state.events[state.events.length - 1]
          : undefined;
      },
      // @ts-ignore
      set event(e) {
        console.log('event', e, state.events);
        state.events.push({ ...e, timestamp: now() });
        m.redraw();
      },
      // @ts-ignore why doesn't esnext work in jsconfig.json?
      get account() {
        return account;
      },
      // @ts-ignore
      set account(value) {
        account = value;
        state.agenda = agenda;
      },
      // @ts-ignore
      get agenda() {
        return agenda;
      },
      // @ts-ignore
      set agenda(value) {
        agenda = value;
        state.event = { label: 'Get', info: 'questions...' };
        getQuestions().then((result) => {
          if (!result) {
            return;
          }
          const { ballot: qas, registered } = result;
          state.questions = qas;
          // default to abstain for all questions
          entries(qas).forEach(([id, { abstainAddr }]) => {
            answers[id] = abstainAddr;
          });
          state.registered = registered; // TODO: display
          state.event = {
            label: registered
              ? 'Verified registered voter'
              : 'ACCOUNT NOT REGISTERED',
          };
        });
      },
      questions: null,
      answers: new Proxy(answers, {
        get(_t, prop) {
          if (typeof prop !== 'string') {
            throw new TypeError(String(prop));
          }
          return answers[prop];
        },
        set(_t, prop, value) {
          if (typeof prop !== 'string') {
            throw new TypeError(String(prop));
          }
          state.events = []; // re-enable Submit
          if (value > '') {
            answers[prop] = value;
          } else {
            delete answers[prop];
          }
          return true;
        },
      }),
      // @ts-ignore
      get response() {
        if (!(account && values(answers).length > 0)) {
          return '';
        }
        const choiceAddrs = values(answers);
        return transferMulti_rho(account.revAddr, choiceAddrs, DUST);
      },
      // @ts-ignore
      get percent() {
        const goals = [
          !!state.account,
          !!state.questions,
          !!state.response.length,
          seen('Submit'),
          !!state.txId,
          !!state.cost,
        ];
        const done = goals.filter((it) => it).length;
        const percent = Math.floor((done / goals.length) * 100);
        const checking =
          seen('STATUS') && !seen('RESULT') ? state.events.length / 2 : 0;
        return percent + checking;
      },
      maxFee: 0.05,
    };
  })();

  const seen = (target) =>
    state.events.filter(({ label }) => label === target).length > 0;

  function getQuestions() {
    const misc = { name: 'testNet', http: null, httpsAdmin: null }; // typechecker says we need these; runtime says we don't
    const node = getNodeUrls({ ...misc, ...testNet.readOnlys[0] });
    const { rnodeHttp } = rnodeWeb;
    return ballotVoterLookup(
      state.agenda,
      state.account.revAddr,
      VOTERS_URI,
      node.httpUrl,
      { rnodeHttp },
    ).catch((err) => {
      console.log({ err });
      state.event = {
        label: 'Error',
        info: `${
          err && typeof err === 'object' && err.message ? err.message : err
        }`,
      };
    });
  }

  function submitResponse(_ev) {
    state.events = [];
    state.event = { label: 'Submit' };
    console.log('Submitting', { state });
    runDeploy(
      state.response,
      {
        account: state.account,
        phloLimit: state.maxFee * REV,
      },
      {
        rnodeWeb,
        log(label, info, ...rest) {
          state.event = { label, info, rest };
          if (label === 'DEPLOY RETURN DATA') {
            state.cost = info.cost / REV;
            state.deployReturn = info.args;
          } else if (label === 'DEPLOY ID (signature)') {
            const SEC = 1000;
            state.txTime = new Date(
              Math.floor(state.event.timestamp / SEC) * SEC,
            );
            state.txId = info;
          }
        },
      },
    ).catch((err) => {
      console.log({ err });
      state.event = { label: 'Error', info: err };
    });
  }

  const statusControl = freeze({
    view() {
      if (!state.event) {
        return html``;
      }
      const { label, info } = state.event;
      if (!info) {
        return html`${label}`;
      }
      if (label === 'RESULT') {
        return html`${'VOTE SUCCESSFULLY REGISTERED !'}`;
      }
      if (label === 'STATUS' && info.startsWith('Checking')) {
        return html`${info.slice(0, 20)}${state.events.length - 5}`;
      }
      return html`${label}: ${`${info}`}`;
    },
  });
  const submitControl = freeze({
    view() {
      const disabled =
        state.response.trim() === '' || seen('SENDING DEPLOY')
          ? { disabled: true }
          : {};
      return html`<input
        type="submit"
        ...${disabled}
        value="Sign and Submit"
        onclick=${submitResponse}
      />`;
    },
  });

  m.mount(theElt('progress-bar'), ProgressControl(state));
  m.mount(theElt('accountControl'), AccountControl(state, ethereumAddress));
  m.mount(theElt('agendaControl'), AgendaControl(state));
  m.mount(theElt('responseControl'), ResponseControl(state));
  m.mount(theElt('questionList'), QuestionsControl(state));
  m.mount(theElt('txInfo'), TxControl(state));
  m.mount(theElt('deployStatus'), statusControl);
  m.mount(theElt('submitControl'), submitControl);
}

const vizHash = (seed, size = 40) => unDom(jazzicon(size, seed));

/**
 * Show Account
 * @param { () => Promise<string> } ethereumAddress
 * @param {{ account: Account?, event: LogEvent }} state
 *
 * @typedef {{ revAddr: string, ethAddr: string, name: string }} Account
 */
function AccountControl(state, ethereumAddress) {
  function signIn(_event) {
    state.event = { label: 'Get', info: 'account...' };
    ethereumAddress().then((ethAddr) => {
      const revAddr = getAddrFromEth(ethAddr);
      state.account = {
        revAddr,
        name: `gov ${revAddr.slice(0, 8)}`,
        ethAddr: ethAddr.replace(/^0x/, ''),
      };
    });
  }

  /**
   * First remove the '0x' and convert the 8 digit hex number to
   * decimal with i.e. `parseInt('e30a34bc, 16)` to generate a
   * "jazzicon".
   * -- Parker Sep 2018
   *    https://www.reddit.com/r/ethdev/comments/9fwffj/wallet_ui_trick_mock_the_metamask_account_icon_by/
   * @type { (a: string) => number }
   */
  const ethJazzSeed = (ethAddr) => parseInt(ethAddr.slice(0, 8), 16);

  return freeze({
    view() {
      const markup =
        state.account === null
          ? html`<button class="navbar-right" onclick=${signIn}>
              Sign In
            </button>`
          : html`REV Addr
              <small><input readonly value=${state.account.revAddr} /></small
              >${vizHash(ethJazzSeed(state.account.ethAddr))}`;
      return markup;
    },
  });
}

function AgendaControl(state) {
  return freeze({
    view() {
      return html`Agenda URI:
        <input
          onchange=${(ev) => {
            state.agenda = ev.target.value;
          }}
          size="60"
          class="coop"
          value=${state.agenda}
        />
        ${vizHash(hashCode(state.agenda))} `;
    },
  });
}

/** @type { (s: string) => number } */
function hashCode(s) {
  // ack: bryc Aug 31, 2018
  // https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0#gistcomment-2694461
  let h = 0;
  for (let i = 0; i < s.length; i += 1)
    // eslint-disable-next-line no-bitwise
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * @param {string} balloturi
 * @param { string } revAddr
 * @param {string} votersuri
 * @param { string } httpUrl
 * @returns { Promise<{ ballot: QAs, registered: boolean }> }
 */
async function ballotVoterLookup(
  balloturi,
  revAddr,
  votersuri,
  httpUrl,
  { rnodeHttp },
) {
  // return Promise.resolve(testQuestions);

  console.log('looking up', { balloturi, votersuri });
  const code = lookup_ballot_user_rho(revAddr, balloturi, votersuri);

  const { expr } = await rnodeHttp(httpUrl, 'explore-deploy', code);
  // console.log(code);
  // console.log(expr);
  const [result] = expr;
  if (!result) {
    throw new Error(JSON.stringify(result));
  }
  // console.log(rhoExprToJson(result));
  return rhoExprToJson(result);
}

/**
 * @param {string} acct
 * @param {string} balloturi
 * @param {string} votersuri
 * @returns { string }
 */
export function lookup_ballot_user_rho(acct, balloturi, votersuri) {
  return `new return ,
    lookup(\`rho:registry:lookup\`)
  in {
    new valueCh in {
      lookup!( \`${balloturi}\` , *valueCh) |
      for (@ballot <- valueCh) {
          lookup!( \`${votersuri}\` , *valueCh) |
          for (@accts <- valueCh) {
            return!({"registered": accts.contains("${acct}") ,"ballot": ballot})
          }
      }
    }}`;
}

/**
 * @param {string} code
 * @param {{ account: Account, phloLimit: number }} pmt
 * @param {{ rnodeWeb: any, log: (l: string, i: any, ...rest: any[]) => void}} powers
 * @returns { Promise<{ args: any[], cost: number, rawData: any }> }
 */
function runDeploy(code, { account, phloLimit }, { rnodeWeb, log }) {
  const misc = { name: 'testNet', http: null, httpsAdmin: null }; // typechecker says we need these; runtime says we don't
  const node = getNodeUrls({ ...misc, ...testNet.hosts[0] }); // TODO: get next validator?

  // appSendDeploy has a strange API: only sends the returned data to the log.
  // at least the log is handled with ocap discipline so we can interpose what we need!
  let deployReturnData;
  const { appSendDeploy } = makeRNodeActions(rnodeWeb, {
    log,
    warn: console.warn,
  });

  const setStatus = (status) => log('STATUS', status);
  return appSendDeploy({ node, code, account, phloLimit, setStatus }).then(
    (result) => {
      log('RESULT', result);
      return deployReturnData;
    },
  );
}

/**
 * @param {{questions?: QAs, answers?: {[id: string]: string}}} state
 */
function QuestionsControl(state) {
  /** @type {(qas: QAs) => any } */
  const markup = (qas) =>
    entries(qas).map(
      ([id, { shortDesc, docLink, yesAddr, noAddr, abstainAddr }], qix) => {
        const name = `q${qix}`;
        /** @type { (value: string) => any } */
        const radio = (value) => html` <td class="choice">
          <input
            type="radio"
            ...${{ name, value, title: value }}
            ...${state.answers[id] === value ? { checked: true } : {}}
            onclick=${(ev) => {
              state.answers[id] = ev.target.value;
            }}
          />
        </td>`;
        return html`
          <tr><td>${id}</td>
          <td>${shortDesc}
           ${
             docLink
               ? html`<br />see: <a href=${docLink} target="_blank">${id}</a>`
               : ''
           }</td>

          ${radio(noAddr)} ${radio(abstainAddr)} ${radio(yesAddr)}
          </dd>`;
      },
    );

  return freeze({
    view: () =>
      markup(
        state.questions || {
          Notice: { shortDesc: 'Stand by for questions...' },
        },
      ),
  });
}

/**
 * @param {{ response: string }} state
 */
function ResponseControl(state, attrs = { rows: 4, cols: 80 }) {
  return freeze({
    view() {
      return html`<textarea readonly ...${attrs}>${state.response}</textarea>`;
    },
  });
}

/**
 * @param {{ maxFee: number, txId?: string, txTime?: Date, cost?: number }} state
 */
function TxControl(state) {
  return freeze({
    view() {
      return html`<small
        >Time: ${state.txTime ? state.txTime.toISOString() : ''}<br />
        TxId: <b>${state.txId}</b><br />
        Max transaction fee:
        <input
          id="phloLimit"
          type="number"
          step="0.001"
          value=${state.maxFee}
          onchange=${(ev) => {
            state.maxFee = parseFloat(ev.target.value);
          }}
        />
        <br />
        Cost: <input readonly value=${state.cost} />
      </small>`;
    },
  });
}

/**
 * @param {{ percent: number }} state
 */
function ProgressControl(state) {
  return freeze({
    view() {
      const { percent } = state;
      return html`
        <div
          class="progress-bar"
          role="progressbar"
          style="width: ${percent}%;"
          aria-valuenow="${percent}"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          ${percent}%
        </div>
      `;
    },
  });
}
