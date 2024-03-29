# Distributing and running container images on browser without pre-conversion, using `imagemounter` (experimental)

Not only converting container image to Wasm image, container2wasm also allow distributing unmodified container images and running it on browser, etc. (still with CPU emulation, though).

`imagemounter` is a helper tool that enables to pull unmodified container images and mount it into the Linux VM running on Wasm.

The benefits of this approach are that it eliminates the need for image conversion and allows the distributing unmodified container images directly from the container registry to the browser (but the registry needs to enable CORS).

The following tools are used:

- Wasm-formatted Linux VM with emulated CPU: Generated by `c2w --external-bundle out.wasm`. This contains runc but doesn't embed container image. External container image's rootfs needs to be mounted to the VM via 9p.
- `imagemounter.wasm`: This provides functionallity of pulling container images from remote location into the browser/node, and show the rootfs to the above Wasm image via 9p.

## Supported image sources

As of now, the following image server is supported:

- HTTP server that serves OCI container imgaes in [OCI Image Layout](https://github.com/opencontainers/image-spec/blob/v1.0.2/image-layout.md): example is https://ktock.github.io/ubuntu-oci-images/ubuntu-22.04-org-amd64
  - Limitations
    - To pull container images into the browser, the server needs to allow CORS access.
- Container registry configured with CORS support
  - Limitations
    - Authentication unsupported (expected to be fixed in the future)
    - To pull container images into the browser, the headers need to be included in the response to support CORS access, for example:
      - `Access-Control-Allow-Origin: *`
      - `Access-Control-Allow-Headers: *`
      - `Access-Control-Expose-Headers: Content-Range`
    - Pulling gzip container image is very slow as decompression happens in the Wasm VM. Future version will fix it by performing decompression outside of the Wasm VM.

## Examples

First, build basic dependencies:

```console
$ mkdir /tmp/outx/
$ c2w --external-bundle /tmp/outx/out.wasm
$ make imagemounter.wasm
```

> container2wasm >= 0.6.0 is needed.

### Example on browser + HTTP Server

The following pulls `ubuntu:22.04` stored at https://ktock.github.io/ubuntu-oci-images/ubuntu-22.04-org-amd64 as [OCI Image Layout](https://github.com/opencontainers/image-spec/blob/v1.0.2/image-layout.md) and runs it on Wasm.

```console
$ cd ./extras/imagemounter
$ mkdir -p /tmp/out-js3/
$ cp -R ./../../examples/no-conversion/* /tmp/out-js3/
$ ( cd ../runcontainerjs && npx webpack && cp -R ./dist /tmp/out-js3/htdocs/ )
$ cat ../../out/imagemounter.wasm | gzip >  /tmp/out-js3/htdocs/imagemounter.wasm.gzip
$ cat /tmp/outx/out.wasm | gzip >  /tmp/out-js3/htdocs/out.wasm.gzip
$ docker run --rm -p 127.0.0.1:8083:80 \
         -v "/tmp/out-js3/htdocs:/usr/local/apache2/htdocs/:ro" \
         -v "/tmp/out-js3/xterm-pty.conf:/usr/local/apache2/conf/extra/xterm-pty.conf:ro" \
         --entrypoint=/bin/sh httpd -c 'echo "Include conf/extra/xterm-pty.conf" >> /usr/local/apache2/conf/httpd.conf && httpd-foreground'
```

Then access to: `localhost:8083?image=https://ktock.github.io/ubuntu-oci-images/ubuntu-22.04-org-amd64`

### Example on browser + Registry

> Note: As described in the above, registry authentication is unsupported as of now so you can't use public registry services. You can try this features using local registry like the following. This limitations is expected to be fixed in the future.

First, launch a registry with enabling CORS.

```console
$ mkdir /tmp/regconfig
$ cat <<EOF > /tmp/regconfig/config.yml
version: 0.1
http:
  addr: :5000
  headers:
    Access-Control-Allow-Origin: ["*"]
    Access-Control-Allow-Headers: ["*"]
    Access-Control-Expose-Headers: [Content-Range]
    X-Content-Type-Options: [nosniff]
storage:
  filesystem:
    rootdirectory: /var/lib/registry
EOF
$ docker run --rm -d -p 127.0.0.1:5000:5000 -v /tmp/regconfig/config.yml:/etc/docker/registry/config.yml --name registry registry:2
$ docker pull ubuntu:22.04
$ docker tag ubuntu:22.04 localhost:5000/ubuntu:22.04
$ docker push localhost:5000/ubuntu:22.04
```

The above registry serves `localhost:5000/ubuntu:22.04` container image.

The following serves a page to run that image.
When you access to `localhost:8083?image=localhost:5000/ubuntu:22.04`, that page fetches `localhost:5000/ubuntu:22.04` container image from the local registry and launches it on browser.

```console
$ cd ./extras/imagemounter
$ mkdir -p /tmp/out-js3/
$ cp -R ./../../examples/no-conversion/* /tmp/out-js3/
$ ( cd ../runcontainerjs && npx webpack && cp -R ./dist /tmp/out-js3/htdocs/ )
$ cat ../../out/imagemounter.wasm | gzip >  /tmp/out-js3/htdocs/imagemounter.wasm.gzip
$ cat /tmp/outx/out.wasm | gzip >  /tmp/out-js3/htdocs/out.wasm.gzip
$ docker run --rm -p 127.0.0.1:8083:80 \
         -v "/tmp/out-js3/htdocs:/usr/local/apache2/htdocs/:ro" \
         -v "/tmp/out-js3/xterm-pty.conf:/usr/local/apache2/conf/extra/xterm-pty.conf:ro" \
         --entrypoint=/bin/sh httpd -c 'echo "Include conf/extra/xterm-pty.conf" >> /usr/local/apache2/conf/httpd.conf && httpd-foreground'
```

### Example on CLI + HTTP Server

Demo CLI is used for pulling and running the container image.

```console
$ ( cd ./tests/imagemounter-test/ ; go build -o ../../out/imagemounter-test . )
```

The following pulls ubuntu:22.04 stored at https://ktock.github.io/ubuntu-oci-images/ubuntu-22.04-org-amd64 as [OCI Image Layout](https://github.com/opencontainers/image-spec/blob/v1.0.2/image-layout.md) and runs it on Wasm.

```console
$ ./out/imagemounter-test \
  --image https://ktock.github.io/ubuntu-oci-images/ubuntu-22.04-org-amd64 \
  --stack ./out/imagemounter.wasm \
  /tmp/outx/out.wasm --net=socket=listenfd=4 --external-bundle=9p=192.168.127.252
```

### Example on CLI + Registry

> Note: As described in the above, registry authentication is unsupported as of now so you can't use public registry services. You can try this features using local registry like the following. This limitations is expected to be fixed in the future.

Demo CLI is used for pulling and running the container image.

```console
$ ( cd ./tests/imagemounter-test/ ; go build -o ../../out/imagemounter-test . )
```

First, launch a registry

```console
$ docker run --rm -d -p 127.0.0.1:5000:5000 --name registry registry:2
$ docker pull ubuntu:22.04
$ docker tag ubuntu:22.04 localhost:5000/ubuntu:22.04
$ docker push localhost:5000/ubuntu:22.04
```

The following pulls `localhost:5000/ubuntu:22.04` container image and runs it on Wasm.

```console
$ ./out/imagemounter-test \
  --image localhost:5000/ubuntu:22.04 \
  --stack ./out/imagemounter.wasm \
  /tmp/out.wasm --net=socket=listenfd=4 --external-bundle=9p=192.168.127.252
```

## How to get container image formatted as OCI Image Layout

Docker buildx suppors [exporting image in OCI Image Layout](https://docs.docker.com/engine/reference/commandline/buildx_build/#oci).

The following puts `ubuntu:22.04` container image to `/tmp/imageout/` as OCI Image Layout.

```console
$ IMAGE=ubuntu:22.04
$ mkdir /tmp/imageout/
$ docker buildx create --name container --driver=docker-container
$ echo "FROM $IMAGE" | docker buildx build --builder=container --output type=oci,dest=- - | tar -C /tmp/imageout/ -xf -
```
