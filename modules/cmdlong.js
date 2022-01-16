var EventEmitter = require('events');
//var util = require('util');
var inherits = require('util').inherits;
//var _ = require('underscore');

// Logging object (winston)
var log;

// Hash of pending-expected acks
var pendingAcks = {};

// Hash of handlers monitoring async send/receive pairs
var senderHandler = {};

// Hash of timers watching for timeouts on ongoing send/receive pairs
var timeoutWatcher = {};

// Reference to the mavlink protocol object
var mavlink;
// Reference to the instantiated mavlink object, for access to target system/component.
var mavlinkParser;

// spec: 
// https://mavlink.io/en/messages/common.html#COMMAND_LONG
// https://mavlink.io/en/messages/common.html#COMMAND_ACK
// https://mavlink.io/en/messages/common.html#MAV_RESULT

// CmdLong object constructor
class MavCmdLong {

    constructor(mavlinkProtocol, mavlinkProtocolInstance, sysid,cmpid,logger) {
	    log = logger;
	    mavlink = mavlinkProtocol;
	    mavlinkParser = mavlinkProtocolInstance;

        this.cmdlongItems = {};

        this.target_system = sysid;
        this.target_component = cmpid;

        this.giveup = false;

        console.log("long target system "+this.target_system);
        console.log("long target comp  "+this.target_component);

        EventEmitter.call(this); // make this class an event consumer/producter..
	    
	    // If the ack is OK, signal OK; if not, signal an error event
	    mavlinkParser.on('COMMAND_ACK', function(msg) {

            if ( this.giveup ) return; 

            console.log('COMMAND_ACK <--',msg.command,'result:',msg.result); // brief
            //console.log('COMMAND_ACK <--',msg); // long

            var mav_cmd_id = msg.command; // eg 246 = reboot

            var mav_cmd_progress = msg.progress; // eg 0 or MAV_RESULT_IN_PROGRESS

            var mav_cmd_result = msg.result; // eg 0=MAV_RESULT_ACCEPTED , or 4=MAV_RESULT_FAILED, 5=MAV_RESULT_IN_PROGRESS etc

            if ( mav_cmd_result == mavlink.MAV_RESULT_ACCEPTED ) {
                this.emit('LONGmessage','cmdlong:accepted');
                console.log("accepted");
            } else {
                this.emit('LONGmessage','cmdlong:failed');
                console.log("failed");
            }

               if(pendingAcks[mav_cmd_id]) {
                    delete pendingAcks[mav_cmd_id];
                    //console.log("-> ack was pending"); 

                    // stop any retries
                    clearInterval(senderHandler[mav_cmd_id]);
                    // stop timeout handler ( at the end of retries)
                    clearTimeout(timeoutWatcher[mav_cmd_id]);
                }


            
	        //t.emit('cmdlong:sent to drone');
            //t.send_complete = true; // t is this

	    });

    }

    destroy () {
      this.giveup = true;
    }

}

//util.inherits(MavCmdLong, events.EventEmitter);
inherits(MavCmdLong, EventEmitter);


MavCmdLong.prototype.send = function(name, retries) {
console.log("name:"+name+" --> SENDING PKT");
    // alisaes
    if (name == 'reboot' ) { 
        attrs = [                
                mavlink20.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN, // a MAV_CMD 
                0, // confirmation
                1,0,1,0,0,0,0 // params 1-7 , this means reboot.
                ];
    }
    if (name == 'accel-cal' ) { 
        attrs = [                
                mavlink20.MAV_CMD_PREFLIGHT_CALIBRATION, // a MAV_CMD 
                0, // confirmation
                0,0,0,0,1,0,0 // params 1-7, param5=1 means 'accelerometer calibration'
                ];
    }

    retries = typeof retries !== 'undefined' ? retries : 1000;

    var cmdlng = new mavlink20.messages.command_long(this.target_system,this.target_component, ...attrs);

    var mav_cmd_id = cmdlng.command; // eg 246 = reboot

    // mostly these dont queue-up heavily.
    var param_retry_delay = 1000;

    // set a 'pending ack' that we can clear when its recieved
    pendingAcks[mav_cmd_id] = param_retry_delay;

        console.log('cmdlong:sent to drone', cmdlng.command); // brief
        //console.log('cmdlong:sent to drone', cmdlng); // more
        mavlinkParser.send(cmdlng); 

    // Establish a 1hz retry handler to try and send the required packet every second until cancelled by getting an 'ack' back
    senderHandler[mav_cmd_id] = setInterval( function() {
        console.log('retrying cmdlong:sent to drone', cmdlng.command); // brief
        //console.log('retrying cmdlong:sent to drone', cmdlng); // more
        mavlinkParser.send(cmdlng); 
    }, param_retry_delay);

    // if we never get an ack, how long do we wait..? 10 secs  = 10 retries
    timeoutWatcher[mav_cmd_id] = setTimeout(function() {
        clearInterval(senderHandler[mav_cmd_id]);
        console.log("cleared interval.."+mav_cmd_id);
        if(pendingAcks[mav_cmd_id]) {
            console.log("ACKS were pending. "+name+" "+pendingAcks[mav_cmd_id]);
            delete pendingAcks[mav_cmd_id];
        }
        
    }, retries);

};


module.exports = MavCmdLong;
