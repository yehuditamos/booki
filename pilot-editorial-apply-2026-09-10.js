/** Apply Booki editorial corrections after catalogue load and after late holiday stories. */
(function(){
  'use strict';
  function apply(){
    if(typeof getAllStories!=='function') return;
    const byId=new Map(getAllStories().map(s=>[s.id,s]));
    for(const patch of (window.BookiEditorialPatches20260910||[])){
      const story=byId.get(patch.id); if(!story) continue;
      if(patch.title!==undefined) story.title=patch.title;
      if(patch.category!==undefined) story.category=patch.category;
      for(const page of patch.pages||[]){
        if(story.pages?.[page.i]){
          story.pages[page.i].text=page.text;
          story.pages[page.i].readingMinutes=page.readingMinutes;
        }
      }
    }
  }
  apply();
  window.addEventListener?.('booki:holiday-stories-ready',apply);
  window.BookiPilotEditorial20260910={version:'2026-09-10.1',apply};
})();
