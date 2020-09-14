#!/bin/bash
#usage: ./tally.sh [ballotfile] [votersfile] [transaction-server:port]
# https://github.com/rchain-community/rv2020/issues/35
# an account is counted only once for a choice.
# The case of a person voting for multiple choices the most recent is used.
debug=echo  # set this value of debug last for debug ON
debug=:     # set this value of debug last for debug OFF
ballot=${1-ballot}
voters=${2-voters}
server=${2-kc-strip.madmode.com:7070}
shortDescs=$(cat "$ballot"|jq -r '.|.[].shortDesc')
yesAddrs=$(cat "$ballot"|jq -r '.|.[].yesAddr')
noAddrs=$(cat "$ballot"|jq -r '.|.[].noAddr')
lastblock=159959156003900 # 100 time current for now
for n in $(seq $(echo "$shortDescs"|wc -l)); do
  desc=$(echo "$shortDescs"|sed -n "${n}"p)
  yesAddr=$(echo "$yesAddrs"|sed -n "${n}"p)
  noAddr=$(echo "$noAddrs"|sed -n "${n}"p)
  echo  "$desc"
  yesVotes=$(curl -s http://"$server"/api/transfer/"$yesAddr"| jq -r '.[].fromAddr'|sort -u)
  yes=$(echo "$yesVotes"|wc -l)
  for acct in $yesVotes; do
          if grep -q "$acct" voters; then : ok; else echo $acct not registered; let yes=yes-1;fi
  done
  for acct in $noVotes; do
          if grep -q "$acct" voters; then : ok; else echo $acct not registered; let no=no-1;fi
  done
  $debug  "$yesVotes" yesVotes
  noVotes=$(curl -s http://"$server"/api/transfer/"$noAddr"| jq -r '.[].fromAddr'|sort -u)
  no=$(echo "$noVotes"|wc -l)
  $debug  "$noVotes" novotes
  double=$(printf "$yesVotes\n$noVotes\n"|sort|uniq -d)
  printf "$yesVotes\n$noVotes\n" >>/tmp/voters
  if [ "$double" != "" ]; then
    $debug  ALERT: "$double" voted both yes and no.
    for voter in $double; do
#           curl -s http://$server/api/transfer/$voter| jq -r '.|.[].deploy.validAfterBlockNumber'
            # .| {xxx: .[].deploy.validAfterBlockNumber}
      for acct in $(curl -s http://"$server"/api/transfer/"$voter"| jq -r '.|.[].toAddr'); do
        if [ "$acct" = "$yesAddr" ]; then : echo yes found; let no=no-1; break
        elif [ "$acct" = "$noAddr" ]; then : echo no found; let yes=yes-1; break
        fi
      done
    done
  fi
  echo  "  $yes yes votes $yesAddr";echo "  $no no votes $noAddr"
done
