#!/bin/bash

#PIDFILEDIR=/var/run/
PIDFILEDIR=/tmp

RUNUSER=biotope	#run as user
USERHOME=/home/biotope #the "root" directory under which all the components are installed
NODEJS=$USERHOME/.nvm/versions/node/v6.9.2/bin/node

WISH=$USERHOME/wish-c99/build/wish-core
WISH_APP_PORT=10001
WISH_PORT=37222

case $1 in

	start)
		echo Starting the OmiNode server
		sudo -u $RUNUSER $USERHOME/o-mi-node-1.0.3/bin/o-mi-node &>/dev/null &!
		echo $! >$PIDFILEDIR/o-mi-node.pid
		
		#Start Wish core for mist-omi-gw, create dir for wish databases
		echo Starting Wish core
		(
			mkdir -p $USERHOME/mist-omi-gw/tools/etc
			cd $USERHOME/mist-omi-gw/tools/etc
			sudo -u $RUNUSER $WISH -a $WISH_APP_PORT -p $WISH_PORT -r &>/dev/null &!
			echo $! >$PIDFILEDIR/mist-omi-gw-wish-c99.pid
		)

		#Start mist-omi-gw
		echo Starting mist-omi-gw
		(
			cd $USERHOME/mist-omi-gw
			#sudo -u $RUNUSER $NODEJS run.js  &>/dev/null &!
			sudo -u $RUNUSER $NODEJS run.js  &!
			echo $! >$PIDFILEDIR/mist-omi-gw.pid
		)


		;;

	stop)
		kill `cat $PIDFILEDIR/o-mi-node.pid`
		rm -f $PIDFILEDIR/o-mi-node.pid

		kill `cat $PIDFILEDIR/mist-omi-gw.pid`
		rm -f $PIDFILEDIR/mist-omi-gw.pid

		kill `cat $PIDFILEDIR/mist-omi-gw-wish-c99.pid`
		rm -f $PIDFILEDIR/mist-omi-gw-wish-c99.pid
		;;
	restart)
		$0 stop
		$0 start
		;;
	*)
		echo "Usage: $0 [start|stop|restart]"
		;;
esac
