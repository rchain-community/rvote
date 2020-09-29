#usage: ./explore.sh URI ['{code}']
uri=${1-"rho:id:ar17ohqq83kx7a16nbfquwu9gxidduk9hstgbs9gkbj63o8gqyh1ye"}
#uri=${1-"rho:id:9hetk4yxrdqcc8h5xiy7md5co61etrgak9z8qnxa3yzwchs8p3if8b"}
code="${3-return!(Nil)}"
curl -s -X POST https://observer.testnet.rchain.coop/api/explore-deploy -d '
new return,
  lookup(`rho:registry:lookup`)
in {
  new valueCh in {
    // Fill in registry URI: `rho:id:11fhnau8j3...h4459w9bpus6oi`
    lookup!(
`'"$uri"'`
      , *valueCh) |
    for (@value <- valueCh) {
            if ( {'"$code"'} == Nil ) {'"$code"'}
            else return!(value)
    }
  }
}
'|tee /tmp/explore.err|jq '.expr[]|
def detype:
  if type == "object"
  then if has("ExprTuple") then .ExprTuple.data | map(detype)
       elif has("ExprList") then .ExprList.data | map(detype)
       elif has("ExprMap") then .ExprMap.data | detype
       elif has("ExprString") then .ExprString.data
       else . end
  else . end;
def walk(f): # walk def is needed for old jq <1.5
  . as $in
  | if type == "object" then
      reduce keys[] as $key
        ( {}; . + { ($key):  ($in[$key] | walk(f)) } ) | f
  elif type == "array" then map( walk(f) ) | f
  else f
  end;
walk(detype)' || cat /tmp/explore.err
exit
