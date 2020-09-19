// @ts-check
import jazzicon from 'jazzicon';
import * as rxjs from 'rxjs';
import * as rxop from 'rxjs/operators';
import htm from 'htm';

import { makeRNodeWeb } from '../vendor/rnode-client-js/src/rnode-web';
import { makeRNodeActions, rhoExprToJS } from '../vendor/rnode-client-js/src/web/rnode-actions';
import { testNet, getNodeUrls } from '../vendor/rnode-client-js/src/rchain-networks';
import { getAddrFromEth } from '../vendor/rnode-client-js/src/rev-address';

import { transferMulti_rho } from '../rho/transfer-multi';
import { lookup_rho } from '../rho/lookup';

const DUST = 1;

const { entries, fromEntries, values } = Object;

/**
 * @template T
 * @typedef {import('rxjs').Observable} Observable<T>
 */

const check = {
    notNull(x, context) {
        if (!x) {
            throw new Error(`null/undefined ${context}`);
        }
        return x;
    },

    /** @type { (elt: unknown) => HTMLButtonElement } */
    theButton(elt) {
        if (!(elt instanceof HTMLButtonElement)) { throw new Error('not Button'); }
        return elt;
    },

    /** @type { (elt: unknown) => HTMLInputElement } */
    theInput(elt) {
        if (!(elt instanceof HTMLInputElement)) { throw new Error('not input'); }
        return elt;
    },

    /** @type { (elt: unknown) => HTMLTextAreaElement } */
    theTextArea(elt) {
        if (!(elt instanceof HTMLTextAreaElement)) { throw new Error('not input'); }
        return elt;
    },
};

/** @type { (button: Element) => Observable<Event> } */
const watchButton = button => rxjs.fromEvent(button, 'click');
/** @type { (field: HTMLInputElement) => Observable<HTMLInputElement> } */
const watchInput = field =>
    rxjs.fromEvent(field, 'change').pipe(
        rxop.map(event => check.theInput(event.target)),
        rxop.startWith(field)
    );
/** @type { (field: HTMLInputElement) => Observable<string> } */
const watchField = field => watchInput(field).pipe(rxop.map(f => f.value));

/**
 * @template T
 * @type { (label: string, obs: Observable<T>) => Observable<T> }
 **/
function slog(label, obs) {
    console.log('SLOG: subscribing to',label);
    obs.subscribe(v => console.log(label, v));
    return obs;
}

/**
 * @param {{
 *  getElementById: typeof document.getElementById,
 *  querySelectorAll: typeof document.querySelectorAll,
 *  createElement: typeof document.createElement,
 *  fetch: typeof window.fetch,
 *  now: typeof Date.now,
 *  ethereumAddress: () => Promise<string>,
 *  }} powers
 *
 * @typedef {{ status?: Status, account?: Account, questions?: QAs, choices?: REVAddress[], response?: RholangProcess }} State
 * @typedef { 'sign in cancelled' | 'getting questions...' | 'sign response cancelled' | voteResult } Status
 * @typedef { string } REVAddress
 * @typedef { string } RholangProcess
 * @typedef { { txid: string } | { message: string} } voteResult
 */
