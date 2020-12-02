/*
https://ourcodeworld.com/articles/read/445/how-to-use-event-emitters-with-es5-and-es6-in-node-js-easily

When EventEmitter.call(this) is executed during the creation of an instance from YourLibrary, it appends properties declared from the EventEmitter constructor to YourLibrary. Then the inherits function inherits the prototype methods from one constructor into another (your constructor YourLibrary and the super constructor EventEmitter), in this way the prototype of your constructor will be set to a new object created from superConstructor.

As your library obviously won't offer the same methods of EventEmitter you need to add your own functions to YourLibrary by using prototyping before or after the module.exports line:
*/

// tip: In the top-level code in a Node module, this is equivalent to module.exports. That's the empty object you see.

//YourLibrary = Better

// Instantiate event emitter and inherits
var EventEmitter = require('events');
var inherits = require('util').inherits;

// Create the constructor of YourLibrary and add the EventEmitter to this context
var Better = function (m,mp) {
    var self = this; // 'this' can be fleeting, and changes insiude of callbacks, 'self' wont
    this.m = m;
    this.parser = mp;
    this.is_armed = false;

    EventEmitter.call(this); // make this class an event consumer/producter..

    // hook a thing that we want all instances to handle...
    this.on('custom_event', function() {
        self.logSomething('custom_event');
      });


   console.log('[better] module registered for HUD msgs');
   this.on('HUD', function (data) 
    {

    //process.stdout.write('b');

       if (this.parser !== undefined ) { 

            if ( this.is_armed == false) {
     // console.log('HUD listner executed.',data);

                    var sysid = 1;
                    var m = this.m;//decide_which_mavlink_obj_and_return_it(sysid);  
                    var mp = this.parser;//decide_which_mavlink_parser_and_return_it(sysid); // mp means 'Mavlink Parser'

                    var target_system = sysid, target_component = 0, command = m.MAV_CMD_COMPONENT_ARM_DISARM, confirmation = 0, 
                        param1 = 1, param2 = 0, param3 = 0, param4 = 0, param5 = 0, param6 = 0, param7 = 0;
                    // param1 is 1 to indicate arm
                    var command_long = new m.messages.command_long(target_system, target_component, command, confirmation, 
                                                                     param1, param2, param3, param4, param5, param6, param7)
                    this.parser.send(command_long,sysid);
                    console.log("[better] attempting ARM of sysid:"+sysid);

           }


            //this.parser.send('xxxx'); 
        }
    });

   // the 'mode' message is like 'armed' message, but has more info, including sysid
   this.on('mode', function (data) 
    {
       if (this.is_armed != data.armed) {
             if (data.armed == true ) console.log("[better] ARM-ed sysid:"+data.sysid);
             if (data.armed == false ) console.log("[better] DISARM-ed sysid:"+data.sysid);
             this.is_armed = data.armed;
       }
    });

    this.on('message', function (data) 
    {
        var msgname = data.name;
      //console.log('all listner executed.',msgname);
      //process.stdout.write('d');
    });
}


Better.prototype.logSomething = function(something) {
  console.log(something);
}

// Use Inheritance to add the properties of the DownloadManager to event emitter
inherits(Better, EventEmitter);

// Export YourLibrary !
module.exports = Better;

//----------------------

Better.prototype.testAsyncMethod = function testAsyncMethod(someData) {
    _this = this;

    // Execute the data event in 2 seconds
    setTimeout(function(){
        // Emit the data event that sends the same data providen by testAsyncMethod 
        _this.emit("better-async", someData);
    }, 2000);
};


//----------------------
// nearly event-emitter object, wich means that io.of(IONameSpace).emit(...) emits to here...

/*
class emitterClass extends events.EventEmitter {

    constructor(opt) {
        super();
        this.parser  = opt;
        //this.name = 'emitter.js'; // set some class properties
      }

    // add some fucntions

    this.on('HUD', function (data) 
    {
     // console.log('HUD listner executed.',data);
    process.stdout.write('.');

       if (this.parser !== undefined ) { this.parser.send('xxxx'); }
    });

    this.on('message', function (data) 
    {
        var msgname = data.name;
      console.log('all listner executed.',msgname);
      //process.stdout.write('x');
    });


}
*/

//var emitterClass = function() {}
//util.inherits(emitterClass, events.EventEmitter);

// make a constructor
//exports.make = emitterClass.prototype.constructor ;

/*
emitterClass.prototype.on = function( msgname, msgdata) {
        console.log("EEEEEEEE ON!!!!",msgname,msgdata);

        if( typeof msgdata === 'function')  msgdata();
}
*/

/*
emitterClass.prototype.emit = function( msgname, msgdata) {
        //console.log(" EMIT!!!!:",msgname," --> " ,msgdata);
        console.log("EEEEEEE EMIT!!!!:",msgname);

        if ((msgname == 'mode') && (msgdata.mode != undefined)) {  
     //       MODE =  msgdata.mode;  
        } // eg 'RTL'

        if ((msgname == 'attitude') && (msgdata.sysid != undefined)) {  
     //       SYSID =  msgdata.sysid;  
        } // eg '1'
}
*/



//exports.emitter = new emitterClass(); // instance of object.

/*
exports.emitter.on('HUD', function (data) 
{
 // console.log('HUD listner executed.',data);
process.stdout.write('.');

   if (this.parser !== undefined ) { this.parser.send('xxxx'); }
});

exports.emitter.on('message', function (data) 
{
    var msgname = data.name;
  console.log('all listner executed.',msgname);
  //process.stdout.write('x');
});
*/

/* data = 

{
  sysid: 1,
  airspeed: 0.022061705589294434,
  groundspeed: 0.12951278686523438,
  heading: 123,
  throttle: 0,
  climb: -0.07263321429491043,
  ap_type: 'ArduPilot'
}
*/

//module.exports = exports;

