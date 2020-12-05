#!/usr/bin/env node
//
// this is a mavlink UDP listener for ArduPlane style vehicles that has a command-line and modules line MAVProxy
//
// incoming UDP mavlink/vehicl/sim data at 0.0.0.0:14550 is parsed SERVER SIDE IN NODE.js to generate json messages
// uses 'backbone.js' as a server-side Model for the Vehicle state and a group of Vehicles, and as few other dependancies as possible.


// Derived from some of my earlier work that had express,webserver,socketio for mavcontrol.. these lines below NOT current, but if u want something that uses them, this script and MAVControl/mavudp_to_ws_server.js from github are totally going to interest u.

// delivers most static content from /static and socketio stuff from /socket.io and /node_index.html is the main page.


//-------------------------------------------------------------
//
// libraries
//
//-------------------------------------------------------------

// arg handling
const yargs = require('yargs/yargs')
var argv = require('yargs/yargs')(process.argv.slice(2))
  .usage('MAVAgent - Node.js and Mavlink\n\nUsage: $0 [options]')
  .help('help').alias('help', 'h')
  .version('version', '0.0.1').alias('version', 'V')
  .options({
    master: {
      alias: 'm',
      description: "<device-id> master serial device name. /dev/ttyUSB0 ",
      requiresArg: true,
      required: false
    },
    //out: {
    //  alias: 'o',
    //  description: "<device-id> output stream",
    //  requiresArg: true,
    //  required: false
    //}
  })
  .argv;

//console.log('Inspecting options');
//console.dir(argv);

var master = undefined;
if (argv.master !== undefined ) {
console.log("serial master connection:", argv.master);
master = argv.master;
}


// the only bit of the serial handling that is outside the 'try connect serial' block, due to its .write 
var serialport = undefined;

var try_connect_serial = function(path) {


    //https://serialport.io/docs/api-stream reference

    const SerialPort = require('serialport')
    //const 
    serialport = new SerialPort(path, { baudRate: 115200, autoOpen: true });// its actually a promise till opened

    serialport.on('open',function(){

      ISSERIALCONNECTED = true; 

      console.log('Serial: connection established !!');

      // serial, not ip, fake the ip, and use path instead of port
      // we know we can reply here, even without knowing the sysid...
      broadcast_ip_address = {'ip':'127.0.0.1', 'port':path, 'type':'serial' }; 
      send_heartbeat_handler(); // doesnt know sysid, heartbeat is ok, as its a broadcast, so 255

      // writing data to server
      //client.write('hello from client');// we send something so server doesnt drop us

    });

    // uncomment to dump mavlink to screen
    //serialport.on('data', line => console.log(`> ${line}`))

    serialport.on('data',function(msg){
        var bread = serialport.bytesRead;
        var bwrite = serialport.bytesWritten;
        //console.log('[SerialPort] Bytes read : ' + bread);
        //console.log('[SerialPort] Bytes written : ' + bwrite);
        //console.log('[SerialPort] Data sent FROM serial : ' + data);

        //console.log("SER:",msg); //msg is a Buffer

        //echo data
        //var is_kernel_buffer_full = serialport.write('Data ::' + msg);
        //if(is_kernel_buffer_full){
        //console.log('[SerialPort] Data was flushed successfully from kernel buffer i.e written successfully!');
        //}else{
        //  serialport.pause();
        //}

        var array_of_chars = Uint8Array.from(msg) // from Buffer to byte array
        var packetlist = [];
        if ((mavlinktype == undefined)&&( array_of_chars.includes(253) )) {
        console.log("found mavlink2 header-serial");
        mavlinktype = 2;
        }
        packetlist = mavlinkParser2.parseBuffer(array_of_chars); // emits msgs
        // filter the packets
        function isGood(element, index, array) {
        return element._id != -1;
        }
        // if there's no readable packets in the byte stream, dont try to iterate over it
        if (packetlist == null ) return;
        goodpackets = packetlist.filter(isGood);
        //console.log("packets:",packetlist.length,"good:",goodpackets.length)

        var rinfo = { address: '127.0.0.1',  port: '/dev/ttyUSB0' }
        mavlink_ip_and_port_handler(goodpackets[0],rinfo.address,rinfo.port,mavlinktype , "serial");  // [1] = ip  and [2] = port

    });


    serialport.on('drain',function(){
      //console.log('[SerialPort] write buffer is empty now .. u can resume the writable stream');
      serialport.resume();
    });

  serialport.on('disconnect',function(){
console.log('[SerialPort] disconnect event');
    });

   // called when a previously valid thing was unplugged...
  serialport.on('close',function(){
//console.log('[SerialPort] close event');

    // we'll treat a close/unplug as an error, both of which need a re-detect loop
    serialport.emit('error', 'serialport not readable');


    });

    var last_error = undefined;
    serialport.on('error',function(error){
//console.log('[SerialPort] error event');
        if (ISUDPCONNECTED)  {  
           //console.log("using incoming UDP data, stopped retries on TCP");    
            return;
        }
        if (ISTCPCONNECTED)  {  
            //console.log("using incoming SERIAL data, stopped retries on TCP");    
            return;
        }
        ISSERIALCONNECTED = false; 

   // don't report same error more than 1hz..
        if (last_error != error.toString()) {
          last_error = error.toString();
          console.log('[SerialPort] ' + error + " - retrying...");
        }

        // re-instantiate whole object, with autoopen
        //serialport = new SerialPort(path, { baudRate: 115200, autoOpen: true });// its actually a promise till opened

        serialport.open();
    });


    // basic checks of tcp link before trying to send
    var serialport_send_heartbeat = function() {
       if ( ! ISSERIALCONNECTED ) return ;
       //don't send unless we are connected, probably dont need all of these..
       if (serialport.connecting == true ) {return; } // when other end wasnt there to start with
       if (serialport.readable == false ) {
            //console.log("tcp not readable");
            serialport.emit('error', 'serialport not readable'); // tell the error handler that will try re-connecting.
            return; 
        }// when other end goes-away unexpectedly
        send_heartbeat_handler();
    }
    serialport.send_heartbeat = serialport_send_heartbeat; // allow access as a method in the object too.


    //serialport.write('ROBOT POWER ON\n')
    console.log('[SerialPort] initialised.\n')

    // serialport.isOpen boolean

    //SerialPort Stream object is a Node.js transform stream and implements the standard data and 
    //          error events in addition to a few others:open,error,close,data,drain

    // serial-specific
    var heartbeat_interval = setInterval(function(){
      //if (client != undefined ) client.send_heartbeat(); // types '>' on console 
      //if (udp_server != undefined ) udp_server.send_heartbeat(); // types '>' on console 
      if (serialport != undefined ) serialport.send_heartbeat(); // types '>' on console 
      last_error = undefined;
      show_stream_rates('serial')
    },1000);

}



// mavlink 2 related stuff:

var {mavlink20, MAVLink20Processor} = require("./mav_v2.js"); 
var mavlinkParser2 = new MAVLink20Processor(logger, 255,0); // 255 is the mavlink sysid of this code as a GCS, as per mavproxy.



