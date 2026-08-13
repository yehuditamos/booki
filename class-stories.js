/**
 * תשתית "הסיפור שבידיים שלנו".
 * בשלב זה הקריאה בלבד פעילה; יצירה/צילום/פרסום ייפתחו לאחר חיבור Storage
 * וכללי הרשאה ייעודיים. המבנה נקבע מראש כדי שמסכי הילד והמורה יחלקו מקור אמת.
 */
const CLASS_STORY_STATUS = Object.freeze({
  DRAFT: 'draft',
  COLLECTING: 'collecting',
  TEACHER_REVIEW: 'teacher_review',
  READY: 'ready',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

const CLASS_STORY_PART_SIZES = Object.freeze(['one_word', 'two_words', 'three_words', 'sentence']);

function _classStoriesDb() { return window.db || null; }

async function loadPublishedClassStories(clubId) {
  const db = _classStoriesDb();
  if (!db || !clubId) return [];
  try {
    const snap = await db.collection('clubs').doc(clubId).collection('classStories')
      .where('status', '==', CLASS_STORY_STATUS.PUBLISHED).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  } catch (e) {
    console.warn('[class-stories] load failed:', e.message);
    return [];
  }
}

async function renderClassStoryShelf(clubId) {
  const shelf = document.getElementById('class-story-shelf');
  const empty = document.getElementById('class-story-empty');
  if (!shelf || !empty) return;
  const stories = await loadPublishedClassStories(clubId);
  shelf.innerHTML = stories.map(story => `
    <article class="class-story-book">
      <div class="class-story-cover">${story.coverEmoji || '📖'}</div>
      <strong>${_escapeClassStoryText(story.title || 'הסיפור שלנו')}</strong>
      <span>${_escapeClassStoryText(story.clubName || '')}</span>
    </article>`).join('');
  empty.style.display = stories.length ? 'none' : 'flex';
}

function _escapeClassStoryText(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

Object.assign(window, { CLASS_STORY_STATUS, CLASS_STORY_PART_SIZES, loadPublishedClassStories, renderClassStoryShelf });
