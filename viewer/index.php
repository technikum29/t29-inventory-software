<?php
  include 'inventory.lib.php';

  $seiten_id = "php-inventory-viewer";
  $external = true;
  
  $header_prepend = <<<HEAD
     <link rel="stylesheet" type="text/css" href="inv-php.css">
     <link rel="styhesheet" type="text/css" href="magnific-popup.css"><!-- to be done -->
     <!-- Siehe Scripte am Ende -->
HEAD;

  $mainnav_content = <<<NAV
     <ul class="u1">
         <li><a href="http://technikum29.de/inv">Inventar Start</a></li>
     </ul>
NAV;

  if(isset($_GET['inv'])) {
     /* Detail list of a particular inventory item */
  $reqid = $_GET['inv'];
  $reqid = sanatize_inv_query($reqid);

  $rels = get_inventory_relations_by_number($reqid);
  $prev_link = $rels["prev"] ? "<a href='".make_inventory_link_for($rels['prev'][$primary_key])."'>Vorgänger (#". $rels['prev'][$primary_key]. ")</a>" : '';
  $next_link = $rels["next"] ? "<a href='".make_inventory_link_for($rels['next'][$primary_key])."'>Nachfolger (#". $rels['next'][$primary_key]. ")</a>" : '';


  $sidebar_content = <<<NAV
     <ul class="u2">
        <li><a href="?">Übersicht</a></li>
        <li>$prev_link</li>
        <li>$next_link</li>
     </ul>
NAV;



  $template_callback = function($template) use ($rels, $primary_key) {
        foreach($rels as $relation => $inv) { // $relation is either "prev" or "next"
	        if(!$inv) continue;
		$link = make_inventory_link_for($inv[$primary_key]);
		$desc = "Inventar #". $inv[$primary_key]. ": " .$inv['Objekt'];
		$template->set_page_relation($relation, $link,
			// Workaround buggy XML en/decoder for menu which does not like HTML entities
			preg_replace('/[[:^print:]]/', '-', $desc));
	}
  };

  // $body_append = ...

  include 't29-lib/technikum29.php';
?>

<?php

if(!$reqid) { inv_404("Illegal Inventory number. Must be a number."); }

$inv = get_inventory_by_number($reqid);
if(!$inv) { inv_404("Inventory with number '<em>$reqid</em>' does not exist."); }

$thumb = get_thumb_by_number($reqid);
$images = get_media_by_number($reqid);

?>

<h2>Inventar #<?php print $inv[$primary_key]; ?>: <?php print $inv['Objekt']; ?></h2>
<?php print_markdown($inv['Beschreibung']); ?>

<h3>Bilder</h3>
<div class="media">
<?php
if(!$images) print '<em>Leider ist dieses Inventar noch ohne Foto.</em>';

foreach($images as $img) {
    $this_thumb = $img . $config['media']['square_thumbnail_suffix'];
    print "<a href='$img' class='popup'><img src='$this_thumb'></a>";
}

?>
<div class="clearfix"></div>
</div>

<h3>Daten</h3>
<dl class="properties">
<?php
  foreach(schema_sort($inv) as $k => $v) {
    if(in_array($k, ["Objekt","Beschreibung",$primary_key])) continue;
    $props = isset($schema['properties'][$k]) ? $schema['properties'][$k] : array();
    $title = isset($props['title']) ? $props['title'] : 'new item';
    print "<dt><strong>$k</strong><span class='title'>$title</span><dd>$v";
  }
?>
</dl>

<!-- Skripte am Seitenende -->
<!--
     <script src="magnific-popup.min.js" type="text/javascript"></script>
     <script type="text/javascript">
	// MAGNIFIC POPUP SETUP
	// http://dimsemenov.com/plugins/magnific-popup/documentation.html
	$(function() {
	   $("div.media").magnificPopup({
		delegate: 'a',
		type: 'image',
		gallery: {
			enabled: true
		},
		image: {
			titleSrc: function(item) {
				//console.log(item);
				return item.el.find("span.desc").html();
			},
			verticalFit: true, // gute idee find ich
		},
	   });
	});
     </script>
-->

<?php
  /* end of detail list of a particular item */
  } else {
  /* generic list */
  
  $sidebar_content = <<<NAV
     <p>This is an early version of a  static, server-side generated inventory <em>viewer</em>.
     There is also an interactive inventory <em>editor</em> available.
     See the <a href="/inv">Inventory entry page</a> for more information.
NAV;
  
  
  include 't29-lib/technikum29.php';
?>
<h2>Inventory list</h2>

<div class="media">
<?php

foreach($inventory as $inv) {
    $img = get_thumb_by_number($inv[$primary_key]);
    $target = "?".http_build_query(array("inv" => $inv[$primary_key]));
    print "<a href='$target'><img src='$img'></a>";
}

?>
<div class="clearfix"></div>
</div>

<?php
  } /* end of if generic list/detail */
?>
