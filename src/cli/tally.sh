#!/bin/bash
#usage: ./tally.sh [ballotfile] [votersfile] [timestamp] [transaction-server:port]
#usage: save=xxx ./tally.sh [ballotfile] [votersfile] [timestamp] [transaction-server:port]
#usage: replay=xxx ./tally.sh [ballotfile] [votersfile] [timestamp] [transaction-server:port]
# https://github.com/rchain-community/rv2020/issues/35
# an account is counted only once for a choice.
# The case of a person voting for multiple choices the most recent is used.
debug=echo  # set this value of debug last for debug ON
debug=:     # set this value of debug last for debug OFF
ballot=${1-../web/ballotexample.json}
voters=${2-voters}
timestamp=${3-$(date +%s)000} # current timestamp default = seconds since epic times 1000
if [ "$save" ]; then mkdir saved/"$save"; fi
server=${4-kc-strip.madmode.com:7070}
transactions="curl -s http://"$server"/api/transfer"
trans () {
  if [ "$save" ]; then
	$transactions/"$1"|tee saved/"$save"/"$1"
  elif [ "$replay" ]; then
	cat saved/"$replay"/"$1"
  else
	$transactions/"$1"
  fi
}
shortDescs=$(cat "$ballot"|jq -r '.|.[].shortDesc')
yesAddrs=$(cat "$ballot"|jq -r '.|.[].yesAddr')
noAddrs=$(cat "$ballot"|jq -r '.|.[].noAddr')
abstainAddrs=$(cat "$ballot"|jq -r '.|.[].abstainAddr')
for n in $(seq $(echo "$shortDescs"|wc -l)); do
  desc=$(echo "$shortDescs"|sed -n "${n}"p)
  yesAddr=$(echo "$yesAddrs"|sed -n "${n}"p)
  noAddr=$(echo "$noAddrs"|sed -n "${n}"p)
  abstainAddr=$(echo "$abstainAddrs"|sed -n "${n}"p)
  echo  "$desc"
  yesVotes=$(trans "$yesAddr"| jq -r ".[] | select(.deploy.timestamp < $timestamp) | .fromAddr"|sort -u)
  yes=$(echo "$yesVotes"|wc -l)
  for acct in $yesVotes; do
          if grep -q "$acct" voters; then : ok; else echo $acct not registered; let yes=yes-1;fi
  done
  noVotes=$(trans "$noAddr"| jq -r ".[] | select(.deploy.timestamp < $timestamp) | .fromAddr"|sort -u)
  no=$(echo "$noVotes"|wc -l)
  for acct in $noVotes; do
          if grep -q "$acct" voters; then : ok; else echo $acct not registered; let no=no-1;fi
  done
  abstainVotes=$(trans "$abstainAddr"| jq -r ".[] | select(.deploy.timestamp < $timestamp) | .fromAddr"|sort -u)
  $debug  "$yesVotes" yesVotes
  $debug  "$noVotes" novotes
  $debug  "$abstainVotes" abstainvotes
  double=$(printf "$yesVotes\n$noVotes\n$abstainVotes\n"|sort|uniq -d)
  printf "$yesVotes\n$noVotes\n" >>/tmp/voters
  if [ "$double" != "" ]; then
    $debug "  $yes yes votes $yesAddr";$debug "  $no no votes $noAddr"
    $debug  ALERT: "$double" voted both yes and no or abstain.
    for voter in $double; do let found=0
     for acct in $(trans "$voter"| jq -r '.|.[].toAddr'); do
        #if [ "$found" == "0" ]; then found=1;: most recent vote remains; else
          if [  "$acct" = "$yesAddr" ]; then $debug yes found
            no=$(grep -v "$voter" <(echo "$noVotes")|wc -l)
            break
          elif [ "$acct" = "$noAddr" ]; then $debug  no found;
            yes=$(grep -v "$voter" <(echo "$yesVotes")|wc -l)
            break
          elif [ "$acct" = "$abstainAddr" ]; then $debug abstain found; 
            no=$(grep -v "$voter" <(echo "$noVotes")|wc -l)
            yes=$(grep -v "$voter" <(echo "$yesVotes")|wc -l)
            break
          fi
        #fi
      done
    done
  fi
  result=$(echo  "  $yes yes votes $yesAddr";echo "  $no no votes $noAddr")
  failed=false
  if [ "$save" ]; then
	  echo "$result" > saved/"$save"/result$n
  elif [ "$replay" ]; then
	  if [ "$(cat saved/$replay/result$n)" != "$result" ]; then echo ERROR: results do not match for replay "$replay" "$n" >&2
		  cat saved/$replay/result$n
		  failed=true
	  else echo Replay "$replay" matched
	  fi
  fi
  echo "$result"
done
if $failed; then echo  FAILED: results do not match for replay "$replay" >&2; fi
#cat /tmp/voters|sort|uniq>voters #for testing only
# cat voters |sed '1,$s/^/"/;1,$s/$/",/;$s/,$/\)/;1s/^/Set\(/' # acct text list to json list
