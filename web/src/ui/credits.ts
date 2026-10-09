// Cesium keeps the full list of data providers behind a "Data attribution" popup. The plan says attribution must always
// be visible, so this mirrors that list (Cesium fills it even while closed) into the bottom bar as one truncated line.
export function mirrorCredits(): void {
  const lightbox = document.querySelector('.cesium-credit-lightbox');
  const line = document.getElementById('credits-inline');
  if (!lightbox || !line) return;
  const read = (): void => {
    const items = Array.from(lightbox.querySelectorAll('li'))
      .map((li) => (li.textContent || li.querySelector('img')?.title || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const text = items.length ? `Data: ${items.join(' · ')}` : '';
    line.textContent = text;
    line.title = text; // the full text on hover when the line is cut off
  };
  new MutationObserver(read).observe(lightbox, { childList: true, subtree: true, characterData: true });
  read();
}
