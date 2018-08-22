# Mist OMI IoT gateway

This program is a generic protocol gateway between Mist and OMI ODF systems. 

## How the program works

The program works by first establishing a trust relationship with a Mist peer.
The peer is (at least for the time being) found using the Wish local discovery protocol; The gateway program expects to find a peer that anounces itself
using a certain wld class (such as: com.enervent.ewind), and when it finds one, it sends a friend request to the peer, and waits until the request is granted.

Once a peer has become online, the Mist model is then queried for, and when the peer's model is known, the gateway starts following the peer for updates.
Each of the endpoints are published to the OmiNode server under path according to this pattern:

    Mist/(peer ruid)/(mist.name)/(endpoint name). 

Example: 
    
    Mist/48d626.../Switch/relay

The publishing happens effectively when the first response of the "control.follow" arrives, and this also overwrites any value the OMI server might have had from before.

Once the Mist value changes, the update is sent to the OmiNode, and vice-versa. Note that when updating values using OMI, the data type of the new OMI value will also determine the Mist datatype of the new value written to the endpoint, so OMI writes must have the correct type attribute speficied for the new value. 

## Usage

* Download and unzip the Aalto ASIA's OmiNode software from Github
** Setup port in conf/application.conf, section "omiservice", "ports"
** Setup whitelist under "input-whitelist-ips" and "input-whitelist-subnets"
* Download Mist as desribed in: https://github.com/akaustel/mist-examples-nodejs and start the Switch demo
* Start a Wish node for the mist-omi-gw using: 

```sh
WISH=~/controlthings/mist/wish-c99/build/wish-core ./run-wish-core.sh
```

* Start the actual mist-omi-gw: 
```sh
node run.js
```

### Creating trust relationships with Mist devices

It is most convenient to use wish-cli for building the trust relationships with the Mist devices and the Omi gateway.

Install wish-cli, then start it:

```sh
CORE=10001 bin/cli
```

Note: This is assuming that you have a wish core running on the local host, core listening at app tcp port 10001, as assumed by the run-wish-core.sh script.

There are several ways to establish trust relationships, in the example below we can use the Wish local discovery to find a systems on our local subnet.

```js
identity.list()
my_uid=result[0].uid		//Note: this assumes that the local identity is first in the list, which is a valid assumption for the time being
wld.list();	//Returns a list of units seen on wld. You can refer to an entry using result[i], where i is the array index of the object in the list
wld.friendRequest(my_uid, result[0].ruid, result[0].rhid) //The system we are interested in happens to be first one on the list returned by wld.list()
//After this step the the Mist peers should be registered to OmiNode automatically

```

## Startup script

There is a starup script under tools/startup.sh, which can be used as a server init script, to startup all the required components: o-mi-node, wish core and mist-omi-gw.

## Testing using OmiNode web UI

### Example OMI read

```xml
<omiEnvelope xmlns="http://www.opengroup.org/xsd/omi/1.0/" version="1.0" ttl="0">
  <read msgformat="odf">
    <msg>
      <Objects xmlns="http://www.opengroup.org/xsd/odf/1.0/">
        <Object>
          <id>Mist</id>
          <Object>
            <id>48d626</id>
            <Object>
              <id>Switch</id>
              <InfoItem name="relay"/>
            </Object>
          </Object>
        </Object>
      </Objects>
    </msg>
  </read>
</omiEnvelope>
```

### Example OMI write

When writing via OMI to an infoitem that is mapped to a Mist endpoint, the type of the new
value passed to Mist via control.write corresponds to the OMI datatype.
That is why it is important that you specify correct datatype in the
value tag for the InfoItem! OMI writes seem to default to xs:string
datatype.

Below, we write a boolean to relay InfoItem, which works correctly if
relay endpoint has Mist type 'bool'.

```xml
<omiEnvelope xmlns="http://www.opengroup.org/xsd/omi/1.0/" version="1.0" ttl="0">
  <write msgformat="odf">
    <msg>
      <Objects xmlns="http://www.opengroup.org/xsd/odf/1.0/">
        <Object>
          <id>Mist</id>
          <Object>
            <id>48d626</id>
            <Object>
              <id>Switch</id>
              <InfoItem name="relay">
                <value type="xs:boolean">false</value>
              </InfoItem>
            </Object>
          </Object>
        </Object>
      </Objects>
    </msg>
  </write>
</omiEnvelope>
```

### Clear OmiNode

To clear the OmiNode database, issue a OMI delete request:

```xml
<omiEnvelope xmlns="http://www.opengroup.org/xsd/omi/1.0/" version="1.0" ttl="0">
  <delete msgformat="odf">
    <msg>
      <Objects xmlns="http://www.opengroup.org/xsd/odf/1.0/"/>
    </msg>
  </delete>
</omiEnvelope>
```

## Testing using MistCli

```js
list()                          # Get list of peers in mist-cli
mist.control.follow(peers[1]);  # Assuming that the Switch peer was second in the peers list
mist.control.read(peers[1], "relay");
mist.control.write(peers[1], "relay", true);
mist.control.write(peers[1], "relay", false);
```


