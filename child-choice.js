/* Booki reading-choice pilot. Describes texts, never diagnoses or ranks children.
   Catalog access stays with the caller; private stories are never persisted here. */
(function () {
  'use strict';
  const formats = [
    {id:'word',label:'מילה בכל עמוד',color:'#F5C518',symbol:'●'},
    {id:'sentence',label:'משפטים קצרים',color:'#20AD57',symbol:'◆'},
    {id:'several',label:'כמה משפטים',color:'#2678E5',symbol:'■'},
    {id:'paragraph',label:'פסקאות לקריאה',color:'#9954D8',symbol:'✦'}
  ];
  const plain = text => String(text || '').normalize('NFC').replace(/[\u0591-\u05BD\u05BF-\u05C2\u05C4-\u05C5\u05C7]/g,'');
  const words = text => plain(text).match(/[\p{L}\p{N}]+/gu) || [];
  function profile(story) {
    const pages=(story.pages||[]).filter(p=>typeof p.text==='string'&&p.text.trim());
    const counts=pages.map(p=>words(p.text).length);
    const max=Math.max(0,...counts),total=counts.reduce((a,b)=>a+b,0);
    const sentences=pages.map(p=>p.text.split(/[.!?׃]+/).filter(s=>words(s).length).length);
    // Conservative editorial starting points, NOT validated reading levels.
    const format=!pages.length?null:max===1?formats[0]:max<=12&&Math.max(...sentences)<=2?formats[1]:max<=45&&Math.max(...sentences)<=5?formats[2]:formats[3];
    const tokens=words(pages.map(p=>p.text).join(' '));
    return {format,pages,counts,total,max,previewIndex:counts.indexOf(max),
      uniqueWords:new Set(tokens).size,longWords:tokens.filter(w=>w.length>=7).length,
      vowelMarks:(pages.map(p=>p.text).join('').match(/[\u05B0-\u05BB\u05C7]/g)||[]).length};
  }
  const topics=[
    {id:'all',label:'הכול',emoji:'✦',match:()=>true},
    {id:'animals',label:'חיות וטבע',emoji:'🦊',match:s=>/animals|adventure/.test(s.libraryId)||/חי[והת]|טבע|יער/.test(plain((s.tags||[]).join(' ')))},
    {id:'friends',label:'חברים ומשפחה',emoji:'🏡',match:s=>/school|beginner|one-word/.test(s.libraryId)||/חבר|משפחה/.test(plain((s.tags||[]).join(' ')))},
    {id:'discover',label:'מגלים דברים',emoji:'🔭',match:s=>/science|history/.test(s.libraryId)},
    {id:'imagine',label:'דמיון והרפתקאות',emoji:'⛵',match:s=>/familiar|folk|booki|original|adventure|long|bookworms/.test(s.libraryId)}
  ];
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  const btn=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
  function mount(root,options) {
    let topic='all',format='all',query='',limit=9,expanded=!!options.browse,offset=0,dialog=null,preference=null;
    const catalog=()=>options.catalog().filter(s=>s.id!=null&&profile(s).format);
    const badge=s=>{const f=profile(s).format,b=el('span',f.symbol+' '+f.label,'cc-badge');b.style.setProperty('--cc-color',f.color);return b;};
    const card=(s,recommended=false)=>{
      const p=profile(s),b=btn('',()=>openDirect(s.id),'cc-card');b.style.setProperty('--cc-color',p.format.color);
      const art=el('div',null,'cc-cover');art.append(el('span',s.emoji||'📖','cc-cover-icon'));art.setAttribute('aria-hidden','true');
      const paper=el('span',p.format.symbol,'cc-cover-seal');art.append(paper);
      const copy=el('div',null,'cc-card-copy');
      if(recommended)copy.append(el('small','המורה המליצה לך ✨','cc-recommend'));
      copy.append(el('h3',s.title),badge(s));
      copy.append(el('p',p.pages[p.previewIndex].text,'cc-excerpt'),el('span','מציצים בסיפור ←','cc-card-action'));
      b.append(art,copy);return b;
    };
    function suggestions(all){
      const recommended=(options.recommendations?.()||[]).map(id=>all.find(s=>String(s.id)===String(id))).filter(Boolean);
      const selected=recommended.slice(0,1),ordered=[...all.slice(offset),...all.slice(0,offset)];
      const availableFormats=preference?[formats.find(f=>f.id===preference),...formats.filter(f=>f.id!==preference)]:[...formats.slice(offset%4),...formats.slice(0,offset%4)];
      for(const f of availableFormats){const s=ordered.find(s=>profile(s).format.id===f.id&&!selected.includes(s));if(s)selected.push(s);if(selected.length===3)break;}
      for(const s of ordered){if(selected.length===3)break;if(!selected.includes(s))selected.push(s);}
      return selected;
    }
    function render(){
      root.replaceChildren();root.classList.add('cc-root');root.dir='rtl';
      const all=catalog(),recommended=options.recommendations?.()||[];
      const heading=el('header',null,'cc-heading');heading.append(el('p','בּוֹקִי · הַסִּפּוּר הַבָּא שֶׁלְּךָ','cc-eyebrow'),el('h2','מָה מִתְחַשֵּׁק לִקְרֹא הַיּוֹם?'),el('p','בוחרים סיפור, מציצים — ומתחילים.'));
      root.append(heading);
      if(!all.length){root.append(el('p','אין כרגע סיפורים זמינים בספרייה הזו.'),btn('לטעון מחדש',()=>options.refresh?.(),'cc-secondary'));return;}
      const grid=el('div',null,'cc-grid cc-suggestions');suggestions(all).forEach(s=>grid.append(card(s,recommended.some(id=>String(id)===String(s.id)))));root.append(grid);
      const actions=el('div',null,'cc-actions');actions.append(btn('עוד רעיונות ↻',()=>{offset=(offset+3)%all.length;render();},'cc-secondary'),btn(expanded?'סגירת כל הסיפורים':'לכל הסיפורים ←',()=>{expanded=!expanded;render();if(expanded)root.querySelector('.cc-browse')?.scrollIntoView({block:'start',behavior:'smooth'});},'cc-primary'));root.append(actions);
      if(!expanded)return;
      const browse=el('section',null,'cc-browse');browse.append(el('h3','מה מעניין אותך?'));
      const topicRow=el('div',null,'cc-chips');topicRow.setAttribute('aria-label','בחירה לפי נושא');
      for(const t of topics.filter(t=>all.some(t.match))){const b=btn(t.emoji+' '+t.label,()=>{topic=t.id;limit=9;drawList();},'cc-chip');b.dataset.topic=t.id;topicRow.append(b);}
      const formatRow=el('div',null,'cc-chips');formatRow.setAttribute('aria-label','כמות הטקסט');
      for(const f of [{id:'all',label:'כל סוגי הטקסט'},...formats.filter(f=>all.some(s=>profile(s).format.id===f.id))]){const b=btn((f.symbol||'')+' '+f.label,()=>{format=f.id;limit=9;drawList();},'cc-chip');b.dataset.format=f.id;formatRow.append(b);}
      const search=el('input');search.type='search';search.placeholder='חיפוש סיפור';search.value=query;search.setAttribute('aria-label','חיפוש לפי שם סיפור');
      const count=el('p',null,'cc-count');count.setAttribute('role','status');
      const list=el('div',null,'cc-grid');const more=btn('עוד סיפורים',()=>{limit+=9;drawList();},'cc-secondary');
      function drawList(){
        const found=catalog().filter(s=>topics.find(t=>t.id===topic).match(s)&&(format==='all'||profile(s).format.id===format)&&plain(s.title).includes(plain(query.trim())));
        topicRow.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.topic===topic)));
        formatRow.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.format===format)));
        count.textContent=found.length?found.length+' סיפורים לבחירה':'לא מצאנו סיפור. אפשר לבחור נושא אחר או למחוק את החיפוש.';
        list.replaceChildren(...found.slice(0,limit).map(s=>card(s,recommended.some(id=>String(id)===String(s.id)))));more.hidden=found.length<=limit;
      }
      search.oninput=()=>{query=search.value;limit=9;drawList();};browse.append(topicRow,el('h3','איך מתחשק לקרוא?'),formatRow,search,count,list,more);root.append(browse);drawList();
    }
    async function openDirect(id){
      const context=options.context?.();
      if(!catalog().some(s=>String(s.id)===String(id)))return;
      try{
        // options.open opens the real reader and its existing niqqud chooser.
        // No intermediate story-preview dialog.
        await options.open(id,{isCurrent:()=>options.context?.()===context});
      }catch(_){}
    }
    function preview(id){
      const story=catalog().find(s=>String(s.id)===String(id));if(!story)return;
      const context=options.context?.();const p=profile(story),indices=[0,...(p.previewIndex>0?[p.previewIndex]:p.pages.length>1?[1]:[])];let sample=0;
      dialog?.close();dialog?.remove();const d=el('dialog',null,'cc-dialog');dialog=d;d.dir='rtl';
      const title=el('h2',story.title);title.id='cc-preview-title';d.setAttribute('aria-labelledby',title.id);
      const close=btn('בחירת סיפור אחר',()=>d.close(),'cc-secondary');const page=el('div',null,'cc-sample'),position=el('p',null,'cc-count');
      const draw=()=>{page.replaceChildren();const text=p.pages[indices[sample]];if(text.illustration)page.append(el('div',text.illustration,'cc-sample-art'));page.append(el('p',text.text));position.textContent='הצצה לעמוד '+(indices[sample]+1)+' מתוך '+p.pages.length;};
      const flip=btn('להצצה נוספת ↔',()=>{sample=(sample+1)%indices.length;draw();},'cc-secondary');flip.hidden=indices.length<2;
      const status=el('p');status.setAttribute('role','status');
      const start=btn('זה הסיפור שלי — מתחילים',async()=>{
        if(options.context?.()!==context||!catalog().some(s=>String(s.id)===String(id))){status.textContent='הספרייה השתנתה. נחזור לבחור סיפור.';start.disabled=true;return;}
        start.disabled=true;try{const ok=await options.open(id);if(ok!==false)d.close();else status.textContent='הסיפור לא נפתח. אפשר לנסות שוב.';}catch(e){status.textContent='לא הצלחנו לפתוח את הסיפור. אפשר לנסות שוב.';}finally{start.disabled=false;}
      },'cc-primary');
      d.append(close,title,badge(story),position,page,flip,start,status);document.body.append(d);d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;});draw();d.showModal();
    }
    render();return {render,preview,reset(){dialog?.close();preference=null;topic='all';format='all';query='';offset=0;expanded=!!options.browse;render();},prefer(value){preference=formats.some(f=>f.id===value)?value:null;render();},destroy(){dialog?.close();root.replaceChildren();}};
  }
  window.BookiChoice={formats,profile,mount};
})();
