drop view if exists valid_votes;
create view valid_votes as
with valid_voter as (
    select *
    from tx
    where tx.fromAddr in (select revAddr from voter)
),
vote_cast as (
    select distinct qid, fromAddr, toAddr, choice.prop, amount, timestamp
    from valid_voter tx
    join choice on choice.addr = tx.toAddr
),
latest as (
    select qid, fromAddr, max(timestamp) max_ts
    from vote_cast
    where timestamp >= 1603306799000 -- AGM voting start time
    group by qid, fromAddr
),
latest_vote as (
    select l.qid, l.fromAddr, c.toAddr, c.prop, c.amount, c.timestamp
    from latest l
    join vote_cast c on l.qid = c.qid and l.fromAddr = c.fromAddr and l.max_ts = c.timestamp
)
select * from latest_vote
;

drop view if exists tally;
create view tally as
select choice.qid, replace(choice.prop, 'Addr', '') sentiment, count(distinct v.fromAddr) qty
from choice
join valid_votes v on v.toAddr = choice.addr
group by choice.qid, choice.prop
order by choice.qid, qty desc
;

select qid, prop, addr from choice order by qid, prop;
select * from valid_votes order by fromAddr, qid;
select * from tally;
