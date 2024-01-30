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

submodules: vendor/v86/.

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

vendor/%/.:
	git submodule update --init vendor/$*

gen/.v86-run: | vendor/v86/.
	docker build -f vendor/v86/tools/docker/exec/Dockerfile -t v86 vendor/v86
	docker rm v86 || true
	docker create --name v86 v86
	touch $@

dist-deps := gen/seabios.bin gen/libv86.js gen/v86.wasm

gen/libv86.js: gen/.v86-run | gen/.
	docker cp v86:/v86/build/libv86.js $@
	touch $@

gen/v86.wasm: gen/.v86-run | gen/.
	docker cp v86:/v86/build/v86.wasm $@
	touch $@

gen/seabios.bin: vendor/v86/. | gen/.
	cp vendor/v86/bios/seabios.bin $@

dist: $(dist-deps)
	$(jsbin)/vite build

serve: $(dist-deps)
	$(jsbin)/vite preview

%/.:
	mkdir -p $@