// create the output hooks for the parser/s
// we overwrite the default send() instead of overwriting write() or using setConnection(), which don't know the ip or port info.
// and we accept ip/port either as part of the mavmsg object, or as a sysid in the OPTIONAL 2nd parameter
generic_mav_udp_and_tcp_and_serial_sender = function(mavmsg,sysid) {
    // this is really just part of the original send()
    buf = mavmsg.pack(this);

    // if we don't know the sysid yet, then perhaps 255 is ok?
    if ( sysid_to_ip_address[sysid] == undefined ) {
        mavmsg.ip = broadcast_ip_address.ip;
        mavmsg.port = broadcast_ip_address.port;
        mavmsg.type = broadcast_ip_address.type; 
    }

      // where we want the packet to go on the network.. we sneak it into the already parsed object that still wraps the raw bytes.
    if (mavmsg.ip == undefined || mavmsg.port == undefined){
        //console.log(sysid_to_ip_address);
        //console.log(sysid);
        mavmsg.ip = sysid_to_ip_address[sysid].ip;
        mavmsg.port = sysid_to_ip_address[sysid].port;
        mavmsg.type = sysid_to_ip_address[sysid].type; // 'tcp' or 'udp'
    }
    if (mavmsg.ip == undefined || mavmsg.port == undefined){
        console.log("unable to determine SEND ip/port from packet or sysid, sorry, discarding. sysid:${sysid}  msg:${mavmsg}");
        return;
    }
    // at startup, till we've had at least one INCOMING packet, we can't send.
    if ((mavmsg.type == "udp")&&(udp_server.have_we_recieved_anything_yet == null )) { 
        console.log('mavlink udp write not possible yet,dropped packet.');
        return;
    } 

    const b = Buffer.from(buf);// convert from array object to Buffer so we can UDP send it.

    //console.log(`... sending msg to: ${mavmsg.ip}:${mavmsg.port} ${mavmsg.type}`);
    //console.log(b);

    // send to the place we had comms for this sysid come from, this is the critical line change from the default send()
    if (mavmsg.type == "udp") {
        udp_server.send( b, mavmsg.port, mavmsg.ip ); 
    }

    if (mavmsg.type == "tcp") {
        client.write( b ); // already open, we hope
    }

    if (mavmsg.type == "serial") {
        serialport.write( b ); // already open, we hope
    }

    // this is really just part of the original send()
    this.seq = (this.seq + 1) % 256;
    this.total_packets_sent +=1;
    this.total_bytes_sent += buf.length;
}

//var origsend2 = MAVLink20Processor.prototype.send;
MAVLink20Processor.prototype.send = generic_mav_udp_and_tcp_and_serial_sender

// most modules are loadable/unloadable, but these few here aren't right now.
var MavParams = require("./modules/mavParam.js");   // these are server-side js libraries for handling some more complicated bits of mavlink
var MavFlightMode = require("./modules/mavFlightMode.js");
var MavMission = require('./modules/mavMission.js');

console.log(JSON.stringify(MavFlightMode));

// config and backend libraries:
var nconf = require("nconf");
var Backbone = require("backbone");


//-------------------------------------------------------------
//
// Globals Variables, State Variables, Initialization.
//
//-------------------------------------------------------------


require('events').EventEmitter.defaultMaxListeners = 0;


// Logger
var logger = null;//console; //winston.createLogger({transports:[new(winston.transports.File)({ filename:'mavlink.dev.log'})]});


// console prompt
var MODE = 'UNKNOWN';
var SYSID = ' ';

// modules
var modules = {};
// self-constructing modules
var Xmodules = {};


//MAVLink20Processor is a events.EventEmitter so mavlinkParser2 has .emit()

//----------------------------------------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------------------------------------
// empty mock objects that do nearly nothing but mean this code, designed for 'express' and socketio and 'app' doesn't have to be changed much.

// nearly event-emitter object, wich means that io.of(IONameSpace).emit(...) emits to here...
_emitterClass = function() {}
util.inherits(_emitterClass, events.EventEmitter);
_emitterClass.prototype.emit = function( msgname, msgdata) {
        //console.log("EMIT!!!!:",msgname," --> " ,msgdata);
        //console.log("EMIT!!!!:",msgname);

        if ((msgname == 'mode') && (msgdata.mode != undefined)) {  
            MODE =  msgdata.mode;  
        } // eg 'RTL'

        if ((msgname == 'attitude') && (msgdata.sysid != undefined)) {  
            SYSID =  msgdata.sysid;  
        } // eg '1'

        //TIP - the messages going throu here is basically anything emitted with io.of(IONameSpace).emit(..)
        // there are't mavlink msgs, they have been pre-filtered by the xxx_handler function, which 
        // also capture the current vehicle state into the Vehicle-Backbone object, which is kept up-to-date by them.

        //  emit this message to all the loaded Xmodules thatre listening..
    
        for (const key in Xmodules ){
             //console.log("Xmodule telling :", key, msgname,msgdata);
             if (Xmodules[key] != undefined )  Xmodules[key].emit(msgname, msgdata);
             // .. a generic message by a generic name
             msgdata['name'] = msgname;
             if (Xmodules[key] != undefined ) Xmodules[key].emit('message', msgdata);
        }

}
var mockEmitter = new _emitterClass(); // instance of object.

// a mock io and namespace with an emit hook... so io.of(IONameSpace).emit(..) calls work, and are captured above..
var io = {}
io.on = function(event,cb) {};
io.of = function(ns) { return mockEmitter; }; // this attaches the namespace to the instance of 'mockEmitter' event emitter object just above.
var nsp = {}
nsp.on = function(event,cb) {};

//----------------------------------------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------------------------------------


// MAVControl puts most of its WebSockets into a NameSpace, so we honour that and replicate it:
IONameSpace = '/MAVControl';


// socket.io namespace
//const nsp = io.of(IONameSpace);

//-----------------------------------------------------------------------------------------------

// set one of these true when we see some sort of mavlink, either via tcp:localhost:5760 or as incoming udp stream
// once UDP is successful, then the other connection/s can stop re-trying etc.
var ISUDPCONNECTED = false; 
var ISTCPCONNECTED = false; 
var ISSERIALCONNECTED = false;

//-----------------------------------------------------------------------------------------------

var net = require('net');

//----------------------------------------------------------------------------------

var set_stream_rates = function(rate,target_system,target_component) {

// mavproxy uses a stream_rate of 4 on its links by default, so we'll just use that...

//target_system, target_component, req_stream_id, req_message_rate, start_stop

    var rsr = new mavlink20.messages.request_data_stream(target_system,target_component,
                                mavlink20.MAV_DATA_STREAM_ALL,rate, 1);

    mavlinkParser2.send(rsr); 
    console.log('Set Stream Rates =4');
}
//----------------------------------------------------------------------------------

var last_pkt_cnt = 0;
var rate = 0;
var data_timeout = 0;
var last_type = undefined;

var show_stream_rates = function(type) {

    if ( type != last_type) { data_timeout=0;   last_type =type;  }

    var newrate = (mavlinkParser2.total_packets_received- last_pkt_cnt);

    if (newrate == 0 ) {data_timeout++;} else {data_timeout=0;}

    // allow a bit of jitter without reporting it
    if (( Math.abs(rate - newrate) > 40)) {
        console.log("streamrate changed:",newrate," trend:",rate,"p/s");
    } 

    // if "streamrate changed 0 p/s" for the 5 seconds then consider other end has gone away and warn...
    if ((data_timeout > 5) && (ISUDPCONNECTED)) { 
        console.log("incoing udp stream has gone away, sorry.");
        ISUDPCONNECTED=false;
        //data_timeout = 0;
    }

    if ((data_timeout > 5) && (ISSERIALCONNECTED)) { 
        console.log("incoing serial stream has gone away, sorry.");
        //ISSERIALCONNECTED=false;
        data_timeout = 0;
    }

    //first time through, assume 120 for no reason other than its plausible, 'newrate' works well for non-serials.
    if (rate == 0) { rate = 120;} else {  rate = Math.floor(((rate*4)+newrate)/5); }

    last_pkt_cnt = mavlinkParser2.total_packets_received;

}
//----------------------------------------------------------------------------------

