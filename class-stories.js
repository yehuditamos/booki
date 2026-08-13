/* הסיפור שבידיים שלנו — סיפור אחד שמתחלק בין כל ילדי המועדון. */
let _currentClassStory = null;
const csClub = () => window.currentClubId;
const csCol = () => {
  const id = String(csClub() || '').replace(/[^\w-]/g, '_');
  return (window.db || firebase.firestore()).collection('classes').doc('classStories_' + id).collection('students');
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function csAll() {
  const snap = await csCol().get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function csBundle(id) {
  const all = await csAll();
  return {
    story: all.find(x => x.kind === 'story' && x.id === id),
    parts: all.filter(x => x.kind === 'part' && x.storyId === id).sort((a,b) => (a.order || 0) - (b.order || 0)),
  };
}
function csStudent() {
  const reader = typeof getActiveReader === 'function' && getActiveReader();
  return {
    id: reader?.userId || String(typeof currentStudentId !== 'undefined' ? currentStudentId : 'unknown'),
    name: reader?.name || (typeof currentStudentData !== 'undefined' && currentStudentData?.name) || 'ילד/ה',
  };
}

function setClassStorySource(mode) {
  document.getElementById('class-story-own-source').style.display = mode === 'own' ? '' : 'none';
  document.getElementById('class-story-app-source').style.display = mode === 'app' ? '' : 'none';
  document.querySelectorAll('.story-source-choice').forEach(el => el.classList.toggle('active', el.dataset.mode === mode));
  document.getElementById('class-story-source-mode').value = mode;
  updateClassStoryPlan();
}

async function initClassStoryCreator() {
  const select = document.getElementById('class-story-app-select');
  if (select && !select.options.length) {
    const stories = typeof getAllStories === 'function' ? getAllStories() : [];
    select.innerHTML = '<option value="">בחרי סיפור…</option>' + stories.map(s => `<option value="${esc(s.id)}">${esc(s.emoji || '📖')} ${esc(s.title)}</option>`).join('');
  }
  const memberships = typeof fbLoadClubMemberships === 'function' ? await fbLoadClubMemberships(csClub()) : [];
  const count = memberships.filter(m => m.status !== 'left').length;
  const countEl = document.getElementById('class-story-member-count');
  if (countEl) countEl.textContent = count ? `בוקי יחלק את הסיפור ל־${count} חלקים — חלק אחד לכל ילד/ה במועדון.` : 'אין עדיין ילדים פעילים במועדון. צריך לצרף ילדים לפני פתיחת סיפור.';
  updateClassStoryPlan();
}

function selectedAppStory() {
  const id = document.getElementById('class-story-app-select')?.value;
  return (typeof getAllStories === 'function' ? getAllStories() : []).find(s => String(s.id) === String(id));
}
function selectedSourceText() {
  const mode = document.getElementById('class-story-source-mode')?.value || 'own';
  if (mode === 'app') return (selectedAppStory()?.pages || []).map(p => p.text || '').join(' ').trim();
  return document.getElementById('class-story-full-text')?.value.trim() || '';
}
function onClassStoryAppSelected() {
  const story = selectedAppStory();
  const title = document.getElementById('class-story-title');
  if (story && title && !title.value.trim()) title.value = story.title.replace(/[\u0591-\u05C7]/g, '');
  updateClassStoryPlan();
}
function splitStoryText(text, count) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!count || words.length < count) return [];
  const base = Math.floor(words.length / count), extra = words.length % count;
  const chunks = []; let at = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    chunks.push(words.slice(at, at + size).join(' ')); at += size;
  }
  return chunks;
}
async function updateClassStoryPlan() {
  const el = document.getElementById('class-story-plan'); if (!el) return;
  const memberships = typeof fbLoadClubMemberships === 'function' ? await fbLoadClubMemberships(csClub()) : [];
  const count = memberships.filter(m => m.status !== 'left').length, text = selectedSourceText();
  if (!text) { el.innerHTML = '<span>לאחר בחירת הטקסט תופיע כאן דוגמת החלוקה.</span>'; return; }
  const parts = splitStoryText(text, count);
  if (!parts.length) { el.innerHTML = `<strong>הטקסט קצר מדי לחלוקה ל־${count} ילדים.</strong><span>צריך לפחות מילה אחת לכל ילד/ה.</span>`; return; }
  el.innerHTML = `<strong>כך בוקי יחלק את הסיפור:</strong><span>${text.split(/\s+/).length} מילים · ${count} ילדים · בערך ${parts[0].split(' ').length} מילים לכל ילד/ה</span><small>חלק לדוגמה: „${esc(parts[0])}”</small>`;
}

