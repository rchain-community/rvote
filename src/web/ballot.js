// @ts-check
import jazzicon from 'jazzicon';

import { makeRNodeWeb } from '../vendor/rnode-client-js/src/rnode-web';
import { makeRNodeActions, rhoExprToJS } from '../vendor/rnode-client-js/src/web/rnode-actions';
import { testNet, getNodeUrls } from '../vendor/rnode-client-js/src/rchain-networks';
import { getAddrFromEth } from '../vendor/rnode-client-js/src/rev-address';

import { transferMulti_rho } from '../rho/transfer-multi';
import { lookup_rho } from '../rho/lookup';

const DUST = 1;

const { entries } = Object;

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

/**
 * @param {{
 *  getElementById: typeof document.getElementById,
 *  querySelectorAll: typeof document.querySelectorAll,
 *  createElement: typeof document.createElement,
 *  fetch: typeof window.fetch,
 *  now: typeof Date.now,
 *  ethereumAddress: () => Promise<string>,
 *  }} powers
 */
export function buildUI({ ethereumAddress, getElementById, querySelectorAll, createElement, fetch, now }) {
    const rnodeWeb = makeRNodeWeb({ fetch, now });

    const theElt = id => check.notNull(getElementById(id));
    const ui = {
        ballotForm: theElt('ballotForm'),
        signIn: check.theButton(theElt('signIn')),
        addrViz: theElt('addrViz'),
        questionList: theElt('questionList'),
        response: check.theTextArea(theElt('response')),
        agendaURI: check.theInput(theElt('agendaURI')),
        agendaUriViz: theElt('agendaUriViz'),
        submitResponse: theElt('submitResponse'),
        phloLimit: check.theInput(theElt('phloLimit')),
        deployStatus: theElt('deployStatus'),
    };

    /** @type {{ account?: Account }} */
    const state = { account: undefined };

    /** @type { (form: Element) => void } */
    const turnOffSubmit = (form) => { form.addEventListener('submit', event => { event.preventDefault(); }) };
    turnOffSubmit(ui.ballotForm);

    ui.signIn.addEventListener('click', _ => ethereumAddress().then(ethAddr => {
        const revAddr = getAddrFromEth(ethAddr);
        state.account = {
            revAddr,
            name: `gov ${revAddr.slice(0, 8) }`,
            ethAddr: ethAddr.replace(/^0x/, ''),
        };
        showAccount(state.account, ui.addrViz);

        updateQuestions();
    }));

    const pmt = () => ({ account: state.account, phloLimit: 100000000 * parseFloat(ui.phloLimit.value) });
    /** @type { (status: string) => void } */
    const setStatus = status => { ui.deployStatus.textContent = status; };
    function updateQuestions() {
        setStatus('');
        const misc = { name: 'testNet', http: null, httpsAdmin: null }; // typechecker says we need these; runtime says we don't
        const node = getNodeUrls({ ...misc, ...testNet.readOnlys[0] });
        const { rnodeHttp } = rnodeWeb;
        registryLookup(ui.agendaURI.value, node.httpUrl, { rnodeHttp, setStatus }).then(qas => {
            showQuestions(qas, ui.questionList, { createElement });
            const controls = querySelectorAll('fieldset input[type="radio"]');
            controls.forEach(radio => {
                radio.addEventListener('change', _ => { ui.response.value = response(state.account, controls); });
            })
        })
        .catch(err => {
            console.log({ err });
            setStatus(`${err && typeof err === 'object' && err.message ? err.message : err}`);
        });
    }

    vizHash(hashCode(ui.agendaURI.value), ui.agendaUriViz);
    ui.agendaURI.addEventListener('change', _ => vizHash(hashCode(ui.agendaURI.value), ui.agendaUriViz));
    ui.submitResponse.addEventListener('click', _ => {
        setStatus('');
        runDeploy(ui.response.value, pmt(), { rnodeWeb, setStatus })
            .catch(err => {
                console.log({ err });
                setStatus(`${err}`);
            });
    });
}

/**
 * Show Account
 * @param { Account } info
 * @param { Element } imgHolder
 *
 * @typedef {{ revAddr: string, ethAddr: string, name: string }} Account
 */
