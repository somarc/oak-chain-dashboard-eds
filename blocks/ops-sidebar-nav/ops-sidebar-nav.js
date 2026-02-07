function textFromCell(cell) {
  return (cell?.textContent || '').trim();
}

function normalizeHref(rawHref) {
  if (!rawHref || typeof rawHref !== 'string') return '#';
  const href = rawHref.trim();
  if (!href.length) return '#';
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) return href;
  return href.startsWith('/') ? href : `/${href}`;
}

function deriveLabel(link) {
  if (!link) return 'Untitled';
  const fromText = (link.textContent || '').trim();
  if (fromText) return fromText;
  const href = link.getAttribute('href') || '';
  if (!href || href === '/') return 'Home';
  const part = href.replace(/\/$/, '').split('/').pop() || 'Item';
  return part.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function isActive(href) {
  if (!href) return false;
  if (href.startsWith('#')) return false;
  const current = window.location.pathname.replace(/\/$/, '') || '/';
  const target = href.replace(/\/$/, '') || '/';
  return current === target;
}

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const items = [];

  rows.forEach((row) => {
    const cells = [...row.querySelectorAll(':scope > div')];
    if (!cells.length) return;
    const [firstCell, secondCell] = cells;

    const explicitLink = firstCell.querySelector('a[href]') || secondCell?.querySelector('a[href]');
    if (explicitLink) {
      const href = normalizeHref(explicitLink.getAttribute('href'));
      items.push({ label: deriveLabel(explicitLink), href });
      return;
    }

    const labelText = textFromCell(firstCell);
    const pathText = secondCell ? textFromCell(secondCell) : '';
    const text = labelText;
    if (!text || /^ops sidebar nav$/i.test(text)) return;

    if (pathText) {
      items.push({ label: labelText, href: normalizeHref(pathText) });
      return;
    }

    // Allow simple "Label | /path" authoring fallback.
    if (text.includes('|')) {
      const [labelPart, hrefPart] = text.split('|').map((part) => part.trim());
      if (labelPart && hrefPart) {
        items.push({ label: labelPart, href: normalizeHref(hrefPart) });
        return;
      }
    }

    items.push({ label: text, href: '#' });
  });

  if (!items.length) {
    items.push({ label: 'Operations', href: '/' });
    items.push({ label: 'TarMK Storage', href: '/tarmk' });
  }

  const nav = document.createElement('nav');
  nav.className = 'ops-sidebar-nav-shell';
  nav.setAttribute('aria-label', 'Operations Navigation');

  const title = document.createElement('p');
  title.className = 'ops-sidebar-nav-title';
  title.textContent = 'Operations';

  const list = document.createElement('ul');
  list.className = 'ops-sidebar-nav-list';
  list.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.className = 'ops-sidebar-nav-item';

    const a = document.createElement('a');
    a.className = 'ops-sidebar-nav-link';
    a.href = item.href;
    a.textContent = item.label;
    if (isActive(item.href)) {
      a.setAttribute('aria-current', 'page');
    }

    li.append(a);
    return li;
  }));

  nav.append(title, list);
  block.replaceChildren(nav);

  const main = document.querySelector('main');
  if (main) main.classList.add('has-ops-sidebar-nav');
  const section = block.closest('.section') || block.parentElement;
  if (section) section.classList.add('ops-sidebar-nav-container');
}
