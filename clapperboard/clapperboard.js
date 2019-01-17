/**
 * Clapperboard for t29 inventory photos
 **/

function numberToCode(value) {
  return value ? "t29/inventar/"+value : "clapperboard/empty";
}

document.addEventListener("DOMContentLoaded", function(){
  input  = document.getElementById('inv-nr');
  qrcode = new QRCode(document.getElementById('qrcode'), numberToCode());

  input.addEventListener("input", function(){
     qrcode.makeCode(numberToCode(input.value));
  });
});
