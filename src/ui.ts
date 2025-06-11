export function initFullscreenButton(): void {
  const btn = document.getElementById('fullscreenBtn') as HTMLButtonElement | null;
  if (!btn) return;
  const container = document.querySelector('.container') as HTMLElement | null;
  btn.addEventListener('click', () => {
    if (!container) return;
    if (!document.fullscreenElement) {
      const req =
        (container as any).requestFullscreen ||
        (container as any).webkitRequestFullscreen ||
        (container as any).msRequestFullscreen;
      req?.call(container);
    } else {
      const exit =
        (document as any).exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).msExitFullscreen;
      exit?.call(document);
    }
  });
}

export function initSettingsButton(): void {
  const btn = document.getElementById('settingsBtn') as HTMLButtonElement | null;
  const panel = document.getElementById('settingsPanel') as HTMLDivElement | null;

  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target as Node) && e.target !== btn) {
      panel.classList.remove('show');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('show')) {
      panel.classList.remove('show');
    }
  });
}

