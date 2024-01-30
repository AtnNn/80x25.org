import bios from '../gen/seabios.bin?url'
import v86wasm from '../gen/v86.wasm?url'
import '../gen/libv86.js?url'
import 'xterm/css/xterm.css'
import './style.css'
import { Terminal } from 'xterm'

let console;
function resizeTerm() {
    const scalex = window.innerWidth / console.offsetWidth
    const scaley = window.innerHeight / console.offsetHeight
    const scale = Math.min(scalex, scaley) * 0.98;
    console.style.transform = `scale(${scale})`
}

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

const term = new Terminal({
    cursorBlink: true,
});

window.term = term

console = document.getElementById('console')
console.innerHTML = ''
term.resize(80, 25)
term.open(console)
term.write('Loading...\r\n')

term.onRender(function(){
    resizeTerm()
    window.onresize = resizeTerm()
})

vm.add_listener("emulator-ready", function() {
    term.onData(function(data) {
        for(let i = 0; i < data.length; i++) {
            vm.bus.send("serial0-input", data.charCodeAt(i))
        }
    });
})

let last = 0;
let init = false;
vm.add_listener("serial0-output-byte", function(byte) {
    if (!init && last === 126 && byte === 37) {
        // ~% prompt
        init = true
        for(const c of "PS1='\\W# '\n") {
            vm.bus.send("serial0-input", c.charCodeAt(0))
        }
        vm.bus.send("serial0-input", 12) // ^L
    }
    last = byte;
    term.write(Uint8Array.of(byte));
});
