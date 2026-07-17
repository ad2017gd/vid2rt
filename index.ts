
import { Hook } from 'require-in-the-middle';
import {execSync} from 'child_process'
import fs from 'fs';
import 'temporal-polyfill/global'
import {Semaphore} from 'await-semaphore';

// stupid fucking fix
new Hook(['gm'], { internals: true }, function (exports, name, basedir) {
  if (name !== 'gm') return exports;
  return (exports as any).subClass({ imageMagick: '7+' });
})
const i2a = require('image-to-ascii')

let config : {file?:string, font:string, fontsize:number, size: number[], fps:number, offset: number, from?: string, to?: string} = { size: [50,15], fps: 4, fontsize: 12, font:"Arial", offset: 0};

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
        case "--from": {
            config.from = val;
            queue = queue.slice(1);
            break;
        }
        case "--to": {
            config.to = val;
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
    console.log(`--file "filename"         -  set target video file`)
    console.log(`--fontsize [number]       -  set font size`)

    // commented since they do not actually render on youtube for some reason

    //console.log(`--font "name"             -  set font by name`)
    console.log(`--fps [number]            -  set target subtitle fps`)
    //console.log(`--size [number]x[number]  -  set target subtitle dimensions\n`)
    console.log(`--offset [number]         -  set subtitle offset in milliseconds\n`)
    console.log(`--from [number/timestamp] -  set video start seconds/timestamp\n`)
    console.log(`--to [number/timestamp]   -  set video end seconds/timestamp\n`)
    process.exit(showHelp ? 0: 1)
}

if(!fs.existsSync("frames")) fs.mkdirSync("frames")

console.log("Deleting old files")
fs.readdirSync("frames").forEach((s,i)=>{
  fs.unlinkSync("frames/"+s)
})
console.log("Extracting frames.")

try {
execSync(`ffmpeg -i ${config.file} ${config.from ? `-ss ${config.from}` : ""} ${config.to ? `-to ${config.to}`: ""} -r ${config.fps} "frames/frame_%04d.jpg" 2> nul`)
} catch {
    console.error("Error trying to run ffmpeg. Is it installed?")
    process.exit(1);
}

let files = fs.readdirSync("frames");
process.stdout.write(`Converting frames. (0/${files.length})`);

let converted_frames = {};

let idx = 1;


let semaphore = new Semaphore(10);
let promises = []
for(let s in files) {

    let release = await semaphore.acquire();
    let finish = (a:any) => {};

    promises.push(new Promise((res, rej) => finish = res));
    
    //<time begin="00:00.0"/><clear/>
    i2a("frames/"+files[s], {colored: true, stringify:false, concat: false, size: {width: config.size[0], height: config.size[1]}, pixels: "█"}, (e, c) => {

                                                        // maybe i did pick the goofiest library to use but oh well
        let format = c.map(x=>x.map(y=>`<font color="#${y.pixel.r.toString(16).padStart(2, '0')}${y.pixel.g.toString(16).padStart(2, '0')}${y.pixel.b.toString(16).padStart(2, '0')}">${y.char}</font>`).join(""))
        let line = format.join("<br/>")
        //console.log(format)
        //console.log(config.offset*1000+(1000000/config.fps)*Number(s), config.fps, config.offset, Number(s))
        let oldtime = Temporal.Duration.from({microseconds: config.offset*1000+(1000000/config.fps)*Number(s)}).round({largestUnit:"minutes"})
        let time = oldtime.add({microseconds: (1000000/config.fps)}).round({largestUnit:"minutes"})

        let frame = `<time begin="${oldtime.minutes.toString().padStart(2,'0')}:${oldtime.seconds.toString().padStart(2,'0')}.${oldtime.milliseconds.toString().padStart(3,'0')}" end="${time.minutes.toString().padStart(2,'0')}:${time.seconds.toString().padStart(2,'0')}.${time.milliseconds.toString().padStart(3,'0')}"/><clear/>${line}`;
        converted_frames[s] = (frame);
        //console.log(s, time.seconds, time.milliseconds)

        //console.log(JSON.stringify(c))
        release();
        finish(1);
        process.stdout.write(`\rConverting frames. (${idx++}/${files.length})`);
    })

    
}
await Promise.all(promises);

// now we must construct array in order!

let ordered = [];
for(let i = 0; i < Object.values(converted_frames).length; i++) {
    ordered[i] = converted_frames[i];
}

fs.writeFileSync("output.rt", 
`<window>
<font size="${config.fontsize}" face="${config.font}">
${Object.values(ordered).join("\n")}
</font>
</window>`
)
console.log("\nDone.")