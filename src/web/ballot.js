// @ts-check
import { getAddrFromEth } from '@tgrospic/rnode-grpc-js';
import { ethereumAddress } from '../eth/eth-wrapper';
import { makeRNodeWeb } from '../rnode-web';
import { makeRNodeActions } from './rnode-actions';
import { testNet, getNodeUrls } from '../rchain-networks';

const { keys, entries, fromEntries } = Object;

function notNull(x, context) {
    if (!x) {
        throw new Error(`null/undefined ${context}`);
    }
    return x;
}

function lookupExpr(uri) {
    return `new return(\`rho:rchain:deployId\`), lookup(\`rho:registry:lookup\`)
     in {
    new valueCh in {
      lookup!(\`${uri}\`, *valueCh) |
      for (@value <- valueCh) {
        return!(("Value from registry", value))
      }
    }
  }`
}

/**
 * @param {HTMLElement} elt
 * @returns {HTMLButtonElement}
 */
function theButton(elt) {
    if (!(elt instanceof HTMLButtonElement)) {
        throw new Error('not Button');
    }
    return elt;
}

/**
 * @param {HTMLElement} elt
 * @returns {HTMLInputElement}
 */
function theInput(elt) {
    console.log({ elt, ok: elt instanceof HTMLInputElement });
    if (!(elt instanceof HTMLInputElement)) {
        throw new Error('not input');
    }
    return elt;
}

/**
 * @param {{
 *  getElementById: typeof document.getElementById,
 *  createElement: typeof document.createElement,
 *  fetch: typeof window.fetch,
 *  ethereumAddress: () => Promise<String>,
 *  }} powers
 */
function buildUI({ ethereumAddress, getElementById, createElement, fetch }) {
    notNull(getElementById('ballotForm'), '#ballotForm').addEventListener('submit', e => {
        e.preventDefault();
    });


    const pickButton = getElementById('pickAccount');
    const addrField = getElementById('REVAddress');
    let account;
    pickButton.addEventListener('click', async ev => {
        const ethAddr = await ethereumAddress();
        const revAddr = getAddrFromEth(ethAddr);
        addrField.textContent = revAddr;
        account = { name: `gov ${revAddr.slice(0, 8) }`, ethAddr: ethAddr.replace(/^0x/, ''), revAddr };
    });

    const rnodeWeb = makeRNodeWeb({ fetch });
    const questionListElt = getElementById('questionList');
    const deployStatusElt = getElementById('deployStatus');
    const choiceElt = (name, label) => {
        const control = createElement('input');
        control.setAttribute('type', 'radio');
        control.setAttribute('name', name)
        const elt = createElement('label');
        elt.appendChild(control);
        elt.append(label);
        return elt;
    };
    theButton(getElementById('getQuestions')).addEventListener('click', ev => {
        if (!account) {
            alert('choose account first');
            return;
        }
        questionListElt.innerHTML = '';
        deployStatusElt.innerHTML = '';

        const agendaURI = theInput(getElementById('agendaURI')).value;
        const phloLimit = parseInt(theInput(getElementById('phloLimit')).value);
        console.log('looking up agenda on chain...');
        console.log(testNet); //@@@
        const node = getNodeUrls(testNet.hosts[0]); // TODO: get next validator?
        const setStatus = status => {
            deployStatusElt.textContent = status;
        }
        const code = lookupExpr(agendaURI);

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

        appSendDeploy({ node, code, account, phloLimit, setStatus })
        .then(result => {
            deployStatusElt.textContent = result;
            const { args, cost } = deployReturnData;
            const qas = args[1];
            entries(qas).forEach(([q, as], ix) => {
                const qElt = createElement('li');
                qElt.textContent = q;
                as.forEach(ans => qElt.appendChild(choiceElt(`q${ix}`, ans)));
                questionListElt.appendChild(qElt);
            });
            })
        .catch(err => {
            console.log({ err });
            deployStatusElt.textContent = `${err}`;
        });
    });
}

window.addEventListener('DOMContentLoaded', (event) => {
    buildUI({
        ethereumAddress,
        fetch: window.fetch,
        createElement: tag => document.createElement(tag),
        getElementById: id => document.getElementById(id),
    });
});
