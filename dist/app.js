const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.primary-nav');
const dialog = document.querySelector('.detail-dialog');
const dialogTitle = document.querySelector('#dialog-title');
const dialogEyebrow = document.querySelector('#dialog-eyebrow');
const dialogContent = document.querySelector('#dialog-content');
let returnFocus = null;

function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  navigation.classList.remove('is-open');
}

menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('is-open', open);
});

navigation.addEventListener('click', event => {
  if (event.target.closest('a')) closeMenu();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});

matchMedia('(min-width: 901px)').addEventListener('change', closeMenu);

const details = {
  philosophy: { title: '私たちの家づくり', eyebrow: 'OUR PHILOSOPHY', source: '.philosophy-body', image: 'philosophy-dining.png' },
  craft: { title: '家づくりのこだわり', eyebrow: 'OUR CRAFT', source: '.craft-list', image: 'craft-workshop.png' },
  'work-natural': { title: '木のぬくもりと、暮らす。', eyebrow: 'OUR WORKS', source: '#work-natural', image: 'work-natural.png' },
  'work-light': { title: '窓の向こうに、季節を感じる。', eyebrow: 'OUR WORKS', source: '#work-light', image: 'work-light.png' },
  'work-renovation': { title: '受け継ぐ住まい、新しい日々。', eyebrow: 'OUR WORKS', source: '#work-renovation', image: 'work-renovation.png' },
  'open-house': { title: '完成見学会', eyebrow: 'OPEN HOUSE', source: '.event-main .event-copy', image: 'event-open-house.png' },
  consultation: { title: '家づくり相談会', eyebrow: 'CONSULTATION', source: '.event-sub .event-copy', image: 'event-consultation.png' },
  news: { title: '完成見学会「木のぬくもりと暮らす家」のご案内', eyebrow: '2026.06.12', source: '.event-main .event-copy', image: 'event-open-house.png' },
  'news-list': { title: 'お知らせ', eyebrow: 'NEWS', source: '.news-list' },
  'works-list': { title: '施工事例', eyebrow: 'OUR WORKS', source: '.works-grid' },
  story: { title: '木和工務店ストーリー', eyebrow: 'OUR STORY', text: '木のぬくもりを、暮らしの真ん中に。', note: 'ストーリーの詳細は準備中です。' },
  about: { title: '木和工務店について', eyebrow: 'ABOUT US', text: 'KIWA KOMUTEN · SINCE 1985', note: '会社情報の詳細は準備中です。' },
  blog: { title: 'ブログ', eyebrow: 'JOURNAL', text: '記事は準備中です。' },
  recruit: { title: '採用情報', eyebrow: 'RECRUIT', text: '採用情報は準備中です。' },
  contact: { title: 'お問い合わせ', eyebrow: 'CONTACT', text: '設計・施工のご相談、お見積りに関することなど、どうぞお気軽にお問い合わせください。', note: 'お問い合わせ窓口は準備中です。電話番号・受付時間が決まり次第、ご案内いたします。' },
  privacy: { title: 'プライバシーポリシー', eyebrow: 'PRIVACY POLICY', text: 'プライバシーポリシーは準備中です。' }
};

function appendParagraph(text) {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  dialogContent.append(paragraph);
}

function openDetail(key, trigger) {
  const detail = details[key];
  if (!detail) return;
  if (!dialog.open) returnFocus = trigger;
  dialogTitle.textContent = detail.title;
  dialogEyebrow.textContent = detail.eyebrow;
  dialogContent.replaceChildren();

  if (detail.image) {
    const image = document.createElement('img');
    image.src = `assets/${detail.image}`;
    image.alt = detail.title;
    dialogContent.append(image);
  }
  if (detail.source) {
    const copy = document.querySelector(detail.source).cloneNode(true);
    // Keep only content, avoiding duplicated IDs and page-specific layout in the dialog.
    copy.querySelectorAll('.photo, .text-link, .craft-number, .event-label').forEach(node => node.remove());
    [copy, ...copy.querySelectorAll('*')].forEach(node => {
      node.removeAttribute('id');
      node.removeAttribute('class');
      node.removeAttribute('data-reveal');
    });
    if (key === 'works-list') {
      copy.querySelectorAll('article').forEach((article, index) => {
        const link = document.createElement('a');
        link.href = '#contact';
        link.dataset.scrollContact = '';
        link.textContent = 'この住まいについて相談する';
        article.append(link);
        if (index) article.style.marginTop = '36px';
      });
    }
    dialogContent.append(copy);
  }
  if (detail.text) appendParagraph(detail.text);
  if (detail.note) appendParagraph(detail.note);
  if (['open-house', 'consultation', 'news'].includes(key)) {
    appendParagraph('開催日時・会場の詳細は準備中です。');
  }
  if (!dialog.open) dialog.showModal();
  else dialog.scrollTop = 0;
  document.body.classList.add('dialog-open');
}

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-dialog]');
  if (!trigger || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openDetail(trigger.dataset.dialog, trigger);
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }
  if (event.target.closest('[data-scroll-contact]')) dialog.close();
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('dialog-open');
  if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
  else if (menuButton.getClientRects().length) menuButton.focus({ preventScroll: true });
});

// Scroll reveals are progressive: content stays visible without JS or observation support.
function initScrollReveals() {
  const elements = [...document.querySelectorAll('[data-reveal]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

  let observer;
  function reveal(element, immediate = false) {
    if (immediate) element.classList.add('is-reveal-immediate');
    element.classList.remove('is-reveal-pending');
    observer?.unobserve(element);
    if (immediate) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        element.classList.remove('is-reveal-immediate');
      }));
    }
  }
  function revealAll() {
    observer?.disconnect();
    elements.forEach(element => reveal(element, true));
  }

  try {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) reveal(entry.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

    for (const element of elements) {
      element.classList.add('is-reveal-pending');
      observer.observe(element);
    }
  } catch {
    revealAll();
    return;
  }

  // Keyboard navigation, printing, and preference changes must never hide content.
  document.addEventListener('focusin', event => {
    let element = event.target.closest('[data-reveal]');
    while (element) {
      reveal(element, true);
      element = element.parentElement?.closest('[data-reveal]');
    }
  });
  reducedMotion.addEventListener('change', event => {
    if (event.matches) revealAll();
  });
  window.addEventListener('beforeprint', revealAll);
}

initScrollReveals();
