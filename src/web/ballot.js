// @ts-check
import jazzicon from 'jazzicon';
import { getAddrFromEth } from '@tgrospic/rnode-grpc-js';
import { ethereumAddress } from '../eth/eth-wrapper';
import { makeRNodeWeb } from '../rnode-web';
import { makeRNodeActions } from './rnode-actions';
import { testNet, getNodeUrls } from '../rchain-networks';
import { transferMulti_rho } from '../rho/transfer-multi';
import { lookup_rho } from '../rho/lookup';
import { forEachObjIndexed } from 'ramda';

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
 *  ethereumAddress: () => Promise<string>,
 *  }} powers
 */
function buildUI({ ethereumAddress, getElementById, querySelectorAll, createElement, fetch }) {
    const rnodeWeb = makeRNodeWeb({ fetch });

    const theElt = id => check.notNull(getElementById(id));
    const ui = {
        ballotForm: theElt('ballotForm'),
        pickButton: check.theButton(theElt('pickAccount')),
        addrField: check.theInput(theElt('REVAddress')),
        addrViz: theElt('addrViz'),
        questionList: theElt('questionList'),
        response: check.theTextArea(theElt('response')),
        agendaURI: check.theInput(theElt('agendaURI')),
        agendaUriViz: theElt('agendaUriViz'),
        getQuestions: check.theButton(theElt('getQuestions')),
        submitResponse: theElt('submitResponse'),
        phloLimit: check.theInput(theElt('phloLimit')),
        deployStatus: theElt('deployStatus'),
    };

    /** @type {{ account?: Account }} */
    const state = { account: undefined };

    /** @type { (form: Element) => void } */
    const turnOffSubmit = (form) => { form.addEventListener('submit', event => { event.preventDefault(); }) };
    turnOffSubmit(ui.ballotForm);

    ui.pickButton.addEventListener('click', _ => ethereumAddress().then(ethAddr => {
        const revAddr = getAddrFromEth(ethAddr);
        state.account = {
            revAddr,
            name: `gov ${revAddr.slice(0, 8) }`,
            ethAddr: ethAddr.replace(/^0x/, ''),
        };
        showAccount(state.account, ui.addrViz, ui.addrField);
    }));

    const pmt = () => ({ account: state.account, phloLimit: parseInt(ui.phloLimit.value) });
    /** @type { (status: string) => void } */
    const setStatus = status => { ui.deployStatus.textContent = status; };
    function updateQuestions() {
        setStatus('');
        registryLookup(ui.agendaURI.value, pmt(), { rnodeWeb, setStatus }).then(qas => {
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
    ui.getQuestions.addEventListener('click', _ => {
        if (!state.account) {
            alert('choose account first');
            return;
        }
        updateQuestions();
    });
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
 * @param { HTMLInputElement } addrField
 *
 * @typedef {{ revAddr: string, ethAddr: string, name: string }} Account
 */
function showAccount(info, imgHolder, addrField) {
    // First remove the '0x' and convert the 8 digit hex number to
    // decimal with i.e. `parseInt('e30a34bc, 16)` to generate a
    // "jazzicon".
    // -- Parker Sep 2018
    //    https://www.reddit.com/r/ethdev/comments/9fwffj/wallet_ui_trick_mock_the_metamask_account_icon_by/
    console.log(info);
    addrField.value = info.revAddr;
    const seed = parseInt(info.ethAddr.slice(0, 8), 16);
    vizHash(seed, imgHolder);
}


/** @type { (seed: number, holder: Element) => void } */
function vizHash(seed, holder, size = 60) {
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
 * @param {{ account: { revAddr: string }, phloLimit: number }} pmt
 * @param {{ rnodeWeb: any, setStatus: (s: string) => void}} powers
 * @returns { Promise<any> }
 */
function registryLookup(uri, { account, phloLimit }, { rnodeWeb, setStatus }) {
    // return Promise.resolve(testQuestions);

    console.log('looking up agenda on chain...');
    const code = lookup_rho(uri);
    return runDeploy(code, { account, phloLimit }, { rnodeWeb, setStatus })
        .then(deployReturnData => {
            const { args } = deployReturnData;
            return args[1];
        });
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
        "docLink": "https://docs.google.com/docs/SWAG.doc",
        "yesAddr": "11112i8bYVDYcm4MSbY3d1As28uY151xoMS7AyiTvZ2YmNJ8Nw13v9",
        "noAddr": "11112uGayGEi57D44Drq3V4iw5WWyfXbcVvsDangRTE7TaR3J4U4FD"
    },
    "Board: DaD": {
        "shortDesc": "Daffy Duck for Board Member",
        "yesAddr": "1111TnFUN7eZBWXp3QQACQRRxpcS5uH5Bpf67vikWhA5e3F6ikAmU",
        "noAddr": "11112Cwtg2Bs4WUAYrXhL9xZXXSXr9Gn62Cty39RhUaBnqjrKkqwAZ"
    },
    "Board: DoD": {
        "shortDesc": "Donald Duck for Board Member",
        "yesAddr": "1111rbdV9Lsw6DyMSq8ySXDacX7pRUxmVGoYho9gGtfZcQYFdAN42",
        "noAddr": "1111JoeZHDYXqyAgo89VaidQnp7W7M9pvdkFUJTqEBU7SHKx6WF2z"
    },
    "Board: WEC": {
        "shortDesc": "Wile E. Coyote for Board Member",
        "yesAddr": "11112gUFvJR6JBDYJURETaWUBpEDa1EyjgRHFncEfQ4hGECnciPnhw",
        "noAddr": "11112aoa6NLYomYZro566XZVGEXyCDqeqDcp8Pzg81Ckuws6SexC99"
    },
    "Board: RR": {
        "shortDesc": "Road Runner for Board Member",
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


window.addEventListener('DOMContentLoaded', (event) => {
    buildUI({
        ethereumAddress,
        fetch: window.fetch,
        createElement: tag => document.createElement(tag),
        getElementById: id => document.getElementById(id),
        querySelectorAll: selector => document.querySelectorAll(selector),
    });
});
