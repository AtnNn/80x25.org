static := $(shell find static -name '*.html' -or -name '*.js' -or -name '*.ico' -or -name '*.png' -or -name '*.json')

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

init: npm-deps dist/.git

npm-deps: package.json package-lock.json
	npm install

dist/.git:
	git worktree add dist dist

deploy:
	[[ -z "$(shell git status --porcelain)" ]]
	git push origin main
	git -C dist add .
	git -C dist commit -m 'deploy' || true
	git push origin dist

v86:
	docker build -f vendor/v86/tools/docker/exec/Dockerfile -t v86 vendor/v86
	docker rm v86 || true
	docker create --name v86 v86
	rm -rf dist/v86
	mkdir dist/v86
	docker cp v86:/v86/build dist/v86/build
	docker cp v86:/v86/bios dist/v86/bios
	docker rm v86

dist/%.html: static/%.html
	$(jsbin)/html-minifier -c html-minifier.conf $< -o $@

dist/%.js: static/%.js
	$(jsbin)/uglifyjs $< > $@

dist/%: static/%
	cp $< $@
