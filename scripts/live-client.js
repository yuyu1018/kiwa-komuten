// Served and injected only by the local development server; never included in dist/.
(() => {
  const events = new EventSource('/__dev/events');
  let currentState;

  function stateKey(data) {
    return `${data.instance}:${data.revision}`;
  }

  events.addEventListener('ready', event => {
    const nextState = stateKey(JSON.parse(event.data));
    if (currentState && currentState !== nextState) location.reload();
    currentState = nextState;
  });

  events.addEventListener('change', event => {
    const data = JSON.parse(event.data);
    currentState = stateKey(data);
    if (!data.cssOnly) {
      location.reload();
      return;
    }

    // Refresh CSS in place so scroll position and open UI remain intact.
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const url = new URL(link.href);
      if (url.origin !== location.origin) return;
      url.searchParams.set('__live', Date.now());
      const replacement = link.cloneNode();
      replacement.href = url.href;
      replacement.addEventListener('load', () => link.remove(), { once: true });
      replacement.addEventListener('error', () => location.reload(), { once: true });
      link.after(replacement);
    });
  });
})();
