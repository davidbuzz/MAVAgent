//-------------------------------------------------------------
//
const SerialPort = require('serialport')

// we get object types, but don't instantiate here.
var {mavlink20, MAVLink20Processor} = require("./mav_v2.js"); 

// set one of these true when we see some sort of mavlink, either via tcp:localhost:5760 or as incoming udp stream
// once UDP is successful, then the other connection/s can stop re-trying etc.
var ISUDPCONNECTED = false; 
var ISTCPCONNECTED = false; 
var ISSERIALCONNECTED = false;


var broadcast_ip_address = {'ip':'127.0.0.1', 'port':'something', 'type':'else' }; 
var sysid_to_ip_address = {};

var logger = null;//console; //winston.createLogger({transports:[new(winston.transports.File)({ filename:'mavlink.dev.log'})]});

var mpo = new MAVLink20Processor(logger, 255,0); // 255 is the mavlink sysid of this code as a GCS, as per mavproxy.

var get_broadip_table = function() { return broadcast_ip_address; }
var get_sys_to_ip_table = function() { return sysid_to_ip_address; }

       // console.log(mavParserObj);
      //  console.log("mod",mpo)


// tcp_client.   udp_server.  and port.  all come thru here.
var send_heartbeat_handler = function() {
//console.log("hb");
   var heartbeat = new mavlink20.messages.heartbeat(); 
      heartbeat.custom_mode = 963497464; // fieldtype: uint32_t  isarray: False 
      heartbeat.type = 17; // fieldtype: uint8_t  isarray: False 
      heartbeat.autopilot = 84; // fieldtype: uint8_t  isarray: False 
      heartbeat.base_mode = 151; // fieldtype: uint8_t  isarray: False 
      heartbeat.system_status = 218; // fieldtype: uint8_t  isarray: False 
      heartbeat.mavlink_version = 3; // fieldtype: uint8_t  isarray: False 

      mpo.send(heartbeat,255); // we don't know the sysid yet, so 255 as a broadcast ip is ok.

    process.stdout.write('>');

}

var set_stream_rates = function(rate,target_system,target_component) {

// mavproxy uses a stream_rate of 4 on its links by default, so we'll just use that...

//target_system, target_component, req_stream_id, req_message_rate, start_stop

    var rsr = new mavlink20.messages.request_data_stream(target_system,target_component,
                                mavlink20.MAV_DATA_STREAM_ALL,rate, 1);

    mpo.send(rsr); 
    console.log('Set Stream Rates =4');
}



class SmartSerialLink extends SerialPort {

    constructor (path) {

        super(path, { baudRate: 115200, autoOpen: true });
        //this = new SerialPort(path, { baudRate: 115200, autoOpen: true });// its actually a promise till opened

        this.__path=path;

        this.last_error = undefined;

        this.mavlinktype = undefined;
        this.streamrate = undefined;

        console.log('[SerialPort] initialised.\n');

        this.eventsetup();

    //    this.on('open',function(){ console.log('default open event'); } )
            //   this.on('error',function(){ console.log('default error event'); } )
     //   this.on('close',function(){ console.log('default close event'); } )

    }

    is_connected() { return ISSERIALCONNECTED; }

    //https://serialport.io/docs/api-stream reference

