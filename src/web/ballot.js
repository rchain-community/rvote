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

    function updateQuestions() {
        /** @type { (status: string) => void } */
        const setStatus = status => { ui.deployStatus.textContent = status; };
        setStatus('');
        const pmt = { account: state.account, phloLimit: parseInt(ui.phloLimit.value) };
        registryLookup(ui.agendaURI.value, pmt, { rnodeWeb, setStatus }).then(qas => {
            showQuestions(qas, ui.questionList, { createElement });
            const controls = querySelectorAll('fieldset input[type="radio"]');
            controls.forEach(radio => {
                radio.addEventListener('change', _ => { ui.response.value = response(state.account, controls); });
            })
        })
        .catch(err => {
            console.log({ err });
            ui.deployStatus.textContent = `${err}`;
        });
    }
    ui.getQuestions.addEventListener('click', _ => {
        if (!state.account) {
            alert('choose account first');
            return;
        }
        updateQuestions();
    });
}

/**
 *
 * @param {string} uri
 * @param {{ account: { revAddr: string }, phloLimit: number }} pmt
 * @param {{ rnodeWeb: any, setStatus: (s: string) => void}} powers
 * @returns { Promise<any> }
 */
function registryLookup(uri, { account, phloLimit }, { rnodeWeb, setStatus }) {
    // return Promise.resolve(testQuestions);

    console.log('looking up agenda on chain...');
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

    const code = lookup_rho(uri);
    return appSendDeploy({ node, code, account, phloLimit, setStatus }).then(result => {
        setStatus(result);
        const { args, cost } = deployReturnData;
        return args[1];
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
    "Daffy for Board Member": {
        "labels": ["no", "yes"],
        "addresses": ["111daffy-no", "111daffy-yes"]
    },
    "Donald for Board Member": {
        "labels": ["no", "yes"],
        "addresses": ["111donald-no", "111donald-yes"]
    }
};

/** @type {(account: { revAddr: string }, controls: NodeListOf<Element> ) => string} */
function response(account, controls) {
    const choiceAddrs = Array.from(controls)
        .map(radio => check.theInput(radio))
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
