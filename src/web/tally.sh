#!/bin/bash
#usage: ./tally.sh [ballotfile] [transaction-server:port]
# https://github.com/rchain-community/rv2020/issues/35
# an account is counted only once for a choice.
# The case of a person voting for multiple choices the most recent is used.
# the check for the account being allowed to vote is not handled.
ballot=${1-ballotexample}
server=${2-kc-strip.madmode.com:7070}
cat $ballot|jq -r '.|.[].shortDesc' >/tmp/shortDesc
cat $ballot|jq -r '.|.[].yesAddr' >/tmp/yesAddr
cat $ballot|jq -r '.|.[].noAddr' >/tmp/noAddr
lastblock=???????
for n in $(seq $(wc -l </tmp/shortDesc)); do
  desc=$(sed -n ${n}p /tmp/shortDesc)
  yesAddr=$(sed -n ${n}p /tmp/yesAddr)
  noAddr=$(sed -n ${n}p /tmp/noAddr)
  echo  "$desc"
  yes=$(curl -s http://$server/api/transfer/$yesAddr|jq -r '.[].fromAddr'|sort -u|tee /tmp/yesVotes|wc -l)
  no=$(curl -s http://$server/api/transfer/$noAddr|jq -r '.[].fromAddr'|sort -u|tee /tmp/noVotes|wc -l)
  echo  "  $yes yes votes $yesAddr";echo "  $no no votes $noAddr"
  double=$(cat /tmp/yesVotes /tmp/noVotes|sort|uniq -d)
  if [ "$double" != "" ]; then
    echo ALERT: $double voted both yes and no.
    for voter in $double; do
      for acct in $(curl -s http://$server/api/transfer/$voter|jq -r '.|.[].toAddr'|tac); do
        if [ $acct = $yesAddr ]; then : echo yes found; let no=no-1; break
        elif [ $acct = $noAddr ]; then : echo no found; let yes=yes-1; break
        fi
      done
    done
    echo  "  $yes yes votes $yesAddr";echo "  $no no votes $noAddr"
  fi
done
rm /tmp/shortDesc /tmp/yesAddr /tmp/noAddr /tmp/yesVotes /tmp/noVotes
