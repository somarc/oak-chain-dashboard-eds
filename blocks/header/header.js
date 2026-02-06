import { getMetadata } from '../../scripts/aem.js';
import { getOpsRuntimeConfig } from '../../scripts/ops-runtime-config.js';
import { loadFragment } from '../fragment/fragment.js';

// media query match that indicates mobile/tablet width
const isDesktop = window.matchMedia('(min-width: 900px)');

function closeOnEscape(e) {
  if (e.code === 'Escape') {
    const nav = document.getElementById('nav');
    const navSections = nav.querySelector('.nav-sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections);
      navSectionExpanded.focus();
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections);
      nav.querySelector('button').focus();
    }
  }
}

function closeOnFocusLost(e) {
  const nav = e.currentTarget;
  if (!nav.contains(e.relatedTarget)) {
    const navSections = nav.querySelector('.nav-sections');
    if (!navSections) return;
    const navSectionExpanded = navSections.querySelector('[aria-expanded="true"]');
    if (navSectionExpanded && isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleAllNavSections(navSections, false);
    } else if (!isDesktop.matches) {
      // eslint-disable-next-line no-use-before-define
      toggleMenu(nav, navSections, false);
    }
  }
}

function openOnKeydown(e) {
  const focused = document.activeElement;
  const isNavDrop = focused.className === 'nav-drop';
  if (isNavDrop && (e.code === 'Enter' || e.code === 'Space')) {
    const dropExpanded = focused.getAttribute('aria-expanded') === 'true';
    // eslint-disable-next-line no-use-before-define
    toggleAllNavSections(focused.closest('.nav-sections'));
    focused.setAttribute('aria-expanded', dropExpanded ? 'false' : 'true');
  }
}

function focusNavSection() {
  document.activeElement.addEventListener('keydown', openOnKeydown);
}

