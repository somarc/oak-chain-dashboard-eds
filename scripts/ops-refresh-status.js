const HOST_ID = 'ops-page-refresh-status';

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (host) return host;

  host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'ops-page-refresh-status';
  host.textContent = 'Last refreshed: --';

  const main = document.querySelector('main');
  if (main && main.firstElementChild) {
    main.insertBefore(host, main.firstElementChild);
  } else if (main) {
    main.append(host);
  } else {
    document.body.prepend(host);
  }
  return host;
}

export function markOpsPageRefreshed(context = '') {
  const host = ensureHost();
  const ts = new Date().toLocaleTimeString();
  host.textContent = context
    ? `Last refreshed: ${ts} (${context})`
    : `Last refreshed: ${ts}`;
}

export function markOpsPageRefreshError(message) {
  const host = ensureHost();
  const ts = new Date().toLocaleTimeString();
  host.textContent = `Last refresh failed: ${ts}${message ? ` (${message})` : ''}`;
}
