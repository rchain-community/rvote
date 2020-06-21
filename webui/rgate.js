// @flow

/*::
interface Doc {
    getElementById: typeof document.getElementById,
    inputElement: (string) => ?HTMLInputElement,
    clock: () => Date
}

type DeployInfo = {
    term: string,
    timestamp: number, // milliseconds
    phloprice: number,
    phlolimit: number,
    validafterblocknumber: number,
}
*/

const defaultPhloInfo = {
    phloprice: 1, phlolimit: 10e3,
};

export default function ui({ getElementById, inputElement, clock, signDeploy }  /*: Doc */) {
    const formValue = id => the(inputElement(id)).value;
    function handleDeploy(_ /*: Event */) {
        const deployInfo /*: DeployInfo */= {
            ...defaultPhloInfo,
            term: formValue('term'),
            timestamp: clock().valueOf(),
            validafterblocknumber: -1,
        }
        alert(JSON.stringify(deployInfo));
        const key = formValue('account')
        alert(key);
        const deploy = signDeploy(key, deployInfo);
        alert(JSON.stringify(deploy));
    }

    const deployButton = the(getElementById('deploy'));
    deployButton.addEventListener('click', handleDeploy);
}

function the/*:: <T> */(x /*: ?T */) /*: T */ {
    if (!x) {
        throw new TypeError();
    }
    return x;
}