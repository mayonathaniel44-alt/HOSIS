const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
process.chdir(path.resolve(__dirname, '..'));
process.env.HOSIS_STARTER_DATA='1';
const port=Number(process.env.HOSIS_PORT||5174);
const probe=net.createServer();
probe.once('error',()=>{
  http.get(`http://127.0.0.1:${port}/api/health`,r=>{
    console.log(r.statusCode===200?`Improved Sales & Marketing is already running at http://127.0.0.1:${port}`:`Port ${port} is occupied. Use another HOSIS_PORT.`);
  }).on('error',()=>{console.error(`Port ${port} is occupied.`);process.exitCode=1;});
});
probe.listen(port,'127.0.0.1',()=>probe.close(()=>{
  const app=require('../backend/src/app');
  app.listen(port,'127.0.0.1',()=>console.log(`Improved Sales & Marketing: http://127.0.0.1:${port}\nOriginal app: http://127.0.0.1:5173\nKeep this process running. Ctrl+C stops only this copy.`));
}));
