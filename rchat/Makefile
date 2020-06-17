
#RNODE=rnode --grpc-host 127.0.0.1 --grpc-port=30401 --grpc-port-internal=30402
RNODE=rnode --grpc-host 127.0.0.1
#PMT=--phlo-limit 10000000 --phlo-price=1 --private-key-path=deploy.sk
# RAW PRIVATE KEY! ONLY IN DEV MODE!
FUN1SK=1d9d914e70e431f1f4ed05e0dc64715265fb05168563535d2d91471e92f844da
PMT=--phlo-limit 1000000000 --phlo-price=1 --private-key=$(FUN1SK)

# https://www.gnu.org/software/make/manual/html_node/Pattern-Examples.html#Pattern-Examples
,deployed/%: %.rho
	# rnode --grpc-host 127.0.0.1 eval $< && touch $@
	# rnode --grpc-host 127.0.0.1 --grpc-port=30401 --grpc-port-internal=30402 eval $< && touch $@ >>storage-log.txt
	# un-comment rho:rchain:deployId and such: new x, //(`rho:...`) => new x(`rho:...`)
	sed 's_, //(`rho:_(`rho:_' <$< >$<.tmp
	echo xxx | $(RNODE) deploy $(PMT) $<.tmp && \
		$(RNODE) propose --print-unmatched-sends && \
		touch $@
		rm $<.tmp

,deployed:
	mkdir -p ,deployed

register: ,deployed ,deployed/iddb
	echo ISSUE: now update URI in myzulipdb.rho

init_mirror: ,deployed ,deployed/iddb ,deployed/myzulipdb

,db_actions.rho: init_mirror chain_replica.js
	@echo listening to zulip for 15 seconds...
	node chain_replica.js $@ 15

do_mirror: ,db_actions.rho ,deployed/,db_actions


validator: ~/.rnode/genesis
	rnode run --no-upnp --allow-private-addresses --host 127.0.0.1 --standalone --synchrony-constraint-threshold 0.0 --validator-private-key $$(cat ~/.rnode/genesis/*.sk | tail -1)

~/.rnode/genesis:
	echo "kill (ctrl-c) this after: BondsParser$ - Created validator ..."
	rnode run -s
