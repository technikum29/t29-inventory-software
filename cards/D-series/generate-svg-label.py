#!/usr/bin/env python3

#
# Generates bulk QR codes from SVG
#
# Public Domain by SvenK, 2021
#
#

import tempfile, sys
from lxml import etree
import requests # for urlstuff

# see https://github.com/lincolnloop/python-qrcode/blob/master/qrcode/image/svg.py
import qrcode
import qrcode.image.styledpil, qrcode.image.svg, qrcode.image.styles.moduledrawers

#image_factory = qrcode.image.styledpil.StyledPilImage # bitmap (PNG)
factory = qrcode.image.svg.SvgPathImage
drawer = qrcode.image.styles.moduledrawers.RoundedModuleDrawer
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L)

svg_template_filename = "t29-sec-labels.svg"

if len(sys.argv) < 2:
    print("Usage: python [thisfilename] [id]")
    print("Will print SVG file to stdout.")
    sys.exit(-1)

inv_id = sys.argv[1]

qr_code_data = "t29/inv/d/"+str(inv_id)

# Generates the QR code:
qr.clear()
qr.add_data(qr_code_data)
img = qr.make_image(image_factory=factory, eye_drawer=drawer, module_drawer=drawer)
#img.save("/tmp/qr.png")
qr_svg_text = img.to_string()
# a single path XML element for a qr code for data
qr_svg_path = etree.fromstring(qr_svg_text)[0]

# set the inventory ID
svg_template_string = open(svg_template_filename, "r").read()
svg_template_string = svg_template_string.replace("1234", str(inv_id))

label_svg = etree.fromstring(svg_template_string.encode("utf-8"))

#label_svg.find("//*[@id='serial']")[0].text = "1234"
label_svg_qrcode_group = label_svg.xpath("//*[@id='qrcode']")[0]
# replace the paths in the group

for child in label_svg_qrcode_group: label_svg_qrcode_group.remove(child)
label_svg_qrcode_group.append(qr_svg_path)

# read out after manually adapting the included QR code

bigger_qr_code = "matrix(0.51793751,0,0,0.50344191,-9.6517194,10.691541)"  # more info
smaller_qr_code = "matrix(0.51730963,0,0,0.50283159,-9.6492078,10.693982)" # less info
label_svg_qrcode_group.attrib["transform"] = smaller_qr_code

# finished label
etree.dump(label_svg)
#label_text = etree.tostring(label_svg)
#print(label_text.decode("utf-8"))

#with tempfile.NamedTemporaryFile(suffix=".svg") as label_file:
#with open("/tmp/foo.svg", "w") as label_file:
#    label_file.write(label_text.decode("utf-8"))
#    label_file.close() # ensure fully written
#    print(label_file.name)
    
# Nice, but what is actually not yet working are the rounded module drawers.
# Apparently they are only implemented for PNG output and not SVG output.

