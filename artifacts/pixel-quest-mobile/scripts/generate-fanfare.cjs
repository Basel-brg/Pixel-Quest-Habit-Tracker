const fs = require('node:fs');
const path = require('node:path');
const rate = 22050, seconds = 1.3, count = Math.floor(rate * seconds);
const data = Buffer.alloc(44 + count * 2);
data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(count * 2, 40);
const notes = [523.25,659.25,783.99,1046.5,783.99,1046.5];
for(let i=0;i<count;i++){
  const t=i/rate, note=Math.min(5,Math.floor(t/.17)), local=t-note*.17;
  const env=Math.max(0,1-local/(note===5?.45:.16));
  const square=Math.sin(2*Math.PI*notes[note]*t)>0?1:-1;
  data.writeInt16LE(Math.round(square*env*4200),44+i*2);
}
const out = path.join(__dirname,'../assets/audio/treasure.wav');
fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,data);
