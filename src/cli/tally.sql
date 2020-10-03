with vote_cast as (
    select distinct qid, fromAddr, toAddr, amount, timestamp
    from tx
    join choice on choice.addr = tx.toAddr
),
latest as (
    select qid, fromAddr, max(timestamp) max_ts
    from vote_cast
    group by qid, fromAddr
),
latest_vote as (
    select l.qid, l.fromAddr, c.toAddr, l.max_ts
    from latest l
    join vote_cast c on l.qid = c.qid and l.fromAddr = c.fromAddr
)
select choice.qid, replace(prop, 'Addr', '') sentiment, count(distinct v.fromAddr) qty
from choice
join latest_vote v on v.toAddr = choice.addr
group by choice.qid, prop
order by choice.qid, qty desc
;

