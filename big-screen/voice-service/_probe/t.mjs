import EdgeTTS from 'node-edge-tts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'samples', 'an_an_node.mp3');

const tts = new EdgeTTS();
await tts.speak('你好，我是安安，这里是迎宾大厅。', 'zh-CN-XiaoxiaoNeural');
await tts.toFile(out);
console.log('NODE_TTS_OK size=', fs.statSync(out).size);
