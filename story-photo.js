/* Local-only story photo selection and review. No image is uploaded. */
(function(){
 'use strict';
 const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 function stage(parent,title){
  const d=node('dialog');d.dir='rtl';d.className='private-library-dialog story-photo-dialog';d.setAttribute('aria-label',title);d.append(node('h2',title));document.body.append(d);d.showModal();
  return {d,wait:build=>new Promise(resolve=>{
   let settled=false;const finish=value=>{if(settled)return;settled=true;parent.removeEventListener('close',cancel);d.close();d.remove();resolve(value);};
   const cancel=()=>finish(null);parent.addEventListener('close',cancel,{once:true});d.addEventListener('cancel',e=>{e.preventDefault();cancel();});d.addEventListener('close',cancel,{once:true});build(finish);
  })};
 }
 async function crop(file,parent){
  const url=URL.createObjectURL(file),img=new Image();
  try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('לא ניתן לפתוח את התמונה. נסי JPG או PNG.'));img.src=url;});
   if(!parent.isConnected)return null;
   const {d,wait}=stage(parent,'בחרי רק את אזור הסיפור');
   d.append(node('p','גררי מסגרת סביב הכותרת והטקסט, בלי המקלדת והכפתורים שמסביב.'));
   const canvas=node('canvas');canvas.className='story-photo-canvas';const scale=Math.min(1,900/img.naturalWidth,1100/img.naturalHeight);canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);d.append(canvas);
   const ctx=canvas.getContext('2d');let box={x:0,y:0,w:canvas.width,h:canvas.height},start=null;
   const draw=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,box.x/scale,box.y/scale,box.w/scale,box.h/scale,box.x,box.y,box.w,box.h);ctx.strokeStyle='#137449';ctx.lineWidth=3;ctx.strokeRect(box.x,box.y,box.w,box.h);};
   const pos=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};};
   canvas.onpointerdown=e=>{start=pos(e);canvas.setPointerCapture(e.pointerId);};
   canvas.onpointermove=e=>{if(!start)return;const p=pos(e);box={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.max(1,Math.abs(p.x-start.x)),h:Math.max(1,Math.abs(p.y-start.y))};draw();};
   canvas.onpointerup=canvas.onpointercancel=()=>{start=null;};draw();
   const error=node('p');error.setAttribute('role','status');d.append(error);
   return await wait(finish=>{
    const add=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;d.append(b);};
    add('זיהוי הטקסט באזור שבחרתי',()=>{if(box.w<30||box.h<30){error.textContent='בחרי מסגרת גדולה יותר סביב הסיפור.';return;}
     const out=node('canvas'),factor=Math.min(2,2200/(box.w/scale),3200/(box.h/scale));out.width=Math.round(box.w/scale*factor);out.height=Math.round(box.h/scale*factor);const c=out.getContext('2d');c.fillStyle='white';c.fillRect(0,0,out.width,out.height);c.drawImage(img,box.x/scale,box.y/scale,box.w/scale,box.h/scale,0,0,out.width,out.height);finish(out.toDataURL('image/png'));
    });add('כל התמונה',()=>{box={x:0,y:0,w:canvas.width,h:canvas.height};draw();});add('ביטול',()=>finish(null));
   });
  }finally{URL.revokeObjectURL(url);}
 }
 async function review(value,parent,confidence){
  const {d,wait}=stage(parent,'בדיקת הטקסט שזוהה');
  const weak=confidence<75||/[A-Za-z]{2}/.test(value);
  d.append(node('p',weak?'הזיהוי אינו ברור מספיק. בדקי מול המקור ותקני לפני ההוספה. אפשר לבטל ולבחור צילום קרוב יותר.':'בדקי מול המקור, כולל הניקוד, ותקני לפני ההוספה.'));
  d.append(node('p','צילום מסך או טקסט מועתק מהמסמך בדרך כלל ברורים יותר מצילום של מסך מחשב.'));
  const text=node('textarea');text.rows=12;text.value=value;text.maxLength=20000;text.setAttribute('aria-label','בדיקת טקסט מהצילום');d.append(text);
  return wait(finish=>{for(const [label,fn] of [['אישור והוספה לסיפור',()=>finish(text.value)],['ביטול',()=>finish(null)]]){const b=node('button',label);b.type='button';b.onclick=fn;d.append(b);}});
 }
 window.BookiStoryPhoto={crop,review};
})();
