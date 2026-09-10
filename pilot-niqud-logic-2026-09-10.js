/** Booki no-niqqud full-spelling logic, 2026-09-10. */
function _bookiPlainToken20260910(token){
  const exact=window._BOOKI_EXACT_PLAIN_20260910.get(token.normalize('NFC'));
  if(exact) return exact;
  const stripped=token.replace(/[\u0591-\u05C7]/g,c=>_NIQUD_KEEP_PUNCT.has(c)?c:'');
  const direct=window._BOOKI_DEFECTIVE_PLAIN_20260910.get(stripped); if(direct) return direct;
  for(const prefix of ['וכש','כש','וה','וב','ול','ומ','וש','וכ','ה','ו','ב','ל','מ','ש','כ']){
    if(!stripped.startsWith(prefix)||stripped.length<=prefix.length+1) continue;
    const expanded=window._BOOKI_DEFECTIVE_PLAIN_20260910.get(stripped.slice(prefix.length));
    if(expanded) return prefix+expanded;
  }
  return stripped;
}
stripNiqud=function(text){
  if(typeof text!=='string') return text;
  return text.replace(/[א-תךםןףץ][א-תךםןףץ\u0591-\u05C7׳״]*/g,_bookiPlainToken20260910);
};
