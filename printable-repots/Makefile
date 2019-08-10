TARGET=inventory

# Run a command silently, surpress output if no error occurs.
# If moreutils/chronic not installed, $SILENTLY_RUN will be empty.
SILENTLY_RUN := $(shell which chronic)

all: tex pdf

tex:
	./inventory2latex.py

pdf:
	$(SILENTLY_RUN) pdflatex -interaction=nonstopmode "$(TARGET)"
	$(SILENTLY_RUN) pdflatex -interaction=nonstopmode "$(TARGET)"

clean:
#	Clean LaTeX auxilliary files
	rm -f *.aux *.log