// tcp_client.   udp_server.  and port.  all come thru here.
var send_heartbeat_handler = function() {

   var heartbeat = new mavlink20.messages.heartbeat(); 
      heartbeat.custom_mode = 963497464; // fieldtype: uint32_t  isarray: False 
      heartbeat.type = 17; // fieldtype: uint8_t  isarray: False 
      heartbeat.autopilot = 84; // fieldtype: uint8_t  isarray: False 
      heartbeat.base_mode = 151; // fieldtype: uint8_t  isarray: False 
      heartbeat.system_status = 218; // fieldtype: uint8_t  isarray: False 
      heartbeat.mavlink_version = 3; // fieldtype: uint8_t  isarray: False 

      mavlinkParser2.send(heartbeat,255); // we don't know the sysid yet, so 255 as a broadcast ip is ok.

    process.stdout.write('>');

}
//----------------------------------------------------------------------------------

// convenient global
var mavlinktype = undefined;

//---------------------client----------------------

// creating a SINGLE custom socket called 'var client' and connecting it....
var client  = undefined;

var try_connect_tcp_client = function(path) {

    client  = new net.Socket();

    client.connect({
      host:'127.0.0.1',
      port:57601
    });


    client.on('connect',function(){

        ISTCPCONNECTED = true; 

        console.log('Client: connection established with TCP server');

        console.log('---------client details -----------------');
        var address = client.address();
        var port = address.port;
        var family = address.family;
        var ipaddr = address.address;
        console.log('Client is connected and recieving on local port: ' + port);
        console.log('Client ip :' + ipaddr);
        console.log('Client is IP4/IP6 : ' + family);

        // we know we can reply here, even without knowing the sysid...
        broadcast_ip_address = {'ip':ipaddr, 'port':port, 'type':'tcp' }; 
        client_send_heartbeat(); // doesnt know sysid, heartbeat is ok, as its a broadcast, so 255

    });


    // basic checks of tcp link before trying to send
    var client_send_heartbeat = function() {
       //don't send unless we are connected, probably dont need all of these..
       if (client.connecting == true ) {return; } // when other end wasnt there to start with
       if (client.readable == false ) {
            //console.log("tcp not readable");
            client.emit('error', 'tcp not readable'); // tell the error handler that will try re-connecting.
            return; 
        }// when other end goes-away unexpectedly
        send_heartbeat_handler();
    }
    client.send_heartbeat = client_send_heartbeat; // allow access as a method in the object too.


    // UDPSERVER IS DIFFERENT TO TCP CLIENT BUT SIMILAR>>>
    client.on('data',function(msg){ // msg = a Buffer() of data

        var rinfo = client.address() // return { address: '127.0.0.1', family: 'IPv4', port: 40860 }
        var array_of_chars = Uint8Array.from(msg) // from Buffer to byte array
        var packetlist = [];

        if ((mavlinktype == undefined)&&( array_of_chars.includes(253) )) {
            console.log("found mavlink2 header");
            mavlinktype = 2;
        }
        packetlist = mavlinkParser2.parseBuffer(array_of_chars); // emits msgs

        // filter the packets
        function isGood(element, index, array) {
          return element._id != -1;
        }

        // if there's no readable packets in the byte stream, dont try to iterate over it
        if (packetlist == null ) return;
        goodpackets = packetlist.filter(isGood);
        mavlink_ip_and_port_handler(goodpackets[0],rinfo.address,rinfo.port,mavlinktype , "tcp");  // [1] = ip  and [2] = port

    });


    // don't report same error more than 1hz..
    var last_error = undefined;
    client.on('error',function(error){

        if (ISUDPCONNECTED)  {  
            //console.log("using incoming UDP data, stopped retries on TCP");    
            return;
        }

        if (ISSERIALCONNECTED)  {  
            //console.log("using incoming SERIAL data, stopped retries on TCP");    
            return;
        }

        ISTCPCONNECTED = false; 

        if (last_error != error.toString()) {
          last_error = error.toString();
          console.log('[TCP Client]' + error + " - retrying...");
        }

        client.connect({
          host:'127.0.0.1',
          port:57601
        });

    });


    // this is a tcp cliebnt heartbeat handler at 1hz, u
    var heartbeat_interval = setInterval(function(){
      if (client != undefined ) client.send_heartbeat(); // types '>' on console 
      //if (udp_server != undefined ) udp_server.send_heartbeat(); // types '>' on console 
      //if (serialport != undefined ) serialport.send_heartbeat(); // types '>' on console 
      last_error = undefined;
      show_stream_rates('client')
    },1000);
    // clear with clearInterval(heartbeat_interval)


} // end of try_connect_tcp_client function


//-------------------------------------------------------------
//
// module handling
//
//-------------------------------------------------------------

function unloadModule(key,file){
    console.log("->module UNloaded '"+key+"' from "+file);
    // remove constructed things
    if(Xmodules.hasOwnProperty(key)) { delete Xmodules[key]; }
    // remove loader references
    if(modules.hasOwnProperty(key)) { delete modules[key];}
    __unloadModule(file);
}

/**
 * Deletes a node module and all associated children from node require cache
 * @param {string} moduleName The name of the module or absolute/relative path to it
 */
function __unloadModule(moduleName) {
  //console.log("->module UNloaded "+moduleName);
  var solvedName = require.resolve(moduleName),
    nodeModule = require.cache[solvedName];
  if (nodeModule) {
    for (var i = 0; i < nodeModule.children.length; i++) {
      var child = nodeModule.children[i];
      __unloadModule(child.filename); // recursive call
    }
    delete require.cache[solvedName];
  }
}
//-------------------------------------------------------------
// filename = module name
function loadModule(key,file){

      // already loaded?
      if(modules.hasOwnProperty(key)) { return; }

      // require the file, and remember it
      modules[key] = require(file);

      // returns a function that is a constructor directly
      if( typeof modules[key] === 'function') {

           //Xmodules[key] = new modules[key]();
            console.log("->module loaded "+key+" from "+file);
            Xmodules[key] = new modules[key](mavlink20,mavlinkParser2,);
      }
}

function LoadModules() {
    // multi-module load at startup.
    var glob = require( 'glob' );
    glob.sync( './modules/*.js' ).forEach( function( file ) {

          let dash = file.split("/");
          if(dash.length == 3) {
           let dot = dash[2].split(".");
            if(dot.length == 2) {
              let key = dot[0];

              // skip special not-quite-modules , where their file name starts with 'mav'
              if (key.startsWith('mav') ) { return;  }

              loadModule(key,file);

            }
          }
    });

}


//-------------------------------------------------------------
//
// serial-console user interaction like mavproxy...
//
//-------------------------------------------------------------


