
import { Hook } from 'require-in-the-middle';
import {execSync} from 'child_process'
import fs from 'fs';
import 'temporal-polyfill/global'

// stupid fucking fix
new Hook(['gm'], { internals: true }, function (exports, name, basedir) {
  if (name !== 'gm') return exports;
  return (exports as any).subClass({ imageMagick: '7+' });
})
const i2a = require('image-to-ascii')

let config : {file?:string, font:string, fontsize:number, size: number[], fps:number, offset: number} = { size: [50,15], fps: 4, fontsize: 12, font:"Arial", offset: 0};

let queue = process.argv.slice(2);
let showHelp = false;
while(queue.length) {
    let cur = queue[0];
    let val = queue.length >= 2 ? queue[1] : undefined;

    switch(cur) {
        case "--file":{
            config.file = val;
            queue = queue.slice(1);
            break;
        }
        case "--font":{
            config.font = val || "Arial";
            queue = queue.slice(1);
            break;
        }
        case "--fontsize":{
            config.fontsize = Number(val || 12);
            queue = queue.slice(1);
            break;
        }
        case "--fps":{
            config.fps = Number(val || 4);
            queue = queue.slice(1);
            break;
        }
        case "--size":{
            config.size = (val || "50x15").split("x").map(x=>Number(x))
            queue = queue.slice(1);
            break;
        }
        case "--offset": {
            config.offset = Number(val || 4);
            queue = queue.slice(1);
            break;
        }
        case "-?":
        case "-h":
        case "/?":
        case "--help":
        {
            showHelp = true;
            break;
        }
    }
    queue = queue.slice(1)
}

if(!config.file || showHelp) {
    if(!showHelp) console.log("No file specified. Use --file \"filename\" to specify target video.\n");
    console.log(`Arguments:`);
    console.log(`--file "filename"        -  set target video file`)
    console.log(`--fontsize [number]      -  set font size`)

    // commented since they do not actually render on youtube for some reason

    //console.log(`--font "name"            -  set font by name`)
    console.log(`--fps [number]           -  set target subtitle fps`)
    //console.log(`--size [number]x[number] -  set target subtitle dimensions\n`)
    console.log(`--offset [number]        -  set subtitle offset in milliseconds\n`)
    process.exit(showHelp ? 0: 1)
}

if(!fs.existsSync("frames")) fs.mkdirSync("frames")

console.log("Deleting old files")
fs.readdirSync("frames").forEach((s,i)=>{
  fs.unlinkSync("frames/"+s)
})
console.log("Extracting frames.")
execSync(`ffmpeg -i ${config.file} -r ${config.fps} "frames/frame_%04d.jpg" 2> nul`)

console.log("Converting frames.")

let converted_frames = [];
let time = Temporal.Duration.from({milliseconds: config.offset}).round({largestUnit:"minutes"});
for(let s of fs.readdirSync("frames")) {
    let resolve = (val: any) => {};
    let promise = new Promise((res,rej) => {resolve=res});
    //<time begin="00:00.0"/><clear/>
    i2a("frames/"+s, {colored: true, stringify:false, concat: false, size: {width: config.size[0], height: config.size[1]}, pixels: "█"}, (e, c) => {

                                                        // maybe i did pick the goofiest library to use but oh well
        let format = c.map(x=>x.map(y=>`<font color="#${y.pixel.r.toString(16).padStart(2, '0')}${y.pixel.g.toString(16).padStart(2, '0')}${y.pixel.b.toString(16).padStart(2, '0')}">${y.char}</font>`).join(""))
        let line = format.join("<br/>")
        //console.log(format)

        let oldtime = time.add({milliseconds:0}).round({largestUnit:"minutes"});

        time = time.add(Temporal.Duration.from({milliseconds: 1000/(config.fps)}));
        time = time.round({largestUnit:"minutes"})

        let frame = `<time begin="${oldtime.minutes.toString().padStart(2,'0')}:${oldtime.seconds.toString().padStart(2,'0')}.${oldtime.milliseconds.toString().padStart(3,'0')}" end="${time.minutes.toString().padStart(2,'0')}:${time.seconds.toString().padStart(2,'0')}.${time.milliseconds.toString().padStart(3,'0')}"/><clear/>${line}`;
        converted_frames.push(frame);

        //console.log(JSON.stringify(c))
        resolve(1);
    })
    await promise;
}
console.log(converted_frames)
fs.writeFileSync("output.rt", 
`<window>
<font size="${config.fontsize}" face="${config.font}">
${converted_frames.join("\n")}
</font>
</window>`
)