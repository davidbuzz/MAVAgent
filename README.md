----------------------------------------------------------------------
MAVAgent
----------------------------------------------------------------------

a mavproxy-like tool in Node.js

### first time only:
npm install 

### run it
node mav-agent.js


----------------------------------------------------------------------

Its only notable features right now is that it's the only JavaScript in the world that supports Mavlink2 packet-signing. :-)

----------------------------------------------------------------------
Longer Version on how to run it...
----------------------------------------------------------------------

Prerequisites:

 - You need to also run some sort of ArduPilot SITL( which listens for a connection on TCP port 6760):

 - you need to have 'node' installed in the usual manner and in your path, so running 'node' works.
    https://nodejs.org/en/download/
  Tested with node version v12.18.2 , but any similar/recent should probably be ok.

----------
windows:
----------
 - be sure yuou have MissionPlanner installed, and have run a plane/copter simulation at least once.


open a cmd.exe then type:

- tweak to suit wherever MissionPlanner put your SITL binaries
```
cd "Documents\Mission Planner\sitl\" 
ArduPlane.exe --model plane
```

open another cmd.exe then type:

 - tweak to suit wherever u have the sources for this 

```
cd "Documents\MAVAgent\" 
npm install
node mav-agent.js
```

----------
linux:
----------
in terminal 1:

   - tweak to suit wherever wherever u have the sources for it
```
cd ~/ardupilot/
./waf configure
./waf plane
./build/sitl/bin/arduplane --model plane
```
in terminal 2:

 - tweak to suit wherever wherever u have the sources for this 
```
cd ~/MAVAgent/
npm install
node mav-agent.js
```


----------------------------------------------------------------------
	Available commands:
	-------------------
	q  - Quit
	h  - this Help text

	d  - Debug Dump of MAVLink20Processor and MAVLinkSigning objects, full stats and highlighting.

	a  - load All avail modules
	m  - list loaded Modules

	b  - load 'Better' module, demo, etc ,it will try to ARM your vehicle and keep it armed.
	ub  - Unload 'Better' module , might want to do this before usig 'ss' 

	s  - load 'Signing' module, which reports on signing events/status.
	ss - Setup Signing, quite complex, but tries to DISARM, then activate SIGNING on this connection
	uu - Deactivate Signing on this connection (uu undoes the work of ss )
	us - Unload 'Signing' module


----------------------------------------------------------------------
Example start-up output:
----------------------------------------------------------------------
```
$ node mav-agent.js 
Vehicle-Backbone is initialized
Client: connection established with server
---------client details -----------------
Client is connected and recieving on local port: 50070
Client ip :127.0.0.1
Client is IP4/IP6 : IPv4
>found mavlink2 header
selected current vehicle as:1
Vehicle-Backbone is initialized
Set Stream Rates =4
Got first PARSED MSG from sysid:1 src:127.0.0.1:50070, mav-proto:2. Not repeating this. 
>streamrate changed 111 p/s
>>>>>>>>>>>>>>>>
{ mode: 'MANUAL', armed: false }
<<<<<<<<<<<<<<<<

--Got a MODE-CHANGE message from 127.0.0.1:50070 tcp
... with armed-state: false and sysid: 1 and mode: MANUAL
>>
MAVAGENT-MANUAL>1>
```
-----------------------------------------------------------------------------


