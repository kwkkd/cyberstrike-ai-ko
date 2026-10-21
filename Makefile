GO ?= go
BINARY ?= cyberstrike-ai
CONFIG ?= config.yaml

.PHONY: build test test-js vet race verify run clean

build:
	$(GO) build -o $(BINARY) ./cmd/server

test:
	$(GO) test -count=1 ./...

test-js:
	node --test web/static/js/*.test.cjs

vet:
	$(GO) vet ./...

race:
	$(GO) test -race -count=1 ./internal/multiagent ./internal/handler ./internal/security ./internal/processguard ./internal/runlease

verify: vet test test-js

run: build
	./$(BINARY) --config $(CONFIG)

clean:
	rm -f $(BINARY) $(BINARY).exe