async function createClassStory() {
  const title = document.getElementById('class-story-title').value.trim();
  const opening = document.getElementById('class-story-opening').value.trim();
  const sourceText = selectedSourceText();
  const msg = document.getElementById('class-story-create-msg');
  const memberships = (typeof fbLoadClubMemberships === 'function' ? await fbLoadClubMemberships(csClub()) : []).filter(m => m.status !== 'left');
  if (!title) { msg.textContent = 'צריך לתת לסיפור שם.'; return; }
  if (!sourceText) { msg.textContent = 'צריך להדביק סיפור או לבחור סיפור מבוקי.'; return; }
  if (!memberships.length) { msg.textContent = 'אין ילדים פעילים שאפשר לחלק ביניהם את הסיפור.'; return; }
  const chunks = splitStoryText(sourceText, memberships.length);
  if (!chunks.length) { msg.textContent = `הסיפור קצר מדי ל־${memberships.length} ילדים.`; return; }
  msg.textContent = 'בוקי מחלק את הסיפור…';
  const storyRef = csCol().doc(), batch = (window.db || firebase.firestore()).batch();
  batch.set(storyRef, { kind:'story', title, opening, sourceText, sourceType:document.getElementById('class-story-source-mode').value, status:'collecting', totalParts:chunks.length, createdAt:Date.now(), clubName:window._currentTeacherClubData?.name || '' });
  memberships.forEach((member, index) => {
    const ref = csCol().doc();
    batch.set(ref, { kind:'part', storyId:storyRef.id, assignedStudentId:member.userId, studentId:member.userId, studentName:member.name || `ילד/ה ${index + 1}`, promptText:chunks[index], status:'assigned', order:index, createdAt:Date.now() });
  });
  await batch.commit();
  document.getElementById('class-story-title').value = '';
  document.getElementById('class-story-opening').value = '';
  document.getElementById('class-story-full-text').value = '';
  msg.textContent = `הסיפור נפתח וחולק ל־${chunks.length} ילדים!`;
  updateClassStoryPlan(); renderTeacherClassStories();
}

async function renderTeacherClassStories() {
  const el = document.getElementById('teacher-class-stories-list'); if (!el) return;
  el.innerHTML = '<p>טוען…</p>';
  try {
    const all = await csAll(), stories = all.filter(x => x.kind === 'story').sort((a,b) => b.createdAt - a.createdAt);
    el.innerHTML = stories.map(story => {
      const parts = all.filter(x => x.kind === 'part' && x.storyId === story.id), finished = parts.filter(x => x.status === 'approved').length;
      return `<button class="teacher-story-card" onclick="openTeacherClassStory('${story.id}')"><span>${story.status === 'published' ? '📗' : '✍️'}</span><div><strong>${esc(story.title)}</strong><small>${story.status === 'published' ? 'פורסם' : `${finished} מתוך ${parts.length} חלקים הושלמו`}</small></div><b>כניסה ←</b></button>`;
    }).join('') || '<div class="class-story-empty"><span>✍️</span><strong>עדיין אין סיפור</strong><p>פותחים למעלה את הסיפור הראשון.</p></div>';
  } catch (e) { el.innerHTML = '<p class="auth-error">לא הצלחנו לטעון. נסו שוב.</p>'; console.error(e); }
}