    eventsetup() {

        this.on('open',function(){

          ISSERIALCONNECTED = true; 

          console.log('Serial: connection opening...');

          // serial, not ip, fake the ip, and use path instead of port
          // we know we can reply here, even without knowing the sysid...
          broadcast_ip_address = {'ip':'127.0.0.1', 'port':this.__path, 'type':'serial' }; 
          send_heartbeat_handler(); // doesnt know sysid, heartbeat is ok, as its a broadcast, so 255

          // writing data to server
          //client.write('hello from client');// we send something so server doesnt drop us

        });

        // uncomment to dump mavlink to screen
        //this.on('data', line => console.log(`> ${line}`))

        this.on('data',function(msg){
            var bread = this.bytesRead;
            var bwrite = this.bytesWritten;
            //console.log('[SerialPort] Bytes read : ' + bread);
            //console.log('[SerialPort] Bytes written : ' + bwrite);
            //console.log('[SerialPort] Data sent FROM serial : ' + data);

            //console.log("SER:",msg); //msg is a Buffer

            //echo data
            //var is_kernel_buffer_full = this.write('Data ::' + msg);
            //if(is_kernel_buffer_full){
            //console.log('[SerialPort] Data was flushed successfully from kernel buffer i.e written successfully!');
            //}else{
            //  this.pause();
            //}

           // var array_of_chars = Uint8Array.from(msg) // from Buffer to byte array
            var packetlist = [];

            if ( (this.mavlinktype == undefined) && msg.includes(254) ) { //fe
            console.log("might be mavlink1..?");
            }

            if ( (this.mavlinktype == undefined) && msg.includes(253) ) { //fd
              console.log("found mavlink2 header-serial");
              this.mavlinktype = 2;
            }
            packetlist = mpo.parseBuffer(msg); // emits msgs
            // filter the packets
            function isGood(element, index, array) {
            return element._id != -1;
            }
            // if there's no readable packets in the byte stream, dont try to iterate over it
            if (packetlist == null ) return;
            var goodpackets = packetlist.filter(isGood);
            //console.log("packets:",packetlist.length,"good:",goodpackets.length)

            // remote end doesnt know were mavlink2, send em a mavlink2 packet...
            if ( goodpackets.length == 0 ) {
                this.heartbeat()
                //set_stream_rates(4);// no target sys or comp, guess?
            }

            if (goodpackets[0] == undefined ) return;

            if (this.streamrate == undefined) {
                set_stream_rates(4,goodpackets[0]._header.srcSystem,goodpackets[0]._header.srcComponent); 
                this.streamrate = 4; 
            }

            var rinfo = { address: '127.0.0.1',  port: '/dev/ttyUSB0' }
            sysid_to_ip_address[goodpackets[0]._header.srcSystem] = {'ip':rinfo.address, 'port':rinfo.port, 'type':"serial" }; 

        });


        this.on('drain',function(){
          //console.log('[SerialPort] write buffer is empty now .. u can resume the writable stream');
          this.resume();
        });

        this.on('disconnect',function(){
          console.log('[SerialPort] disconnect event');
        });

        // called when a previously valid thing was unplugged...
        this.on('close',function(){
        //console.log('[SerialPort] close event');

            this.last_error = undefined;
            this.mavlinktype = undefined;
            this.streamrate = undefined;

            // we'll treat a close/unplug as an error, both of which need a re-detect loop
            this.emit('error', 'serialport not readable');

        });


        this.on('error',function(error){
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
            if (this.last_error != error.toString()) {
              this.last_error = error.toString();
              console.log('[SerialPort] ' + error + " - retrying...");
            }

            // re-instantiate whole object, with autoopen
            //this = new SerialPort(path, { baudRate: 115200, autoOpen: true });// its actually a promise till opened

             this.open();

        });

      // serial-specific
     var ttt = this;
     this.heartbeat_interval = setInterval(function(){ // cant use 'this' inside this call, we're talking to the instance.
          ttt.heartbeat(); // types '>' on console 
          ttt.last_error = undefined;
          if (ISSERIALCONNECTED ) show_stream_rates('serial')
        },1000);

  }


   // basic checks of tcp link before trying to send
   heartbeat(){
       //console.log("HEARTBEAT");
       if ( ! ISSERIALCONNECTED ) return ;
       //don't send unless we are connected, probably dont need all of these..
    //   if (this.connecting == true ) {return; } // when other end wasnt there to start with
   //    if (this.readable == false ) {
            //console.log("tcp not readable");
     //       this.emit('error', 'serialport not readable'); // tell the error handler that will try re-connecting.
     //       return; 
     //   }// when other end goes-away unexpectedly
        send_heartbeat_handler();
    }
       // this.send_heartbeat = serialport_send_heartbeat; // allow access as a method in the object too.


        //serialport.write('ROBOT POWER ON\n')


        // serialport.isOpen boolean

        //SerialPort Stream object is a Node.js transform stream and implements the standard data and 
        //          error events in addition to a few others:open,error,close,data,drain



}



//-------------------------------------------------------------
const net = require('net');

class SmartTCPLink extends net.Socket {

    constructor (ip,port) {
        super()

        this.last_error = undefined;

        this.remote_ip = ip;//'127.0.0.1';
        this.remote_port = port;//5760;

        this.connect({
          host:this.remote_ip,
          port:this.remote_port
        });

        this.eventsetup();

    }

