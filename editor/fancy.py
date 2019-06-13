#!/usr/bin/env python2
#
# This is a small standalone Python2 webserver.
# It servers as a REST/Websocket PubSub and logging server
# and allows serveral input devices for Inventory marking to work together
#
# Prototype, based on the inventory clapperboard webserver
#
#  Dependencies:  Tornado, Json-Patch
#
# Quickly written by SvenK at 2019-04-26, 2019-05-10

import os, sys, csv, io, re, platform, datetime, random, string  # builtins
import tornado.ioloop, tornado.web, tornado.websocket
from tornado.escape import json_decode, json_encode
from json import load as json_load # from file
import jsonpatch # PyPi https://python-json-patch.readthedocs.io/en/latest/

timestr = lambda: datetime.datetime.now().replace(microsecond=0).isoformat()

def make_handler(callback):
	class MiniHandler(tornado.web.RequestHandler):
		def get(self):
			return callback(self)
	return MiniHandler

randomString = lambda stringLength=10: ''.join(random.choice(string.ascii_lowercase) for i in range(stringLength))
make_default_identifier = lambda ip_as_str: ip_as_str + randomString(3)

def read_json_file(filename):
	# probably todo: file locking
	with open(filename, "r") as fh:
		return json_load(fh)
def write_json_file(filename, data):
	# todo: file locking
	# Such as https://github.com/dmfrey/FileLock/blob/master/filelock/filelock.py#L15
	# or https://docs.python.org/2/library/fcntl.html#fcntl.lockf
	with open(filename, "w") as fh:
		fh.write(json_encode(data))


port = 8000
static_file_path = os.path.dirname(__file__)
#message_file = "markers-%s.csv" % timestr()

paths = {
	# files in the local directory
	"inventory_filename": "./inventory/inventory.json",
	"schema_filename": "./inventory/schema.json",
	"patches_directory": "./patches/",
	
	# A "virtual" URL endpoint, no files
	"websocket_path": "/ws",
	"inventory_path": "/inventory/inventory.json", # mind the missing dot; absolute
}

class JSONEditor:
	""""
	The server endpoint for stateful editing a JSON file.
	We use JSON patch for compression over network.
	The JSON file changes are managed via Git. This allows to postpone
	conflict changes to the future.
	
	Clients are identified with a short string which may change during the session.
	
	This class is purely "local" and does not know about transports,
	such as Websocket, HTTP/REST, etc.
	"""
	
	def set_identifier(self, new_identifier, _internal_max_tries=10):
		# TODO: Treat new_identifier as potentially harmful;
		# TODO: Slugify identifier and remove malicious names such as "../../whatever"
		
		suffix = ".json"
		new_patch_filename = os.path.join(paths["patches_directory"], "patch-" + new_identifier + suffix)
		
		if hasattr(self, "identifier") and os.path.exists(self.patch_filename)
			# this is a rename operation.
			if not os.path.exists(new_patch_filename):
				os.rename(self.patch_filename, new_patch_filename)
				self.patch_filename = new_patch_filename
				self.identifier = new_identifier
				return new_identifier
			else:
				# change of identifier neccessary
				pass
		elif not os.path.exists(new_identifier):
			self.patch_filename = new_patch_filename
			self.identifier = new_identifier
			return new_identifier
		
		# identifier needs to be changed.
		# Recursively try to deal with existing identifiers
		if internal_max_tries>0:
			new_identifier += randomString(3)
			return self.set_identifier(new_identifier, _internal_max_tries=_internal_max_tries-1)
		else:
			raise ValueError("Cannot deal with existing identifier %s" % new_identifier)
		
	
	def __init__(self, filename, identifier):
		"""
		filename: Filename of the document to edit
		identifier shall be a short string identifing the client
		"""
		self.filename = filename
		self.patch = {} # empty patch
		self.basis = read_json_file(filename)
		self.set_identifier(identifier)
	
	def set_patch(self, new_patch_document):
		self.patch = new_patch_document
		# The frequent write-out is only helpful for debugging or safety,
		# but not really neccessary
		json_write_document(self.patch_filename, self.patch)
	
	def is_patch_empty(self):
		return bool(self.patch)
	
	def close_patch(self):
		if self.is_patch_empty():
			os.remove(self.patch_filename())
		else:
			print "Would apply patch now: "+self.patch_filename()

	def apply_patch(self):
		jsonpatch.apply_patch(self.basis, self.patch, in_place=True)
		self.patch = {} # reset patch
		self.write_doc()
		
	def write_doc(self):
		json_write_document(self.basis, self.filename)
	
	def __str__(self):
		return "JSONEditor(%s, %s) with %d patches" % (self.filename, self.identifier, len(self.patch))

#### TODO CONTINUE WITH EDITOR, rwerite as JSON editor, integrate GIT.
#### with https://github.com/libgit2/pygit2


inv = Inventory(paths["inventory_filename"])

class PubSubWebSocket(tornado.websocket.WebSocketHandler):
    def open(self):
	#import pdb; pdb.set_trace()
	print "Websocket client %s connected" % self.request.remote_ip
        self.set_nodelay(True)

        self.editor = Editor(
		inv, # ...
		make_default_identifier(self.request.remote_ip))

    def check_origin(self, origin): return True # allow all

    def on_message(self, message):
	# so we assume the thing we got is a new JSON patch document.
	self.editor.set_patch( json_decode(message) )
	print "got patch"

    def on_close(self):
        print "Websocket client %s disconnected" % self.request.remote_ip
        self.editor.close_patch()
        # This is a good moment to do the sync...

app = tornado.web.Application([
    (paths["websocket_path"], PubSubWebSocket),
    ('/paths', make_handler(lambda req: req.write(json_encode(paths)))),

    ('/', make_handler(lambda req: req.redirect("app/"))),
    (r'/(.*)', tornado.web.StaticFileHandler, {
         'path': static_file_path,
	 "default_filename": "index.html"
    })
], debug=True)

print "Starting Tornado server on port %d" % port
app.listen(port)
tornado.ioloop.IOLoop.current().start()
