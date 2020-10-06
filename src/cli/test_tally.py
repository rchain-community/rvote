import typing as py
from dataclasses import dataclass
from itertools import groupby, cycle
from datetime import datetime, timedelta
from pprint import pformat

from hypothesis import given, infer, assume, settings, HealthCheck
# import hypothesis.strategies as st

import load_votes

DAY = 60 * 60 * 24

# KLUDGE. can't figure out how to use importlib.resources from main program
tally_sql = open('tally.sql').read()


class RevAddr:
    pass
    raw: bytes
    role: bool

    def __repr__(self):
        return f"111{['Src', 'Dest'][self.role]}{self.raw.hex()}"


@dataclass(frozen=True, order=True)
class SrcAddr(RevAddr):
    raw: bytes

    def __repr__(self):
        return f"111Src{self.raw.hex()}"


@dataclass(frozen=True, order=True)
class DestAddr(RevAddr):
    raw: bytes

    def __repr__(self):
        return f"111Dest{self.raw.hex()}"


@dataclass(order=True, frozen=True)
class Question:
    ix: int
    yesAddr: RevAddr
    noAddr: RevAddr
    abstainAddr: RevAddr

    @property
    def id(self):
        return f'Q{self.ix}'


@dataclass(frozen=True)
class Meeting:
    roll: py.Set[SrcAddr]
    choiceAddrs: py.Set[DestAddr]

    @property
    def questions(self):
        ch = sorted(self.choiceAddrs)
        return [
            Question(ix, y, n, a)
            for ix in list(range(len(ch) - 2))[::3]
            for (y, n, a) in [(ch[ix], ch[ix + 1], ch[ix + 2])]
        ]

    def voters(self):
        return [str(addr) for addr in self.roll]

    def choices(self):
        return {
            q.id: {
                'yesAddr': str(q.yesAddr),
                'noAddr': str(q.noAddr),
                'abstainAddr': str(q.abstainAddr),
            }
            for q in self.questions
        }


@dataclass(order=True, frozen=True)
class Tx:
    fromAddr: RevAddr
    toAddr: RevAddr
    amount: int
    time: datetime

    @classmethod
    def byAddr(cls, txs: py.List['Tx']):
        ea = [{
            'fromAddr': str(tx.fromAddr),
            'toAddr': str(tx.toAddr),
              'amount': tx.amount,
              'deploy': {
                  'timestamp': int(tx.time.timestamp() * 1000),
                  'sig': 'TODO',
                  'deployer': 'TODO'}}
              for tx in txs]
        byAddr = {}
        for k, g in groupby(ea, lambda tx: tx['fromAddr']):
            byAddr[k] = list(g)
        return byAddr


@dataclass(order=True, frozen=True)
class Voter:
    identity: py.Union[SrcAddr, int]
    choices: py.List[int]
    t0: datetime
    d1: py.Optional[int]
    d2: py.Optional[int]

    @property
    def times(self):
        return [self.t0] + [
            self.t0 + timedelta(seconds=abs(d) % DAY)
            for d in [self.d1, self.d2] if d
        ]

    def votes(self, roll: py.List[RevAddr], questions: py.List[Question]):
        # print(
        #     f'votes(#ch={len(self.choices)}')
        assume(len(self.choices) >= 1)
        # print('... votes OK')

        if type(self.identity) is int:
            fromAddr = roll[self.identity % len(roll)]
        else:
            fromAddr = self.identity

        ea = cycle(self.choices)
        for t in self.times:
            for q in questions:
                toAddr = [q.yesAddr, q.noAddr, q.abstainAddr][next(ea) % 3]
                yield Tx(fromAddr, toAddr, 1, t)


def records(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


@given(meeting=infer, voters=infer)
@settings(suppress_health_check=[
    HealthCheck.filter_too_much, HealthCheck.too_slow])
def test_tally(conn, meeting: Meeting,
               voters: py.List[Voter]):
    # print('======== case')
    # print('checking len(meeting.questions)', meeting.questions)
    assume(len(meeting.questions) >= 1)
    # print('checking roll disjoint choices', meeting.roll)
    assume(len(meeting.roll) >= 1)
    assume(meeting.roll.isdisjoint(meeting.choiceAddrs))
    # print("== In: Meeting agenda choices")
    # print(pformat(meeting.choices()))
    # print('checking votes', len(voters))
    assume(len(voters) >= 1)
    roll = sorted(meeting.roll)
    votes = [
        vote
        for voter in voters
        for vote in voter.votes(roll, meeting.questions)]
    # print("== In: Votes")
    # print(pformat(Tx.byAddr(votes)))

    load_votes.initdb(conn)
    load_votes.loadTxs(conn, Tx.byAddr(votes))
    load_votes.loadVoters(conn, meeting.voters())
    load_votes.loadChoices(conn, meeting.choices())
    conn.executescript(tally_sql)

    q = conn.cursor()
    q.execute(
        'select fromAddr, qid, prop from valid_votes order by fromAddr, qid')
    print("== Out: Valid Votes")
    print(pformat(records(q)))
    q.execute('select * from tally order by qid, qty desc')
    tally = records(q)
    print("== Out: Tally")
    print(pformat(tally))

    qids = [q.id for q in meeting.questions]
    for choice in tally:
        assert choice['qid'] in qids
    q.execute('''
    select (select count(*) from choice) choice_qty
         , (select count(*) from voter) voter_qty
         , (select count(*) from tx) tx_qty
         , (select count(*) from valid_votes) vote_qty
         , (select count(*) from tally) tally_qty
    ''')
    print(records(q))
    print('PASS!')


if __name__ == '__main__':
    def _script_io():
        from sqlite3 import connect

        test_tally(connect(':memory:'))

    _script_io()
