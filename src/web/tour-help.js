// @ts-check
/* global HTMLElement */

/**
 * @param {(opts: TourOptions) => Tour} makeTour
 * @param {{
 *   $: typeof document.querySelector,
 *   $all: typeof document.querySelectorAll,
 * }} io
 * @typedef {import ('shepherd.js').default.Tour} Tour
 * @typedef {import ('shepherd.js').default.Tour.TourOptions} TourOptions
 */
export function addTour(makeTour, { $, $all }) {
  const tour = makeTour({
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      classes: 'alert alert-info',
      buttons: [{ text: 'Next', action: () => tour.next() }],
      scrollTo: { behavior: 'smooth', block: 'center' },
    },
  });

  Array.from($all('#helpSteps li')).forEach((li) => {
    if (!(li instanceof HTMLElement)) {
      return;
    }
    const anchor = li.querySelector('a');
    const element = anchor ? anchor.getAttribute('href') : undefined;
    const text = li.innerHTML;
    console.log('tour step', { element, text });
    tour.addStep({ text, attachTo: { element, on: 'auto' } });
  });

  $('#helpTour').addEventListener('click', (_e) => tour.start());
  tour.start();
}
