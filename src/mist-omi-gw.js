var Mist = require('mist-api').Mist;
var OmiClient = require('omi-odf').OmiClient;
var inspect = require('util').inspect;

var host = 'ws://localhost:8080';
var omiClient = new OmiClient(host);
var name = 'MySwitch';
var path = 'Your/Path/Things/'+name;
var path2 = 'Your/Path/Things';
var ep = 'relay';

omiClient.once('ready', function() {
    console.log("OmiClient connected to "+ host +'.');
    


 
    // ensure the instance in the O-MI node by issuing a write command
    omiClient.write(path, ep, false);
 
    // subscribe to changes from "MyDevice"
    omiClient.subscribe(path, null, {}, function(ep, data, opts) {
        console.log("OMI Subscribe:", ep, data, opts);
    });
 
    /*
    // write ep to true, which should trigger subscription callback
    setTimeout(() => { omiClient.write(path, ep, true); }, 500);
    */
    
    setTimeout(() => {
        console.log("reading")
        omiClient.read(path, ep, function(ep, value, opts) {
            console.log('Read:', ep, value, opts);
        });
        omiClient.model(path, null, null, function(ep, value, opts) {
            console.log('model', ep, value, opts);
        });       
    }, 600);
    
});
 
omiClient.once('close', function() {
    console.log("OmiClient websocket connection was lost.");
    process.exit(1);
});


function followCb(err, data) {
    console.log("followCb", data);
    if (data && data.id === 'relay') {
        omiClient.write(path, ep, data.data);
    }
}



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
            mist.request('listPeers', [], (err, data) => {
                //console.log("listPeers:", data);

                for (var i in data) {
                    var peer = data[i];
                    mist.request('mist.control.follow', [peer, 'relay'],
                        followCb);
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

        if (data[0] === "localDiscovery") {
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
