static_files := *.html:*.js:*.ico:*.png:*.json:CNAME:.nojekyll

static := $(shell find static -name '$(subst :,' -or -name ',$(static_files))')

jsbin := node_modules/.bin

default:
	echo 'make [init|rebuild|build|deploy]'
	false

rebuild:
	git -C dist clean -fxd
	git -C dist rm -rf .
	$(MAKE) build

build: v86 static

static: $(patsubst static/%,dist/%,$(static))

init: submodules npm-deps dist/.git

submodules:
	git submodule update --init

npm-deps: package.json package-lock.json
	npm install

dist/.git:
	git worktree add dist dist

deploy:
	git diff --stat HEAD --exit-code
	git push origin main
	git -C dist add .
	git -C dist commit -m 'deploy' || true
	git push origin dist

vendor/v86: submodules

v86-run: vendor/v86
	docker build -f vendor/v86/tools/docker/exec/Dockerfile -t v86 vendor/v86
	docker rm v86 || true
	docker create --name v86 v86

v86: gen/seabios.bin gen/libv86.js gen/v86.wasm

gen/libv86.js: gen/. v86-run
	docker cp v86:/v86/build/libv86.js $@

gen/v86.wasm: gen/. v86-run
	docker cp v86:/v86/build/v86.wasm $@

gen/seabios.bin: vendor/v86 gen/.
	cp vendor/v86/bios/seabios.bin $@

dist: v86
	$(jsbin)/vite build

serve: v86
	$(jsbin)/vite preview

%/.:
	mkdir -p $@