// the passed in this is a Buffer of chars, we will change this to chars and words inside
process_cmdline = function(cmdline) {

    // drop newline
    if (cmdline[cmdline.length - 1] == 13) { cmdline.pop(); } // remove last item

    var strcmd = String.fromCharCode.apply(null, cmdline); // turn array of bytes into a string

    //console.log("--",strcmd,"--                              "); // extra whitespace to clear rest of line
    var args = strcmd.split(" "); // chars to words

    // remove empty words
    args = args.filter( word => word.length > 0);

    // print cmd line if non-empty
    if (args.length > 0 ) {  console.log("--",args,"--                              "); } // extra whitespace to clear rest of line
    // q=  quit
    if (args[0] == "q") { process.exit(0); }
    // a = load All modules
    if (args[0] == "a") {   LoadModules();  }


    if (args[0] == "ub") { 
        unloadModule('better','./modules/better.js');
    }
    // b = load 'better' module as an example
    if (args[0] == "b") { 
        loadModule('better','./modules/better.js');
    }

    // d = show signing debug object from signing.js, with .m and .parser  and .parser.signing: MAVLinkSigning { ... } and events
    if (args[0] == "d") { 
        console.log(mavlinkParser2);
    }

    // s = signing show internal state variable of the signing module
    if (args[0] == "s") { 
        loadModule('signing','./modules/signing.js');

        console.log(Xmodules.signing.show_state());
    }
    // us= unload signing
    if (args[0] == "us") { 
        unloadModule('signing','./modules/signing.js');
    }

  // ss = 'signing setup' aka ss aka python self.cmd_signing_setup(args[1:])
  if (args[0] == "ss") { 
        loadModule('signing','./modules/signing.js');

        var sk = args.slice(1);
        sk = "qwertyuiop";
        sysid = 1;
        Xmodules.signing.cmd_signing_setup([sk,sysid])
  }

  // uu = 'undo signing' aka reverse of the 'ss' command
  if (args[0] == "uu") { 
        loadModule('signing','./modules/signing.js');

        Xmodules.signing.cmd_signing_unsetup()
  }

  // module list
  if (args[0] == "m") { 
        console.log("module list:" );
    for (const key in Xmodules ){
        console.log("\tmodule:",key );
    }
  }

  // h for help, or ? 
  if ((args[0] == "h")||(args[0] == "?")) { 
        console.log("\tAvailable commands:" );
        console.log("\t-------------------");
        console.log("\tq  - Quit" );
        console.log("\th  - this Help text" );
        console.log("");
        console.log("\td  - Debug Dump of MAVLink20Processor and MAVLinkSigning objects, full stats and highlighting." );
        console.log("");
        console.log("\ta  - load All avail modules" );
        console.log("\tm  - list loaded Modules" );
        console.log("");
        console.log("\tb  - load 'Better' module, demo, etc ,it will try to ARM your vehicle and keep it armed." );
        console.log("\tub  - Unload 'Better' module , might want to do this before usig 'ss' " );
        console.log("");
        console.log("\ts  - load 'Signing' module, which reports on signing events/status." );
        console.log("\tss - Setup Signing, quite complex, but tries to DISARM, then activate SIGNING on this connection" );
        console.log("\tuu - Deactivate Signing on this connection (uu undoes the work of ss )" );
        console.log("\tus - Unload 'Signing' module" );
        console.log("");
  }
  
}
//-------------------------------------------------------------

// triggers 'on' even after every keypress..
process.stdin.setRawMode(true);

var partialine = [];

process.stdin.on('readable', function () {

  var data = process.stdin.read(); // data  is a Buffer 
  if (data == null) {console.log("no data"); return;}
  var key = String(data);

  // emit keypress without \n
  process.stdout.write(data);

  partialine.push(data[0]);// build up list of keypresses.

  // newline pressed on its own means, execute the command  and re-show prompt
  if (data[0] == 0x0d) {

    process_cmdline(partialine); 

    partialine = [];

    process.stdout.write("\nMAVAGENT-"+MODE+">"+SYSID+"> ");

  }

  // backspace needs care
  if (data[0] == 0x7f) {

    process.stdout.write("\b"); // move cursor back, but does not clear prev pos
    process.stdout.write(" "); // blank over current positon after move
    process.stdout.write("\b"); // move cursor back again after blanking

    // pop the backspace itself
    partialine.pop();
    // pop the prev char
    partialine.pop();

  } 

 // after backspacing
//  console.log(data, partialine); //Buffer - use this to get hexadecimal for spedial keys


});
//-------------------------------------------------------------

// without this little block, the above 'readable' block doesnt repeat
process.stdin.on('data', function () {
  var data = process.stdin.read();
  return;
});

//-------------------------------------------------------------
//
//  we need to keep a lookup table between the sysid and the ip/port/type of connection
//
//-------------------------------------------------------------

// after INCOMiNG MAVLINK goes thru the mavlink parser , it dispatches them to here where we save the source ip/port for each sysid
var mavlink_ip_and_port_handler = function(message,ip,port,mavlinktype,tcp_or_udp) {

    if (message === undefined) { return ; }
    if (typeof message._header == 'undefined'){  return;   }

    // don't allow sysid of 255 to be stored.
    if (message._header.srcSystem == 255 ) { return;  }

  // it's been parsed, and must be a valid mavlink packet, and thus must have a sysid available now..
    if (  sysid_to_ip_address[message._header.srcSystem] == null )  {
          console.log(`Got first PARSED MSG from sysid:${message._header.srcSystem} src:${ip}:${port}, mav-proto:${mavlinktype}. Not repeating this. `);
    }
    sysid_to_ip_address[message._header.srcSystem] = {'ip':ip, 'port':port, 'type':tcp_or_udp }; 
    sysid_to_mavlink_type[message._header.srcSystem] =    mavlinktype; // 1 or 2

}

//-------------------------------------------------------------
//
// creating a udp server, as its a listener, its a bit different to a serial or tcp_client connection, but works.
//
var udp_server  = undefined;

var try_connect_udp_server = function(portnum) {

    // setup UDP listener
    const dgram = require('dgram');
    udp_server = dgram.createSocket('udp4'); 
    // and bind it
    udp_server.bind(portnum);

    // hook udp listener events to actions:
    udp_server.on('error', (err) => {
        ISUDPCONNECTED = false; 
        console.log(`udp server error:\n${err.stack}`);
    });

    // UDPSERVER IS DIFFERENT TO TCP CLIENT BUT SIMILAR>>>
    udp_server.on('message', (msg, rinfo) => {
        //console.log(udp_server.have_we_recieved_anything_yet);
        //console.log(rinfo);

        // we don't know its sysid yet, but this means we can at least send broadcast/s like heartbeat
        broadcast_ip_address = {'ip':rinfo.address,'port':rinfo.port, 'type':'udp' }; 

        ISUDPCONNECTED = true; 

        // first time thru:
        if (udp_server.have_we_recieved_anything_yet == null ) { udp_server.have_we_recieved_anything_yet = true } 

        var array_of_chars = Uint8Array.from(msg) // from Buffer to byte array

        //console.log("\nUDPRAW:"+array_of_chars+" len:"+array_of_chars.length);

        var packetlist = [];
        var mavlinktype = undefined;
        // lets try to support mav1/mav2 with dual parsers.
        if (array_of_chars[0] == 253 ) { 
            packetlist = mavlinkParser2.parseBuffer(array_of_chars); // emits msgs from here woth parsed result
            mavlinktype = 2; // known bug, at the moment we assume that if we parsed ONE packet for this sysid in the start of the stream as mav1 or mav2, then they all are
        } 
     
        // if there's no readable packets in the byte stream, dont try to iterate over it
        if (packetlist == null ) return;

        // all msgs in this block came from the same ip/port etc, so we just process the first one for the lookup table.
        mavlink_ip_and_port_handler(packetlist[0],rinfo.address,rinfo.port,mavlinktype, "udp" );  // record src.
        
    });

    // basic checks of udp link before trying to send
    var udp_server_send_heartbeat = function() {
       if ( ! ISUDPCONNECTED ) return ;

        // todo implement some thing that sends a heartbeat to each active udp stream ?

        send_heartbeat_handler();

    }
    serialport.send_heartbeat = udp_server_send_heartbeat; // allow access as a method in the object too.


    // this is a upd-server heartbeat handler at 1hz
    var heartbeat_interval = setInterval(function(){
      //if (client != undefined ) client.send_heartbeat(); // types '>' on console 
      if (udp_server != undefined ) udp_server.send_heartbeat(); // types '>' on console 
      //if (serialport != undefined ) serialport.send_heartbeat(); // types '>' on console 
      //last_error = undefined;
      show_stream_rates('udp')
    },1000);

} // end connecting udp_server



