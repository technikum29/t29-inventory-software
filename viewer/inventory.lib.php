<?php
/**
 * A mini lightweight dynamical renderer of the technikum29
 * inventory database (JSON based).
 *
 * Written by SvenK at 2019-09
 **/
 
include_once "Parsedown.lib.php"; // markdown support
 
// Might require an intermediate utf8_encode()
function read_json_file($fname) {
    return json_decode(file_get_contents($fname), /*assoc*/ true); }
function array_map_assoc(callable $f, array $a) {
    return array_merge(...array_map($f, array_keys($a), $a)); }
function print_markdown($txt) {
    print (new Parsedown())->text($txt); }

$config = read_json_file('../editor/inventory-editor-config.json');

$database = array_map_assoc(function($k, $fn) use ($config) {
   return [$k => read_json_file($config['paths']['inventory_repository'] . '/' . $fn )];
}, $config['files']);

extract($database); // defines $inventory, $schema, $media

// Enrich database: Find primary key name
foreach($schema["properties"] as $k => $props) {
	if(isset($props["primary-key"]) && $props["primary-key"]) {
		$primary_key = $k; break;
	}
}

if(!isset($primary_key))
	die("Could not determine t29 inventory database primary key.");
	
function sanatize_inv_query($query) {
	preg_match('/^(\d+)/', $query, $matches);
	return $matches ? $matches[0] : NULL;
}

function get_inventory_by_number($inv_no) {
	global $config, $inventory, $primary_key;
	$candidates = array_filter($inventory,
	   function($inv) use ($inv_no, $primary_key) {
		return isset($inv[$primary_key]) && $inv[$primary_key] == $inv_no;
	   });
	return count($candidates)==1 ? array_values($candidates)[0] : array();
}

function get_inventory_relations_by_number($inv_no) {
	// this is dumb
	global $inventory, $primary_key;
	$i = 0; // $inventory is a plain list (not dict)
	foreach($inventory as $inv) {
		if(isset($inv[$primary_key]) && $inv[$primary_key] == $inv_no) {
			$prev = $i>0 ? $inventory[$i-1] : array();
			$next = count($inventory)>$i ? $inventory[$i+1] : array();
			return compact('prev', 'next');
		}
		$i += 1;
	}
	return array();
}

function make_inventory_link_for($inv_no) {
	return '?'.http_build_query(array('inv' => $inv_no));
}

function get_thumb_by_number($inv_no) {
	global $media, $config;
	$inv_media = isset($media[$inv_no]) ? $media[$inv_no] : array();
	return $config['paths']['media_repository'] .'/'.
		(empty($inv_media)
		  ? $config['media']['square_thumbnail_placeholder']
		  : ($config['media']['cache_directory']
		      .'/'. $inv_media[0]
		      . $config['media']['square_thumbnail_suffix']
		    ))
	;
}

function get_media_by_number($inv_no) {
	global $media, $config;
	return isset($media[$inv_no]) ?
		array_map(function($k) use ($config) {
			return $config['paths']['media_repository'] .'/'.$config['media']['cache_directory'].'/'.$k;  },
		$media[$inv_no])
	: array();
}

function schema_sort($inv) {
	// todo; as implemented already in Python, such as in the inventory2latex.py file
	return $inv;
}

function inv_404($msg) {
	print "Error: $msg";
	exit;
}




