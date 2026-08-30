(function (root, factory) {
  const Matcher = factory();
  if (typeof module === 'object' && module.exports) module.exports = Matcher;
  else root.BookiWordMatcher = Matcher;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const normalizeHebrew = value => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/["'׳״.,!?;:()\[\]{}־–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // זיהוי דיבור מחזיר לרוב כתיב מלא ("בבוקר", "לגינה"), בעוד טקסט מנוקד
  // נכתב לעיתים בכתיב חסר. ו/י הן אופציונליות לצורך ההשוואה בלבד.
  const comparisonKey = value => normalizeHebrew(value).replace(/[וי]/g, '');

  return class BookiWordMatcher {
    constructor(text, { searchAhead = 5, searchBehind = 2 } = {}) {
      this.displayWords = String(text).split(/\s+/).filter(Boolean);
      this.targetWords = this.displayWords.map(normalizeHebrew);
      this.targetKeys = this.displayWords.map(comparisonKey);
      this.searchAhead = searchAhead;
      this.searchBehind = searchBehind;
      this.reset();
    }

    reset() { this.confirmed = new Set(); this.anchor = 0; }
    get complete() { return this.confirmed.size === this.targetWords.length; }
    nextUnconfirmed() {
      for (let i = 0; i < this.targetWords.length; i++) if (!this.confirmed.has(i)) return i;
      return this.targetWords.length;
    }

    findTargetIndex(word, cursor) {
      const from = Math.max(0, cursor - this.searchBehind);
      const to = Math.min(this.targetWords.length - 1, cursor + this.searchAhead);
      const matches = [];
      const exact = normalizeHebrew(word);
      const key = comparisonKey(word);
      for (let i = from; i <= to; i++) {
        if (this.targetWords[i] === exact || this.targetKeys[i] === key) matches.push(i);
      }
      if (!matches.length) return -1;
      const forward = matches.find(i => !this.confirmed.has(i) && i >= cursor);
      if (forward !== undefined) return forward;
      const correction = matches.find(i => !this.confirmed.has(i));
      return correction !== undefined ? correction : matches[0];
    }

    applyTranscript(transcript) {
      const words = normalizeHebrew(transcript).split(' ').filter(Boolean);
      let cursor = Math.max(0, this.anchor - this.searchBehind);
      let furthest = this.anchor;
      const newlyConfirmed = [];
      for (const word of words) {
        const index = this.findTargetIndex(word, cursor);
        if (index < 0) continue;
        if (!this.confirmed.has(index)) newlyConfirmed.push(index);
        this.confirmed.add(index);
        cursor = Math.max(cursor, index + 1);
        furthest = Math.max(furthest, index + 1);
      }
      this.anchor = furthest;
      return newlyConfirmed;
    }
  };
});