//----------------------------------------------------------------------------------
//
// first serious bit of code here.. is where we try to use either serial from --master, or tcp/udp connectors
//
//----------------------------------------------------------------------------------

// if given a serial device, try to connect to it, otehrwise we'll try to auto-connect to tcp and udpin 
if (master !== undefined ) {
  try_connect_serial(master)
} else {
    console.log('--master not given. Skipping [SerialPort] and trying tcp and udp autoconnect\n')
    try_connect_tcp_client()
    try_connect_udp_server(14550) 
}


//----------------------------------------------------------------------------------
//----------------------------------------------------------------------------------



// Attach an event handler for any valid MAVLink message - we use this mostly for unknown packet types, console.log and debug messages. 
// the majority of specific responses to specifc messages are not handled in the 'generic' handler, but in specific message handlers for each 
// type of message.   eg mavlinkParser1.on('HEATBEAT') is better than here, as this 'generic' block might go away at some point.
var generic_message_handler = function(message) {

    // don't dissplay or handle parsing errors -  ie Bad prefix errors, but allow signing errors thru
    if ((message._id == -1 ) && (message._reason != 'Invalid signature') ) { return;}


    // console.log all the uncommon message types we DONT list here. 
    if ( ! ['GPS_RAW_INT', 'VFR_HUD', 'ATTITUDE', 'SYS_STATUS', 'GLOBAL_POSITION_INT', 'HEARTBEAT','VIBRATION',
            'BATTERY_STATUS', 'TERRAIN_REPORT', 'WIND', 'HWSTATUS', 'AHRS', 'AHRS2', 'AHRS3',
            'SIMSTATE', 'RC_CHANNELS','RC_CHANNELS_RAW', 'SERVO_OUTPUT_RAW', 'LOCAL_POSITION_NED',
            'MEMINFO',  'POWER_STATUS', 'SCALED_PRESSURE', 'SCALED_IMU','SCALED_IMU2','SCALED_IMU3', 'RAW_IMU',
            'EKF_STATUS_REPORT', 'SYSTEM_TIME', 'MISSION_CURRENT' , 'SENSOR_OFFSETS', 
            'TIMESYNC', 'PARAM_VALUE', 'HOME_POSITION', 'POSITION_TARGET_GLOBAL_INT',
            'NAV_CONTROLLER_OUTPUT', 'STATUSTEXT' , 'COMMAND_ACK' , 
            'MISSION_ITEM', 'MISSION_ITEM_INT','MISSION_COUNT','MISSION_REQUEST', 'MISSION_ACK',
            'AIRSPEED_AUTOCAL', 'MISSION_ITEM_REACHED' , 'STAT_FLTTIME' ,'AUTOPILOT_VERSION' ,
             'FENCE_STATUS' , 'AOA_SSA' , 'GPS_GLOBAL_ORIGIN', 'TERRAIN_REQUEST', 
            'FILE_TRANSFER_PROTOCOL', 'MOUNT_STATUS',].includes(message._name) ) { 
            
	console.log('unhandled msg type - please add it to the list....:');
	console.log(message);  // emit any message type that we don't list above, as we dont know about it...
    } 
    // log PARAM_VALUE differently to exclude common ones like where param_id starts with 'STAT_RUNTIME' etc
    // many of these are emitted on-boot and aren't interesting as 'normal params' 
    if (  ['PARAM_VALUE' ].includes(message._name) ) { 
        if (  message.param_id.startsWith('STAT_RUNTIME') || 
              message.param_id.startsWith('STAT_FLTTIME')  ||
              message.param_id.startsWith('STAT_RESET')  ||
              message.param_id.startsWith('COMPASS_')  ||
              message.param_id.startsWith('SR0_')  || 
              message.param_id.startsWith('ARSPD_OFFSET')  || 
              message.param_id.startsWith('MIS_TOTAL')  || 
              message.param_id.startsWith('INS_GYR_ID')  || 
              message.param_id.startsWith('INS_ACC_ID')  || 
              message.param_id.startsWith('INS_GYR2_ID')  || 
              message.param_id.startsWith('INS_ACC2_ID')  || 
              message.param_id.startsWith('GND_ALT_OFFSET')  || 
              message.param_id.startsWith('GND_ABS_PRESS')  ){ 
            // pass
        } else { 
            console.log(`param fetch ${message.param_id} -> ${message.param_value} ` );
        }
    }

    //   STATUSTEXT handled elsewhere now

    if (  ['COMMAND_ACK' ].includes(message._name) ) {
        console.log(`COMMAND_ACK command= ${message.command} result= ${message.result} `);
    } 


    if (  ['MISSION_ITEM' ].includes(message._name) ) {
       // console.log(`MISSION_ITEM command= ${message.command} x= ${message.x} y= ${message.y} z= ${message.z} `);
    } 

    if (  ['MISSION_ITEM_INT' ].includes(message._name) ) {
        console.log(`MISSION_ITEM_INT seq= ${message.seq} command= ${message.command} x= ${message.x} y= ${message.y} z= ${message.z} `);
        //console.log(message);
    } 

    if (  ['MISSION_COUNT' ].includes(message._name) ) {
       // console.log(`MISSION_COUNT number of mission items:= ${message.count} `); moved to mavMission.js

    } 

    if (  ['MISSION_ACK' ].includes(message._name) ) {
        console.log(`MISSION_ACK recieved `);
    } 

    if (  ['MISSION_ITEM_REACHED' ].includes(message._name) ) {
        console.log(`MISSION_ITEM_REACHED recieved num:= ${message.seq} `);
    }

    if (  ['PARAM_VALUE' ].includes(message._name) &&  message.param_id.startsWith('STAT_FLTTIME')){
        mins = parseInt(message.param_value/60,10);
        secs = parseInt(message.param_value%60,10);
        console.log(`TIME IN AIR:  ${mins}min:${secs}secs `);
    }

}

// Attach the event handler for any valid MAVLink message in either stream, its agnostic at this stage
//mavlinkParser1.on('message', generic_message_handler);
mavlinkParser2.on('message', generic_message_handler);

// lookup table we populate later.
sysid_to_ip_address = {};
var broadcast_ip_address = undefined; 
sysid_to_mavlink_type = {};


var sysid = 12; // lets assume just one sysid to start with.

// looks for flight-mode changes on this specific sysid only
var mavFlightModes = [];

mavFlightModes.push(new MavFlightMode(mavlink20, mavlinkParser2, null, logger,sysid));


// MavParams are for handling loading parameters
// Just hacking/playing code for now, compiles but not properly tested.

var mavParams2 = new MavParams(mavlinkParser2,logger);


//-------------------------------------------------------------
//
// This is the Backbone Model that stores and accumulates all the information that is specific to a singular Vehicle.
//  ( we have a group of these ) 
//
//-------------------------------------------------------------

