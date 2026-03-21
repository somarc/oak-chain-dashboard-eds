function getRowCells(row) {
  return [...row.children];
}

function getRowType(cell) {
  return cell?.textContent?.trim().toLowerCase() || '';
}

function getText(cell) {
  return cell?.textContent?.trim() || '';
}

function cloneContentWithoutLinks(cell) {
  const clone = cell?.cloneNode(true);
  if (!clone) return '';

  clone.querySelectorAll('a').forEach((link) => link.remove());
  clone.querySelectorAll('p, li').forEach((element) => {
    if (!element.textContent.trim()) {
      element.remove();
    }
  });

  return clone.innerHTML.trim();
}

function collectLinks(cell) {
  return [...(cell?.querySelectorAll('a') || [])].map((link) => ({
    href: link.href,
    text: link.textContent.trim(),
  })).filter((link) => link.href && link.text);
}

function appendRichText(parent, html, className) {
  if (!html) return;

  const wrapper = document.createElement('div');
  wrapper.className = className;
  wrapper.innerHTML = html;
  parent.append(wrapper);
}

function buildLinkList(links, className) {
  if (!links.length) return null;

  const list = document.createElement('div');
  list.className = className;

  links.forEach((link, index) => {
    const anchor = document.createElement('a');
    anchor.href = link.href;
    anchor.textContent = link.text;

    if (className === 'tools-home-primary-actions') {
      anchor.className = index === 0 ? 'button' : 'button secondary';
    } else {
      anchor.className = 'tools-home-text-link';
    }

    list.append(anchor);
  });

  return list;
}

const ATMOSPHERE_DOTS = [
  { x: 8, y: 14, size: 8, variant: 'muted', dx: -10, dy: 6, delay: '-6s', duration: '24s' },
  { x: 18, y: 26, size: 10, variant: 'validator', dx: 8, dy: -6, delay: '-12s', duration: '28s' },
  { x: 28, y: 18, size: 7, variant: 'muted', dx: -6, dy: 8, delay: '-3s', duration: '22s' },
  { x: 42, y: 16, size: 9, variant: 'validator', dx: 10, dy: 4, delay: '-8s', duration: '26s' },
  { x: 56, y: 12, size: 12, variant: 'core', dx: 6, dy: -4, delay: '-10s', duration: '20s' },
  { x: 66, y: 18, size: 10, variant: 'reader', dx: -8, dy: 6, delay: '-5s', duration: '24s' },
  { x: 78, y: 22, size: 8, variant: 'muted', dx: 8, dy: -8, delay: '-14s', duration: '30s' },
  { x: 88, y: 14, size: 10, variant: 'reader', dx: -6, dy: 8, delay: '-2s', duration: '22s' },
  { x: 16, y: 48, size: 8, variant: 'muted', dx: 10, dy: -4, delay: '-4s', duration: '25s' },
  { x: 32, y: 42, size: 10, variant: 'validator', dx: -10, dy: 8, delay: '-7s', duration: '27s' },
  { x: 48, y: 38, size: 14, variant: 'core', dx: 8, dy: 10, delay: '-11s', duration: '21s' },
  { x: 62, y: 44, size: 9, variant: 'reader', dx: 6, dy: -8, delay: '-1s', duration: '23s' },
  { x: 76, y: 40, size: 12, variant: 'validator', dx: -8, dy: 6, delay: '-15s', duration: '31s' },
  { x: 90, y: 48, size: 7, variant: 'muted', dx: 6, dy: -6, delay: '-9s', duration: '20s' },
  { x: 22, y: 74, size: 11, variant: 'reader', dx: -6, dy: 8, delay: '-13s', duration: '29s' },
  { x: 38, y: 70, size: 8, variant: 'muted', dx: 8, dy: -6, delay: '-5s', duration: '24s' },
  { x: 56, y: 76, size: 12, variant: 'validator', dx: -10, dy: 6, delay: '-16s', duration: '32s' },
  { x: 70, y: 72, size: 10, variant: 'reader', dx: 10, dy: -8, delay: '-6s', duration: '26s' },
  { x: 84, y: 78, size: 8, variant: 'muted', dx: -6, dy: 8, delay: '-12s', duration: '28s' },
];

const ATMOSPHERE_LINKS = [
  { x: 10, y: 17, width: 22, angle: 14, opacity: 0.16 },
  { x: 26, y: 21, width: 28, angle: -10, opacity: 0.14 },
  { x: 44, y: 17, width: 20, angle: 9, opacity: 0.12 },
  { x: 56, y: 18, width: 24, angle: 14, opacity: 0.18 },
  { x: 66, y: 24, width: 18, angle: -12, opacity: 0.14 },
  { x: 24, y: 44, width: 30, angle: -8, opacity: 0.12 },
  { x: 44, y: 41, width: 28, angle: 11, opacity: 0.17 },
  { x: 62, y: 45, width: 22, angle: -14, opacity: 0.16 },
  { x: 18, y: 73, width: 24, angle: -12, opacity: 0.12 },
  { x: 48, y: 72, width: 30, angle: 10, opacity: 0.16 },
  { x: 68, y: 74, width: 18, angle: -9, opacity: 0.12 },
];