export function buildUI({ ethereumAddress, getElementById, querySelectorAll, createElement, fetch, now }) {
    const rnodeWeb = makeRNodeWeb({ fetch, now });

    /** @type { (id: string) => Element } */
    const theElt = id => check.notNull(getElementById(id));
    const ui = {
        progressbar: theElt('progressbar'),
        ballotForm: theElt('ballotForm'),
        signIn: check.theButton(theElt('signIn')),
        signedIn: theElt('signedIn'),
        addrViz: theElt('addrViz'),
        questionList: theElt('questionList'),
        response: check.theTextArea(theElt('response')),
        agendaURI: check.theInput(theElt('agendaURI')),
        agendaUriViz: theElt('agendaUriViz'),
        submitResponse: check.theInput(theElt('submitResponse')),
        phloLimit: check.theInput(theElt('phloLimit')),
        deployStatus: theElt('deployStatus'),
    };

    /** @type { (form: Element) => void } */
    const turnOffSubmit = (form) => { form.addEventListener('submit', event => { event.preventDefault(); }) };
    turnOffSubmit(ui.ballotForm);

    const render = builder(createElement);

    // @@TODO: use rxjs for status
    /** @type { (status: string) => void } */
    const setStatus = status => { ui.deployStatus.textContent = status; };

    /** @type { Observable<Account> } */
    const acct$ = controlSignIn(ethereumAddress, { signIn: ui.signIn, signedIn: ui.signedIn, addrViz: ui.addrViz });
    slog('acct$', acct$);

    const agendaURI$ = watchField(ui.agendaURI);
    agendaURI$.subscribe(_ => setStatus('getting questions...'));
    agendaURI$.subscribe(agendaURI => vizHash(hashCode(agendaURI), ui.agendaUriViz));

    const { ballot$, votes$ } = controlQAs(agendaURI$, ui.questionList, { rnodeHttp: rnodeWeb.rnodeHttp, render })
    ballot$.subscribe(_ => setStatus(''));

    const response$ = rxjs.combineLatest(acct$, votes$).pipe(
        rxop.map(([acct, votes]) => transferMulti_rho(acct.revAddr, values(votes), DUST))
    );
    response$.subscribe(response => {
        ui.response.value = response;
    });

    const phloLimit$ = watchField(ui.phloLimit).pipe(rxop.map(numeral => 100000000 * parseFloat(numeral)));

    const ready$ = rxjs.combineLatest(acct$, votes$).pipe(rxop.map(av => !!av), rxop.startWith(false));
    ready$.subscribe(ready => ui.submitResponse.disabled = !ready);

    const submit$ = watchButton(ui.submitResponse);
    submit$.subscribe(_ => {
        setStatus('');
        ui.submitResponse.disabled = true;
    });

    const parts$ = slog('parts@@', rxjs.combineLatest(acct$, response$, phloLimit$));
    const tx$ = rxjs.zip(submit$, parts$).pipe(
        rxop.flatMap(([_submit, [account, response, phloLimit]]) =>
            slog('tx$ runDeploy', rxjs.from(runDeploy(response, { account, phloLimit }, { rnodeWeb, setStatus })
                .catch(err => {
                    console.log({ err });
                    setStatus(`${err.message.replace('MetaMask Message Signature:', '')}`);
                })))));
    slog('tx$', tx$);

    const init = obs => obs.pipe(rxop.startWith(null));
    const progress$ = rxjs.combineLatest(init(acct$), init(votes$), init(submit$), init(tx$)).pipe(
        rxop.map(goals => 100 * goals.filter(g => !!g).length / goals.length),
        rxop.distinctUntilChanged(),
    );
    controlProgress(progress$, ui.progressbar);
}

function controlProgress(progress$, progressbar) {
    progress$.subscribe(pct => {
        entries({ class: `progress-bar w-${pct}`, role: 'progressbar', 'aria-valuenow': `${pct}`})
            .forEach(([name, value]) => progressbar.setAttribute(name, value));
        progressbar.textContent = `${pct}%`;
    });
}

 /**
 * Sign In Control
 * @param { () => Promise<string> } ethereumAddress
 * @param { { signIn: Element, signedIn: Element, addrViz: Element } } ui
 *
 * @typedef {{ revAddr: string, ethAddr: string, name: string }} Account
 * @returns { Observable<Account> }
 */
function controlSignIn(ethereumAddress, ui) {
    /** @type Observable<Account> */
    const acct$ = rxjs.combineLatest(rxjs.fromEvent(ui.signIn, 'click'), rxjs.from(ethereumAddress()))
        .pipe(rxop.map(([_click, ethAddr]) => {
            const revAddr = getAddrFromEth(ethAddr);
            return {
                revAddr,
                name: `gov ${revAddr.slice(0, 8) }`,
                ethAddr: ethAddr.replace(/^0x/, '')
            }
        }));

    acct$.subscribe(acct => {
        ui.signIn.classList.add('d-none');
        ui.signedIn.classList.remove('d-none');

        console.log(acct);
        ui.addrViz.setAttribute('title', acct.revAddr);
        vizHash(ethJazzSeed(acct.ethAddr), ui.addrViz);
    });

    return acct$;
}

/**
 * First remove the '0x' and convert the 8 digit hex number to
 * decimal with i.e. `parseInt('e30a34bc, 16)` to generate a
 * "jazzicon".
 * -- Parker Sep 2018
 *    https://www.reddit.com/r/ethdev/comments/9fwffj/wallet_ui_trick_mock_the_metamask_account_icon_by/
 *
 * @param {string} ethAddr
 * @returns { number }
 */