function buildUrl(base, path) {
  if (!path) return null;
  const normalizedBase = (base || '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function unwrapEnvelope(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function shortWallet(wallet) {
  if (!wallet || typeof wallet !== 'string') return 'unknown';
  if (wallet.length <= 18) return wallet;
  return `${wallet.slice(0, 10)}...${wallet.slice(-8)}`;
}

function buildBrand(navBrand) {
  const existingLink = navBrand.querySelector('a');
  const href = existingLink ? existingLink.getAttribute('href') : '/';

  navBrand.textContent = '';

  const link = document.createElement('a');
  link.className = 'nav-brand-link';
  link.href = href || '/';
  link.setAttribute('aria-label', 'Blockchain AEM home');

  const icon = document.createElement('span');
  icon.className = 'nav-brand-icon';
  icon.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  `;

  const text = document.createElement('span');
  text.className = 'nav-brand-text';

  const titleRow = document.createElement('span');
  titleRow.className = 'nav-brand-title-row';

  const title = document.createElement('span');
  title.className = 'nav-brand-title';
  title.innerHTML = 'Blockchain <span>AEM</span>';

  const subtitle = document.createElement('span');
  subtitle.className = 'nav-brand-subtitle';
  subtitle.textContent = 'Global P2P Oak Repository';

  titleRow.append(title);
  text.append(titleRow, subtitle);
  link.append(icon, text);
  navBrand.append(link);

  return {
    title,
    subtitle,
  };
}

function createChip(label) {
  const chip = document.createElement('span');
  chip.className = 'nav-status-chip';
  chip.textContent = label;
  return chip;
}

function buildOpsStatus(navTools) {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-status-row';

  const validator = createChip('Validator n/a');
  const ipfs = createChip('IPFS n/a');
  const mode = createChip('Mode n/a');
  const wallet = createChip('Wallet n/a');
  const network = createChip('Network n/a');

  wrapper.append(validator, ipfs, mode, wallet, network);

  navTools.textContent = '';
  navTools.append(wrapper);

  return {
    validator,
    ipfs,
    mode,
    wallet,
    network,
  };
}

function applyHeaderData(data, refs) {
  const payload = data || {};
  const validator = payload.validator || {};
  const ipfs = payload.ipfs || {};

  const nodeId = validator.nodeId !== undefined ? validator.nodeId : 'n/a';
  const role = String(validator.role || '').toUpperCase() || 'UNKNOWN';
  const mode = String(payload.mode || 'unknown').toLowerCase();

  refs.brand.subtitle.textContent = payload.subtitle || 'Global P2P Oak Repository';
  refs.chips.validator.textContent = `Validator ${nodeId} ${role}`;

  refs.chips.ipfs.textContent = `IPFS ${String(ipfs.daemonStatus || 'n/a').toUpperCase()}`;
  refs.chips.mode.textContent = `Mode ${mode}`;
  refs.chips.wallet.textContent = `Wallet ${payload.clusterWalletShort || shortWallet(payload.clusterWallet)}`;
  refs.chips.network.textContent = `Network ${String(payload.networkStatus || 'unknown').toUpperCase()}`;

  refs.chips.mode.classList.remove('is-mode-mock', 'is-mode-sepolia', 'is-mode-mainnet');
  if (mode === 'mock') refs.chips.mode.classList.add('is-mode-mock');
  if (mode === 'sepolia') refs.chips.mode.classList.add('is-mode-sepolia');
  if (mode === 'mainnet') refs.chips.mode.classList.add('is-mode-mainnet');

  refs.chips.ipfs.classList.remove('is-up', 'is-down');
  if (String(ipfs.daemonStatus || '').toUpperCase() === 'UP') {
    refs.chips.ipfs.classList.add('is-up');
  } else if (String(ipfs.daemonStatus || '').toUpperCase() === 'DOWN') {
    refs.chips.ipfs.classList.add('is-down');
  }

  refs.chips.validator.classList.remove('is-role-leader', 'is-role-follower');
  if (role === 'LEADER') refs.chips.validator.classList.add('is-role-leader');
  if (role === 'FOLLOWER') refs.chips.validator.classList.add('is-role-follower');
}

async function refreshHeader({ baseUrl, endpoint, refs }) {
  const target = buildUrl(baseUrl, endpoint);
  if (!target) return;

  try {
    const response = await fetch(target, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = unwrapEnvelope(await response.json());
    applyHeaderData(payload, refs);
  } catch (_error) {
    applyHeaderData({
      subtitle: 'Global P2P Oak Repository',
      validator: { nodeId: 'n/a', role: 'UNKNOWN' },
      binaries: { type: 'n/a' },
      ipfs: { daemonStatus: 'DOWN' },
      mode: 'unknown',
      clusterWallet: 'unknown',
      networkStatus: 'down',
    }, refs);
  }
}

/**
 * Toggles all nav sections
 * @param {Element} sections The container element
 * @param {Boolean} expanded Whether the element should be expanded or collapsed
 */
function toggleAllNavSections(sections, expanded = false) {
  if (!sections) return;
  sections.querySelectorAll('.nav-sections .default-content-wrapper > ul > li').forEach((section) => {
    section.setAttribute('aria-expanded', expanded);
  });
}

/**
 * Toggles the entire nav
 * @param {Element} nav The container element
 * @param {Element} navSections The nav sections within the container element
 * @param {*} forceExpanded Optional param to force nav expand behavior when not null
 */
function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  document.body.style.overflowY = (expanded || isDesktop.matches) ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
  button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  // enable nav dropdown keyboard accessibility
  if (navSections) {
    const navDrops = navSections.querySelectorAll('.nav-drop');
    if (isDesktop.matches) {
      navDrops.forEach((drop) => {
        if (!drop.hasAttribute('tabindex')) {
          drop.setAttribute('tabindex', 0);
          drop.addEventListener('focus', focusNavSection);
        }
      });
    } else {
      navDrops.forEach((drop) => {
        drop.removeAttribute('tabindex');
        drop.removeEventListener('focus', focusNavSection);
      });
    }
  }

  // enable menu collapse on escape keypress
  if (!expanded || isDesktop.matches) {
    // collapse menu on escape press
    window.addEventListener('keydown', closeOnEscape);
    // collapse menu on focus lost
    nav.addEventListener('focusout', closeOnFocusLost);
  } else {
    window.removeEventListener('keydown', closeOnEscape);
    nav.removeEventListener('focusout', closeOnFocusLost);
  }
}

/**
 * loads and decorates the header, mainly the nav
 * @param {Element} block The header block element
 */
export default async function decorate(block) {
  const runtime = getOpsRuntimeConfig();
  const headerEndpoint = runtime.endpoints.header;
  const refreshSeconds = Number(runtime.refreshSeconds.header || 5);

  // load nav as fragment
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  // decorate nav DOM
  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  const classes = ['brand', 'sections', 'tools'];
  classes.forEach((c, i) => {
    const section = nav.children[i];
    if (section) section.classList.add(`nav-${c}`);
  });

  const navBrand = nav.querySelector('.nav-brand');
  const navTools = nav.querySelector('.nav-tools');
  const brandRefs = navBrand ? buildBrand(navBrand) : null;
  const chipRefs = navTools ? buildOpsStatus(navTools) : null;

  const navSections = nav.querySelector('.nav-sections');
  if (navSections) {
    navSections.remove();
  }

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  if (brandRefs && chipRefs) {
    const refs = { brand: brandRefs, chips: chipRefs };
    const tick = () => refreshHeader({ baseUrl: runtime.apiBase, endpoint: headerEndpoint, refs });
    tick();
    window.setInterval(tick, Math.max(1, refreshSeconds) * 1000);
  }
}
