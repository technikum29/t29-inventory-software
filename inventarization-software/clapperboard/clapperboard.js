/**
 * Clapperboard for t29 inventory photos
 **/

window.cb = { /* clapperboard app namespace */
   ws: null,  // Websocket connection
   mf: [],     // Messagefile content
   
   // log only locally
   log: function(msg) { cb.mf.push({"event": "LOCMSG", "inv-nr": "-", "comment": msg}); }
};

function numberToCode(value) { // QR code information
  return value ? "t29/inventar/"+value : "clapperboard/empty";
}

function numberToSound(value) { // DTMF sound information
  return "#" + value + "*";
}

function log(msg) {
  cb.ws.send(JSON.stringify({"event": "MSG", "inv-nr": "-", "comment": msg}));
}

function setCode(code) {
  cb.ws.send(JSON.stringify({"event": "START", "inv-nr": code, "comment": "from Clapperboard" }));
  dtmfPlay(numberToSound(code));
}

function startup(){
  input  = document.getElementById('inv-nr');
  qrcode = new QRCode(document.getElementById('qrcode'), numberToCode());
  
  cb.vue = new Vue({ el: "#log", data: cb });

  input.addEventListener("input", function(){
     qrcode.makeCode(numberToCode(input.value));
  });
  input.addEventListener("keypress", function(event){
     if(event.key === "Enter") {
        setCode(input.value);
        // Don't submit form or similar
        event.preventDefault();
        return false;
     }
  });
  
  $.ajax({
    type: 'GET',
    url: '/get_websocket_path',
    success: fullSetup,
    error: function() { $("#status").text("(standalone)"); }
  });
}

function fullSetup(websocket_path) {
  $("#status").text("connected");
  $("body").addClass("showLog");
  
  $.ajax({
    url: "/get_initial_list",
    success: function(msgs) {
       cb.log("Initial data recieved");
       cb.mf = JSON.parse(msgs);
    }
  });
  
  var loc = window.location;
  var fqdn_ws_path = "ws://" + window.location.host + websocket_path;
  cb.log("Opening Websocket at " + fqdn_ws_path);
  cb.ws = new WebSocket(fqdn_ws_path);

  cb.ws.onopen = function() {
    log("Hello from javascript");
  };
  cb.ws.onmessage = function(evt) {
    msg = JSON.parse(evt.data);
    //msg = JSON.parse(msg); // dafuq
    console.log("recieved ", msg);
    cb.mf.push(msg);
    // Proper double data binding would be nice
  };
}

document.addEventListener("DOMContentLoaded", startup);
