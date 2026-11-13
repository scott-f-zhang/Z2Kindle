# slides2kindle — run stages for one project:  make <target> P=path/to/project-or-config.yaml
P ?= examples/demo
PY ?= python3 -I

.PHONY: help deps demo extract check web epub all clean-demo

help:
	@echo "make deps                 install Node + Python dependencies"
	@echo "make extract P=<project>  stage 1: text + page images from sources/"
	@echo "make check   P=<project>  validate notes (add CHECK_ARGS='--book --baseline <dir>')"
	@echo "make web     P=<project>  stage 4: static web pages"
	@echo "make epub    P=<project>  stage 5: Kindle EPUB"
	@echo "make all     P=<project>  check + web + epub"
	@echo "make demo                 run the bundled demo end to end"

deps:
	npm install --no-audit --no-fund
	pip install -r requirements.txt

extract:
	$(PY) tools/extract.py $(P)

check:
	$(PY) tools/check.py $(P) $(CHECK_ARGS)

web:
	node build/build_web.js $(P)

epub:
	node build/build_epub.js $(P)

all: check web epub

demo:
	$(PY) examples/demo/make_demo_slides.py
	$(PY) tools/extract.py examples/demo
	$(PY) tools/figtool.py examples/demo crop L1_Demo_Logistic 2 90 150 660 540 sigmoid
	$(PY) tools/check.py examples/demo --book
	node build/build_web.js examples/demo
	node build/build_epub.js examples/demo

clean-demo:
	rm -rf examples/demo/work examples/demo/dist examples/demo/figs examples/demo/sources
