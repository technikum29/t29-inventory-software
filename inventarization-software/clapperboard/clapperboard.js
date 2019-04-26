/**
 * Clapperboard for t29 inventory photos
 **/

window.cb = { /* clapperboard app namespace */
   ws: null,  // Websocket connection
   mf: []     // Messagefile content
};

function numberToCode(value) { // QR code information
  return value ? "t29/inventar/"+value : "clapperboard/empty";
}

function numberToSound(value) { // DTMF sound information
  return "#" + value + "*";
}

function log(msg) {
  ws.send(JSON.stringify({"event": "MSG", "inv-nr": "-", "comment": msg}));
}

function startup(){
  input  = document.getElementById('inv-nr');
  qrcode = new QRCode(document.getElementById('qrcode'), numberToCode());

  input.addEventListener("input", function(){
     qrcode.makeCode(numberToCode(input.value));
  });
  input.addEventListener("keypress", function(event){
     if(event.key === "Enter") {
        dtmfPlay(numberToSound(input.value));
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
  
  $.ajax({
    url: "/get_initial_list",
    success: function(msgs) {
       console.log("Initial data recieved");
       cb.mf = msgs;
    }
  });
  
  var loc = window.location;
  var fqdn_ws_path = "ws://" + window.location.host + websocket_path;
  console.log("Opening Websocket at ", fqdn_ws_path);
  ws = new WebSocket(fqdn_ws_path);

  ws.onopen = function() {
    log("Hello from javascript");
  };
  ws.onmessage = function(evt) {
    msg = JSON.parse(evt.data);
    console.log("Recieved a message");
    cb.mf.push(msg);
    //$("#ws").append(evt.data); // yep...

    // Now do double data binding.
  };
}

document.addEventListener("DOMContentLoaded", startup);
