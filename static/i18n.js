(() => {
  // Detect page
  const path = location.pathname;
  const page =
    /techniques\.html$/i.test(path) ? "techniques" :
    /guide\.html$/i.test(path)      ? "guide" :
    "index";

  // Urdu translations mapped to CSS selectors
  const UR = {
    // ===== index.html =====
    index: {
      'header .nav a[href="index.html"]': 'صفحہ اول',
      'header .nav a[href="techniques.html"]': 'طریقے',
      'header .nav a[href="guide.html"]': 'رہنمائی',
      // FIX: match actual link (educator.html, not education.html)
      'header .nav a[href="educator.html"]': 'سمیلیٹر',

      '.hero h1': 'شہری پاکستان کے لیے ہائیڈروپونکس',
      '.hero .tagline':
        'کم پانی اور کم جگہ میں تازہ غذا اُگائیں — وہیں جہاں لوگ رہتے ہیں۔ ہائیڈروپونکس میں مٹی کے بغیر نباتات کی جڑوں تک غذائی محلول گردش کر کے پہنچایا جاتا ہے۔ پانی بار بار استعمال ہونے اور درست مقدار میں پہنچنے کی وجہ سے روایتی کھیتی کے مقابلے میں پانی کی کھپت تقریباً 90٪ تک کم ہو سکتی ہے۔',

      '.cards .card:nth-of-type(1) h2': 'پاکستان کو ہائیڈروپونکس کی کیوں ضرورت ہے؟',
      '.cards .card:nth-of-type(1) li:nth-of-type(1)':
        'شدید آبی دباؤ: فی کس پانی 1951 میں 5,000 م³ سے کم ہو کر 2005 تک 1,000 م³ سے نیچے جا چکا ہے اور اب 500 م³ (انتہائی کمی) سے بھی کم ہونے کا خدشہ ہے۔ ذخیرہ بھی محدود ہے (~159 م³ فی کس، سالانہ بہاؤ کا ~10٪ بمقابلہ عالمی ~40٪)۔',
      '.cards .card:nth-of-type(1) li:nth-of-type(2)':
        'شہری پانی کی رسائی گھٹ رہی ہے: شہروں میں پائپڈ واٹر 62٪ (2006–07) سے کم ہو کر ~36٪ (2019–20) رہ گیا — لوگ غیرمحفوظ/مہنگے ذرائع پر انحصار کرتے ہیں۔',
      '.cards .card:nth-of-type(1) li:nth-of-type(3)':
        'شہروں کے اندر زرعی زمین سکڑ رہی ہے: لاہور و کراچی میں کاشت شدہ رقبہ رہائش کے پھیلاؤ سے کم ہوا؛ خوراک دور دراز سے آتی ہے اور عدم استحکام بڑھتا ہے۔',
      '.cards .card:nth-of-type(1) li:nth-of-type(4)':
        'گرمی اور آلودگی: شہری حرارت کا اثر لاہور میں ~3.7°C اور کراچی میں ~3.9°C تک اضافہ دکھاتا ہے؛ اندرونی کنٹرولڈ پیداوار زیادہ مزاحم ہے۔',

      '.cards .card:nth-of-type(2) h2': 'ہائیڈروپونکس کیسے مدد دیتا ہے',
      '.cards .card:nth-of-type(2) li:nth-of-type(1)':
        'پانی کی بچت: بند نظام پانی کو دوبارہ گردش کرتا ہے — مٹی والی زراعت کے مقابلے میں ~90٪ تک کم استعمال۔',
      '.cards .card:nth-of-type(2) li:nth-of-type(2)':
        'جگہ کی بچت: چھتیں، بالکنی، کمروں میں بھی ممکن؛ عمودی ریک فی مربع میٹر پیداوار بڑھاتے ہیں۔',
      '.cards .card:nth-of-type(2) li:nth-of-type(3)':
        'علاقائی و مضبوط: شہری توسیع سے کھوئی ہوئی کچھ پیداوار واپس، اور گرمی/سموگ کے دنوں میں بھی تسلسل۔',

      '.cards .card:nth-of-type(3) h2': 'لوگ تیار ہیں — بس رہنمائی درکار ہے',
      '.cards .card:nth-of-type(3) p:first-of-type':
        'لاہور کی تحقیق بتاتی ہے کہ شہری لوگ اپنانے کے خواہش مند ہیں، مگر عملی طور پر رکاوٹیں (تربیت، جگہ/وقت، وسائل) ہیں — اس لیے سادہ تعلیمی اوزار اور ہاتھ پکڑ کر رہنمائی ضروری ہے۔',
      '.cards .card:nth-of-type(3) a.cta': 'طریقے دیکھیں',

      'a.cta[href="educator.html"]': 'سیمیولیٹر شروع کریں',
      'footer.site-footer p': '© 2025 شہری پاکستان کے لیے ہائیڈروپونکس'
    },

    // ===== techniques.html =====
    techniques: {
      'header .nav a[href="index.html"]': 'صفحہ اول',
      'header .nav a[href="techniques.html"]': 'طریقے',
      'header .nav a[href="guide.html"]': 'رہنمائی',
      // FIX: educator.html
      'header .nav a[href="educator.html"]': 'سمیلیٹر',

      '.hero.small h1': 'طریقے',
      '.hero.small .tagline':
        'طرائق کی کئی اقسام ہیں (کراتکی، ڈی ڈبلیو سی، این ایف ٹی، ایب اینڈ فلو، ڈرِپ) — لیکن روزمرہ چلانے کا انداز عموماً دو طریقوں میں آتا ہے، یا دونوں کا مرکب ہوتا ہے۔',

      '.cards.two .card:nth-of-type(1) h2': 'روایتی',
      '.cards.two .card:nth-of-type(1) p':
        'یہ نظام ہاتھ سے چلتے ہیں: EC، pH، پانی کی سطح، درجۂ حرارت، نمی اور روشنی کے گھنٹے چیک کریں، پھر ضروری تبدیلی کریں (نیوٹریئنٹس، pH اپ/ڈاؤن، ٹاپ اپ، لائٹس)۔',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(1)': 'کم خرچ — سیکھنے اور چھوٹے سیٹ اپ کے لیے بہترین۔',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(2)': 'سادہ پی وی سی پائپ + پمپ + ریزروائر سے کام چل جاتا ہے۔',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(3)': 'روٹین दरکار (مثلاً ہر 6 گھنٹے بعد مختصر چیک)۔',

      '.cards.two .card:nth-of-type(2) h2': 'اسمارٹ',
      '.cards.two .card:nth-of-type(2) p':
        'یہ نظام خودکار ہوتے ہیں: سینسرز (EC، pH، درجۂ حرارت/نمی، پانی کی سطح، گرو لائٹ) اور کنٹرولر (مثلاً ESP32)؛ ڈوزنگ/ٹاپ اپ خود، فین/لائٹ کنٹرول اور موبائل نوٹیفکیشن۔',
      '.cards.two .card:nth-of-type(2) li:nth-of-type(1)': 'زیادہ مستحکم نتائج — مکمل آٹومیشن۔',
      '.cards.two .card:nth-of-type(2) li:nth-of-type(2)': 'گرمی کے اتار چڑھاؤ اور مصروف شیڈول کے لیے موزوں۔',

      '.cards.two .card:nth-of-type(3) h2': 'ہائبرڈ',
      '.cards.two .card:nth-of-type(3) p':
        'دونوں کا امتزاج: مثلاً EC/pH ہاتھ سے مگر لائٹنگ خودکار، یا دستی چیک کے ساتھ پانی کی سطح کی نگرانی — جتنی آٹومیشن چاہیں۔',
      '.cards.two .card:nth-of-type(3) li:nth-of-type(1)': 'کم لاگت۔',
      '.cards.two .card:nth-of-type(3) li:nth-of-type(2)': 'لچک — کم نگرانی درکار۔',

      'section.card h2': 'کیا دیکھتے رہیں',
      '.pill-row .pill:nth-of-type(1)': 'EC',
      '.pill-row .pill:nth-of-type(2)': 'pH',
      '.pill-row .pill:nth-of-type(3)': 'پانی کی سطح',
      '.pill-row .pill:nth-of-type(4)': 'درجۂ حرارت',
      '.pill-row .pill:nth-of-type(5)': 'نمی',
      '.pill-row .pill:nth-of-type(6)': 'روشنی کے گھنٹے',
      'section.card .note':
        'ہر فصل کے مطابق EC/pH حد کے اندر رکھیں، جڑوں کو آکسیجن ملتی رہے، اور روزانہ روشنی کے درکار گھنٹے پورے کریں۔',
      'section.card a.cta[href="guide.html"]': 'سیمیولیٹر کیسے کام کرتا ہے — دیکھیں',

      'footer.site-footer p': '© 2025 شہری پاکستان کے لیے ہائیڈروپونکس'
    },

    // ===== guide.html =====
    guide: {
      'header .nav a[href="index.html"]': 'صفحہ اول',
      'header .nav a[href="techniques.html"]': 'طریقے',
      'header .nav a[href="guide.html"]': 'رہنمائی',
      // FIX: educator.html
      'header .nav a[href="educator.html"]': 'سمیلیٹر',

      '.hero.small h1': 'سیمیولیٹر کیسے کام کرتا ہے',
      '.hero.small .tagline': '2 منٹ کی رہنمائی: آپ کیا کنٹرول کرتے ہیں، کیوں اہم ہے، اور اچھے نتائج کیسے ملتے ہیں۔',

      /* Quick Guide (first .card section) */
      'section.card:nth-of-type(2) h2': 'فوری رہنمائی',
      'section.card:nth-of-type(2) ol.list li:nth-of-type(1)':
        '<strong>شہر، مہینہ اور فصل منتخب کریں:</strong> منتخب شہر/مہینے کا مقامی موسم (درجۂ حرارت، نمی، دن کی روشنی) اور فصل کی آئیڈیل حدیں (EC، pH، درجۂ حرارت، نمی، روشنی) لوڈ ہوتی ہیں۔',
      'section.card:nth-of-type(2) ol.list li:nth-of-type(2)':
        '<strong>اسٹارٹ دبائیں:</strong> سیمیولیشن شروع ہو جاتی ہے۔',
      'section.card:nth-of-type(2) ol.list li:nth-of-type(3)':
        '<strong>پرومپٹس پر عمل کریں:</strong> اگر EC، pH، نمی، درجۂ حرارت، پانی یا روشنی گھنٹے حد سے باہر جائیں تو “Actions Required” میں وارننگ آتی ہے — ایک ٹیپ سے حل کریں۔',
      'section.card:nth-of-type(2) ol.list li:nth-of-type(4)':
        '<strong>لائیو ڈیش بورڈ:</strong> ڈیش بورڈ میں دن، گھنٹہ، اسٹیج، پانی، EC، pH وغیرہ سب نظر آتا ہے۔',
      'section.card:nth-of-type(2) ol.list li:nth-of-type(5)':
        '<strong>تعلیمی فیڈبیک:</strong> وارننگ مس ہونے پر ہیلتھ میں ہلکی کٹوتی ہوتی ہے (سیکھنے کی غرض سے)۔ بروقت ایکشن پر تعریف/ایکرنالجمنٹ ملتی ہے۔',

      /* Learning Outcomes & Control Panel */
      '.cards.two .card:nth-of-type(1) h2': 'آپ کیا سیکھتے ہیں',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(1)': '<strong>پانی کی سطح</strong> — روٹس خشک نہ ہوں، ٹاپ اپ رکھیں۔',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(2)': '<strong>EC (غذائیت)</strong> — نارملائز کریں تاکہ خوراک متوازن رہے۔',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(3)': '<strong>pH</strong> — ڈرفٹ معمول ہے؛ محفوظ حد میں واپس لائیں۔',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(4)': '<strong>درجۂ حرارت</strong> — گرمی/ٹھنڈ کو شیڈ/انڈور یا سن لائٹ سے مینج کریں۔',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(5)': '<strong>نمی</strong> — بڑھانے کو سپرے، کم کرنے کو ڈیہیومیڈیفائی۔',
      '.cards.two .card:nth-of-type(1) li:nth-of-type(6)': '<strong>روشنی کے گھنٹے</strong> — سورج + گرو لائٹ سے روزانہ ضرورت پوری کریں۔',

      '.cards.two .card:nth-of-type(2) h2': 'کنٹرول پینل',
      '.cards.two .card:nth-of-type(2) li:nth-of-type(1)':
        '<strong>بائیں کنٹرولز:</strong> لائٹ، EC نارملائز، pH نارملائز، کولنگ — وارننگ پر ایک ٹیپ۔',
      '.cards.two .card:nth-of-type(2) li:nth-of-type(2)':
        '<strong>دائیں کنٹرولز:</strong> پانی بھریں، ڈیہیومیڈیفائی، پانی چھڑکیں، ہیٹنگ — وارننگ پر ایک ٹیپ۔',

      /* Prompts & Yield */
      'section.card:nth-of-type(4) h2': 'پرومپٹس، صحت اور پیداوار',
      'section.card:nth-of-type(4) li:nth-of-type(1)':
        '<strong>پرومپٹس</strong> صرف تب آتی ہیں جب ایکشن درکار ہو (مثلاً “Normalize pH”)۔',
      'section.card:nth-of-type(4) li:nth-of-type(2)':
        '<strong>مسڈ پرومپٹس</strong> پر ہیلتھ میں ہلکی کٹوتی — فوری توجہ سکھانے کے لیے۔',
      'section.card:nth-of-type(4) li:nth-of-type(3)':
        '<strong>اختتام:</strong> آخری اسٹیج پر فصل کی حتمی صحت کی بنیاد پر اندازاً پیداوار دکھائی جاتی ہے۔',

      /* Scenario */
      '.cards.three .card h2': 'سینیریو — کراچی میں جولائی کے مہینے میں چیری ٹماٹر',
      '.cards.three .card p':
        'کراچی کا جولائی گرم اور نم ہوتا ہے۔ یہ مثال دکھاتی ہے کہ حرارت/نمی کو کیسے سنبھالیں۔',
      '.cards.three .card h3': 'کیا توقع رکھیں',
      '.cards.three .card li:nth-of-type(1)':
        '<strong>کبھی کبھار ڈیہیومیڈیفائی:</strong> نم گھٹن نمی حد سے اوپر لے جا سکتی ہے۔',
      '.cards.three .card li:nth-of-type(2)':
        '<strong>فصل کو ٹھنڈا رکھیں:</strong> اگر درجۂ حرارت بڑھ جائے تو “Cooling” استعمال کریں۔',

      /* Limitations */
      'section.card:nth-of-type(6) h2': 'حدود اور ڈیزائن کے فیصلے',
      'section.card:nth-of-type(6) li:nth-of-type(1)':
        '<strong>سب سے حقیقت پسند نہیں:</strong> جان بوجھ کر سادہ رکھا گیا ہے تاکہ ہر شہری صارف (انگریزی/اردو، تعلیم یافتہ/غیر تعلیم یافتہ) سیکھ سکے۔',
      'section.card:nth-of-type(6) li:nth-of-type(2)':
        '<strong>لرننگ فرسٹ:</strong> مقصد بنیادی عادات سکھانا ہے — پانی بھرنا، EC/pH نارملائز، روشنی و درجۂ حرارت مینج — بغیر اوورویلمنگ کیے۔',
      'section.card:nth-of-type(6) li:nth-of-type(3)':
        '<strong>حقیقی ہارڈویئر نہیں:</strong> یہ صرف تعلیمی سیمیولیٹر ہے؛ مستقبل میں ESP32 وغیرہ کے ساتھ جوڑا جا سکتا ہے۔',
      'section.card:nth-of-type(6) li:nth-of-type(4)':
        '<strong>عین فزکس نہیں:</strong> سادہ مساوات سے رویّہ دکھایا جاتا ہے: EC گھٹتا، pH ڈرفٹ کرتا، پانی کم ہوتا، درجۂ حرارت/نمی بدلتی ہے۔',
      'section.card:nth-of-type(6) li:nth-of-type(5)':
        '<strong>مستقبل کے لیے تیار:</strong> بعد میں بہتر فصل ماڈلز، ڈوزنگ الگورتھمز، موسم APIs اور ڈیوائس انٹیگریشن شامل کر سکتے ہیں۔',
      // Two CTAs in this section: provide an ARRAY in DOM order (simulator first, then survey)
      'section.card:nth-of-type(6) a.cta': ['سیمیولیٹر شروع کریں', 'سروے میں شرکت کریں'],

      'footer.site-footer p': '© 2025 شہری پاکستان کے لیے ہائیڈروپونکس'
    }
  };

  // Save originals so we can restore on English
  const ORIGINAL = {};
  function saveOriginal(selectors) {
    selectors.forEach(sel => {
      const nodes = document.querySelectorAll(sel);
      if (!nodes.length) return;
      ORIGINAL[sel] = Array.from(nodes).map(el => el.innerHTML);
    });
  }

  // Apply a translation map
  function applyMap(map) {
    Object.entries(map).forEach(([sel, val]) => {
      document.querySelectorAll(sel).forEach((el, i) => {
        const txt = Array.isArray(val) ? (val[i] ?? val[0]) : val;
        if (txt != null) el.innerHTML = txt;
      });
    });
  }

  // Inject minimal CSS so the toggle sits in-line in the navbar and RTL looks neat
  function injectStyle() {
    if (document.getElementById('lang-toggle-style')) return;
    const style = document.createElement('style');
    style.id = 'lang-toggle-style';
    style.textContent = `
      header .nav{display:flex;gap:1rem;align-items:center}
      #lang-toggle{margin-inline-start:auto;padding:.35rem .65rem;border:1px solid #ddd;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
      html[dir="rtl"] body{direction:rtl}
      html[dir="rtl"] .hero,html[dir="rtl"] .cards,html[dir="rtl"] .card{text-align:right}
      html[dir="rtl"] .list{padding-right:1.25rem;padding-left:0}
    `;
    document.head.appendChild(style);
  }

  function applyUrdu(btn) {
    document.documentElement.lang = 'ur';
    document.documentElement.dir = 'rtl';
    document.body.classList.add('rtl');
    applyMap(UR[page] || {});
    if (btn) btn.textContent = 'English';
  }

  function applyEnglish(btn) {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    document.body.classList.remove('rtl');
    Object.entries(ORIGINAL).forEach(([sel, arr]) => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (arr[i] !== undefined) el.innerHTML = arr[i];
      });
    });
    if (btn) btn.textContent = 'اردو';
  }

  // Put the toggle INSIDE the navbar, aligned in-line
  function mountToggleInNav() {
    const nav = document.querySelector('header .nav');
    const btn = document.createElement('button');
    btn.id = 'lang-toggle';
    btn.type = 'button';
    nav.appendChild(btn);
    btn.addEventListener('click', () => {
      const next = (localStorage.getItem('lang') === 'ur') ? 'en' : 'ur';
      localStorage.setItem('lang', next);
      if (next === 'ur') applyUrdu(btn); else applyEnglish(btn);
    });
    return btn;
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectStyle();
    const sels = Object.keys(UR[page] || {});
    saveOriginal(sels);
    const btn = mountToggleInNav();
    const saved = localStorage.getItem('lang') || 'en';
    if (saved === 'ur') applyUrdu(btn); else applyEnglish(btn);
  });
})();
