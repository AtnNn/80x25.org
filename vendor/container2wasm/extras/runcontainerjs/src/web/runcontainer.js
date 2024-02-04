export async function createContainer(vmImage, imageAddr, stackWorkerPath, mounterWasmURL) {
    let stackWorker = new Worker(stackWorkerPath);
    return {vmImage: vmImage, net: createStack(stackWorker, imageAddr, mounterWasmURL)};
}

function createStack(stackWorker, imageAddr, mounterWasmURL) {
    var proxyShared = new SharedArrayBuffer(12 + 1024 * 1024);

    var toShared = new SharedArrayBuffer(1024 * 1024);
    var fromShared = new SharedArrayBuffer(1024 * 1024);
    var toNetCtrl = new Int32Array(toShared, 0, 1);
    var toNetBegin = new Int32Array(toShared, 4, 1);
    var toNetEnd = new Int32Array(toShared, 8, 1);
    var toNetNotify = new Int32Array(toShared, 12, 1);
    var toNetData = new Uint8Array(toShared, 16);
    var fromNetCtrl = new Int32Array(fromShared, 0, 1);
    var fromNetBegin = new Int32Array(fromShared, 4, 1);
    var fromNetEnd = new Int32Array(fromShared, 8, 1);
    var fromNetData = new Uint8Array(fromShared, 12);
    toNetCtrl[0] = 0;
    toNetBegin[0] = 0;
    toNetEnd[0] = 0;
    toNetNotify[0] = 0;
    fromNetCtrl[0] = 0;
    fromNetBegin[0] = 0;
    fromNetEnd[0] = 0;

    var metaFromShared = new SharedArrayBuffer(4096);
    var metaFromNetCtrl = new Int32Array(metaFromShared, 0, 1);
    var metaFromNetBegin = new Int32Array(metaFromShared, 4, 1);
    var metaFromNetEnd = new Int32Array(metaFromShared, 8, 1);
    var metaFromNetStatus = new Int32Array(metaFromShared, 12, 1);
    var metaFromNetData = new Uint8Array(metaFromShared, 16);
    metaFromNetCtrl[0] = 0;
    metaFromNetBegin[0] = 0;
    metaFromNetEnd[0] = 0;
    metaFromNetStatus[0] = 0;

    stackWorker.onmessage = connect("proxy", proxyShared, toShared);
    stackWorker.postMessage({type: "init", buf: proxyShared, toBuf: toShared, fromBuf: fromShared, imageAddr: imageAddr, mounterWasmURL: mounterWasmURL, metaFromBuf: metaFromShared});
    return {
        toNet: toShared,
        fromNet: fromShared,
        metaFromNet: metaFromShared
    };
}

