import EdgeTTS from 'node-edge-tts';
const tts = new EdgeTTS();
await tts.speak('你好，我是安安，这里是迎宾大厅。', 'zh-CN-XiaoxiaoNeural');
await tts.toFile('E:/xiaozhi-Requirement/voice-service/samples/an_an_node.mp3');
import fs from 'fs';
console.log('NODE_TTS_OK size=', fs.statSync('E:/xiaozhi-Requirement/voice-service/samples/an_an_node.mp3').size);
