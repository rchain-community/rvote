// @ts-check

/**
 * @param {(opts: TourOptions) => Tour} makeTour
 * @typedef {import ('shepherd.js').default.Tour} Tour
 * @typedef {import ('shepherd.js').default.Tour.TourOptions} TourOptions
 */
export function addTour(makeTour) {
  const tour = makeTour({
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      classes: 'alert alert-info',
      buttons: [{ text: 'Next', action: () => tour.next() }],
      scrollTo: { behavior: 'smooth', block: 'center' }
    }
  });

  tourSteps.forEach(({ element, content }) => {
    tour.addStep({ text: content, attachTo: { element, on: 'auto' } });
  });
  document.querySelector('#startTour').addEventListener('click', _e => tour.start());
}


export const tourSteps = [
  {
    element: "#meetingNotice",
    content: "Do you have a REV Address registered with the coop? If not, see the meeting notice for instructions."
  },
  {
    element: "#signIn",
    content: "Press <b>Sign In</b> to connect to Metamask. Choose the ethereum account corresponding to your REV address."
  },
  {
    element: "#questionList",
    content: "Once you are signed in, after a short pause to get the ballot from RChain, the quesitions are presented along with links for more information."
  },
  {
    element: "#response",
    content: "As you choose your responses, the rholang transactions representing your responses will be prepared for you.",
  },
  {
    element: "#txFee",
    content: "Voting, like all RChain transactions, incurs a small charge. (The coop offset this charge with a 100 REV reward for those who registered before July 31, 2020.) Be sure you have enough in your account to cover the max transaction fee."
  },
  {
    element: "#submitResponse",
    content: "When you are ready, press <b>Sign and Submit</b>. This will bring up metamask in order to sign your rholang response."
  },
  {
    element: "#deployStatus",
    content: "Confirm that your transactions succeeded. It could fail if you don't have any REV."
  },
];
