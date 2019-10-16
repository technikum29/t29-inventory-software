#!/usr/bin/env python3
#
# Inspired by the t29-inventory-webserver.py.
# SvenK, 2019-08-08

import sys, os, json, pathlib, tempfile, re, datetime, collections, subprocess
import jinja2 # sudo apt-get install python3-jinja2

not_in = lambda x,y: [item for item in x if item not in y]
both_in = lambda x,y: [item for value in x if item in y] 
is_one_of = lambda base, candidates: any([base==c for c in candidates])
slurp = lambda filename: pathlib.Path(filename).read_text()
read_json_file = lambda filename: json.loads(slurp(filename))
tmpdir = tempfile.mkdtemp(suffix="--"+os.path.basename(__file__))
# simple but unsafe ways of checking repository status for stats
git_head_commit = lambda repodir: subprocess.getoutput("cd '%s'; git rev-parse --short HEAD"%repodir)
git_working_directory_is_clean = lambda repodir: subprocess.getoutput("cd '%s'; git diff --exit-code 2>&1 >/dev/null; echo $?"%repodir) == "0" # EXIT_SUCCESS

config = read_json_file("../editor/inventory-editor-config.json")
data = { key: read_json_file(os.path.join(config['paths']['inventory_repository'], fn)) for key,fn in config['files'].items() }

schema_props = data['schema']['properties'] # abbrev

# enrich data
data["primary_key"] = [ field for field,schema in schema_props.items() if "primary-key" in schema ][0]

sorted_schema_props = sorted(schema_props.keys(), key=lambda k: (schema_props[k].get("order", 100), k))
def sorted_fields_for(inv):
	"""
	Show fields first by schema order key, then alphanumerically.
	"""
	return [k for k in sorted_schema_props if     k in inv] \
	     + [k for k in sorted(inv)         if not k in schema_props]

data['sorted_fields_for'] = sorted_fields_for

def media_path_for(inv):
	"""
	Composes a suitable smaller image (from cache directory) and returns a path to that file without spaces
	by making a temporary softlink. Because latex doesn't like whitespace.
	"""
	image = data["media"][inv[data["primary_key"]]][0]
	prefix = os.path.join(config["paths"]["media_repository"], config["media"]["cache_directory"])
	full_path = os.path.join(prefix, image)
	if not os.path.isfile(full_path):
		print("Warning: For inventory no. %s, primary image '%s' does not exist at %s." \
		  % (inv[data["primary_key"]], image, prefix), file=sys.stderr)
		return None
	# assuming the full_path also doesn't introduce whitespace when the image itself doesn't.
	simplified_name = re.sub("[^a-zA-Z0-9.]", "-", image)
	full_path_to_simplified_name = os.path.join(tmpdir, simplified_name)
	if not os.path.isfile(full_path_to_simplified_name):
		os.symlink(os.path.realpath(full_path), full_path_to_simplified_name)
	# return only the basename
	return simplified_name

data['date_identifier'] = datetime.datetime.now().strftime("%-d. %B %Y")
data['git_commit'] = git_head_commit(config['paths']['inventory_repository'])
data['git_clean'] = git_working_directory_is_clean(config['paths']['inventory_repository'])


def inventory_filter(inv):
	return not any([
		"Objekt" in inv and is_one_of(inv["Objekt"].strip(), ("ungenutzt", "gedruckt")),
		"Beschreibung" in inv and is_one_of(inv["Beschreibung"].strip(), ("ungenutzt", "gedruckt"))
	])

data["inventory"] = list(filter(inventory_filter, data["inventory"]))

# limit the amount of data for testing
#data["inventory"] = data["inventory"][:30]

data["media_path_for"] = media_path_for
data["graphicspath"] = tmpdir + "/" # latex requires trailing slash
data["config"] = config

print("Dumping %d inventory items into tex file..." % len(data["inventory"]))
print("Working in %s " % tmpdir)

# cf. https://tex.stackexchange.com/a/34586
latex_special_chacters = collections.OrderedDict({'\\': '\\textbackslash'}) # replace \ at first
latex_special_chacters.update({ c: '\\'+c for c in '&%$#_{}' })     # then all easy, then all verbose characters
latex_special_chacters.update({ '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', u'€': '\\euro{}' })

def escape_latex(text):
	if not isinstance(text,str): return text
	for c,safe in latex_special_chacters.items():
		text = text.replace(c,safe)
	return text

env = jinja2.Environment(
	block_start_string="<<",  # defaults {%
	block_end_string=">>",    # defaults %}
	variable_start_string=u"«", # defaults {{
	variable_end_string=u"»",    # defaults }}
	comment_start_string="Use Line comments instead",  # defaults {# (really problematic)
	comment_end_string="Dont use them, use line comments instead",  # defaults #}
	line_comment_prefix="###"
)

env.filters['esc'] = escape_latex

env.from_string(slurp("template.tex")).stream(**data).dump('inventory.tex')

# At one point, after compiling the tex file, you should delete the tmpdir...
# shutils.rmtree(tmpdir)