    is_connected() { return ISTCPCONNECTED; }

  // basic checks of tcp link before trying to send
    heartbeat() {
       //don't send unless we are connected, probably dont need all of these..
       if (this.connecting == true ) {return; } // when other end wasnt there to start with
       if (this.readable == false ) {
            //console.log("tcp not readable");
            this.emit('error', 'tcp not readable'); // tell the error handler that will try re-connecting.
            return; 
        }// when other end goes-away unexpectedly
        send_heartbeat_handler();
    }


    eventsetup() {

        this.on('connect',function(){

            ISTCPCONNECTED = true; 

            console.log('Client: connection established with TCP server');

            console.log('---------client details -----------------');
            var address = this.address();
            var port = address.port;
            var family = address.family;
            var ipaddr = address.address;
            console.log('Client is connected and recieving on local port: ' + port);
            console.log('Client ip :' + ipaddr);
            console.log('Client is IP4/IP6 : ' + family);

            // we know we can reply here, even without knowing the sysid...
            broadcast_ip_address = {'ip':ipaddr, 'port':port, 'type':'tcp' }; 
            //this.send_heartbeat(); // doesnt know sysid, heartbeat is ok, as its a broadcast, so 255

            send_heartbeat_handler();

        });

        // UDPSERVER IS DIFFERENT TO TCP CLIENT BUT SIMILAR>>>
        this.on('data',function(msg){ // msg = a Buffer() of data

            var rinfo = this.address() // return { address: '127.0.0.1', family: 'IPv4', port: 40860 }
            var array_of_chars = Uint8Array.from(msg) // from Buffer to byte array
            var packetlist = [];

            if ( (this.mavlinktype == undefined) && array_of_chars.includes(253) ) {
            console.log("found mavlink2 header-tcp");
            this.mavlinktype = 2;
            }
            packetlist = mpo.parseBuffer(array_of_chars); // emits msgs

            // filter the packets
            function isGood(element, index, array) {
              return element._id != -1;
            }

            // if there's no readable packets in the byte stream, dont try to iterate over it
            if (packetlist == null ) return;
            var goodpackets = packetlist.filter(isGood);


           // remote end doesnt know were mavlink2, send em a mavlink2 packet...
            if ( goodpackets.length == 0 ) {
                this.heartbeat()
                //set_stream_rates(4);// no target sys or comp, guess?
            }

            if (goodpackets[0] == undefined ) return;

            if (this.streamrate == undefined) {
                set_stream_rates(4,goodpackets[0]._header.srcSystem,goodpackets[0]._header.srcComponent); 
                this.streamrate = 4; 
            }

            sysid_to_ip_address[goodpackets[0]._header.srcSystem] = {'ip':rinfo.address, 'port':rinfo.port, 'type':"tcp" }; 
        });


        // don't report same error more than 1hz..
        // var last_error = undefined;
        this.on('error',function(error){

            if (ISUDPCONNECTED)  {  
                //console.log("using incoming UDP data, stopped retries on TCP");    
                return;
            }

            if (ISSERIALCONNECTED)  {  
                //console.log("using incoming SERIAL data, stopped retries on TCP");    
                return;
            }

            ISTCPCONNECTED = false; 

            if (this.last_error != error.toString()) {
              this.last_error = error.toString();
              console.log('[TCP Client]' + error + " - retrying...");
            }

            this.connect({
              host:this.remote_ip,
              port:this.remote_port
            });

        });

        // this is a tcp cliebnt heartbeat handler at 1hz, u
        var t= this; //  closure with an explicit reference:
        this.heartbeat_interval = setInterval( function(){
          //console.log('client interval');
          t.heartbeat(); // types '>' on console 
          //if (udp_server != undefined ) udp_server.send_heartbeat(); // types '>' on console 
          //if (serialport != undefined ) serialport.send_heartbeat(); // types '>' on console 
          t.last_error = undefined;
          if (ISTCPCONNECTED ) show_stream_rates('client')
        },1000);
        // clear with clearInterval(heartbeat_interval)

    }


} // end of SmartTCPLink


//-------------------------------------------------------------
//
// creating a udp server, as its a listener, its a bit different to a serial or tcp_client connection, but works.
//
const dgram = require('dgram');


class SmartUDPLink extends dgram.Socket {

