#!/usr/bin/env python3
#
# Inspired by the t29-inventory-webserver.py.
# SvenK, 2019-08-08

import os, json, pathlib, tempfile, re, datetime
import jinja2 # sudo apt-get install python3-jinja2

timestr = lambda: datetime.datetime.now().replace(microsecond=0).isoformat()
slurp = lambda filename: pathlib.Path(filename).read_text()
read_json_file = lambda filename: json.loads(slurp(filename))
tmpdir = tempfile.mkdtemp(suffix="--"+os.path.basename(__file__))

config = read_json_file("../editor/inventory-editor-config.json")
data = { key: read_json_file(os.path.join(config['paths']['inventory_repository'], fn)) for key,fn in config['files'].items() }

# enrich data
data["primary_key"] = [ field for field,schema in data['schema']['properties'].items() if "primary-key" in schema ][0]

def media_path_for(inv):
	"""
	Composes a suitable smaller image (from cache directory) and returns a path to that file without spaces
	by making a temporary softlink. Because latex doesn't like whitespace.
	"""
	image = data["media"][inv[data["primary_key"]]][0]
	full_path = os.path.join(
		config["paths"]["media_repository"],
		config["media"]["cache_directory"],
		image)
	# assuming the full_path also doesn't introduce whitespace when the image itself doesn't.
	simplified_name = re.sub("[^a-zA-Z0-9.]", "-", image)
	full_path_to_simplified_name = os.path.join(tmpdir, simplified_name)
	if not os.path.isfile(full_path_to_simplified_name):
		os.symlink(os.path.realpath(full_path), full_path_to_simplified_name)
	# return only the basename
	return simplified_name

data['date_identifier'] = timestr()
	
# limit the amount of data
data["inventory"] = data["inventory"][:30]

data["media_path_for"] = media_path_for
data["graphicspath"] = tmpdir + "/" # latex requires trailing slash
data["config"] = config

print("Dumping %d inventory items into tex file..." % len(data["inventory"]))
print("Working in %s " % tmpdir)

jinja2.Environment(
	block_start_string="<<",  # defaults {%
	block_end_string=">>",    # defaults %}
	variable_start_string=u"«", # defaults {{
	variable_end_string=u"»",    # defaults }}
	comment_start_string="Use Line comments instead",  # defaults {# (really problematic)
	comment_end_string="Dont use them, use line comments instead",  # defaults #}
	line_comment_prefix="###"
).from_string(slurp("template.tex")).stream(**data).dump('inventory.tex')
