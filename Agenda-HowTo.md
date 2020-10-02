# To put Agenda Questions on RChain

1. Put the questions into a JSON format

_Conveniently, JSON syntax is included in rholang._

```js
/**
 * @typedef {{[refID: string]: {
 *   shortDesc: string,
 *   docLink?: string,
 *   yesAddr: string,
 *   noAddr: string,
 *   abstainAddr: string,
 * }}} QAs
 * @type { QAs }
 */
const testQuestions = {
    "Member Swag": {
        "shortDesc": "The Item of Business I want to propose is to provide all new members with stickers and t-shirts with the RChain logo on it as part of their membership onboarding package.",
        "docLink": "https://gist.github.com/dckc/ca240e5336d0ee3e4f5cf31c4f629a30#member-swag",
        "yesAddr": "11112i8bYVDYcm4MSbY3d1As28uY151xoMS7AyiTvZ2YmNJ8Nw13v9",
        "abstainAddr": "111184Ab7raMAoVy6fX8JuoPFB5PggfrEWfzXE4WMzTKioFwmQMsa",
        "noAddr": "11112uGayGEi57D44Drq3V4iw5WWyfXbcVvsDangRTE7TaR3J4U4FD"
    },
    ...
}
```

(see also `QAs` in `src/web/ballot.js`)

2. Deploy it to testnet using https://tgrospic.github.io/rnode-client-js/

   1. In the custom deploy section, choose **insert into registry**
   2. replace `"My value"` with the JSON above
   3. deploy; stand by for the resulting URI

3. update the web form ( https://github.com/rchain-community/rnode-client-js/blob/ballot-ui/src/web/ballot.html#L50 ) with the URI
