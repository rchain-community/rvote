// @ts-check
import {
    getAddrFromEth
  } from '@tgrospic/rnode-grpc-js';
import { ethereumAddress } from '../eth/eth-wrapper';

/**
 *
 * @param {{
 *  getElementById: (id) => HTMLElement,
 *  getButtonById: (id) => HTMLButtonElement,
 *  ethereumAddress: () => Promise<String>,
 *  }} powers
 */
async function buildUI({ ethereumAddress, getElementById, getButtonById }) {
    const pickButton = getElementById('pickAccount');
    const addrField = getElementById('REVAddress');
    pickButton.addEventListener('click', async ev => {
        const eth = await ethereumAddress();
        const addr = getAddrFromEth(eth);
        addrField.textContent = addr;
    });

    getElementById('ballotForm').addEventListener('submit', e => {
        e.preventDefault();
    });
}


buildUI({
    ethereumAddress,
    getElementById: id => document.getElementById(id),
    getButtonById: id => document.getElementById(id),
});