    constructor (portnum) {
        super('udp4')

        this.bind(portnum);

        this.have_we_recieved_anything_yet  = undefined;

        this.eventsetup();
    }

    is_connected() { return ISUDPCONNECTED; }

  // basic checks of udp link before trying to send
    heartbeat() {
       if ( ! ISUDPCONNECTED ) return ;

        // todo implement some thing that sends a heartbeat to each active udp stream ?

        send_heartbeat_handler();

    }

    eventsetup(){

        // hook udp listener events to actions:
        this.on('error', (err) => {
            ISUDPCONNECTED = false; 
            console.log(`udp server error:\n${err.stack}`);
        });

        // UDPSERVER IS DIFFERENT TO TCP CLIENT BUT SIMILAR>>>
        this.on('message', (msg, rinfo) => {
            //console.log(this.have_we_recieved_anything_yet);
            //console.log(rinfo);

            // we don't know its sysid yet, but this means we can at least send broadcast/s like heartbeat
            broadcast_ip_address = {'ip':rinfo.address,'port':rinfo.port, 'type':'udp' }; 

            ISUDPCONNECTED = true; 

            // first time thru:
            if (this.have_we_recieved_anything_yet == undefined ) { this.have_we_recieved_anything_yet = true } 

            var array_of_chars = Uint8Array.from(msg) // from Buffer to byte array

            //console.log("\nUDPRAW:"+array_of_chars+" len:"+array_of_chars.length);

            var packetlist = [];
            //var mavlinktype = undefined;
            // lets try to support mav1/mav2 with dual parsers.
            if (array_of_chars[0] == 253 ) { 
                packetlist = mpo.parseBuffer(array_of_chars); // emits msgs from here woth parsed result
                //mavlinktype = 2; // known bug, at the moment we assume that if we parsed ONE packet for this sysid in the start of the stream as mav1 or mav2, then they all are
            } 
         
            // if there's no readable packets in the byte stream, dont try to iterate over it
            if (packetlist == null ) return;

            // all msgs in this block came from the same ip/port etc, so we just process the first one for the lookup table.

             sysid_to_ip_address[packetlist[0]._header.srcSystem] = {'ip':rinfo.address, 'port':rinfo.port, 'type':"udp" }; 
        });

        // this is a upd-server heartbeat handler at 1hz
        var tt = this;
        this.heartbeat_interval = setInterval(function(){
          //if (client != undefined ) client.send_heartbeat(); // types '>' on console 
          if (tt != undefined ) tt.heartbeat(); // types '>' on console 
          //if (serialport != undefined ) serialport.send_heartbeat(); // types '>' on console 
          //last_error = undefined;
          if (ISUDPCONNECTED ) show_stream_rates('udp')
        },1000);

    }

} // end connecting udp_server

//----------------------------------------------------------------------------------

var last_pkt_cnt = 0;
var rate = 0;
var data_timeout = 0;
var last_type = undefined;

var show_stream_rates = function(type) {

    if ( type != last_type) { data_timeout=0;   last_type =type;  }

    var newrate = (mpo.total_packets_received- last_pkt_cnt);

    if (newrate == 0 ) {data_timeout++;} else {data_timeout=0;}

    // allow a bit of jitter without reporting it
    if (( Math.abs(rate - newrate) > 40)) {
        console.log(type,"streamrate changed:",newrate," trend:",rate,"p/s");
    } 


    // if "streamrate changed 0 p/s" for the ~5 seconds then consider other end has gone away and warn...
    // since UDP connections are 'connectionless', we use streamrate of zero as a proxy for 'disconnected'.
    // as a bonus... when this happens, the TCP auto-conenct code will start re-trying, till we get a stream from either one of them.
    if ((data_timeout > 5) && (ISUDPCONNECTED)) { 
        console.log("incoing udp stream has gone away, sorry.");
        ISUDPCONNECTED=false;
        //data_timeout = 0;
    }

    //first time through, assume 120 for no reason other than its plausible, 'newrate' works well for non-serials.
    if (rate == 0) { rate = 120;} else {  rate = Math.floor(((rate*4)+newrate)/5); }

    last_pkt_cnt = mpo.total_packets_received;

}
//----------------------------------------------------------------------------------



module.exports = {SmartSerialLink,SmartUDPLink,SmartTCPLink,mpo,get_broadip_table,get_sys_to_ip_table};


