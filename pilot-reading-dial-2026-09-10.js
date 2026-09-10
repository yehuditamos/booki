/** Booki selector v8: verified 810x455 approved artwork, accessible live controls. */
(function () {
  'use strict';
  if (window.BookiReadingDial) return;
  const MODES = [
    { id: 'app', label: 'קריאה בבוקי', action: 'enterAppStoryReading' },
    { id: 'letters', label: 'קוראים אותיות', action: 'showLettersReading' },
    { id: 'timer', label: 'ספר עם שעון', action: 'startBookiReading' },
    { id: 'report', label: 'דיווח קריאה', action: 'startBookReading' }
  ];
  // This set decodes successfully; generated-button-v1 was a corrupt WebP.
  const ART_PARTS = [0,1,2,3,4].map(i => `assets/approved-control/booki-control.part${String(i).padStart(2,'0')}.b64?v=1`);
  const W = 810, H = 455;
  const ROWS = [[640,86,114,85],[646,172,102,58],[646,233,102,78],[646,312,102,78]];
  const ICONS = [null,[660,177,76,45],[664,236,70,69],[668,315,63,69]];
  const $ = id => document.getElementById(id);
  let selected = 0, activePointer = null, wasHome = false, loading = null, images = [], wheelTime = 0;
  const mode = () => MODES[selected];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function render(announce = false) {
    const shell = $('booki-reading-dial');
    if (!shell) return;
    shell.dataset.selected = mode().id;
    const start = $('booki-reading-dial-start'), reel = $('booki-reading-reel-hit');
    start.setAttribute('aria-label', `התחל קריאה — ${mode().label}`);
    reel.setAttribute('aria-valuenow', String(selected));
    reel.setAttribute('aria-valuetext', mode().label);
    const art = $('booki-reading-generator-art');
    if (images[selected] && art.getAttribute('src') !== images[selected]) art.src = images[selected];
    const pill = $('booki-reading-mode-overlay'), marker = $('booki-reading-row-marker');
    pill.hidden = marker.hidden = selected === 0 || !images.length;
    pill.textContent = mode().label;
    const [x,y,w,h] = ROWS[selected];
    Object.assign(marker.style, {left:`${x/W*100}%`,top:`${y/H*100}%`,width:`${w/W*100}%`,height:`${h/H*100}%`});
    const fallback = $('booki-art-fallback-mode');
    if (fallback) fallback.value = String(selected);
    if (announce) $('booki-reading-dial-live').textContent = `נבחרה ${mode().label}`;
  }
  function select(index, announce = true) {
    const n = Number(index);
    if (!Number.isFinite(n)) return;
    const next = clamp(Math.trunc(n),0,MODES.length-1);
    if (next === selected) return;
    selected = next;
    render(announce);
  }
  function selectFromPointer(event) {
    const box = $('booki-reading-reel-hit').getBoundingClientRect();
    if (!box.height) return;
    // Map to the visible rows in the source artwork, not to the whole screenshot.
    const y = 24 + (event.clientY-box.top)/box.height*425;
    select(y < 163 ? 0 : y < 235 ? 1 : y < 311 ? 2 : 3);
  }
  function runSelected() {
    const start = $('booki-reading-dial-start');
    if (!start || start.disabled || activePointer !== null) return;
    const status = $('booki-reading-dial-status'), item = mode();
    const action = window[item.action];
    if (typeof action !== 'function') {
      status.textContent = 'אפשרות הקריאה עדיין נטענת. נסו שוב בעוד רגע.';
      return;
    }
    status.textContent = '';
    start.disabled = true;
    const fallbackStart = $('booki-art-fallback-start');
    if (fallbackStart) fallbackStart.disabled = true;
    try { if (typeof window.track === 'function') window.track('reading_mode_started',{mode:item.id}); } catch (_) {}
    const release = () => {
      setTimeout(() => { start.disabled = false; if(fallbackStart) fallbackStart.disabled = false; },250);
    };
    try {
      Promise.resolve(action()).catch(error => {
        console.error('[booki-selector] Reading action failed',error);
        status.textContent = 'משהו נתקע. נסו שוב.';
      }).finally(release);
    } catch(error) {
      console.error('[booki-selector] Reading action failed',error);
      status.textContent = 'משהו נתקע. נסו שוב.';
      release();
    }
  }

  function canvas(w,h) {
    const c = document.createElement('canvas'); c.width=w; c.height=h; return c;
  }
  function decode(src) {
    return new Promise((resolve,reject) => {
      const img = new Image();
      const timer = setTimeout(() => reject(new Error('Artwork decode timeout')),8000);
      img.onload = () => {clearTimeout(timer);resolve(img);};
      img.onerror = () => {clearTimeout(timer);reject(new Error('Artwork cannot be decoded'));};
      img.src = src;
    });
  }
  // Keep the exact approved pixels in default mode. For other modes, reuse the
  // same material and the icons cut from the same scale, rather than covering them.
  function buildStateImages(source, originalURL) {
    const base = canvas(W,H), ctx = base.getContext('2d');
    ctx.drawImage(source,0,0);
    const pixels = ctx.getImageData(0,0,W,H), d = pixels.data;
    // Cut out the exterior cream matte, not the artwork. Flooding from the image
    // edges preserves the cream scale and white lettering enclosed by its green rim.
    const exterior=new Uint8Array(W*H), edges=[];
    const edge=n=>{
      if(n<0||n>=W*H||exterior[n])return;
      exterior[n]=1;const q=n*4;
      if(!(d[q+1]-d[q]>5 && d[q+1]-d[q+2]>5)){d[q+3]=0;edges.push(n);}
    };
    for(let x=0;x<W;x++){edge(x);edge((H-1)*W+x);}
    for(let y=0;y<H;y++){edge(y*W);edge(y*W+W-1);}
    for(let q=0;q<edges.length;q++){
      const n=edges[q];if(n%W>0)edge(n-1);if(n%W<W-1)edge(n+1);edge(n-W);edge(n+W);
    }
    ctx.putImageData(pixels,0,0);
    const exactCutout=base.toDataURL('image/png');
    // Neutralize ONLY the mint backing of the first row; book icon pixels survive.
    for(let y=84;y<172;y++) for(let x=640;x<754;x++) {
      const p=(y*W+x)*4,r=d[p],g=d[p+1],b=d[p+2];
      const t=clamp((g-r-5)/20,0,1)*clamp((b-95)/35,0,1)*clamp((g-175)/35,0,1);
      [249,240,210].forEach((c,k) => {d[p+k]=d[p+k]*(1-t)+c*t;});
    }
    // Clear only the changeable icon/text interiors using the neighboring raster
    // material. The button outline, title, pill edge and scale remain original.
    function clearInterior(x1,y1,x2,y2,left,right) {
      for(let y=y1;y<y2;y++) for(let x=x1;x<x2;x++) {
        const t=(x-x1)/(x2-x1),p=(y*W+x)*4;
        for(let k=0;k<3;k++) d[p+k]=d[(y*W+left)*4+k]*(1-t)+d[(y*W+right)*4+k]*t;
      }
    }
    clearInterior(302,102,434,218,297,438);
    clearInterior(232,342,512,396,220,522);
    ctx.putImageData(pixels,0,0);
    const output=[exactCutout];
    for(let i=1;i<MODES.length;i++) {
      const [x,y,w,h]=ICONS[i], cut=canvas(w,h), cutCtx=cut.getContext('2d');
      cutCtx.drawImage(source,x,y,w,h,0,0,w,h);
      const iconPixels=cutCtx.getImageData(0,0,w,h), p=iconPixels.data;
      // Remove edge-connected cream only. A color-only key would also erase the
      // white clock face / clipboard paper. Their enclosed interiors stay opaque.
      const seen=new Uint8Array(w*h), queue=[];
      const add=n=>{
        if(n<0||n>=w*h||seen[n])return;
        seen[n]=1;const q=n*4;
        const distance=Math.max(Math.abs(p[q]-249),Math.abs(p[q+1]-240),Math.abs(p[q+2]-210));
        if(distance<65){p[q+3]=0;queue.push(n);}
      };
      for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
      for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
      for(let q=0;q<queue.length;q++){
        const n=queue[q];if(n%w>0)add(n-1);if(n%w<w-1)add(n+1);add(n-w);add(n+w);
      }
      cutCtx.putImageData(iconPixels,0,0);
      const state=canvas(W,H), s=state.getContext('2d');s.drawImage(base,0,0);
      const scale=Math.min(112/w,110/h), dw=w*scale, dh=h*scale;
      s.drawImage(cut,367-dw/2,159-dh/2,dw,dh);
      output.push(state.toDataURL('image/png'));
    }
    return output;
  }
  async function loadApprovedArtwork(retry = false) {
    if (loading) return loading;
    const shell = $('booki-reading-dial'), status = $('booki-reading-dial-status');
    shell.classList.remove('art-failed');shell.setAttribute('aria-busy','true');
    status.textContent='טוענים את כפתור הקריאה…';
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),10000);
    loading=(async()=>{
      try {
        const parts=await Promise.all(ART_PARTS.map(async path=>{
          const response=await fetch(path,{cache:retry?'reload':'default',signal:controller.signal});
          if(!response.ok) throw new Error(`Artwork HTTP ${response.status}`);
          return (await response.text()).trim();
        }));
        const b64=parts.join('').replace(/\s+/g,'');
        const url=`data:image/webp;base64,${b64}`, original=await decode(url);
        if(original.naturalWidth!==W || original.naturalHeight!==H) throw new Error('Unexpected artwork dimensions');
        images=buildStateImages(original,url);
        // Decode every selectable visual state before enabling the image control.
        await Promise.all(images.slice(1).map(decode));
        render(false);
        await decode($('booki-reading-generator-art').src);
        shell.classList.add('art-ready');status.textContent='';
      } catch(error) {
        console.error('[booki-selector] Approved artwork failed',error);
        images=[];shell.classList.remove('art-ready');shell.classList.add('art-failed');
        status.textContent='התמונה לא נטענה. אפשר לנסות שוב או להתחיל קריאה כאן.';
        render(false);
      } finally {
        clearTimeout(timeout);shell.setAttribute('aria-busy','false');loading=null;
      }
    })();
    return loading;
  }

  function cleanLegacyHome() {
    ['#screen-main .home-speech-bubble','#screen-main .home-start-hint','#screen-main .console-frame',
     '#reading-chooser-overlay','#screen-main .booki-unread-cue','#booki-personal-message',
     '#home-class-goal','#home-shelf-card'].forEach(selector=>{
      const el=document.querySelector(selector);if(!el)return;
      el.style.setProperty('display','none','important');el.setAttribute('aria-hidden','true');
      if(el.matches('button'))el.tabIndex=-1;
    });
    const stage=$('home-console-stage');
    if(stage){stage.tabIndex=-1;stage.removeAttribute('role');stage.removeAttribute('aria-label');stage.setAttribute('inert','');}
    document.body.classList.remove('booki-personal-message-open');
  }
  function build() {
    const oldStart=$('home-start-reading'), wrap=oldStart?.parentElement;
    if(!wrap||$('booki-reading-dial'))return;
    const shell=document.createElement('section');shell.id='booki-reading-dial';shell.className='booki-reading-dial';
    shell.setAttribute('aria-label','בחירת אופן הקריאה והתחלת קריאה');
    shell.innerHTML=`<div class="booki-reading-generator-shell">
      <img id="booki-reading-generator-art" class="booki-reading-generator-art" alt="" width="810" height="455" draggable="false">
      <span id="booki-reading-row-marker" class="booki-reading-row-marker" aria-hidden="true" hidden></span>
      <span id="booki-reading-mode-overlay" class="booki-reading-mode-overlay" aria-hidden="true" hidden></span>
      <button id="booki-reading-dial-start" class="booki-reading-generator-hit-main" type="button" aria-label="התחל קריאה — קריאה בבוקי"></button>
      <div id="booki-reading-reel-hit" class="booki-reading-generator-hit-reel" role="slider" tabindex="0" aria-label="אופן הקריאה" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0" aria-valuetext="קריאה בבוקי"></div>
    </div>
    <div class="booki-art-fallback">
      <button id="booki-art-retry" type="button">טעינת התמונה מחדש</button>
      <label>אופן הקריאה <select id="booki-art-fallback-mode">${MODES.map((m,i)=>`<option value="${i}">${m.label}</option>`).join('')}</select></label>
      <button id="booki-art-fallback-start" type="button">התחל קריאה</button>
    </div>
    <span id="booki-reading-dial-live" class="booki-reading-dial-sr" aria-live="polite"></span>
    <p id="booki-reading-dial-status" class="booki-reading-dial-status" role="status"></p>`;
    wrap.insertBefore(shell,oldStart);
    oldStart.style.setProperty('display','none','important');oldStart.setAttribute('aria-hidden','true');oldStart.tabIndex=-1;
    const start=$('booki-reading-dial-start'),reel=$('booki-reading-reel-hit');
    start.addEventListener('click',runSelected);
    $('booki-art-retry').addEventListener('click',()=>loadApprovedArtwork(true));
    $('booki-art-fallback-mode').addEventListener('change',e=>select(e.target.value));
    $('booki-art-fallback-start').addEventListener('click',runSelected);
    reel.addEventListener('pointerdown',event=>{
      if(activePointer!==null||event.isPrimary===false||(event.pointerType==='mouse'&&event.button!==0))return;
      activePointer=event.pointerId;
      try{reel.setPointerCapture(event.pointerId);}catch(_){}
      selectFromPointer(event);event.preventDefault();
    });
    reel.addEventListener('pointermove',event=>{
      if(event.pointerId!==activePointer)return;
      selectFromPointer(event);event.preventDefault();
    });
    const end=event=>{
      if(event.pointerId!==activePointer)return;
      if(event.type==='pointerup')selectFromPointer(event);
      activePointer=null;
      try{reel.releasePointerCapture(event.pointerId);}catch(_){}
    };
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>reel.addEventListener(name,end));
    reel.addEventListener('keydown',event=>{
      const keys={ArrowDown:selected+1,ArrowRight:selected+1,ArrowUp:selected-1,ArrowLeft:selected-1,Home:0,End:3};
      if(Object.prototype.hasOwnProperty.call(keys,event.key)){event.preventDefault();select(keys[event.key]);}
    });
    reel.addEventListener('wheel',event=>{
      if(!event.deltaY)return;event.preventDefault();
      if(Date.now()-wheelTime<120)return;wheelTime=Date.now();select(selected+Math.sign(event.deltaY));
    },{passive:false});
    window.openReadingChooser=runSelected;cleanLegacyHome();render(false);loadApprovedArtwork();
  }
  function resetForHome(){selected=0;activePointer=null;cleanLegacyHome();render(false);}
  function watchHome(){
    const main=$('screen-main');if(!main)return;
    wasHome=main.classList.contains('active');if(wasHome)resetForHome();
    new MutationObserver(()=>{
      const active=main.classList.contains('active');if(active&&!wasHome)resetForHome();wasHome=active;
    }).observe(main,{attributes:true,attributeFilter:['class']});
  }
  function installStyle(){
    if($('booki-reading-dial-style'))return;
    const style=document.createElement('style');style.id='booki-reading-dial-style';
    style.textContent=`
      #reading-chooser-overlay,#booki-personal-message,#screen-main .booki-unread-cue,
      #screen-main .home-speech-bubble,#screen-main .home-start-hint,#screen-main .console-frame,
      #screen-main #home-class-goal,#screen-main #home-shelf-card{display:none!important}
      #screen-main #home-console-stage{pointer-events:none!important;cursor:default!important}
      #screen-main.booki-world--home{background-color:#fff7e2!important;background-image:
        radial-gradient(78% 31% at -8% 7%,rgba(210,226,190,.70) 0 52%,transparent 53%),
        radial-gradient(72% 28% at 108% 13%,rgba(210,229,196,.60) 0 53%,transparent 54%),
        radial-gradient(65% 23% at -9% 57%,rgba(250,194,163,.40) 0 51%,transparent 52%),
        radial-gradient(75% 27% at 111% 76%,rgba(228,207,205,.35) 0 52%,transparent 53%),
        linear-gradient(180deg,#fff9e9 0%,#fff3d4 54%,#fff9e8 100%)!important}
      #screen-main .home-ambient{display:none!important}
      #screen-main .home-console-wrap{padding-top:6px!important}
      #screen-main .home-console-stage{margin:0 auto 4px!important}
      #screen-main .home-console-char{width:min(55vw,220px)!important;height:auto!important;filter:drop-shadow(0 14px 15px rgba(117,91,46,.12))}
      .booki-reading-dial{width:min(100%,560px);max-width:100%;margin:0 auto 22px;direction:rtl;font-family:Heebo,Arial,sans-serif;text-align:center}
      .booki-reading-generator-shell{position:relative;width:100%;aspect-ratio:810/455;isolation:isolate;visibility:hidden}
      .booki-reading-dial.art-ready .booki-reading-generator-shell{visibility:visible}
      .booki-reading-dial.art-failed .booki-reading-generator-shell{display:none}
      .booki-reading-generator-art{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;z-index:1;pointer-events:none;user-select:none;-webkit-user-drag:none}
      .booki-reading-generator-hit-main{position:absolute;z-index:6;left:1.4%;top:6.2%;width:75.2%;height:92.5%;border:0;background:transparent;padding:0;margin:0;border-radius:34%/46%;box-shadow:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
      .booki-reading-generator-hit-main:focus-visible{outline:3px solid #2877b8;outline-offset:-4px}
      .booki-reading-generator-hit-main:active{background:rgba(0,90,47,.045)}
      .booki-reading-generator-hit-main:disabled{cursor:wait}
      .booki-reading-generator-hit-reel{position:absolute;z-index:7;left:76.9%;top:5.2747%;width:18.025%;height:93.4066%;border-radius:44%;background:transparent;touch-action:none;user-select:none;cursor:ns-resize;-webkit-tap-highlight-color:transparent;outline:none}
      .booki-reading-generator-hit-reel:focus-visible{outline:3px solid #2877b8;outline-offset:1px}
      .booki-reading-row-marker{position:absolute;z-index:4;border-radius:12px;border:2px solid #36ba71;box-shadow:0 0 9px rgba(62,193,110,.25);box-sizing:border-box;background:transparent;pointer-events:none;transition:top .12s ease,height .12s ease}
      .booki-reading-mode-overlay{position:absolute;z-index:5;left:22.0%;top:72.1%;width:46.8%;height:17.8%;display:flex;align-items:center;justify-content:center;background:transparent;color:#bff3c8;font:900 clamp(.82rem,4vw,1.5rem)/1 Heebo,Arial,sans-serif;white-space:nowrap;pointer-events:none}
      #booki-reading-dial [hidden]{display:none!important}
      .booki-art-fallback{display:none}
      .booki-reading-dial.art-failed .booki-art-fallback{display:flex;flex-direction:column;gap:10px;align-items:center}
      .booki-art-fallback button,.booki-art-fallback select{font:700 16px Heebo,Arial,sans-serif;padding:12px;border:1px solid #218d50;border-radius:12px;background:#fff8e7;color:#175637}
      #booki-art-fallback-start{background:#218d50;color:white}
      .booki-reading-dial-status:empty{display:none}
      .booki-reading-dial-status{margin:8px 0;color:#495c4f;font-size:.88rem;font-weight:700}
      .booki-reading-dial.art-failed .booki-reading-dial-status{color:#973c31}
      .booki-reading-dial-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      @media(prefers-reduced-motion:reduce){.booki-reading-row-marker{transition:none!important}}
    `;document.head.appendChild(style);
  }
  function init(){installStyle();build();watchHome();}
  window.BookiReadingDial={version:8,select,runSelected,reset:resetForHome,modes:MODES};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