// a singular aircraft
var VehicleClass = Backbone.Model.extend({

initialize: function(){
        console.log("Vehicle-Backbone is initialized");
    },

defaults: {
  
  //sysid: 0,    // mavlink THIS_MAV ID of this aircraft
  speed: undefined, // kph.  Who the hell sets this?? TODO =P
  // this can likely be removed since we are most likely interested in ground speed

  // Set by mavlink.global_position_int packets
  lat: undefined,
  lon: undefined,
  alt: undefined,
  relative_alt: undefined,
  vx: undefined,
  vy: undefined,
  vz: undefined,
  hdg: undefined,

  // Set by mavlink.gps_raw_int packets
  fix_type: undefined,
  satellites_visible: undefined,
  raw_lat: undefined,
  raw_lon: undefined,
  raw_alt: undefined,
  eph: undefined,
  epv: undefined,
  vel: undefined,
  cog: undefined,

  // set by mavlink.attitude packets
  pitch: undefined,
  roll: undefined,
  yaw: undefined,
  pitchspeed: undefined, // acceleration
  rollspeed: undefined, // acceleration
  yawspeed: undefined, // acceleration

  // Set by mavFlightMode interpreting mavlink.HEATBEAT etc
  stateMode: undefined,
  stateArmed: undefined,
  // local copy 
  mode: undefined,
  armed: undefined,

  // Set by mavlink.SYS_STATUS packets
  voltage_battery: undefined,
  current_battery: undefined,
  battery_remaining: undefined,
  drop_rate_comm: undefined,
  errors_comm: undefined,

  // Set by mavlink.vfr_hud packets
  airspeed: undefined,
  groundspeed: undefined,
  heading: undefined,
  throttle: undefined,
  climb: undefined

},

validate: function(attrs) {
  attrs.lat /= 1e07;
  attrs.lon /= 1e07;
  attrs.alt /= 100;
}

});

//-------------------------------------------------------------
//
// this is the backbone state that has us create a "Collection" ( group ) of Vehicles, each with its own unique state,
//
//-------------------------------------------------------------

var AllVehiclesClass = Backbone.Collection.extend({
    model: VehicleClass
} );

//-------------------------------------------------------------
// we instantiate a group, and just for convenience also instantiate the first vehicle in it too with a fixed/default sysid.
// ( the vehicle isn't needed to be done as it's done dynamically elsewhere ) 
//-------------------------------------------------------------

AllVehicles = new AllVehiclesClass();
FirstVehicle = new VehicleClass({id:sysid});

var __current_vehicle = FirstVehicle; // default it to something, doesn't matter, so long as not undef
function get_current(){
return __current_vehicle = AllVehicles.get(tmp_sysid);
}
function set_current(tmp_sysid){
    if ((__current_vehicle !== undefined ) && (__current_vehicle.id != tmp_sysid)) {
      console.log("selected current vehicle as:"+tmp_sysid)
    }
    __current_vehicle = AllVehicles.get(tmp_sysid);
    return __current_vehicle;
}

// put the vehicle into the collection:
AllVehicles.add(FirstVehicle); 


//console.log(AllVehicles);
//console.log(FirstVehicle);
console.log("ALL:"+JSON.stringify(AllVehicles));


/* 
TIP: What does _.extend do?
In simple terms, it adds properties from other objects (source) on to a target object. 
  Which properties will be added? Own and inherited properties which are enumerable, including those up the prototype chain.. etc
 see more here: https://medium.com/@ee7klt/deconstructing-extend-492a33333079
*/


// these change/s are vehicle specific events, and so are bound to a specific vehicle in the collection, not the whole collection.
// We pull the Vehicle from the Collection by its sysid "current_vehicle = AllVehicles.get(message._header.srcSystem); "


//-------------------------------------------------------------
//
// handle all the parsed MAVLINK messages coming in to us, from UDP/tcp/serial/etc  link to actual Vehicle. 
//
// (the heartbeat msg is the most complex, as we use it to create new vehicles in the collection and hook state-change events.)
//
//-------------------------------------------------------------


//  hooks on the 'heartbeat' right now for convenience, as its guaranteed to be on a stream..

var heartbeat_handler =  function(message) {
    //console.log(message);
    var tmp_sysid = message._header.srcSystem;

    // don't allow messages that appear to come from 255 to be hadled.
    if (message._header.srcSystem == 255 ) { return;  }

    var current_vehicle = set_current(tmp_sysid) // returns the entire vehicle object also sets __current_vehicle global for elsewhere
    // if we already have the vehicle in the collection: 
    if ( current_vehicle) {  
        //console.log("------------------------------------");
        //console.log(current_vehicle.get('id'));
        current_vehicle.set( {
           // type: message.type,
          //  autopilot: message.autopilot,
          //  base_mode: message.base_mode,
          //  custom_mode: message.custom_mode,
          //  system_status: message.system_status,
            last_heartbeat: Date.now(), //returns the number of milliseconds elapsed since January 1, 1970
            mavlink_version: message.mavlink_version
        });

        var vehicle_type = 'Plane'; // todo state.vehicle_type
        // mode is either undefined or a human-readable mode string like 'AUTO' or 'RTL'
        //console.log({ "sysid": current_vehicle.get('id'), 
        //                    "mode": current_vehicle.get('mode'),
        //                    "type": vehicle_type });
        io.of(IONameSpace).emit('mode', { "sysid": current_vehicle.get('id'), 
                            "mode": current_vehicle.get('mode'),
                            "armed": current_vehicle.get('armed'),
                            "type": vehicle_type });

        //console.log("UPDATE:"+JSON.stringify(AllVehicles));

    // we only CREATE new vehicle object/s when we successfully see a HEARTBEAT from them:
    } else { 



        var tmpVehicle = new VehicleClass({id:message._header.srcSystem});
        // put the modified temporary object back onto the collection
        AllVehicles.add(tmpVehicle, {merge: true}); // 'add' can do "update" when merge=true, in case theres 2 of them somehow.
        //console.log("ADD:"+JSON.stringify(AllVehicles));

        set_stream_rates(4,message._header.srcSystem,message._header.srcComponent);

        // assemble a new MavFlightMode hook to watch for this sysid:
        mavFlightModes.push(new MavFlightMode(mavlink20, mavlinkParser2, null, logger,tmp_sysid));

        // re-hook all the MavFlightMode objects to their respective events, since we just added a new one.
        mavFlightModes.forEach(  function(m) {
            m.removeAllListeners('change');
            //console.log("change hook mavFlightModes.length"+mavFlightModes.length);

            // this event is generated locally by mavFlightMode.js, and it passed the entire 'state' AND sysid as params
            m.on('change', function(state,sysid) {

                // don't try to handle the vehicle till we know its IP, this might delay us by one heartbeat packet.
                if (sysid_to_ip_address[sysid] === undefined){ return ;}

                console.log(`\n--Got a MODE-CHANGE message from ${sysid_to_ip_address[sysid].ip}:${sysid_to_ip_address[sysid].port} ${sysid_to_ip_address[sysid].type}`);
                console.log(`... with armed-state: ${state.armed} and sysid: ${sysid} and mode: ${state.mode}`);

                // change the mode in the state subsystem to match this, but only if its changed.
                var current_vehicle = AllVehicles.get(sysid);  
                if (current_vehicle.get('mode') != state.mode ) {
                    current_vehicle.set( { 'mode': state.mode});
                }
                if (current_vehicle.get('armed') != state.armed ) {
                    current_vehicle.set( { 'armed': state.armed});
                }
                // old way, not sure it worked in all cases.
                //if ( current_vehicle) {  
                //    current_vehicle.set( m.getState());  // or 'state' is equiv, hopefuly
                //}

            });
        });
    }

}
//mavlinkParser1.on('HEARTBEAT', heartbeat_handler);
mavlinkParser2.on('HEARTBEAT', heartbeat_handler);


