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

const AEM_EVOLUTION_STEPS = [
  { index: '(1)', label: 'On-Prem' },
  { index: '(2)', label: 'Managed Services' },
  { index: '(3)', label: 'AEMaaCS' },
  { index: '(4)', label: 'AEM Edge Delivery' },
];

const PRIMARY_HIGHLIGHTS = [
  'Adaptive release flow',
  'Validator truth',
  'Signals and drift',
  'GC posture',
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

function buildEvolutionTrack() {
  const track = document.createElement('div');
  track.className = 'tools-home-hero-track';
  track.setAttribute('aria-label', 'AEM evolution track');

  const label = document.createElement('p');
  label.className = 'tools-home-hero-track-label';
  label.textContent = 'AEM Evolution';
  track.append(label);

  const list = document.createElement('div');
  list.className = 'tools-home-hero-track-list';
  list.setAttribute('role', 'list');

  AEM_EVOLUTION_STEPS.forEach((step) => {
    const item = document.createElement('div');
    item.className = 'tools-home-hero-step';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <span class="tools-home-hero-step-index">${step.index}</span>
      <span class="tools-home-hero-step-label">${step.label}</span>
    `;
    list.append(item);
  });

  track.append(list);

  const fifth = document.createElement('div');
  fifth.className = 'tools-home-hero-fifth';
  fifth.innerHTML = `
    <span class="tools-home-hero-step-index">(5)</span>
    <div class="tools-home-hero-fifth-copy">
      <p class="tools-home-hero-fifth-title">Blockchain AEM</p>
      <p class="tools-home-hero-fifth-body">The canonical shared Oak state layer that makes AEM durable, global, and verifiable.</p>
    </div>
  `;
  track.append(fifth);

  return track;
}

function buildPrimaryPreview() {
  const preview = document.createElement('div');
  preview.className = 'tools-home-primary-preview';
  preview.innerHTML = `
    <p class="tools-home-primary-preview-kicker">Inside Oak Ops</p>
    <div class="tools-home-primary-preview-grid">
      ${PRIMARY_HIGHLIGHTS.map((item) => `
        <span class="tools-home-primary-pill">${item}</span>
      `).join('')}
    </div>
    <p class="tools-home-primary-preview-note">The authored landing page introduces the platform. The real operator surfaces live under <code>/tools</code>.</p>
  `;
  return preview;
}

function buildCardIcon(kicker) {
  const icon = document.createElement('div');
  icon.className = 'tools-home-card-icon';
  const tone = kicker.toLowerCase();
  if (tone.includes('evolution')) {
    icon.innerHTML = '<svg viewBox="0 0 24 24" role="presentation"><path d="M12 3.5 19 7v10l-7 3.5L5 17V7l7-3.5Zm0 1.68L6.5 7.93v8.14l5.5 2.75 5.5-2.75V7.93L12 5.18Z"></path></svg>';
  } else if (tone.includes('truth') || tone.includes('control')) {
    icon.innerHTML = '<svg viewBox="0 0 24 24" role="presentation"><path d="M5 4h6v6H5V4Zm8 0h6v6h-6V4ZM5 12h6v8H5v-8Zm8 4h2.5v-4H13v4Zm4 0H19v-4h-2v4Zm-4 1.5v2h6v-2h-6Z"></path></svg>';
  } else {
    icon.innerHTML = '<svg viewBox="0 0 24 24" role="presentation"><path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z"></path></svg>';
  }
  return icon;
}

function buildHero(row) {
  const [, eyebrowCell, titleCell, bodyCell] = getRowCells(row);
  const section = document.createElement('section');
  section.className = 'tools-home-hero';
  const layout = document.createElement('div');
  layout.className = 'tools-home-hero-layout';

  const copy = document.createElement('div');
  copy.className = 'tools-home-hero-copy';

  const eyebrow = getText(eyebrowCell);
  const title = getText(titleCell);
  const bodyHtml = cloneContentWithoutLinks(bodyCell);

  if (eyebrow) {
    const kicker = document.createElement('p');
    kicker.className = 'tools-home-eyebrow';
    kicker.textContent = eyebrow;
    copy.append(kicker);
  }

  if (title) {
    const heading = document.createElement('h1');
    heading.textContent = title;
    copy.append(heading);
  }

  appendRichText(copy, bodyHtml, 'tools-home-subtitle');
  layout.append(copy, buildEvolutionTrack());
  section.append(layout);
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
  section.append(buildPrimaryPreview());

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
  article.append(buildCardIcon(kicker || title || 'card'));

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
