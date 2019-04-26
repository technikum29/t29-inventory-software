#!/usr/bin/env python2
#
# This is a small standalone Python2 webserver, using Tornado as sole
# dependency. It servers as a REST/Websocket PubSub and logging server
# and allows serveral input devices for Inventory marking to work together
#
# Quickly written by SvenK at 2019-04-26

import os, sys, csv, io, platform, datetime
import tornado.ioloop, tornado.web, tornado.websocket
from tornado.escape import json_decode, json_encode

port = 8000
static_file_path = os.path.dirname(__file__)

timestr = lambda: datetime.datetime.now().replace(microsecond=0).isoformat()
message_file = "markers-%s.csv" % timestr()

class MessageFile:
	"Small in-memory cache + CSV file"
	fields = ["timestamp", "event", "inv-nr", "comment" ]
	
	def __init__(self, filename):
		print "Writing to file %s" % message_file
		#self.fh = io.open(message_file, "w", encoding="utf-8", newline="")
		# Unicode in Python2 is dumb. Forget about Unicode...
		self.fh = open(message_file, "w")#, newline="")
		#self.writer = csv.writer(self.fh, delimiter="\t", quotechar='"', quoting=csv.QUOTE_MINIMAL)
		self.writer = csv.DictWriter(self.fh, fieldnames=self.fields, delimiter="\t")
		self.logger = csv.DictWriter(sys.stdout, fieldnames=self.fields, delimiter="\t")
		self.writer.writeheader()
		self.in_memory = []
		
	def append(self, row):
		row["timestamp"] = timestr()
		if not "comment" in row: row["comment"] = ""
		
		self.writer.writerow(row)
		self.logger.writerow(row)
		self.in_memory.append(row)
		
	def msg(self, msg): # syntactic sugar
		self.append({"event": "MSG", "inv-nr": "-", "comment": msg})

	def get_all(self):
		return self.in_memory # could then limit up to ... events

mf = MessageFile(message_file)
ws_connections=[]

mf.msg("File opened on %s by clapperboard-webserver.py" % platform.node())

class PubSubWebSocket(tornado.websocket.WebSocketHandler):
    def open(self):
	#import pdb; pdb.set_trace()
	mf.msg("Websocket client %s connected" % self.request.remote_ip)
        self.set_nodelay(True)
        ws_connections.append(self)

    def check_origin(self, origin): return True # allow all

    def on_message(self, message):
	mf.append(json_decode(message))
	# pub to all subscribers
	for c in ws_connections:
		c.write_message(json_encode(message))

    def on_close(self):
        mf.msg("Websocket client %s disconnected" % self.request.remote_ip)
        ws_connections.remove(self)

def make_handler(callback):
	class MiniHandler(tornado.web.RequestHandler):
		def get(self):
			return callback(self)
	return MiniHandler

websocket_path = r"/ws";
app = tornado.web.Application([
    (websocket_path, PubSubWebSocket),
    ('/get_websocket_path', make_handler(lambda req: req.write(websocket_path))),
    ('/get_initial_list', make_handler(lambda req: req.write(json_encode(mf.get_all())))),

    ('/', make_handler(lambda req: req.redirect("clapperboard/"))),
    (r'/(.*)', tornado.web.StaticFileHandler, {
	'path': static_file_path,
	 "default_filename": "index.html"})
], debug=True)

print "Starting Tornado server on port %d" % port
app.listen(port)
tornado.ioloop.IOLoop.current().start()
