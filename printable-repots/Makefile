TARGET=inventory

all: tex pdf

tex:
	./inventory2latex.py

pdf:
	pdflatex -interaction=nonstopmode "$(TARGET)"
#	pdflatex -interaction=nonstopmode "$(TARGET)"
#	pdflatex -interaction=nonstopmode "$(TARGET)"
