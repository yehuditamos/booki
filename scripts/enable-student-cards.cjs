'use strict';
// UI-only stylesheet activation. Do not modify identity or roster logic.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'..','index.html');
const tag='<link rel="stylesheet" href="student-cards.css?v=20260918-folder-style">';
const html=fs.readFileSync(file,'utf8');
if(!html.includes(tag)){
  if((html.match(/<\/head>/g)||[]).length!==1||html.includes('href="student-cards.css'))throw Error('Unexpected stylesheet hook; inspect before replacing.');
  fs.writeFileSync(file,html.replace('</head>',tag+'\n</head>'));
}
console.log('Student-card theme enabled; no data or JavaScript behaviour changes.');
