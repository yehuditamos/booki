(function(){
 const root=document.getElementById('choice'),reader=document.getElementById('demo-reader');let story=null,page=0,paused=null,withNiqqud=true;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls='cc-secondary')=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
 const chooser=BookiChoice.mount(root,{catalog:getAllStories,open:async id=>{story=getStoryById(id);if(!story)return false;page=0;withNiqqud=true;draw();return true;}});
 const back=()=>{root.hidden=false;reader.hidden=true;root.scrollIntoView();};
 function draw(){
  document.getElementById('cc-demo-resume')?.remove();root.hidden=true;reader.hidden=false;reader.replaceChildren();
  const pause=button('הפסקה — נמשיך אחר כך',()=>{paused={id:story.id,page};back();addResume();});
  reader.append(button('לבחירת סיפור אחר',back),el('h1',story.title));
  const sample=el('div',null,'cc-sample'),p=story.pages[page];if(p.illustration)sample.append(el('div',p.illustration,'cc-sample-art'));
  sample.append(el('p',withNiqqud?p.text:p.text.replace(/[\u0591-\u05BD\u05BF-\u05C2\u05C4-\u05C5\u05C7]/g,'')));
  reader.append(el('p','עמוד '+(page+1)+' מתוך '+story.pages.length,'cc-count'),sample);
  const nav=el('nav');const prev=button('→ העמוד הקודם',()=>{page--;draw();});prev.disabled=page===0;
  nav.append(prev,button(page===story.pages.length-1?'סיימנו ✨':'לעמוד הבא ←',()=>{if(page<story.pages.length-1){page++;draw();}else finish();},'cc-primary'));
  reader.append(nav,button(withNiqqud?'להסתיר ניקוד':'להציג ניקוד',()=>{withNiqqud=!withNiqqud;draw();}),pause);window.scrollTo(0,0);
 }
 function addResume(){
  document.getElementById('cc-demo-resume')?.remove();if(!paused)return;
  const b=button('ממשיכים בסיפור: '+getStoryById(paused.id).title,()=>{story=getStoryById(paused.id);page=paused.page;draw();});b.id='cc-demo-resume';root.before(b);
 }
 function finish(){
  paused=null;document.getElementById('cc-demo-resume')?.remove();reader.replaceChildren(el('h1','איזה כיף שקראנו!'),el('p','מה מתחשק בפעם הבאה?'));
  const current=BookiChoice.formats.findIndex(f=>f.id===BookiChoice.profile(story).format.id);
  for(const [label,delta] of [['פחות מילים',-1],['בערך ככה',0],['יותר מילים',1]])reader.append(button(label,()=>{chooser.prefer(BookiChoice.formats[Math.max(0,Math.min(3,current+delta))].id);back();}));
  reader.append(button('לבחירת סיפור',back,'cc-primary'));
 }
})();
