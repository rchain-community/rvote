drop view if exists valid_votes;
create view valid_votes as
with voting_period as (
    select '2020-10-21 11:00:00' start, '2020-10-24 00:00:00' end, '-7 hours' tz
),
valid_voter as (
    select *
    from tx
    where tx.fromAddr in (select revAddr from voter)
),
vote_cast as (
    select distinct qid, fromAddr, toAddr, choice.prop, timestamp, datetime(timestamp / 1000, 'unixepoch', tz) dt
    from valid_voter tx cross join voting_period
    join choice on choice.addr = tx.toAddr
),
latest as (
    select qid, fromAddr, max(timestamp) max_ts
    from vote_cast
    join voting_period on dt between voting_period.start and voting_period.end
    group by qid, fromAddr
),
latest_vote as (
    select l.qid, l.fromAddr, c.toAddr, c.prop, c.timestamp, c.dt
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
select qid, prop, toAddr, fromAddr, timestamp, dt from valid_votes order by qid, prop, fromAddr;
select count(distinct qid) questions, count(distinct fromAddr) voters, min(dt) vote_time_min, max(dt) vote_time_max
from valid_votes;
select * from tally;