var gpi_handler = function(message) {
    var current_vehicle = AllVehicles.get(message._header.srcSystem); 
    // if we already have the vehicle in the collection: 
    if ( current_vehicle) {  
        //console.log(`Got a GLOBAL_POSITION_INT message `);
        current_vehicle.set( {
            lat: message.lat / 10000000,
            lon: message.lon / 10000000,
            alt: message.alt / 1000,
            relative_alt: message.relative_alt / 1000,
            vx: message.vx / 100,
            vy: message.vy / 100,
            vz: message.vz / 100,
            hdg: message.hdg / 100
        });
        //console.log("UPDATE GLOBAL_POSITION_INT:"+JSON.stringify(AllVehicles));

        io.of(IONameSpace).emit('location', { "sysid": current_vehicle.get('id'), 
                                        "lat": current_vehicle.get('lat'), 
                                    "lng": current_vehicle.get('lon'), 
                                    "heading": current_vehicle.get('hdg'),
                                    "altitude_agl": current_vehicle.get('relative_alt')});
    }
}
//mavlinkParser1.on('GLOBAL_POSITION_INT', gpi_handler);
mavlinkParser2.on('GLOBAL_POSITION_INT', gpi_handler);



var sysstatus_handler = function(message) {
    var current_vehicle = AllVehicles.get(message._header.srcSystem); 
    // if we already have the vehicle in the collection: 
    if ( current_vehicle) {  
        //console.log(`Got a SYS_STATUS message `);
        current_vehicle.set( {
            voltage_battery: message.voltage_battery,
            current_battery: message.current_battery,
            battery_remaining: message.battery_remaining,
            drop_rate_comm: message.drop_rate_comm,
            errors_comm: message.errors_comm
        });
        //console.log("UPDATE SYS_STATUS:"+JSON.stringify(AllVehicles));

        io.of(IONameSpace).emit('sys_status', { "sysid": current_vehicle.get('id'), 
                                    "v1": current_vehicle.get('voltage_battery'), 
                                    "c1": current_vehicle.get('current_battery'), 
                                    "br": current_vehicle.get('battery_remaining'),
                                    "drop_rate_comm": current_vehicle.get('drop_rate_comm'),
                                    "errors_comm": current_vehicle.get('errors_comm')});
    }
}
//mavlinkParser1.on('SYS_STATUS', sysstatus_handler);
mavlinkParser2.on('SYS_STATUS', sysstatus_handler);


// there are specific status-text messages that help us know if we really are armed/disarmed , and the rest are sent as 'message' for the web-console.
var statustext_handler = function(message) {
    var current_vehicle = AllVehicles.get(message._header.srcSystem); 

    // if we already have the vehicle in the collection: 
    if ( current_vehicle) {  

        // drop everything including and after the first null byte.
        var _message = message.text.replace(/\0.*$/g,'');
        console.log(`\nSTATUSTEXT: ${_message}`);

        // arm and disarm confirmation messages are handled like their own events, as they are important.
        if (_message == "Throttle armed" || _message == "Arming motors"){
            io.of(IONameSpace).emit('armed', true); // no sysid in this msg
        }
        if (_message == "Throttle disarmed" || _message == "Disarming motors"){
            io.of(IONameSpace).emit('disarmed', true); // no sysid in this msg.
        }

        // everything else is just pushed into the 'messages' display box by this event...
        io.of(IONameSpace).emit('status_text', { "sysid": message._header.srcSystem,  "text": _message});
        //io.of(IONameSpace).emit('message', { "sysid": current_vehicle.get('id'),  "message": _message});
    }
}
//mavlinkParser1.on('STATUSTEXT', statustext_handler);
mavlinkParser2.on('STATUSTEXT', statustext_handler);


var att_handler = function(message) {
    //console.log(message);
    if ( message._header == undefined) return;
    var current_vehicle = AllVehicles.get(message._header.srcSystem); 
    // if we already have the vehicle in the collection: 
    if ( current_vehicle) {  
        //console.log(`Got a ATTITUDE message `);

       // radians * 180.0 / 3.14159 = Angle_in_degrees 
        current_vehicle.set( {
            pitch: Math.round(message.pitch * 180.0 / 3.14159 *100)/100,
            roll: Math.round(message.roll * 180.0 / 3.14159 *100)/100,
            yaw: Math.round(message.yaw * 180.0 / 3.14159 *100)/100,
            pitchspeed: message.pitchspeed,
            rollspeed: message.rollspeed,
            yawspeed: message.yawspeed
        });
        //console.log("UPDATE ATTITUDE:"+JSON.stringify(AllVehicles));

        io.of(IONameSpace).emit('attitude', { 'sysid': current_vehicle.get('id'), 
                                       'pitch': current_vehicle.get('pitch'), 
                                      'roll': current_vehicle.get('roll'), 
                                      'yaw': current_vehicle.get('yaw')} );
    }
}
//mavlinkParser1.on('ATTITUDE', att_handler);
mavlinkParser2.on('ATTITUDE', att_handler);


var vfrhud_handler = function(message) {
    var current_vehicle = AllVehicles.get(message._header.srcSystem); 
    // if we already have the vehicle in the collection: 
    if ( current_vehicle) {  
        //console.log(`Got a VFR_HUD message `);
        current_vehicle.set( {
            airspeed: message.airspeed,
            groundspeed: message.groundspeed,
            heading: message.heading,
            throttle: message.throttle,
            climb: message.climb
        });
        //console.log("UPDATE VFR_HUD:"+JSON.stringify(AllVehicles));

        io.of(IONameSpace).emit('HUD', { 'sysid': current_vehicle.get('id'), 
                                    'airspeed': current_vehicle.get('airspeed'),
                                    'groundspeed': current_vehicle.get('groundspeed'),
                                    'heading': current_vehicle.get('heading'), 
                                    'throttle': current_vehicle.get('throttle'),
                                    'climb': current_vehicle.get('climb'),
                                    'ap_type': "ArduPilot" }); // todo calculate ap_type
    }
}
//mavlinkParser1.on('VFR_HUD', vfrhud_handler);
mavlinkParser2.on('VFR_HUD', vfrhud_handler);


var gpsrawint_handler = function(message) {
    var current_vehicle = AllVehicles.get(message._header.srcSystem); 
    // if we already have the vehicle in the collection: 
    if ( current_vehicle) {  
        //console.log(`Got a GPS_RAW_INT message `);
        current_vehicle.set( {
            fix_type: message.fix_type,
            satellites_visible: message.satellites_visible,
            raw_lat: message.lat / 10000000,
            raw_lon: message.lon / 10000000,
            raw_alt: message.alt / 1000,
            eph: message.eph,
            epv: message.epv,
            vel: message.vel,
            cog: message.cog
        });
        //console.log("UPDATE GPS_RAW_INT:"+JSON.stringify(AllVehicles));

        io.of(IONameSpace).emit('gps_raw_int', { "sysid": current_vehicle.get('id'), 
                                        "raw_lat": current_vehicle.get('raw_lat'), 
                                    "raw_lng": current_vehicle.get('raw_lon'), 
                                    "raw_alt": current_vehicle.get('raw_alt'),
                                    "fix_type": current_vehicle.get('fix_type'),
                                    "satellites_visible": current_vehicle.get('satellites_visible'),
                                    "cog": current_vehicle.get('cog')});
    }
}
//mavlinkParser1.on('GPS_RAW_INT', gpsrawint_handler);
mavlinkParser2.on('GPS_RAW_INT', gpsrawint_handler);


