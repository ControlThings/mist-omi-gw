# Mist OMI IoT gateway

This program is a generic protocol gateway between Mist and OMI ODF systems. The program works by first establishing a trust relationship with a Mist peer.
The peer is (at least for the time being) found using the Wish local discovery protocol; The gateway program expects to find a peer that anounces itself
using a certain wld class (such as: com.enervent.ewind), and when it finds one, it sends a friend request to the peer, and waits until the request is granted.

Once a peer has become online, the Mist model is then queried for, and when the peer's model is known, each of the relevant endpoints are published ("ensured") to the OmiNode server. After this initialisation step, the gateway program starts following the Mist peer for changes in endpoint's values, and vice-versa for the corresponding InfoItems on the OmiNode server. When a change is detected on one of the sides, also the other side's value is updated.

## Usage

Download the Aalto ASIA's OmiNode software from Github