function connect(name, shared, toNet) {
    var streamCtrl = new Int32Array(shared, 0, 1);
    var streamStatus = new Int32Array(shared, 4, 1);
    var streamLen = new Int32Array(shared, 8, 1);
    var streamData = new Uint8Array(shared, 12);
    var httpConnections = [];
    var curID = 0;
    var maxID = 0x7FFFFFFF; // storable in streamStatus(signed 32bits)
    function getID() {
        var startID = curID;
        while (true) {
            if (httpConnections[curID] == undefined) {
                return curID;
            }
            if (curID >= maxID) {
                curID = 0;
            } else {
                curID++;
            }
            if (curID == startID) {
                return -1; // exhausted
            }
        }
        return curID;
    }
    function serveData(data, len) {
        if (streamData.byteLength < data.byteLength)
            console.log("small buffer(net)" + streamData.byteLength + " " + data.byteLength);
        var length = len;
        if (length > streamData.byteLength)
            length = streamData.byteLength;
        if (length > data.byteLength)
            length = data.byteLength
        var buf = data.subarray(0, length);
        var remain = data.subarray(length, data.byteLength);
        streamLen[0] = buf.byteLength;
        streamData.set(buf, 0);
        return remain;
    }
    function serveDataOffset(data, off, len) {
        if (streamData.byteLength < data.byteLength)
            console.log("small buffer(net)" + streamData.byteLength + " " + data.byteLength);
        var length = len;
        if (length > streamData.byteLength)
            length = streamData.byteLength;
        if (off + length > data.byteLength)
            length = data.byteLength - off
        var buf = data.subarray(off, off + length);
        streamLen[0] = buf.byteLength;
        streamData.set(buf, 0);
        return;
    }
    var timeoutHandler = null;
    var timeoutDeadlineMilli = null;
    let toNetCtrl = new Int32Array(toNet, 0, 1);
    let toNetBegin = new Int32Array(toNet, 4, 1);
    let toNetEnd = new Int32Array(toNet, 8, 1);
    let toNetNotify = new Int32Array(toNet, 12, 1);
    let toNetData = new Uint8Array(toNet, 16);
    function isBufReadable() {
        let begin = toNetBegin[0]; //inclusive
        let end = toNetEnd[0]; //exclusive
        var len;
        var round;
        if (end >= begin) {
            len = end - begin;
            round = 0;
        } else {
            len = toNetData.byteLength - begin;
            round = end;
        }
        if ((len + round) > 0) {
            // ready
            return true;
        } else {
            // not ready
            return false;
        }
    }
    return function(msg){
        const req_ = msg.data;
        if (typeof req_ == "object" && req_.type) {
            switch (req_.type) {
                case "recv-is-readable-cancel":
                    if (timeoutHandler) {
                        clearTimeout(timeoutHandler);
                        timeoutHandler = null;
                    } else {
                        Atomics.store(streamCtrl, 0, 1);
                        Atomics.notify(streamCtrl, 0);
                    }
                    break;
                case "recv-is-readable":
                    if (isBufReadable()) {
                        streamStatus[0] = 1; // ready for reading
                        Atomics.store(toNetNotify, 0, 1);
                        Atomics.notify(toNetNotify, 0);
                    } else {
                        if ((req_.timeout != undefined) && (req_.timeout > 0)) {
                            if (timeoutHandler) {
                                console.log("ONGOING POLL (stack)");
                                clearTimeout(timeoutHandler);
                                timeoutHandler = null;
                                timeoutDeadlineMilli = null;
                            }
                            timeoutDeadlineMilli = Date.now() + req_.timeout * 1000;
                            function pollBuf() {
                                timeoutHandler = setInterval(() => {
                                    if (isBufReadable()) {
                                        streamStatus[0] = 1; // ready for reading
                                        Atomics.store(toNetNotify, 0, 1);
                                    } else {
                                        if (Date.now() < timeoutDeadlineMilli) {
                                            return; // try again
                                        }
                                        streamStatus[0] = 0; // timeout
                                        Atomics.store(toNetNotify, 0, -1);
                                    }
                                    Atomics.notify(toNetNotify, 0);
                                    clearTimeout(timeoutHandler);
                                    timeoutHandler = null;
                                    // streamStatus[0] = 0;
                                    Atomics.store(streamCtrl, 0, 1);
                                    Atomics.notify(streamCtrl, 0);
                                }, 0.01);
                            }
                            pollBuf();
                            return;
                        }
                        streamStatus[0] = 0; // timeout
                        Atomics.store(toNetNotify, 0, -1);
                        Atomics.notify(toNetNotify, 0);
                    }
                    break;
                case "http_send":
                    var reqObj = JSON.parse(new TextDecoder().decode(req_.req));
                    reqObj.mode = "cors";
                    reqObj.credentials = "omit";
                    if (reqObj.headers && reqObj.headers["User-Agent"] != "") {
                        delete reqObj.headers["User-Agent"]; // Browser will add its own value.
                    }
                    var reqID = getID();
                    if (reqID < 0) {
                        console.log(name + ":" + "failed to get id");
                        streamStatus[0] = -1;
                        break;
                    }
                    var connObj = {
                        address: new TextDecoder().decode(req_.address),
                        request: reqObj,
                        requestSent: false,
                        reqBodybuf: new Uint8Array(0),
                        reqBodyEOF: false,

                        response: null,
                        done: null,
                        respBodybuf: null,
                    };
                    httpConnections[reqID] = connObj;
                    streamStatus[0] = reqID;
                    break;
                case "http_writebody":
                    httpConnections[req_.id].reqBodybuf = appendData(httpConnections[req_.id].reqBodybuf, req_.body)
                    httpConnections[req_.id].reqBodyEOF = req_.isEOF;
                    streamStatus[0] = 0;
                    if (req_.isEOF && !httpConnections[req_.id].requestSent) {
                        httpConnections[req_.id].requestSent = true;
                        var connObj = httpConnections[req_.id];
                        if ((connObj.request.method != "HEAD") && (connObj.request.method != "GET")) {
                            connObj.request.body = connObj.reqBodybuf;
                        }
                        fetch(connObj.address, connObj.request).then((resp) => {
                            var headers = {};
                            for (const key of resp.headers.keys()) {
                                headers[key] = resp.headers.get(key);
                            }
                            connObj.response = new TextEncoder().encode(JSON.stringify({
                                bodyUsed: resp.bodyUsed,
                                headers: headers,
                                redirected: resp.redirected,
                                status: resp.status,
                                statusText: resp.statusText,
                                type: resp.type,
                                url: resp.url
                            })),
                            connObj.done = false;
                            connObj.respBodybuf = new Uint8Array(0);
                            if (resp.ok) {
                                resp.arrayBuffer().then((data) => {
                                    connObj.respBodybuf = new Uint8Array(data);
                                    connObj.done = true;
                                }).catch((error) => {
                                    connObj.respBodybuf = new Uint8Array(0);
                                    connObj.done = true;
                                    console.log("failed to fetch body: " + error);
                                });
                            } else {
                                connObj.done = true;
                            }
                        }).catch((error) => {
                            connObj.response = new TextEncoder().encode(JSON.stringify({
                                status: 503,
                                statusText: "Service Unavailable",
                            }))
                            connObj.respBodybuf = new Uint8Array(0);
                            connObj.done = true;
                        });
                    }
                    break;
                case "http_isreadable":
                    if ((httpConnections[req_.id] != undefined) && (httpConnections[req_.id].response != null)) {
                        streamData[0] = 1; // ready for reading
                    } else {
                        streamData[0] = 0; // nothing to read
                    }
                    streamStatus[0] = 0;
                    break;
                case "http_recv":
                    if ((httpConnections[req_.id] == undefined) || (httpConnections[req_.id].response == null)) {
                        console.log(name + ":" + "response is not available");
                        streamStatus[0] = -1;
                        break;
                    }
                    httpConnections[req_.id].response = serveData(httpConnections[req_.id].response, req_.len);
                    streamStatus[0] = 0;
                    if (httpConnections[req_.id].response.byteLength == 0) {
                        streamStatus[0] = 1; // isEOF
                    }
                    break;
                case "http_readbody":
                    if ((httpConnections[req_.id] == undefined) || (httpConnections[req_.id].response == null)) {
                        console.log(name + ":" + "response body is not available");
                        streamStatus[0] = -1;
                        break;
                    }
                    httpConnections[req_.id].respBodybuf = serveData(httpConnections[req_.id].respBodybuf, req_.len);
                    streamStatus[0] = 0;
                    if ((httpConnections[req_.id].done) && (httpConnections[req_.id].respBodybuf.byteLength == 0)) {
                        streamStatus[0] = 1;
                        delete httpConnections[req_.id]; // connection done
                    }
                    break;
                case "layer_request":
                    var reqObj = {
                        method: "GET",
                    };
                    reqObj.mode = "cors";
                    reqObj.credentials = "omit";
                    if (reqObj.headers && reqObj.headers["User-Agent"] != "") {
                        delete reqObj.headers["User-Agent"]; // Browser will add its own value.
                    }
                    var reqID = getID();
                    if (reqID < 0) {
                        console.log(name + ":" + "failed to get id");
                        streamStatus[0] = -1;
                        break;
                    }
                    var digest = new TextDecoder().decode(req_.digest);
                    var connObj = {
                        address: new TextDecoder().decode(req_.address),
                        request: reqObj,
                        requestSent: false,
                        reqBodybuf: new Uint8Array(0),
                        reqBodyEOF: false,

                        response: null,
                        done: null,
                        respBodybuf: null,
                    };
                    httpConnections[reqID] = connObj;
                    httpConnections[reqID].reqBodyEOF = 1;
                    streamStatus[0] = 0;
                    httpConnections[reqID].requestSent = true;
                    connObj = httpConnections[reqID];
                    fetch(connObj.address, connObj.request).then((resp) => {
                        var headers = {};
                        for (const key of resp.headers.keys()) {
                            headers[key] = resp.headers.get(key);
                        }
                        connObj.response = new TextEncoder().encode(JSON.stringify({
                            bodyUsed: resp.bodyUsed,
                            headers: headers,
                            redirected: resp.redirected,
                            status: resp.status,
                            statusText: resp.statusText,
                            type: resp.type,
                            url: resp.url
                        })),
                        connObj.done = false;
                        connObj.respBodybuf = new Uint8Array(0);
                        if (resp.ok) {
                            resp.arrayBuffer().then((data) => {
                                crypto.subtle.digest("SHA-256", data).then((hash) => {
                                    const hashArray = Array.from(new Uint8Array(hash));
                                    const hashHex = hashArray
                                          .map((b) => b.toString(16).padStart(2, "0"))
                                          .join(""); // convert bytes to hex string
                                    if (hashHex != digest) {
                                        // TODO: return error
                                        connObj.respBodybuf = new Uint8Array(0);
                                        connObj.done = true;
                                        console.log("failed to fetch layer: " + error);
                                        return;
                                    }
                                    if (req_.isGzipN == 0) {
                                        connObj.respBodybuf = new Uint8Array(data);
                                        connObj.done = true;
                                    } else {
                                        const ds = new DecompressionStream("gzip")
                                        new Response(new Blob([data]).stream().pipeThrough(ds))['arrayBuffer']().then((data) => {
                                            connObj.respBodybuf = new Uint8Array(data);
                                            connObj.done = true;
                                        })
                                    }
                                });
                            })
                        } else {
                            connObj.done = true;
                        }
                    }).catch((error) => {
                        connObj.response = new TextEncoder().encode(JSON.stringify({
                            status: 503,
                            statusText: "Service Unavailable",
                        }))
                        connObj.respBodybuf = new Uint8Array(0);
                        connObj.done = true;
                    });
                    streamStatus[0] = reqID;
                    break;
                case "layer_isreadable":
                    if ((httpConnections[req_.id] != undefined) && (httpConnections[req_.id].response != null) && (httpConnections[req_.id].done)) {
                        streamData[0] = 1; // ready for reading
                        streamStatus[0] = httpConnections[req_.id].respBodybuf.byteLength;

                    } else {
                        streamData[0] = 0; // nothing to read
                        streamStatus[0] = 0;
                    }
                    break;
                case "layer_readat":
                    if ((httpConnections[req_.id] == undefined) || (httpConnections[req_.id].response == null) && (httpConnections[req_.id].done)) {
                        console.log(name + ":" + "response body is not available");
                        streamStatus[0] = -1;
                        break;
                    }
                    serveDataOffset(httpConnections[req_.id].respBodybuf, req_.offset, req_.len);
                    streamStatus[0] = 0;
                    break;
                default:
                    console.log(name + ":" + "unknown request: " +  req_.type)
                    return;
            }
            Atomics.store(streamCtrl, 0, 1);
            Atomics.notify(streamCtrl, 0);
        } else {
            console.log("UNKNOWN MSG " + msg);
        }
    }
}

function appendData(data1, data2) {
    let buf2 = new Uint8Array(data1.byteLength + data2.byteLength);
    buf2.set(new Uint8Array(data1), 0);
    buf2.set(new Uint8Array(data2), data1.byteLength);
    return buf2;
}