//-------------------------------------------------------------
//
// small utility functions
//
//-------------------------------------------------------------


function getTime() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    return hour + ":" + min + ":" + sec;
}

// js objects are already double precision, so no need to change a float into anything else, but this is helpful as a label.
function float(thing) { 
    return thing;
}



//-------------------------------------------------------------
//
// websocket messages from the browser-GCS to us via a namespace:
//
//-------------------------------------------------------------


nsp.on('connection', function(websocket) {

    io.of(IONameSpace).emit('news', { hello: 'Welcome2'});
    console.log("Client Re/Connect:"+IONameSpace);

    websocket.on('my_ping', function(msg){
         io.of(IONameSpace).emit('my_pong'); // this is used by the client-side to measure how long the round-trip is 
    });

    // periodically, at 1hz we send the webclient a msg to say we are still alive, kinda like a mavlink heartbeat packet, but not.
    setInterval(function() {  
         //console.log("WS heartbeat internal");
         io.of(IONameSpace).emit('heartbeat', getTime() );
        
    }, 1000);

    // websocket messages from the browser-GCS to us: 

    websocket.on('arm', function(sysid){

        var target_system = sysid, target_component = 0, command = mavlink20.MAV_CMD_COMPONENT_ARM_DISARM, confirmation = 0, 
            param1 = 1, param2 = 0, param3 = 0, param4 = 0, param5 = 0, param6 = 0, param7 = 0;
        // param1 is 1 to indicate arm
        var command_long = new mavlink20.messages.command_long(target_system, target_component, command, confirmation, 
                                                         param1, param2, param3, param4, param5, param6, param7)
        mavlinkParser2.send(command_long,sysid);
        console.log("arm sysid:"+sysid);
      });

    websocket.on('disarm', function(sysid){

        var target_system = sysid, target_component = 0, command = mavlink20.MAV_CMD_COMPONENT_ARM_DISARM, confirmation = 0, 
            param1 = 0, param2 = 0, param3 = 0, param4 = 0, param5 = 0, param6 = 0, param7 = 0;
        // param1 is 0 to indicate disarm
        var command_long = new mavlink20.messages.command_long(target_system, target_component, command, confirmation, 
                                                         param1, param2, param3, param4, param5, param6, param7)
        mavlinkParser2.send(command_long,sysid);
        console.log("disarm sysid:"+sysid);
      });

    websocket.on('do_change_speed',  function(sysid,speed_type, speed, throttle) { 
        if (speed_type == "airspeed")
            speed_type = 0;
        else if (speed_type == "groundspeed")
            speed_type = 1;

        var target_system = sysid, target_component = 0, command = mavlink20.MAV_CMD_DO_CHANGE_SPEED, confirmation = 0, 
            param1 = float(speed_type), param2 = float(speed), param3 = float(throttle), 
            // param4 is absolute or relative [0,1]
            param4 = 0, 
            param5 = 0, param6 = 0, param7 = 0;
        var command_long = new mavlink20.messages.command_long(target_system, target_component, command, confirmation, 
                                                         param1, param2, param3, param4, param5, param6, param7)
        mavlinkParser2.send(command_long,sysid);
        console.log(`do_change_speed sysid: ${sysid} to speed: ${speed}`);
    });

    websocket.on('do_change_altitude',  function(sysid,alt) { 

        var target_system = sysid, target_component = 0, command = mavlink20.MAV_CMD_DO_CHANGE_ALTITUDE, confirmation = 0, 
            // param2 = 3  means MAV_FRAME_GLOBAL_RELATIVE_ALT, see https://mavlink.io/en/messages/common.html#MAV_FRAME
            param1 = float(alt), param2 = 3, param3 = 0, param4 = 0, param5 = 0, param6 = 0, param7 = 0;
        var command_long = new mavlink20.messages.command_long(target_system, target_component, command, confirmation, 
                                                         param1, param2, param3, param4, param5, param6, param7)
        mavlinkParser2.send(command_long,sysid);
        console.log(`do_change_altitude sysid: ${sysid} to alt: ${alt}`);
    });

    websocket.on('do_change_mode',  function(sysid,mode) { 

        // any instance of a MavFlightMode will do ,so we pick the Zeroth element of the list as it's probably there.
        var mode_mapping_inv = mavFlightModes[0].mode_mapping_inv();
        mode = mode.toUpperCase();
        modenum = mode_mapping_inv[mode];
        var target_system = sysid, /* base_mode = 217, */ custom_mode = modenum; 

        set_mode_message = new mavlink20.messages.set_mode(target_system, mavlink20.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, custom_mode);                        
        mavlinkParser2.send(set_mode_message,sysid);
                     
        console.log(`do_change_mode sysid: ${sysid} to mode: ${mode}`);
        console.log(set_mode_message);
    });

    // 
    websocket.on('set_wp', function(sysid,seq) {  

        var target_system = sysid, target_component = 0;
        var mission_set_current = new mavlink20.messages.mission_set_current(target_system, target_component, seq);

        mavlinkParser2.send(mission_set_current,sysid);
        console.log(`set_wp/mission_set_current sysid: ${sysid} to alt: ${seq}`);
        
    });

    // TODO test these...

    // we don't try to get missions or even run the get-mission code unless the client asks us to.
    websocket.on('enableGetMission', function(sysid,msg) {

        console.log('ENABLING MISSION GETTING')
        var mm= new MavMission(mavlink20, mavlinkParser2 , null, logger);
        mm.enableGetMission();

        // after getting mission re-load to plane as a rtest
        //everyone.now.loadMission();
    });

    websocket.on('loadMission', function(sysid,msg) {

        console.log('LOADING MISSION')
        var mm= new MavMission(mavlink20, mavlinkParser2 , null, logger);
        mm.loadMission();

     });


    // TODO add more here 

/*  untested
    // setGuided
    websocket.on('setGuided',function(sysid) {

        var target_system = sysid;
        message = new mavlink20.messages.set_mode(target_system, mavlink20.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4);                        
        //buffer = new Buffer(message.pack(mavlinkParser2));
        //connection.write(buffer)
        mavlinkParser2.send(message,sysid);
        console.log('Set guided mode');  
    }

    //takeOff
    websocket.on('takeOff',function(sysid) {

        var target_system = sysid;
        message = new mavlink20.messages.command_long(target_system, 0, mavlink20.MAV_CMD_NAV_TAKEOFF, 0,  0, 0 ,0, 0, -35.363261, 149.165230, 10);                        
        //buffer = new Buffer(message.pack(mavlinkParser2));
        //connection.write(buffer)
        mavlinkParser2.send(message,sysid);
        console.log('Takeoff');  
    }

    //streamAll
    websocket.on('streamAll',function(sysid) {

        var target_system = sysid;
        message = new mavlink20.messages.request_data_stream(target_system, 1, mavlink20.MAV_DATA_STREAM_ALL, 1, 1);
        //buffer = new Buffer(message.pack(mavlinkParser2));
        //connection.write(buffer);
        mavlinkParser2.send(message,sysid);
    }
*/

});



