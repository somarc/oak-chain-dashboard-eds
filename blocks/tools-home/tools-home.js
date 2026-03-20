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
