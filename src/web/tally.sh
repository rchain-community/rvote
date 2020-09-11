#!/bin/bash
#usage: ./tally.sh [ballotfile] [transaction-server:port]
# https://github.com/rchain-community/rv2020/issues/35
# an account is counted only once for a choice.
# The case of a person voting for multiple choices the most recent is used.
ballot=${1-ballotexample}
server=${2-kc-strip.madmode.com:7070}
shortDescs=$(cat "$ballot"|jq -r '.|.[].shortDesc')
yesAddrs=$(cat "$ballot"|jq -r '.|.[].yesAddr')
noAddrs=$(cat "$ballot"|jq -r '.|.[].noAddr')
lastblock=???????
for n in $(seq $(echo "$shortDescs"|wc -l)); do
  desc=$(echo "$shortDescs"|sed -n "${n}"p)
  yesAddr=$(echo "$yesAddrs"|sed -n "${n}"p)
  noAddr=$(echo "$noAddrs"|sed -n "${n}"p)
  echo  "$desc"
  yesVotes=$(curl -s http://"$server"/api/transfer/"$yesAddr"| jq -r '.[].fromAddr'|sort -u)
  yes=$(echo "$yesVotes"|wc -l)
  echo "$yesVotes" yesVotes
  noVotes=$(curl -s http://"$server"/api/transfer/"$noAddr"| jq -r '.[].fromAddr'|sort -u)
  no=$(echo "$noVotes"|wc -l)
  echo "$noVotes" novotes
  echo  "  $yes yes votes $yesAddr";echo "  $no no votes $noAddr"
  double=$(printf "$yesVotes\n$noVotes\n"|sort|uniq -d)
  if [ "$double" != "" ]; then
    echo ALERT: "$double" voted both yes and no.
    for voter in $double; do
#           curl -s http://$server/api/transfer/$voter| jq -r '.|.[].deploy.validAfterBlockNumber'
            # .| {xxx: .[].deploy.validAfterBlockNumber}
      for acct in $(curl -s http://"$server"/api/transfer/"$voter"| jq -r '.|.[].toAddr'); do
        if [ "$acct" = "$yesAddr" ]; then : echo yes found; let no=no-1; break
        elif [ "$acct" = "$noAddr" ]; then : echo no found; let yes=yes-1; break
        fi
      done
    done
    echo  "  $yes yes votes $yesAddr";echo "  $no no votes $noAddr"
  fi
done
