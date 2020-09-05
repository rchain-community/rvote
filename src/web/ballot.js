// @ts-check
import { getAddrFromEth } from '@tgrospic/rnode-grpc-js';
import { ethereumAddress } from '../eth/eth-wrapper';

const { keys, entries, fromEntries } = Object;

/**
 * @param {unknown} proc
 */
function rho2js(proc) {
    function notNull(x, context) {
        if (!x) {
            throw new Error(`null/undefined ${context}`);
        }
        return x;
    }
    function theObj(x, context) {
        if (typeof x !== 'object') {
            throw new Error(`${context} must be js object; got ${typeof x}`);
        }
        return x;
    }
    function theArray(x, context) {
        if (!Array.isArray(x)) {
            throw new Error(`${context} must be js Array; got ${typeof x}`);
        }
        return x;
    }
    const procObj = theObj(notNull(proc));
    if ('ExprMap' in procObj) {
        const data = theObj(notNull(proc['ExprMap']['data'], 'ExprMap'), 'ExprMap');
        return fromEntries(entries(data).map(([key, valProc]) => [key, rho2js(valProc)]));
    } else if ('ExprList' in procObj) {
        const data = theArray(notNull(proc['ExprList']['data'], 'ExprList'), 'ExprList');
        return data.map(rho2js);
    } else if ('ExprString' in procObj) {
        const data = procObj['ExprString']['data'];
        if (typeof data !== 'string') {
            throw new Error(`ExprString must be js String; got ${typeof data}`);
        }
        return data;
    } else {
        throw new Error(`not implemented: rho2js({${JSON.stringify(keys(proc))}})`)
    }
}

// added to testnet Sep 5
const agendaAddr = 'rho:id:g9hj5p66muy1n9d6bors494ikupqma4qj9q8kmxdgzhzkzz3957hmf';

const agenda1 = {
    "ExprMap": {
        "data": {
            "Daffy for Board Member": {
                "ExprList": {
                    "data": [{"ExprString": {"data": "no"}}, {"ExprString": {"data": "yes"}}]
                }
            },
            "Donald for Board Member": {
                "ExprList": {
                    "data": [{"ExprString": {"data": "no"}}, {"ExprString": {"data": "yes"}}]
                }
            }
        }
    }
};

/**
 * @param {{
 *  getElementById: typeof document.getElementById,
 *  getButtonById: typeof document.getElementById,
 *  createElement: typeof document.createElement,
 *  ethereumAddress: () => Promise<String>,
 *  }} powers
 */
async function buildUI({ ethereumAddress, getElementById, getButtonById, createElement }) {
    getElementById('ballotForm').addEventListener('submit', e => {
        e.preventDefault();
    });

    const pickButton = getElementById('pickAccount');
    const addrField = getElementById('REVAddress');
    pickButton.addEventListener('click', async ev => {
        const eth = await ethereumAddress();
        const addr = getAddrFromEth(eth);
        addrField.textContent = addr;
    });

    const questionListElt = getElementById('questionList');
    const choiceElt = (name, label) => {
        const control = createElement('input');
        control.setAttribute('type', 'radio');
        control.setAttribute('name', name)
        const elt = createElement('label');
        elt.appendChild(control);
        elt.append(label);
        return elt;
    };
    getButtonById('getQuestions').addEventListener('click', async ev => {
        console.log('@@look up agenda on chain');
        const qas = rho2js(agenda1);
        entries(qas).forEach(([q, as], ix) => {
            const qElt = createElement('li');
            qElt.textContent = q;
            as.forEach(ans => qElt.appendChild(choiceElt(`q${ix}`, ans)));
            questionListElt.appendChild(qElt);
        });

    });
}


buildUI({
    ethereumAddress,
    createElement: tag => document.createElement(tag),
    getElementById: id => document.getElementById(id),
    getButtonById: id => document.getElementById(id),
});
