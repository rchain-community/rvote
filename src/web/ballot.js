/* eslint-disable no-use-before-define */
/* eslint-disable camelcase */
/* global HTMLButtonElement, HTMLInputElement, HTMLTextAreaElement */
// @ts-check
import jazzicon from 'jazzicon';
import m from 'mithril'; // WARNING: Ambient access to Dom
import htm from 'htm';

import { makeRNodeWeb } from '../vendor/rnode-client-js/src/rnode-web';
import {
  makeRNodeActions,
  rhoExprToJS,
} from '../vendor/rnode-client-js/src/web/rnode-actions';
import {
  testNet,
  getNodeUrls,
} from '../vendor/rnode-client-js/src/rchain-networks';
import { getAddrFromEth } from '../vendor/rnode-client-js/src/rev-address';

import { transferMulti_rho } from '../rho/transfer-multi';

const VOTERS_URI =
  'rho:id:kiijxigqydnt7ds3w6w3ijdszswfysr3hpspthuyxz4yn3ksn4ckzf';

const DUST = 1;

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
 */
export function buildUI({ ethereumAddress, getElementById, fetch, now }) {
  const rnodeWeb = makeRNodeWeb({ fetch, now });

  const theElt = (id) => check.notNull(getElementById(id));

  turnOffSubmit(theElt('ballotForm'));

  /** @type { Account? } */
  let account = null;
  let agenda = check.theInput(theElt('agendaURI')).value;
  let status = '';
  /** @type { QAs? } */
  let questions = null;
  /** @type {{[id: string]: string}?} */
  let answers = {};

  const state = {
    // @ts-ignore why doesn't esnext work in jsconfig.json?
    get account() {
      return account;
    },
    // @ts-ignore
    set account(value) {
      account = value;
      state.agenda = agenda;
    },
    registered: undefined,
    // @ts-ignore
    get status() {
      return status;
    },
    // @ts-ignore
    set status(value) {
      status = value;
      theElt('deployStatus').textContent = value; // kludge? make control?
      m.redraw();
    },
    // @ts-ignore
    get agenda() {
      return agenda;
    },
    // @ts-ignore
    set agenda(value) {
      agenda = value;
      getQuestions().then(({ qas, registered }) => {
        questions = qas;
        state.registered = registered; // TODO: display
        m.redraw();
      });
    },
    // @ts-ignore
    get questions() {
      return questions;
    },
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
        if (value > '') {
          answers[prop] = value;
        } else {
          delete answers[prop];
        }
        m.redraw();
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
    maxFee: 0.05,
  };

  function getQuestions() {
    state.status = '';
    const misc = { name: 'testNet', http: null, httpsAdmin: null }; // typechecker says we need these; runtime says we don't
    const node = getNodeUrls({ ...misc, ...testNet.readOnlys[0] });
    const { rnodeHttp } = rnodeWeb;
    return ballotVoterLookup(
      ui.agendaURI.value,
      state.account.revAddr,
      VOTERS_URI,
      node.httpUrl,
      { rnodeHttp },
    ).catch((err) => {
      console.log({ err });
      state.status = `${
        err && typeof err === 'object' && err.message ? err.message : err
      }`;
    });
  }

  function submitResponse(_ev) {
    state.status = '';
    runDeploy(
      state.response,
      {
        account: state.account,
        phloLimit: 100000000 * state.maxFee,
      },
      {
        rnodeWeb,
        setStatus: (s) => {
          state.status = s;
        },
      },
    ).catch((err) => {
      console.log({ err });
      state.status = `${err}`;
    });
  }

  const submitControl = freeze({
    view() {
      const disabled = !(account && state.response.length > 0);
      return html`<input
        type="submit"
        ...${disabled}
        value="Sign and Submit"
        onclick=${submitResponse}
      />`;
    },
  });

  m.mount(theElt('accountControl'), AccountControl(state, ethereumAddress));
  m.mount(theElt('agendaControl'), AgendaControl(state));
  m.mount(theElt('responseControl'), ResponseControl(state));
  m.mount(theElt('questionList'), QuestionsControl(state));
  m.mount(theElt('phloLimit'), MaxFeeControl(state));
  m.mount(theElt('submitControl'), submitControl);
}

const vizHash = (seed, size = 40) => unDom(jazzicon(size, seed));

/**
 * Show Account
 * @param { () => Promise<string> } ethereumAddress
 * @param {{ account: Account? }} state
 *
 * @typedef {{ revAddr: string, ethAddr: string, name: string }} Account
 */
function AccountControl(state, ethereumAddress) {
  function signIn(_event) {
    ethereumAddress().then((ethAddr) => {
      const revAddr = getAddrFromEth(ethAddr);
      state.account = {
        revAddr,
        name: `gov ${revAddr.slice(0, 8)}`,
        ethAddr: ethAddr.replace(/^0x/, ''),
      };
      m.redraw();
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
          : html`Signed in as ${vizHash(ethJazzSeed(state.account.ethAddr))}<br />
              <small><input readonly value=${state.account.revAddr} /></small>`;
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
 * @returns { Promise<any> }
 */
async function ballotVoterLookup(
  balloturi,
  revAddr,
  votersuri,
  httpUrl,
  { rnodeHttp },
) {
  // return Promise.resolve(testQuestions);

  console.log('looking up agenda on chain...');
  const code = lookup_ballot_user_rho(revAddr, balloturi, votersuri);
  const { expr } = await rnodeHttp(httpUrl, 'explore-deploy', code);
  console.log(code);
  console.log(expr);
  const [
    {
      ExprMap: { data: result },
    },
  ] = expr;
  if (!result) {
    throw new Error(JSON.stringify(result));
  }
  console.log(rhoExprToJS(result));
  return rhoExprToJS(result);
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
 * @param {{ account: { revAddr: string }, phloLimit: number }} pmt
 * @param {{ rnodeWeb: any, setStatus: (s: string) => void}} powers
 * @returns { Promise<{ args: any[], cost: number, rawData: any }> }
 */
function runDeploy(code, { account, phloLimit }, { rnodeWeb, setStatus }) {
  const misc = { name: 'testNet', http: null, httpsAdmin: null }; // typechecker says we need these; runtime says we don't
  const node = getNodeUrls({ ...misc, ...testNet.hosts[0] }); // TODO: get next validator?

  // appSendDeploy has a strange API: only sends the returned data to the log.
  // at least the log is handled with ocap discipline so we can interpose what we need!
  let deployReturnData;
  const { appSendDeploy } = makeRNodeActions(rnodeWeb, {
    log(label, info, ...rest) {
      if (label === 'DEPLOY RETURN DATA') {
        deployReturnData = info;
      }
      console.log(label, info, ...rest);
    },
    warn: console.warn,
  });

  return appSendDeploy({ node, code, account, phloLimit, setStatus }).then(
    (result) => {
      setStatus(result);
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
    view: () => markup(state.questions || {}),
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
 * @param {{ maxFee: number }} state
 */
function MaxFeeControl(state) {
  return freeze({
    view() {
      return html`<small
        >Max transaction fee:
        <input
          id="phloLimit"
          type="number"
          value=${state.maxFee}
          onchange=${(ev) => {
            state.maxFee = parseFloat(ev.target.value);
          }}
      /></small>`;
    },
  });
}
