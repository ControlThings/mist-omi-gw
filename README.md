# Mist OMI IoT gateway

This program is a generic protocol gateway between Mist and OMI ODF systems. The program works by first establishing a trust relationship with a Mist peer.
The peer is (at least for the time being) found using the Wish local discovery protocol; The gateway program expects to find a peer that anounces itself
using a certain wld class (such as: com.enervent.ewind), and when it finds one, it sends a friend request to the peer, and waits until the request is granted.

Once a peer has become online, the Mist model is then queried for, and when the peer's model is known, the gateway starts following the peer for updates.
Each of the endpoints are published to the OmiNode server under path according to this pattern:

    Mist/(first 3 bytes of the peer's luid)/(mist.name)/(endpoint name). 

Example: 
    
    Mist/48d626/Switch/relay

The publishing happens effectively when the first response of the "control.follow" arrives, and this also overwrites any value the OMI server might have had from before.

Once the Mist value changes, the update is sent to the OmiNode, and vice-versa. Note that when updating values using OMI, the data type of the new OMI value will also determine the Mist datatype of the new value written to the endpoint, so OMI writes must have the correct type attribute speficied for the new value. 

## Usage

* Download the Aalto ASIA's OmiNode software from Github
* Download Mist as desribed in: https://github.com/akaustel/mist-examples-nodejs and start the Switch demo
* Start a Wish node for the mist-omi-gw using: 

```sh
WISH=~/controlthings/mist/wish-c99/build/wish-core ./run-wish-core.sh
```

* Start the actual mist-omi-gw: 
```sh
node run.js
```



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

list()
mist.control.follow(peers[1]);
mist.control.read(peers[1], "relay");
mist.control.write(peers[1], "relay", true);


