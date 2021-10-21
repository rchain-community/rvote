#!/bin/bash
#usage: ./tally.sh [ballotfile] [votersfile] [starttime] [endtime]] [transaction-server:port]
# https://github.com/rchain-community/rv2020/issues/35
# an account is counted only once for a choice.
# The case of a person voting for multiple choices the most recent is used.
debug=echo  # set this value of debug last for debug ON
debug=:     # set this value of debug last for debug OFF
ballot=${1-../web/ballotexample.json}
voters=${2-voters}
starttime=${3-1603306799000} # rchain 2020 AGM starttime
endtime=${4-1603526399000} # endtime of rchain 2020 AGM
endtime=${4-$(date +%s)000} # current timestamp default = seconds since epic times 1000
cond="select((.deploy.timestamp < $endtime) and .deploy.timestamp > $starttime)"
if [ "$save" ]; then mkdir saved/"$save"; fi
server=${5-https://status.rchain.coop}
#server=${5-https://status.testnet.rchain.coop}
transactions="curl -s "$server"/api/transfer"
trans () {
  if [ "$save" ]; then
	$transactions/"$1"|tee saved/"$save"/"$1"
  elif [ "$replay" ]; then
	cat saved/"$replay"/"$1"
  else
	$transactions/"$1"
	$debug $transactions/"$1" >&2
  fi
}
shortDescs=$(cat "$ballot"|jq -r '.|.[].shortDesc')
yesAddrs=$(cat "$ballot"|jq -r '.|.[].yesAddr')
noAddrs=$(cat "$ballot"|jq -r '.|.[].noAddr')
abstainAddrs=$(cat "$ballot"|jq -r '.|.[].abstainAddr')
for n in $(seq $(echo "$shortDescs"|sed '/^$/d'|wc -l)); do
  desc=$(echo "$shortDescs"|sed -n "${n}"p)
  yesAddr=$(echo "$yesAddrs"|sed -n "${n}"p)
  noAddr=$(echo "$noAddrs"|sed -n "${n}"p)
  abstainAddr=$(echo "$abstainAddrs"|sed -n "${n}"p)
  echo  "$desc"
  yesVotes=$(trans "$yesAddr"| jq -r ".[] | $cond | .fromAddr"|sort -u|comm -12  - voters)
  yes=$(echo "$yesVotes"|sed '/^$/d'|wc -l)
  noVotes=$(trans "$noAddr"| jq -r ".[] | $cond | .fromAddr"|sort -u|comm -12  - voters)
  no=$(echo "$noVotes"|sed '/^$/d'|wc -l)
  abstainVotes=$(trans "$abstainAddr"| jq -r ".[] | $cond | .fromAddr"| sort -u|comm -12  - voters)
  abstain=$(echo "$abstainVotes"|sed '/^$/d'|wc -l)
  $debug  "$yesVotes" yesVotes
  $debug  "$noVotes" novotes
  $debug  "$abstainVotes" abstainvotes
  double=$(printf "$yesVotes\n$noVotes\n$abstainVotes\n"|sort|uniq -d)
  printf "$yesVotes\n$noVotes\n" >>/tmp/voters
  if [ "$double" != "" ]; then
    $debug "  $yes yes votes $yesAddr";$debug "  $no no votes $noAddr"
    echo  ALERT: "$double" voted both yes and no or abstain.
    for voter in $double; do let found=0
     for acct in $(trans "$voter"| jq -r '.|.[].toAddr'); do
        #if [ "$found" == "0" ]; then found=1;: most recent vote remains; else
          if [  "$acct" = "$yesAddr" ]; then $debug yes found
            #no=$(grep -v "$voter" <(echo "$noVotes")|sed '/^$/d'|wc -l)
            abstain=$(grep -v "$voter" <(echo "$abstainVotes")|sed '/^$/d'|wc -l)
            break
          elif [ "$acct" = "$noAddr" ]; then $debug  no found;
            yes=$(grep -v "$voter" <(echo "$yesVotes")|sed '/^$/d'|wc -l)
            break
          elif [ "$acct" = "$abstainAddr" ]; then $debug abstain found; 
            no=$(grep -v "$voter" <(echo "$noVotes")|sed '/^$/d'|wc -l)
            yes=$(grep -v "$voter" <(echo "$yesVotes")|sed '/^$/d'|wc -l)
            break
          fi
        #fi
      done
    done
  fi
  let total=$yes+$no+$abstain
  result=$(echo  "  $yes yes votes $yesAddr";$debug "  $no no votes $noAddr";
  	echo "  $abstain abstain votes $abstainAddr";echo "  $total total")
  new=$(echo "$yesVotes"|comm -12  - voters|wc -l);  if [ $yes != $new ]; then $debug final yeses $yes do not match $new; fi
  new=$(echo "$noVotes"|comm -12  - voters|wc -l);  if [ $no != $new ]; then $debug final noes $no do not match $new; fi
  new=$(echo "$abstainVotes"|comm -12  - voters|wc -l);  if [ $abstain != $new ]; then $debug final abstains $abstain do not match $new; fi
  failed=false
  if [ "$save" ]; then
	  echo "$result" > saved/"$save"/result$n
  elif [ "$replay" ]; then
	  if [ "$(cat saved/$replay/result$n)" != "$result" ]; then echo ERROR: results do not match for replay "$replay" "$n" >&2
		  cat saved/$replay/result$n
		  failed=true
	  else $debug Replay "$replay" matched
	  fi
  fi
  echo "$result"
done
if [ "$replay" ]; then
  if $failed; then echo  FAILED: results do not match for replay "$replay" >&2; 
  else echo SUCCESS: replay matched.
  fi
fi
#cat /tmp/voters|sort|uniq>voters #for testing only
# cat voters |sed '1,$s/^/"/;1,$s/$/",/;$s/,$/\)/;1s/^/Set\(/' # acct text list to json list