async function renderClassStoryShelf() {
  const active = document.getElementById('active-class-stories'), shelf = document.getElementById('class-story-shelf'), empty = document.getElementById('class-story-empty');
  try {
    const all = await csAll(), stories = all.filter(x => x.kind === 'story');
    active.innerHTML = stories.filter(x => x.status === 'collecting').map(s => `<button class="active-story-card" onclick="openStudentClassStory('${s.id}')"><span>✍️</span><div><strong>הכיתה כותבת עכשיו</strong><b>${esc(s.title)}</b><small>החלק שלך כבר מחכה לך ←</small></div></button>`).join('');
    const published = stories.filter(x => x.status === 'published');
    shelf.innerHTML = published.map(s => `<button class="class-story-book" onclick="openPublishedClassStory('${s.id}','child')"><div class="class-story-cover">📖</div><strong>${esc(s.title)}</strong><span>${esc(s.clubName || 'הסיפור שלנו')}</span></button>`).join('');
    empty.style.display = published.length ? 'none' : 'flex';
  } catch (e) { console.error(e); }
}

async function openStudentClassStory(id) {
  const bundle = await csBundle(id); if (!bundle.story) return;
  _currentClassStory = bundle.story;
  document.getElementById('student-story-title').textContent = bundle.story.title;
  document.getElementById('student-story-opening').textContent = bundle.story.opening || 'כל ילד וילדה כותבים חלק אחד, ובסוף מחברים ספר כיתתי.';
  const me = csStudent(), part = bundle.parts.find(p => p.assignedStudentId === me.id || p.studentId === me.id), action = document.getElementById('student-story-action');
  if (!part) action.innerHTML = '<div class="story-submitted"><span>🔎</span><strong>לא מצאנו חלק שמחכה לך</strong><p>כדאי לבקש מהמורה לבדוק ששמך נמצא במועדון.</p></div>';
  else if (part.image && part.status !== 'rejected') action.innerHTML = `<div class="story-submitted"><span>${part.status === 'approved' ? '✅' : '⏳'}</span><strong>${part.status === 'approved' ? 'החלק שלך נכנס לסיפור!' : 'התמונה אצל המורה לבדיקה'}</strong><p>תודה שכתבת איתנו.</p></div>`;
  else action.innerHTML = `<div class="assigned-story-part"><span>החלק שלך בסיפור</span><strong>${esc(part.promptText)}</strong></div>${part.status === 'rejected' ? '<p class="story-retry-note">המורה ביקשה צילום חדש וברור יותר.</p>' : ''}<div class="handwriting-guide"><strong>מעתיקים את החלק על דף לבן</strong><span>בכתב יד גדול וברור ובטוש כהה.</span></div><label class="story-camera-btn">📷 צילום כתב היד<input type="file" accept="image/*" capture="environment" onchange="previewClassStoryPhoto(this,'${part.id}')"></label><div id="class-story-photo-preview"></div>`;
  showScreen('screen-student-class-story');
}