function buildAtmosphere() {
  const layer = document.createElement('div');
  layer.className = 'tools-home-atmosphere';
  layer.setAttribute('aria-hidden', 'true');

  const mesh = document.createElement('div');
  mesh.className = 'tools-home-atmosphere-mesh';
  layer.append(mesh);

  ATMOSPHERE_LINKS.forEach((link) => {
    const beam = document.createElement('span');
    beam.className = 'tools-home-atmosphere-link';
    beam.style.left = `${link.x}%`;
    beam.style.top = `${link.y}%`;
    beam.style.width = `${link.width}%`;
    beam.style.opacity = `${link.opacity}`;
    beam.style.transform = `rotate(${link.angle}deg)`;
    layer.append(beam);
  });

  ATMOSPHERE_DOTS.forEach((dot) => {
    const node = document.createElement('span');
    node.className = `tools-home-atmosphere-dot is-${dot.variant}`;
    node.style.left = `${dot.x}%`;
    node.style.top = `${dot.y}%`;
    node.style.width = `${dot.size}px`;
    node.style.height = `${dot.size}px`;
    node.style.setProperty('--drift-x', `${dot.dx}px`);
    node.style.setProperty('--drift-y', `${dot.dy}px`);
    node.style.animationDelay = dot.delay;
    node.style.animationDuration = dot.duration;
    layer.append(node);
  });

  ['one', 'two', 'three'].forEach((variant) => {
    const glow = document.createElement('span');
    glow.className = `tools-home-atmosphere-glow is-${variant}`;
    layer.append(glow);
  });

  return layer;
}

function buildHero(row) {
  const [, eyebrowCell, titleCell, bodyCell] = getRowCells(row);
  const section = document.createElement('section');
  section.className = 'tools-home-hero';

  const eyebrow = getText(eyebrowCell);
  const title = getText(titleCell);
  const bodyHtml = cloneContentWithoutLinks(bodyCell);

  if (eyebrow) {
    const kicker = document.createElement('p');
    kicker.className = 'tools-home-eyebrow';
    kicker.textContent = eyebrow;
    section.append(kicker);
  }

  if (title) {
    const heading = document.createElement('h1');
    heading.textContent = title;
    section.append(heading);
  }

  appendRichText(section, bodyHtml, 'tools-home-subtitle');
  return section;
}

function buildPrimary(row) {
  const [, kickerCell, titleCell, bodyCell] = getRowCells(row);
  const section = document.createElement('section');
  section.className = 'tools-home-primary';

  const copy = document.createElement('div');
  copy.className = 'tools-home-primary-copy';

  const kicker = getText(kickerCell);
  const title = getText(titleCell);
  const bodyHtml = cloneContentWithoutLinks(bodyCell);
  const links = collectLinks(bodyCell);

  if (kicker) {
    const label = document.createElement('p');
    label.className = 'tools-home-kicker';
    label.textContent = kicker;
    copy.append(label);
  }

  if (title) {
    const heading = document.createElement('h2');
    heading.textContent = title;
    copy.append(heading);
  }

  appendRichText(copy, bodyHtml, 'tools-home-body');

  section.append(copy);

  const actions = buildLinkList(links, 'tools-home-primary-actions');
  if (actions) {
    section.append(actions);
  }

  return section;
}

function buildCard(row) {
  const [, kickerCell, titleCell, bodyCell] = getRowCells(row);
  const article = document.createElement('article');
  article.className = 'tools-home-card';

  const kicker = getText(kickerCell);
  const title = getText(titleCell);
  const bodyHtml = cloneContentWithoutLinks(bodyCell);
  const links = collectLinks(bodyCell);

  if (kicker) {
    const label = document.createElement('p');
    label.className = 'tools-home-kicker';
    label.textContent = kicker;
    article.append(label);
  }

  if (title) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    article.append(heading);
  }

  appendRichText(article, bodyHtml, 'tools-home-body');

  const actions = buildLinkList(links, 'tools-home-card-links');
  if (actions) {
    article.append(actions);
  }

  return article;
}

function buildNote(row) {
  const [, kickerCell, titleCell, bodyCell] = getRowCells(row);
  const section = document.createElement('section');
  section.className = 'tools-home-note';

  const kicker = getText(kickerCell);
  const title = getText(titleCell);
  const bodyHtml = cloneContentWithoutLinks(bodyCell);
  const links = collectLinks(bodyCell);

  if (kicker) {
    const label = document.createElement('p');
    label.className = 'tools-home-kicker';
    label.textContent = kicker;
    section.append(label);
  }

  if (title) {
    const heading = document.createElement('h2');
    heading.textContent = title;
    section.append(heading);
  }

  appendRichText(section, bodyHtml, 'tools-home-body');

  const actions = buildLinkList(links, 'tools-home-card-links');
  if (actions) {
    section.append(actions);
  }

  return section;
}

export default function decorate(block) {
  const section = block.closest('.section');
  section?.classList.add('tools-home-section');

  const shell = document.createElement('div');
  shell.className = 'tools-home-shell';
  shell.append(buildAtmosphere());

  const cards = document.createElement('div');
  cards.className = 'tools-home-card-grid';
  const trailingSections = [];

  [...block.children].forEach((row) => {
    const type = getRowType(row.firstElementChild);

    if (type === 'hero') {
      shell.append(buildHero(row));
    } else if (type === 'primary') {
      shell.append(buildPrimary(row));
    } else if (type === 'card') {
      cards.append(buildCard(row));
    } else if (type === 'note') {
      trailingSections.push(buildNote(row));
    }
  });

  if (cards.childElementCount) {
    shell.append(cards);
  }

  trailingSections.forEach((note) => shell.append(note));

  block.replaceChildren(shell);
}
