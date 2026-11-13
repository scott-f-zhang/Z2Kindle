# Z2kindle — run stages for one project:  make <target> P=path/to/project [E=edition]
P ?= examples/demo
PY ?= python3 -I
ED := $(if $(E),--edition $(E),)

.PHONY: help deps demo extract check web epub build all clean-demo covers

help:
	@echo "make deps                 install Node + Python dependencies"
	@echo "make extract P=<project>  stage 1: text + page images from sources/"
	@echo "make check   P=<project> [E=book]  validate notes (CHECK_ARGS='--book --baseline main')"
	@echo "make build   P=<project> [E=book]  EPUB(s) -> <project>/output/ (+ web if web: true)"
	@echo "make web     P=<project> [E=book]  optional web preview -> <project>/work/web/<edition>/"
	@echo "make epub    P=<project> [E=book]  one edition's EPUB only"
	@echo "make covers  P=<project> [E=book]  every cover style -> work/covers/<edition>/contact.png"
	@echo "make all     P=<project>           check + build"
	@echo "make demo                 run the bundled demo end to end"

deps:
	npm install --no-audit --no-fund
	pip install -r requirements.txt

extract:
	$(PY) tools/extract.py $(P)

check:
	$(PY) tools/check.py $(P) $(ED) $(CHECK_ARGS)

build:
	node build/build.js $(P) $(ED) $(BUILD_ARGS)

web:
	node build/build_web.js $(P) $(ED)

epub:
	node build/build_epub.js $(P) $(ED)

covers:
	node build/cover.js $(P) $(ED) --gallery $(COVER_ARGS)

all: check build

demo:
	$(PY) examples/demo/make_demo_slides.py
	$(PY) tools/extract.py examples/demo
	$(PY) tools/figtool.py examples/demo crop L1_Demo_Logistic 2 90 150 660 540 sigmoid
	$(PY) tools/check.py examples/demo --book
	$(PY) tools/check.py examples/demo --edition zh --book
	node build/build.js examples/demo

clean-demo:
	rm -rf examples/demo/work examples/demo/output examples/demo/dist examples/demo/figs examples/demo/sources
