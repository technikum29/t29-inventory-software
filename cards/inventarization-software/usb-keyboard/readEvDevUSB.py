#!/usr/bin/env python

import sys
import evdev

devices = [evdev.InputDevice(fn) for fn in evdev.list_devices()]

if len(devices) == 0:
	print "No devices found, try running with sudo"
	sys.exit(1)

for device in devices:
	if device.name == 'Orand Inc. USB Keyboard':
		print(device)
		device.grab()
		for event in device.read_loop():
			#print event
			if event.type == evdev.ecodes.EV_KEY:
				print(evdev.categorize(event))
