"""Load ballot, vote data for tallying
"""
import json
import logging
from urllib.request import OpenerDirector

log = logging.getLogger(__name__)

AGENDA = 'rho:id:5rcmyxwu8r7yywjz4qqg4ij3pox3d96joeky1gczdpf3fkaujejdxr'
VOTERS = 'rho:id:1ri71weozwuoanef9zit5p7ooafkmkzhkwo6phgaourcknbmi6ke7t'
INDEX_SVC = 'kc-strip.madmode.com:7070'
OBSERVER = 'https://observer.testnet.rchain.coop'


def main(argv, cwd, connect, build_opener):
    [txf, db] = argv[1:3]

    node = Observer(build_opener(), OBSERVER)
    voters = Registry.lookup_set(node, VOTERS)
    ballot = Registry.lookup(node, AGENDA)

    log.info('in: %s out: %s', json, db)
    with connect(db) as work:
        initdb(work)

        loadChoices(work, ballot)
        loadVoters(work, voters)

        with (cwd / txf).open() as infp:
            txByAddr = json.load(infp)
        loadTxs(work, txByAddr)


class Observer:
    def __init__(self, ua: OpenerDirector, base: str):
        self.base = base
        self.__ua = ua

    def _fetchJSON(self, url: str, body: bytes):
        ua = self.__ua
        reply = ua.open(url, body)
        return json.load(reply)

    def exploratoryDeploy(self, term: str):
        addr = f'{self.base}/api/explore-deploy'
        info = self._fetchJSON(addr, term.encode('utf-8'))
        log.debug('exploratory deploy response: %s', info)
        return info


class Registry:
    @classmethod
    def lookup_rho(cls, target):
        return f'''
        new return, lookup(`rho:registry:lookup`), ch in {{
            lookup!(`{target}`, *return)
        }}
        '''

    @classmethod
    def lookup_set_rho(cls, target):
        return f'''
        new return, lookup(`rho:registry:lookup`), ch in {{
            lookup!(`{target}`, *ch) |
            for (@addrs <- ch) {{
                return!(addrs.toList())
            }}
        }}
        '''

    @classmethod
    def lookup(cls, node: Observer, target: str) -> str:
        log.info('looking up %s', target)
        info = node.exploratoryDeploy(cls.lookup_rho(target))
        return RhoExpr.parse(info['expr'][0])

    @classmethod
    def lookup_set(cls, node: Observer, target: str) -> str:
        log.info('looking up set %s', target)
        info = node.exploratoryDeploy(cls.lookup_set_rho(target))
        return RhoExpr.parse(info['expr'][0])


def id(data):
    return data


class Par(set):
    pass


class RhoExpr:

    dispatch = {
        'ExprBool': id,
        'ExprInt': id,
        'ExprString': id,
        'ExprBytes': id,
        'ExprUri': id,
        'ExprUnforg': id,
        'ExprList': lambda items: [RhoExpr.parse(item) for item in items],
        'ExprTuple': lambda items: tuple([RhoExpr.parse(item)
                                          for item in items]),
        'ExprPar': lambda items: Par([RhoExpr.parse(item)
                                      for item in items]),
        'ExprMap': lambda data: {k: RhoExpr.parse(v)
                                 for (k, v) in data.items()}
    }

    @classmethod
    def parse(cls, expr):
        (ty, val) = next(iter(expr.items()))
        decode = cls.dispatch[ty]
        return decode(val['data'])


tables = {
    'tx': '''
    create table tx(fromAddr, toAddr, amount, timestamp, sig, deployer)
    ''',
    'choice': '''
    create table choice(qid, addr, prop)
    ''',
    'voter': '''
    create table voter(revAddr)
    '''
}


def initdb(work):
    for (name, ddl) in tables.items():
        work.execute(f'drop table if exists {name}')
        work.execute(ddl)
        log.info(f'(re-)created table: {name}')


def loadTxs(work, txByAddr):
    txs = [
        (tx['fromAddr'], tx['toAddr'], tx['amount'],
         tx['deploy']['timestamp'],
         tx['deploy']['sig'],
         tx['deploy']['deployer'])
        for txs in txByAddr.values()
        for tx in txs
    ]
    work.executemany('''
    insert into tx(fromAddr, toAddr, amount, timestamp, sig, deployer)
    values (?, ?, ?, ?, ?, ?)
    ''', txs)
    log.info('inserted %d records into tx', len(txs))


def loadChoices(work, ballot):
    choices = [
        (qid, info[prop], prop)
        for (qid, info) in ballot.items()
        for prop in ['yesAddr', 'noAddr', 'abstainAddr']
        if prop in info
    ]
    work.executemany('''
    insert into choice(qid, addr, prop)
    values (?, ?, ?)
    ''', choices)
    log.info('inserted %d records into choice', len(choices))


def loadVoters(work, voters):
    work.executemany('''
    insert into voter(revAddr)
    values (?)
    ''', [(v,) for v in voters])
    log.info('inserted %d records into voter', len(voters))


if __name__ == '__main__':
    def _script_io():
        from pathlib import Path
        from sqlite3 import connect
        from sys import argv
        from urllib.request import build_opener

        logging.basicConfig(level=logging.INFO)
        main(argv[:], cwd=Path('.'), connect=connect,
             build_opener=build_opener)

    _script_io()