function ethJazzSeed(ethAddr) {
    return parseInt(ethAddr.slice(0, 8), 16);
}

/** @type { (seed: number, holder: Element) => void } */
function vizHash(seed, holder, size = 40) {
    const el = jazzicon(size, seed);
    holder.innerHTML = '';
    holder.appendChild(el);
}

/** @type { (s: string) => number } */
function hashCode(s) {
    // ack: bryc Aug 31, 2018
    // https://gist.github.com/hyamamoto/fd435505d29ebfa3d9716fd2be8d42f0#gistcomment-2694461
    for(var i = 0, h = 0; i < s.length; i++)
        h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return h;
}

/**
 * @param {string} uri
 * @param { string } httpUrl
 * @param {{ rnodeHttp: any }} powers
 * @returns { Promise<any> }
 */
async function registryLookup(uri, httpUrl, { rnodeHttp }) {
    // return Promise.resolve(testQuestions);

    console.log('looking up agenda on chain...');
    const code = lookup_rho(uri);

    const { expr } = await rnodeHttp(httpUrl, 'explore-deploy', code);
    const [{ ExprTuple: { data: [{ ExprBool: { data: ok }}, result]}}] = expr;
    if (!ok) {
        throw new Error(JSON.stringify(result));
    }
    return rhoExprToJS(result);
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

    // TODO: refactor to use rclient.js; return sig / deployId as well.

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

    return appSendDeploy({ node, code, account, phloLimit, setStatus }).then(result => {
        setStatus(result);
        return deployReturnData;
    });
}

/**
 * @param {typeof document.createElement} createElement
 * @returns { Renderer }
 *
 * @typedef { (type: string, props?: Object, ...children: Span[]) => Element } Renderer
 * @typedef { Element | Element[] } Span
 */
function builder(createElement) {
    let ix = 0;

    /** @type { Renderer } */
    return function(type, props, ...children) {
        /** @type Element */
        const elt = createElement(type);
        elt.setAttribute('id', `h_${ix++}`);
        entries(props || {}).forEach(([name, value]) => elt.setAttribute(name, value));
        function append(...more) {
            for (const item of more) {
                if (Array.isArray(item)) {
                    append(...item);
                } else {
                    elt.append(item);
                }
            }
        }
        append(...children);
        return elt;
    };
}

/**
 * @param { Observable<string> } agendaURI$
 * @param { Element } questionList
 * @param { { rnodeHttp: any, render: Renderer  }} powers
 * @returns {{ ballot$: Observable<QAs>, votes$: Observable<{[qid: string]: REVAddress?}> }}
 */
function controlQAs(agendaURI$, questionList, { rnodeHttp, render }) {
    const misc = { name: 'testNet', http: null, httpsAdmin: null }; // typechecker says we need these; runtime says we don't
    const node = getNodeUrls({ ...misc, ...testNet.readOnlys[0] });

    const cmp = (a, b) => a === b ? 0 : a < b ? -1 : 1;
    const byKey = obj => fromEntries(entries(obj).sort(([a, _va], [b, _vb]) => cmp(a, b)));
    const filterValues = (obj, pred) => fromEntries(entries(obj).filter(([_, val]) => pred(val)));

    // rxop.flatMap seems to result in one call per subscriber
    // "RxJS is "unicast" by default while Kefir and Bacon are multicast by default."
    // -- https://github.com/tc39/proposal-observable/issues/66
    const ballot$ = agendaURI$.pipe(
        rxop.flatMap(agendaURI => rxjs.from(registryLookup(agendaURI, node.httpUrl, { rnodeHttp }))),
        rxop.map(qas => byKey(qas))
    );
    /*@@TODO: handle errors from registry lookup
    .catch(err => {
        console.log({ err });
        setStatus(`${err && typeof err === 'object' && err.message ? err.message : err}`);
    });
    */

    ballot$.subscribe(qas => {
        questionList.innerHTML = '';
        const ea = entries(qas).map(([id, info], qix) => renderQuestion(id, qix, info, { render }));
        questionList.append(...ea);
    });

    const withTarget = (votes, target) => (radio => ({...votes, [radio.name]: radio.value }))(check.theInput(target));
    const votes$ = rxjs.fromEvent(questionList, 'change').pipe(
        rxop.scan((votes, event) => withTarget(votes, event.target), {}),
        rxop.map(votes => filterValues(votes, addr => addr.length > 0))
    );
    return { ballot$, votes$ };
}

