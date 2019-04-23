/**
 * Clapperboard for t29 inventory photos
 **/

function numberToCode(value) { // QR code information
  return value ? "t29/inventar/"+value : "clapperboard/empty";
}

function numberToSound(value) { // DTMF sound information
  return "#" + value + "*";
}

document.addEventListener("DOMContentLoaded", function(){
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
});
