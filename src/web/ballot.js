// @ts-check
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
        addrField: theElt('REVAddress'),
        questionList: theElt('questionList'),
        response: check.theTextArea(theElt('response')),
        agendaURI: check.theInput(theElt('agendaURI')),
        getQuestions: check.theButton(theElt('getQuestions')),
        submitResponse: theElt('submitResponse'),
        phloLimit: check.theInput(theElt('phloLimit')),
        deployStatus: theElt('deployStatus'),
    };

    /** @type {{ account?: { revAddr: string, ethAddr: string, name: string }}} */
    const state = { account: undefined };

    /** @type { (form: Element) => void } */
    const turnOffSubmit = (form) => { form.addEventListener('submit', event => { event.preventDefault(); }) };
    turnOffSubmit(ui.ballotForm);

    ui.pickButton.addEventListener('click', _ => ethereumAddress().then(ethAddr => {
        const revAddr = getAddrFromEth(ethAddr);
        ui.addrField.textContent = revAddr;
        state.account = {
            revAddr,
            name: `gov ${revAddr.slice(0, 8) }`,
            ethAddr: ethAddr.replace(/^0x/, ''),
        };
    }));

    const pmt = () => ({ account: state.account, phloLimit: parseInt(ui.phloLimit.value) });
    /** @type { (status: string) => void } */
    const setStatus = status => { ui.deployStatus.textContent = status; };
    function updateQuestions() {
        setStatus('');
        registryLookup(ui.agendaURI.value, pmt(), { rnodeWeb, setStatus }).then(qas => {
            showQuestions(qas, ui.questionList, { createElement });
            const controls = querySelectorAll('fieldset input[type="checkbox"]');
            controls.forEach(radio => {
                radio.addEventListener('change', _ => { ui.response.value = response(state.account, controls); });
            })
        })
        .catch(err => {
            console.log({ err });
            setStatus(`${err}`);
        });
    }
    ui.getQuestions.addEventListener('click', _ => {
        if (!state.account) {
            alert('choose account first');
            return;
        }
        updateQuestions();
    });

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
    entries(qas).forEach(([id, { shortDesc, docLink, revAddr }], qix) => {
        const link = docLink ? [elt('br'), 'see: ', elt('a', { href: docLink, target: '_blank' }, [id])] : [];
        questionList.appendChild(elt('dt', { title: revAddr }, [id]));
        questionList.appendChild(elt('dd', {},
         [elt('label', { title: revAddr }, [elt('input', { type: 'checkbox', title: revAddr }), shortDesc]),
         ...link]));
    });
}

/**
 * @typedef {{[refID: string]: { shortDesc: string, docLink?: string, revAddr: string }}} QAs
 * @type { QAs }
 */
const testQuestions = {
    "Member Swag": {
        "shortDesc": "The Item of Business I want to propose is to provide all new members with stickers and t-shirts with the RChain logo on it as part of their membership onboarding package.",
        "docLink": "https://docs.google.com/docs/SWAG.doc",
        "revAddr": "11112uGayGEi57D44Drq3V4iw5WWyfXbcVvsDangRTE7TaR3J4U4FD"
    },
    "Board: Daffy": {
        "shortDesc": "Daffy Duck for Board Member",
        "revAddr": "11112Cwtg2Bs4WUAYrXhL9xZXXSXr9Gn62Cty39RhUaBnqjrKkqwAZ"
    },
    "Board: Donald": {
        "shortDesc": "Donald Duck for Board Member",
        "revAddr": "1111JoeZHDYXqyAgo89VaidQnp7W7M9pvdkFUJTqEBU7SHKx6WF2z"
    },
    "Board: Coyote": {
        "shortDesc": "Wile E. Coyote for Board Member",
        "revAddr": "11112aoa6NLYomYZro566XZVGEXyCDqeqDcp8Pzg81Ckuws6SexC99"
    },
    "Board: Road Runner": {
        "shortDesc": "Road Runner for Board Member",
        "revAddr": "1111swBFUPVRwR4ugkDBCvrLwPeR1621B1cHQf3cAkNxt3Zad2eac"
    }
};

/** @type {(account: { revAddr: string }, controls: NodeListOf<Element> ) => string} */
function response(account, controls) {
    const choiceAddrs = Array.from(controls)
        .map(radio => check.theInput(radio)) // filter rather than throw?
        .reduce((acc, cur, _ix, _src) => cur.checked ? [...acc, cur] : acc, [])
        .map(radio => radio.getAttribute('title'));
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
