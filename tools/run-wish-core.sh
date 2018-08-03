#!/bin/bash

APP_PORT=10001 #This must agree with what the JS code expects
WISH_PORT=37222 #This is can be freely re-defined to something else
WISH_WD=etc

if [ -z $WISH ]; then
    echo "Please supply wish core executable's path by defining WISH env variable"
    exit
fi

mkdir -p $WISH_WD
cd $WISH_WD
$WISH -a $APP_PORT -p $WISH_PORT -r
