'use strict';
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {destroyContaminatedV3DataOnce}=require('../inventory-v3-destructive-cutover.cjs');
const RUNTIME_MOUNT_MARKER='UNIQUEPOS_RUNTIME_MOUNTS_INVENTORY_V3';

function findExpressAppDeclaration(source){
  for(const pattern of[/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)\s*;?/m,/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)\s*;?/m]){
    const match=pattern.exec(source);
    if(match)return{appVar:match[1],end:match.index+match[0].length};
  }
  return null;
}

function prepareRuntimeSource(filename){
  const source=fs.readFileSync(filename,'utf8');
  if(source.includes(RUNTIME_MOUNT_MARKER))return source;
  const declaration=findExpressAppDeclaration(source);
  if(!declaration)throw new Error('Runtime integration: Express application declaration not found.');
  const {appVar,end}=declaration;
  const code=`\n/* ${RUNTIME_MOUNT_MARKER} */\n(() => {\n  const { mountInventoryV3 } = require('./server/inventory-v3.cjs');\n  ${appVar}.use((req,res,next)=>{\n    if(req.body!==undefined||!['POST','PUT','PATCH'].includes(req.method))return next();\n    const type=String(req.headers['content-type']||'').toLowerCase();\n    if(!type.includes('application/json'))return next();\n    let raw='';\n    req.setEncoding('utf8');\n    req.on('data',chunk=>{\n      raw+=chunk;\n      if(raw.length>10485760){res.status(413).json({error:'Request too large'});req.destroy();}\n    });\n    req.on('end',()=>{\n      if(res.headersSent)return;\n      try{req.body=raw?JSON.parse(raw):{};next();}\n      catch(_err){res.status(400).json({error:'Invalid JSON request body'});}\n    });\n    req.on('error',next);\n  });\n  ${appVar}.get('/api/healthz',(_req,res)=>res.status(200).json({status:'ok',ok:true,service:'unique-pos',inventory:'v3'}));\n  mountInventoryV3(${appVar});\n})();\n`;
  return source.slice(0,end)+code+source.slice(end);
}

async function loadIndex(){
  const wiped=await destroyContaminatedV3DataOnce();
  if(wiped)console.log('[inventory-v3] destructive clean cutover completed');
  const sourceFilename=path.join(__dirname,'..','..','index.cjs');
  const runtimeFilename=path.join(__dirname,'..','..','index.runtime.cjs');
  try{if(fs.existsSync(runtimeFilename))fs.unlinkSync(runtimeFilename);}catch(_){}
  const source=prepareRuntimeSource(sourceFilename);
  const runtimeModule=new Module(sourceFilename,module);
  runtimeModule.filename=sourceFilename;
  runtimeModule.paths=Module._nodeModulePaths(path.dirname(sourceFilename));
  runtimeModule._compile(source,sourceFilename);
  return runtimeModule.exports;
}

module.exports={loadIndex,prepareRuntimeSource};
