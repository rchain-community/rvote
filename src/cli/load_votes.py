import json
import logging

log = logging.getLogger(__name__)


def main(argv, cwd, connect):
    [ballotf, txf, db] = argv[1:4]

    log.info('in: %s out: %s', json, db)
    with connect(db) as work:
        initdb(work)

        with (cwd / ballotf).open() as infp:
            ballot = json.load(infp)
        loadChoices(work, ballot)

        with (cwd / txf).open() as infp:
            txByAddr = json.load(infp)
        loadTxs(work, txByAddr)


tables = {
    'tx': '''
    create table tx(fromAddr, toAddr, amount, timestamp, sig, deployer)
    ''',
    'choice': '''
    create table choice(qid, addr, prop)
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


if __name__ == '__main__':
    def _script_io():
        from pathlib import Path
        from sqlite3 import connect
        from sys import argv

        logging.basicConfig(level=logging.DEBUG)
        main(argv[:], cwd=Path('.'), connect=connect)
    
    _script_io()
