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
            const controls = querySelectorAll('fieldset input[type="radio"]');
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
 * @typedef {{[q: string]: { labels: string[], addresses: string[] }}} QAs
 * @param {QAs} qas
 * @param { Element } questionList
 * @param {{ createElement: typeof document.createElement }} powers
 */
function showQuestions(qas, questionList, { createElement }) {
    /** @type { (tag: string, attrs: {[name: string]: string}, children: Array<Element | string>) => Element } */
    function elt(tag, attrs, children) {
        const it = createElement(tag);
        entries(attrs).forEach(([name, value]) => it.setAttribute(name, value));
        children.forEach(ch => it.append(ch));
        return it;
    };
    /** @type { (name: string, label: string, value: string) => Element } */
    const choiceElt = (name, label, value) => elt('label', { title: value },
        [elt('input', { name, value, type: 'radio' }, []), label]);
    questionList.innerHTML = '';
    entries(qas).forEach(([q, as], qix) => {
        const { labels, addresses } = as;
        const qElt = elt('li', {}, [elt('strong', {}, [q]),
            ...labels.map((ans, aix) => choiceElt(`q${qix}`, ans, addresses[aix]))]);
        questionList.appendChild(qElt);
    });
}

/** @type { QAs } */
const testQuestions = {
    "Set Membership Fee To": {
        "labels": ["$10", "$20", "$50", "$100"],
        "addresses": ["11112uGayGEi57D44Drq3V4iw5WWyfXbcVvsDangRTE7TaR3J4U4FD",
         "11111Nr7m7SfhgXEghQfQqEBwQGddoa3vHAf4x1UVR6Nm32piqFwh",
        "11117p8GtmatxaAYK5iQxnYrMy7dH9iquDDWmNTVdUQyvvoVpUzNN",
        "1111Lq2S8ZoViqAiWvEAfBYxMEtBsdrid8rh58CusJJRVjfdpqb6o"]
    },
    "Daffy for Board Member": {
        "labels": ["no", "yes"],
        "addresses": ["1111Cp4n2pydnBKbWh9eZdeKxxsqFY9pwPJHQfuqe9RnTPyKBR8ax", "11112Cwtg2Bs4WUAYrXhL9xZXXSXr9Gn62Cty39RhUaBnqjrKkqwAZ"]
    },
    "Donald for Board Member": {
        "labels": ["no", "yes"],
        "addresses": ["1111JoeZHDYXqyAgo89VaidQnp7W7M9pvdkFUJTqEBU7SHKx6WF2z", "11112cruhUBUk9WriamwCZARkYXAun1L5GiVSWxeB4ZQSUM1o2h6b9"]
    },
    "Wile E. Coyote for Board Member": {
        "labels": ["no", "yes"],
        "addresses": ["11112aoa6NLYomYZro566XZVGEXyCDqeqDcp8Pzg81Ckuws6SexC99", "1111wqGepMkvKCeoJC2rpa7dHiZsZUq8NiXH1y3JyF5jSvH341zYK"]
    },
    "Road Runner for Board Member": {
        "labels": ["no", "yes"],
        "addresses": ["1111swBFUPVRwR4ugkDBCvrLwPeR1621B1cHQf3cAkNxt3Zad2eac", "1111rQuiaZj6sKJx4Cj8HzFbF5NJTRj3iGgkdiLPWJaJybs6EZPY3"]
    }
};

/** @type {(account: { revAddr: string }, controls: NodeListOf<Element> ) => string} */
function response(account, controls) {
    const choiceAddrs = Array.from(controls)
        .map(radio => check.theInput(radio)) // filter rather than throw?
        .reduce((acc, cur, _ix, _src) => cur.checked ? [...acc, cur] : acc, [])
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
