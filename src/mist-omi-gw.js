/*
 * Copyright (C) 2018, ControlThings Oy Ab
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * @license Apache-2.0
 */

var Mist = require('mist-api').Mist;
var OmiClient = require('omi-odf').OmiClient;
var inspect = require('util').inspect;
var crypto = require('crypto');

/** This the URL of the OmiNode server */
var host = 'ws://localhost:8083';
/** The device OMI data will be published under this path */
var pathBody = 'Mist/';

var once = false;

var omiRestartInterval;
var omiRunning = false;
var mist;
var followIds = new Array(); //Array containing the current followIDs, indexed with peer hashes, created using hashPeer()

function setupOmiClient() {
    if (omiRunning) {
        return;
    }
    omiClient = new OmiClient(host);
    omiClient.once('ready', function() {
        console.log("OmiClient connected to "+ host +'.');
        omiRunning = true;
        
        if (omiRestartInterval) {
            clearInterval(omiRestartInterval);
        }
        omiRestartInterval = null;

        mist.request('signals', [], (err, data) => {
            if (data[0] && data[0] === "peers") {
                /* A change has happened in the list of peers that we know of */
                setupMistOmiGateway();
            }
        });
        setupMistOmiGateway();
    });

    omiClient.once('close', function() {
        console.log("OmiClient websocket connection was lost.");
        //process.exit(1);
        omiRunning = false;
        for (p in followIds) {
            mist.requestCancel(followIds[p]);
        }
        omiRestartInterval = setInterval(setupOmiClient, 1000);
    });
}



function comparePeers(peer1, peer2) {
    if (!peer1 || !peer2) {
        return false;
    }
    
    return peer1['luid'].compare(peer2['luid']) == 0  && peer1['ruid'].compare(peer2['ruid']) == 0 && peer1['rsid'].compare(peer2['rsid']) == 0 && peer1['rhid'].compare(peer2['rhid']) == 0;
}

function hashPeer(peer) {
    return crypto.createHash('sha256').update(Buffer.concat(new Array(peer['luid'], peer['ruid'], peer['rsid'], peer['rhid']))).digest().toString('hex');
}

function setupMistOmiGateway() {
    console.log("setupMistOmiGateway")
    var peers = new Array();
    var mistValueCache = new Array();
    var omiValueCache = new Array();

    mist.request('listPeers', [], (err, data) => {
        for (var i in data) {
            /* Each of the peers (the data[i]) will be used in an async function. Ensure variable 'peer' atomicity by putting it in an in-line function and giving data[ı] as the parameter */
            ((peer) => {
                if (!peer.online) {
                    for (p in peers) {
                        if (comparePeers(peer, peers[p])) {
                            console.log("Peer registered at omi path", p, "is offline");
                            /* Here we should cancel the omi subscription, and mist follow */
                            mist.requestCancel(followIds[createHash(peers[p])]);
                            peers[p] = null;
                        }
                    }
                    return;
                }
                mist.request('mist.control.read', [peer, "mist.name"], (err, data) => {
                    if (err) {
                        console.log("Error while reading mist.name");
                        return;
                    }
                    var name = data;
                    var path = pathBody + peer.ruid.toString('hex') + '/' + name;

                    for (p in peers) {
                        if (peers[p] && comparePeers(peer, peers[p])) {
                            /* Don't do anything, as we are already keeping track of this peer */
                            console.log("Peer", name, "already registered, omi path", path);
                            return;
                        }
                    }
                    
                    /* Associate OMI path with the peer */
                    console.log("Registering peer", name, "at omi path", path);
                    peers[path] = peer;

                    /* We now know the name of the Mist device, let's create the InfoItems that correspond to the device's Mist endpoints */
                    mist.request('mist.control.model', [peer], (err, data) => {
                        //console.log(name, "model:", err, data);
                        
                        /* Start following to get updates from Mist. The first follow reponse arrives immediately, and that creates the InfoItems.
                        Note that this implicitly means that if Mist and OMI values disagree when
                        Mist peer is online, the Mist value is written to OMI, even if the value had been updated in OMI during the time Mist peer was offline. */
                        console.log("Starting follow for ", name, hashPeer(peer) );
                        followIds[hashPeer(peer)] = mist.request('mist.control.follow', [peer], (err, data, meta) => {
                            //console.log("follow cb:", path, "data:", data, "err:", err);
                            if (err) {
                                console.log("follow error", data, "path:", path);
                                return;
                            }

                            if (!data) {
                                console.log("follow data was null", data, "path:", path);
                                return;
                            }

                            var ep = data['id'];
                            var value = data['data'];
                            
                            mistValueCache[path+ep] = value;
                            if (omiValueCache[path+ep] !== value) {
                                omiValueCache[path+ep] = value;
                                console.log("OMI write", path, ep, value);
                                omiClient.write(path, ep, value);
                            }
                        });
                        
                        /* Subscribe to the OMI info items */
                        console.log("OMI Subscribe to :", path);
                        omiClient.subscribe(path, null, {}, function(infoItemPath, data, opts) {
                            console.log("OMI Subscribe callback:", infoItemPath, data, opts);
                            var mistEndpoint = infoItemPath.substring(infoItemPath.lastIndexOf("/")+1);
                            var path = infoItemPath.substring(0, infoItemPath.lastIndexOf("/")); //key to peers in order to find the peer
                            var value = data;

                            if (peers[path] === null) {
                                console.log("There seems to be no Mist peer associated with", infoItemPath);
                                return;
                            }

                            omiValueCache[path+mistEndpoint] = value;
                            if (mistValueCache[path+mistEndpoint] !== value) {
                                console.log("mist write", mistEndpoint, "value:", value, "(" + typeof value + ")");
                                mistValueCache[path+mistEndpoint] = value;
                                
                                mist.request('mist.control.write', [peers[path], mistEndpoint, value], (err, data) => {
                                    if (err) {
                                        console.log("Mist peer", name, "write error on OMI change:", data);
                                        return;
                                    }
                                    //console.log("Wrote to Mist peer", name, "ep", mistEndpoint);
                                });
                            }
                        });
                    });
                    
                });
            }) (data[i]);
        }
    });

}



