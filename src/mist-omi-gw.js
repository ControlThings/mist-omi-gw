var Mist = require('mist-api').Mist;
var OmiClient = require('omi-odf').OmiClient;
var inspect = require('util').inspect;

/** This the URL of the OmiNode server */
var host = 'ws://localhost:8080';
/** The device OMI data will be published under this path */
var pathBody = 'Mist/';
var omiClient = new OmiClient(host);

var once = false;
var once2 = false;
var peers = new Array();
var endpointTypes = new Array();
var mistValueCache = new Array();
var omiValueCache = new Array();

omiClient.once('ready', function() {
    console.log("OmiClient connected to "+ host +'.');
});
 
omiClient.once('close', function() {
    console.log("OmiClient websocket connection was lost.");
    process.exit(1);
});

function OmiNode() {
    var mist = new Mist({ name: 'MistApi', corePort: 10001 }); // defaults: coreIp: '127.0.0.1', corePort: 9094

    
    mist.request('signals', [], (err, data) => {
        //console.log(err, data[0]);

        if (data[0] && data[0] === 'ready') {
            if (data[1] === true) {
                setupWishCore(mist);
            }
        }
   
        if (data[0] && data[0] === "peers") {

            if (once2) {
                return;
            }
            once2 = true;
            mist.request('listPeers', [], (err, data) => {
                for (var i in data) {
                    /* Each of the peers (the data[i]) will be used in an async function. Ensure variable 'peer' atomicity by putting it in an in-line function and giving data[ı] as the parameter */
                    ((peer) => { 
                        mist.request('mist.control.read', [peer, "mist.name"], (err, data) => {
                            if (err) {
                                console.log("Error while reading mist.name");
                                return;
                            }
                            var name = data;
                            console.log("Saw", data);
                           
                            
                            /* We now know the name of the Mist device, let's create the InfoItems that correspond to the device's Mist endpoints */
                            mist.request('mist.control.model', [peer], (err, data) => {
                                console.log(name, "model:", err, data);
                                var path = pathBody + peer.ruid.toString('hex').substring(0,6) + '/' + name;
                                
                                /* Associate OMI path with the peer */
                                peers[path] = peer;

                                
                                /* Iterate through the endpoints and ensure the corresponding InfoItems on the OMI node */
                                for (var ep in data) {
                                    endpointTypes[path+ep] = data[ep].type;
        
                                }
                                
                                /* The endpoints have now been ensured, start following to get updates from Mist */
                                console.log("Starting follow for ", path);
                                mist.request('mist.control.follow', [peer], (err, data, meta) => {
                                    console.log("follow cb", path, "data", data, "err", err);
                                    if (err) {
                                        console.log("follow error", data);
                                        return;
                                    }

                                    if (!data) {
                                        console.log("follow data was null", data);
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
                                    console.log("OMI Subscribe callback:", infoItemPath, data, opts, peers[infoItemPath]);
                                    var mistEndpoint = infoItemPath.substring(infoItemPath.lastIndexOf("/")+1);
                                    var path = infoItemPath.substring(0, infoItemPath.lastIndexOf("/")); //key to peers in order to find the peer
                                    var value = data;

                                    omiValueCache[path+mistEndpoint] = value;
                                    if (mistValueCache[path+mistEndpoint] !== value) {
                                        console.log("mist write to", peers[path], mistEndpoint);
                                        mistValueCache[path+mistEndpoint] = value;
                                        
                                        mist.request('mist.control.write', [peers[path], mistEndpoint, value], (err, data) => {
                                            if (err) {
                                                console.log("Mist peer", name, "write error on OMI change:", data);
                                                return;
                                            }
                                            console.log("Wrote to Mist peer", name, "ep", mistEndpoint);
                                        });
                                    }
                                });
                                
                            });
                            
                        });
                    }) (data[i]);
                }
            });

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
            mist.wish.request("identity.create", [name + "'s identity"], (err, data) => {
                if (err) { console.log("Error creating identity!", data); return; }
                //console.log("identity.create", data);
                localUid = data.uid;
            });
        }
    });

    mist.wish.request("signals", [], (err, data) => {
        //console.log("Got Wish core signals: ", data);

        if (data[0] === "ok") {
            // Clear the local discovery cache so that we may get updates on available peers
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
}

module.exports = {
    OmiNode: OmiNode
};