async function compressPhoto(file) {
  const url = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const image = await new Promise((resolve,reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
  const scale = Math.min(1, 720 / Math.max(image.width,image.height)), canvas = document.createElement('canvas');
  canvas.width = image.width * scale; canvas.height = image.height * scale; canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg', .62);
}
async function previewClassStoryPhoto(input, partId) {
  if (!input.files?.[0]) return;
  const box = document.getElementById('class-story-photo-preview'); box.innerHTML = '<p>מכינים את התמונה…</p>';
  try {
    const data = await compressPhoto(input.files[0]); box.dataset.image = data;
    box.innerHTML = `<img src="${data}" alt="צילום כתב היד"><button class="btn-giant btn-green" onclick="submitClassStoryPart('${partId}')">זה ברור — שליחה למורה</button>`;
  } catch { box.innerHTML = '<p class="auth-error">לא הצלחנו לפתוח את התמונה. נסו שוב.</p>'; }
}
async function submitClassStoryPart(partId) {
  const box = document.getElementById('class-story-photo-preview'); if (!box?.dataset.image) return;
  box.innerHTML = '<p>שולחים למורה…</p>';
  await csCol().doc(partId).update({ image:box.dataset.image, status:'pending', submittedAt:Date.now() });
  openStudentClassStory(_currentClassStory.id);
}

async function openTeacherClassStory(id) {
  const bundle = await csBundle(id); if (!bundle.story) return; _currentClassStory = bundle.story;
  document.getElementById('teacher-story-review-title').textContent = bundle.story.title;
  document.getElementById('teacher-story-review-opening').textContent = bundle.story.opening || '';
  document.getElementById('teacher-story-parts').innerHTML = bundle.parts.map((part,index) => `<article class="review-part ${part.status}">${part.image ? `<img src="${part.image}" alt="כתב היד של ${esc(part.studentName)}">` : '<div class="review-part-empty">עוד לא צולם</div>'}<div><strong>${index + 1}. ${esc(part.studentName)}</strong><small>${esc(part.promptText || '')}</small><b>${part.status === 'approved' ? 'מאושר' : part.status === 'rejected' ? 'ממתין לצילום חוזר' : part.status === 'pending' ? 'מחכה לבדיקה' : 'עדיין לא נשלח'}</b></div>${part.image ? `<div class="review-actions"><button onclick="setClassStoryPartStatus('${part.id}','approved')">✓ אישור</button><button onclick="setClassStoryPartStatus('${part.id}','rejected')">↩ צילום חוזר</button></div>` : ''}</article>`).join('');
  const complete = bundle.parts.length > 0 && bundle.parts.every(p => p.status === 'approved');
  const publish = document.getElementById('publish-class-story'); publish.disabled = !complete; publish.textContent = complete ? 'סיום ופרסום בספריית הכיתה' : `ממתינים לעוד ${bundle.parts.filter(p => p.status !== 'approved').length} חלקים`;
  showScreen('screen-teacher-story-review');
}
async function setClassStoryPartStatus(id,status) { await csCol().doc(id).update({status}); openTeacherClassStory(_currentClassStory.id); }
async function publishClassStory() { await csCol().doc(_currentClassStory.id).update({status:'published',publishedAt:Date.now()}); openPublishedClassStory(_currentClassStory.id,'teacher'); }
async function openPublishedClassStory(id,from='child') {
  const bundle = await csBundle(id); _currentClassStory = bundle.story;
  document.getElementById('published-story-title').textContent = bundle.story.title; document.getElementById('published-story-title-print').textContent = bundle.story.title;
  document.getElementById('published-story-opening').textContent = bundle.story.opening || '';
  document.getElementById('published-story-pages').innerHTML = bundle.parts.filter(p => p.status === 'approved').map((p,i) => `<figure><img src="${p.image}" alt="עמוד ${i + 1}"><figcaption>${esc(p.studentName)}</figcaption></figure>`).join('');
  document.getElementById('published-story-back').onclick = from === 'teacher' ? showTeacherStoryLibrary : showClassLibrary;
  document.getElementById('published-story-print').style.display = from === 'teacher' ? '' : 'none'; showScreen('screen-published-class-story');
}
function printClassStory() { window.print(); }
Object.assign(window,{splitStoryText,setClassStorySource,initClassStoryCreator,onClassStoryAppSelected,updateClassStoryPlan,createClassStory,renderTeacherClassStories,renderClassStoryShelf,openStudentClassStory,previewClassStoryPhoto,submitClassStoryPart,openTeacherClassStory,setClassStoryPartStatus,publishClassStory,openPublishedClassStory,printClassStory});
