// One place that knows what a record's address looks like, so a link from a
// report, from a renewals row, or from the other side of a placement all land
// on the same page.

export const recordHash = (kind, id) => `registry/${kind === 'worker' ? 'w' : 'f'}/${id}`;

export const recordUrl = (kind, id) => `${location.pathname}${location.search}#${recordHash(kind, id)}`;

// Records always open in a new browser tab, so the report or list you came from
// stays where it was.
export function openRecordTab(kind, id) {
  window.open(recordUrl(kind, id), '_blank', 'noopener');
}
