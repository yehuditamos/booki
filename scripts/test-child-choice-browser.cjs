'use strict';
const puppeteer=require('puppeteer-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.BOOKI_CHROME,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[];
 try{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
   const context=await browser.createBrowserContext(),page=await context.newPage();
   await page.setViewport(viewport);await page.setCacheEnabled(false);
   const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
   await page.setRequestInterception(true);
   page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1'){external.push(r.url());void r.abort();}else void r.continue();});
   const response=await page.goto('http://127.0.0.1:8089/child-choice-test.html',{waitUntil:'networkidle0'});
   assert.equal(response.status(),200);
   assert.equal(await page.$$eval('#choice .cc-suggestions .cc-card',a=>a.length),3);
   const bounds=await page.evaluate(()=>({width:innerWidth,scrollX,scrollWidth:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('#choice .cc-suggestions .cc-card')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};})}));
   assert(bounds.scrollWidth<=viewport.width+1,'No horizontal overflow');
   bounds.cards.forEach(r=>assert(r.left>=-1&&r.right<=viewport.width+1,'Each card must fit horizontally, including RTL'));
   // Viewport captures mirror what a user sees; fullPage captures can offset RTL screenshots.
   await page.screenshot({path:`verification/child-choice-${viewport.width}.png`,fullPage:false,captureBeyondViewport:false});
   await page.click('#choice .cc-card');
   assert(await page.$eval('dialog',d=>d.open));
   const dialogBounds=await page.$eval('dialog',d=>{const r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
   assert(dialogBounds.left>=0&&dialogBounds.right<=viewport.width,'Preview must fit inside viewport');
   assert(dialogBounds.top>=0&&dialogBounds.bottom<=viewport.height,'Preview must scroll internally on a small screen');
   assert(await page.$eval('dialog .cc-sample p',p=>p.textContent.trim().length>0));
   await page.screenshot({path:`verification/child-preview-${viewport.width}.png`,fullPage:false,captureBeyondViewport:false});
   assert(await page.$eval('#demo-reader',n=>n.hidden),'Preview does not start reading');
   await page.keyboard.press('Escape');await page.waitForSelector('dialog',{hidden:true});
   await page.click('#choice .cc-card');await page.click('dialog .cc-primary');
   await page.waitForFunction(()=>!document.getElementById('demo-reader').hidden);
   await page.click('#demo-reader nav .cc-primary');
   await page.evaluate(()=>[...document.querySelectorAll('#demo-reader button')].find(b=>b.textContent.includes('הפסקה')).click());
   assert(await page.$('#cc-demo-resume'));await page.click('#cc-demo-resume');
   assert(await page.$eval('#demo-reader',n=>!n.hidden));
   assert.equal(await page.evaluate(()=>localStorage.length),0,'No persistent demo data');
   assert.deepEqual(errors,[]);assert.deepEqual(external,[],'No external/auth/database requests');
   results.push({viewport,status:'passed',bounds,dialogBounds,checks:['three choices','RTL card bounds','preview bounds','real preview','Escape','start','next page','pause','resume','no persistent data','no external requests','no JS exceptions']});
   await context.close();
  }
 }finally{fs.writeFileSync('verification/browser-report.json',JSON.stringify(results,null,2));await browser.close();}
 console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