function showAccount(info, imgHolder) {
    // First remove the '0x' and convert the 8 digit hex number to
    // decimal with i.e. `parseInt('e30a34bc, 16)` to generate a
    // "jazzicon".
    // -- Parker Sep 2018
    //    https://www.reddit.com/r/ethdev/comments/9fwffj/wallet_ui_trick_mock_the_metamask_account_icon_by/
    console.log(info);
    imgHolder.setAttribute('title', info.revAddr);
    const seed = parseInt(info.ethAddr.slice(0, 8), 16);
    vizHash(seed, imgHolder);
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
 * @param {{ rnodeHttp: any, setStatus: (s: string) => void}} powers
 * @returns { Promise<any> }
 */
async function registryLookup(uri, httpUrl, { rnodeHttp, setStatus }) {
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
 * @param {QAs} qas
 * @param { Element } questionList
 * @param {{ createElement: typeof document.createElement }} powers
 */
function showQuestions(qas, questionList, { createElement }) {
    /** @type { (tag: string, attrs: {[name: string]: string}, children: Array<Element | string>) => Element } */
    function elt(tag, attrs = {}, children = []) {
        const it = createElement(tag);
        entries(attrs).forEach(([name, value]) => it.setAttribute(name, value));
        children.forEach(ch => it.append(ch));
        return it;
    };
    questionList.innerHTML = '';
    entries(qas).forEach(([id, { shortDesc, docLink, yesAddr, noAddr }], qix) => {
        const link = docLink ? [elt('br'), 'see: ', elt('a', { href: docLink, target: '_blank' }, [id])] : [];
        const name = `q${qix}`;
        /** @type { (label: string, value: string) => Element } */
        const radio = (label, value) => elt('td', { class: 'choice' }, [
            elt('input', { name, value, type: 'radio', title: value, ...(value === '' ? { checked: 'checked' } : {}) }),
            ]);
        const qrow = elt('tr', {}, [elt('td', {}, [id]), elt('td', {}, [shortDesc, ...link]),
            radio('no', noAddr), radio('abstain', ''), radio('yes', yesAddr)])
        questionList.appendChild(qrow);
    });
}

/**
 * @typedef {{[refID: string]: { shortDesc: string, docLink?: string, yesAddr: string, noAddr: string }}} QAs
 * @type { QAs }
 */
const testQuestions = {
    "Member Swag": {
        "shortDesc": "The Item of Business I want to propose is to provide all new members with stickers and t-shirts with the RChain logo on it as part of their membership onboarding package.",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#member-swag",
        "yesAddr": "11112i8bYVDYcm4MSbY3d1As28uY151xoMS7AyiTvZ2YmNJ8Nw13v9",
        "noAddr": "11112uGayGEi57D44Drq3V4iw5WWyfXbcVvsDangRTE7TaR3J4U4FD"
    },
    "Board: DaD": {
        "shortDesc": "Daffy Duck for Board Member",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#board-dad",
        "yesAddr": "1111TnFUN7eZBWXp3QQACQRRxpcS5uH5Bpf67vikWhA5e3F6ikAmU",
        "noAddr": "11112Cwtg2Bs4WUAYrXhL9xZXXSXr9Gn62Cty39RhUaBnqjrKkqwAZ"
    },
    "Board: DoD": {
        "shortDesc": "Donald Duck for Board Member",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#board-dod",
        "yesAddr": "1111rbdV9Lsw6DyMSq8ySXDacX7pRUxmVGoYho9gGtfZcQYFdAN42",
        "noAddr": "1111JoeZHDYXqyAgo89VaidQnp7W7M9pvdkFUJTqEBU7SHKx6WF2z"
    },
    "Board: WEC": {
        "shortDesc": "Wile E. Coyote for Board Member",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#board-wec",
        "yesAddr": "11112gUFvJR6JBDYJURETaWUBpEDa1EyjgRHFncEfQ4hGECnciPnhw",
        "noAddr": "11112aoa6NLYomYZro566XZVGEXyCDqeqDcp8Pzg81Ckuws6SexC99"
    },
    "Board: RR": {
        "shortDesc": "Road Runner for Board Member",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#board-rr",
        "yesAddr": "1111krbAKSbyGA9vfa7w4K2pKAxZZn6qjaVEduDLWotDZ8HLt2aXR",
        "noAddr": "1111swBFUPVRwR4ugkDBCvrLwPeR1621B1cHQf3cAkNxt3Zad2eac"
    }
};

/** @type {(account: { revAddr: string }, controls: NodeListOf<Element> ) => string} */
function response(account, controls) {
    const choiceAddrs = Array.from(controls)
        .map(radio => check.theInput(radio)) // filter rather than throw?
        .reduce((acc, cur, _ix, _src) => cur.checked && cur.value > '' ? [...acc, cur] : acc, [])
        .map(radio => radio.value);
    return transferMulti_rho(account.revAddr, choiceAddrs, DUST);
}