/**
 *
 * @param {string} id
 * @param { number } qix
 * @param {QInfo} qInfo
 * @param {{ render: Renderer }} io
 * @returns { Element }
 */
function renderQuestion(id, qix, { shortDesc, docLink, yesAddr, noAddr, abstainAddr }, { render }) {
    const html = htm.bind(render);

    const name = `q${qix}`;

    /** @type { (value: string, props?: Object) => HTMLInputElement } */
    const radio = (value, props = {}) =>
        check.theInput(render('input', { type: 'radio', name, value, title: value, ...props }));

    const answers = [radio(noAddr), radio(abstainAddr, {checked: 'checked'}), radio(yesAddr)]; //radio('', {checked: 'checked'})

    const question = html`
      <tr><td>${id}</td>
      <td>${shortDesc}
       ${docLink ? html`<br />see: <a href=${docLink} target="_blank">${id}</a>` : ''}</td>
       ${answers.map(radio => html`<td class="choice">${radio}</td>`)}
      </tr>`;
    if (Array.isArray(question)) {
        throw new TypeError('expected Element; got Element[]');
    }
    return question;
}

function logged(label, x) {
    console.log(label, x);
    return x;
}

/**
 * @typedef {{ shortDesc: string, docLink?: string, yesAddr: string, noAddr: string, abstainAddr: string  }} QInfo
 * @typedef {{[refID: string]: QInfo}} QAs
 *
 * @type { QAs }
 */
const testQuestions = {
    "Member Swag": {
        "shortDesc": "The Item of Business I want to propose is to provide all new members with stickers and t-shirts with the RChain logo on it as part of their membership onboarding package.",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#member-swag",
        "yesAddr": "11112i8bYVDYcm4MSbY3d1As28uY151xoMS7AyiTvZ2YmNJ8Nw13v9",
        "abstainAddr": "111184Ab7raMAoVy6fX8JuoPFB5PggfrEWfzXE4WMzTKioFwmQMsa",
        "noAddr": "11112uGayGEi57D44Drq3V4iw5WWyfXbcVvsDangRTE7TaR3J4U4FD"
    },
    "Board: DaD": {
        "shortDesc": "Daffy Duck for Board Member",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#board-dad",
        "yesAddr": "1111TnFUN7eZBWXp3QQACQRRxpcS5uH5Bpf67vikWhA5e3F6ikAmU",
        "abstainAddr": "11112nT2XooHcCVQLEAsEJhQm6boCS5B7XQ1DBmw6ex3xveiCWRWAx",
        "noAddr": "11112Cwtg2Bs4WUAYrXhL9xZXXSXr9Gn62Cty39RhUaBnqjrKkqwAZ"
    },
    "Board: DoD": {
        "shortDesc": "Donald Duck for Board Member",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#board-dod",
        "abstainAddr": "11113Y89LxqCmjDK9PUDi1dfsEcjAHbBW7mQ3Zw2yqqiwSUibaTkq",
        "yesAddr": "1111rbdV9Lsw6DyMSq8ySXDacX7pRUxmVGoYho9gGtfZcQYFdAN42",
        "noAddr": "1111JoeZHDYXqyAgo89VaidQnp7W7M9pvdkFUJTqEBU7SHKx6WF2z"
    },
    "Board: WEC": {
        "shortDesc": "Wile E. Coyote for Board Member",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#board-wec",
        "yesAddr": "11112gUFvJR6JBDYJURETaWUBpEDa1EyjgRHFncEfQ4hGECnciPnhw",
        "abstainAddr": "1111pKehMgsPBAiqzCSkSekXP4aUXMjY5DvtSXcz72ATP7Pm3RK9o",
        "noAddr": "11112aoa6NLYomYZro566XZVGEXyCDqeqDcp8Pzg81Ckuws6SexC99"
    },
    "Board: RR": {
        "shortDesc": "Road Runner for Board Member",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#board-rr",
        "yesAddr": "1111krbAKSbyGA9vfa7w4K2pKAxZZn6qjaVEduDLWotDZ8HLt2aXR",
        "abstainAddr": "11112CgGiNg3DdMDsYz7UikeSxh7CfFdEbDYzmoJLfS4vx3uZjm55V",
        "noAddr": "1111swBFUPVRwR4ugkDBCvrLwPeR1621B1cHQf3cAkNxt3Zad2eac"
    }
};