function OmiNode() {
    mist = new Mist({ name: 'MistApi', corePort: 10001 }); // defaults: coreIp: '127.0.0.1', corePort: 9094
   
    var id = mist.request('signals', [], (err, data) => {
        console.log("Waiting for Wish core to become ready...")

        if (data[0] && data[0] === 'ready') {
            console.log("Core ready.")
            if (data[1] === true) {
                setupWishCore(mist);
            }
            setupOmiClient();
            mist.requestCancel(id);
        }
    });   
}

/* This function lists the identities in the Wish core, and if there are no identities, a local identity is created. 
 If the local identity has no friends, the core is set to claimable state. */
 function setupWishCore(mist) {
    var localUid;
    mist.wish.request('identity.list', [], function(err, data) { 
        var foundLocalId = false;
        
        
        for (var i in data) {
            if (data[i] && data[i].privkey) {
                /* A local identity was found */
                foundLocalId = true;
                localUid = data[i].uid;
                //console.log("localuid", localUid);
            }
        }
        
        if (!foundLocalId) {
            console.log("There were no local identities in the core, creating one!");
	    var name = "Omi gw"
            mist.wish.request("identity.create", [name + "'s identity"], (err, data) => {
                if (err) { console.log("Error creating identity!", data); return; }
                //console.log("identity.create", data);
                localUid = data.uid;
            });
        }
    });

/*
    mist.wish.request("signals", [], (err, data) => {
        //console.log("Got Wish core signals: ", data);

        if (data[0] === "ok") {
            // Clear the local discovery cache so that we may get updates on available cores
            mist.wish.request("wld.clear", [], (err, data) => { if (err)  { console.log("wld.clear err", data)}});
        }

        if (data[0] === "localDiscovery" && !once) {
            mist.wish.request("wld.list", [], (err, data) => { 
                //console.log("wld:", data);
                for (var i in data) {
                    if (data[i] && data[i].alias === "Jan") {
                        var friendCandidate = data[i];
                        mist.wish.request("identity.list", [], (err, data) => {
                            //console.log("friend req, identity.list", err, data);
                            var found = false;
                            for (var i in data) {
                                if (data[i].uid.equals(friendCandidate.ruid)) {
                                    //console.log("Not sending friendreq to ", friendCandidate.alias);
                                    found = true;
                                }
                            }
                            if (!found) {
                                mist.wish.request("wld.friendRequest", [localUid, friendCandidate.ruid, friendCandidate.rhid], (err, data) => {
                                    console.log("Friend request sent to:", friendCandidate.alias);
                                    once = true;
                                });
                            }
                        });
                        
                    }
                }
            });
        }
    });
*/
}

module.exports = {
    OmiNode: OmiNode
};
