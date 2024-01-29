import bios from '../gen/seabios.bin?url'
import v86wasm from '../gen/v86.wasm?url'
import '../gen/libv86.js?url'
import 'xterm/css/xterm.css'
import './style.css'
import { Terminal } from 'xterm'

const log = function(x){ /* console.log(x) */ }

const vm = new V86({
    wasm_path: v86wasm,
    memory_size: 1 * 1024 * 1024 * 1024,
    bios: { url: bios },
    bzimage: {
        url: "buildroot-bzimage.bin"
    },
    autostart: true,
})

window.vm = vm

let term = new Terminal({
    cursorBlink: true,
});

window.term = term

const console = document.getElementById('console')
console.innerHTML = ''
term.resize(80, 25)
term.open(console)
term.write('Loading...\r\n')

vm.add_listener("emulator-ready", function() {
    log('emulator-ready')
    term.onData(function(data) {
        log({termData: data})
        for(let i = 0; i < data.length; i++) {
            vm.bus.send("serial0-input", data.charCodeAt(i))
        }
    });
})

vm.add_listener("serial0-output-byte", function(byte) {
    log({serialOuput: byte})
    term.write(Uint8Array.of(byte));
});
