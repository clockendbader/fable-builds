/* Interface text in English and Arabic. Place names and facts live in data/places.js. */
window.I18N = {
  en: {
    title: 'Saudi Arabia',
    tagline: 'The Kingdom in 3D',
    introKicker: 'Real satellite imagery · Real terrain',
    introSub: 'Mountains, cliffs, dunes and 33 places to explore',
    introSkip: 'Click anywhere to skip',
    fullView: 'Full view',
    search: 'Search places',
    all: 'All',
    city: 'Cities',
    heritage: 'Heritage',
    nature: 'Nature',
    modern: 'Modern',
    typeOne: { city: 'City', heritage: 'Heritage', nature: 'Nature', modern: 'Modern' },
    count: n => n === 1 ? '1 place' : n + ' places',
    none: 'No place matches that search.',
    unesco: y => 'UNESCO World Heritage · ' + y,
    photo: 'Photo',
    source: 'Read more on Wikipedia',
    prev: 'Previous',
    next: 'Next',
    orbitPause: 'Pause',
    orbitPlay: 'Circle',
    close: 'Back to full view',
    hint: 'Drag to move · Right-drag or Ctrl + drag to rotate and tilt · Scroll to zoom',
    reliefAuto: 'Relief: enhanced',
    reliefTrue: 'Relief: true scale',
    hideList: 'Hide the list',
    showList: 'Show the list',
    credits: 'Credits and sources',
    lat: v => Math.abs(v).toFixed(4) + '° ' + (v >= 0 ? 'N' : 'S'),
    lng: v => Math.abs(v).toFixed(4) + '° ' + (v >= 0 ? 'E' : 'W'),
    attribution:
      'Imagery: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016</a> by EOX (CC BY 4.0) · ' +
      'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a> · ' +
      'Border: <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a> · ' +
      'Photos: <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> · ' +
      '<a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre</a> · ' +
      '<button type="button" data-open-credits>All credits</button>',
    creditsHtml: {
      heading: 'Credits and sources',
      intro: 'Everything on this map is real. Nothing is generated or invented.',
      mapHead: 'Map data',
      map: [
        '<b>Satellite imagery.</b> <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), licensed CC BY 4.0. Ground detail is 10 metres per pixel.',
        '<b>Terrain height.</b> <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a> hosted by AWS Open Data, built from SRTM (NASA, USGS), GMTED2010 (USGS) and ETOPO1 (NOAA). <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Full terrain attribution</a>. Sea areas are drawn flat at sea level.',
        '<b>Relief.</b> Heights are real. From far away they are stretched up to four times so the mountains read at country scale, easing to 1.5 times up close. The relief button switches to true scale.',
        '<b>Border.</b> <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a> 1:10m Admin 0 Countries, public domain.',
        '<b>Map engine.</b> <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre GL JS</a>, BSD-3-Clause. Typeface: IBM Plex Sans Arabic, SIL Open Font License.'
      ],
      factsHead: 'Facts and coordinates',
      facts: 'Facts come from the Wikipedia article linked in each panel. Coordinates were checked against Wikipedia, Wikidata and OpenStreetMap (© OpenStreetMap contributors).',
      photosHead: 'Photos',
      photos: 'All photos are from Wikimedia Commons. Author and licence are taken from each file\'s Commons page. Photos are shown resized and cropped to fit.',
      moveHead: 'Moving around',
      move: 'Drag to move. Right-drag or Ctrl + drag to rotate and tilt. Scroll to zoom. Esc returns to the full view. Arrow keys step through places.'
    }
  },
  ar: {
    title: 'المملكة العربية السعودية',
    tagline: 'خريطة ثلاثية الأبعاد',
    introKicker: 'صور أقمار صناعية حقيقية · تضاريس حقيقية',
    introSub: 'جبال وجروف وكثبان، و33 مكاناً تستكشفها',
    introSkip: 'انقر في أي مكان للتخطي',
    fullView: 'العرض الكامل',
    search: 'ابحث عن مكان',
    all: 'الكل',
    city: 'مدن',
    heritage: 'تراث',
    nature: 'طبيعة',
    modern: 'معالم حديثة',
    typeOne: { city: 'مدينة', heritage: 'تراث', nature: 'طبيعة', modern: 'معلم حديث' },
    count: n => n === 1 ? 'مكان واحد' : n === 2 ? 'مكانان' : n <= 10 ? n + ' أماكن' : n + ' مكاناً',
    none: 'لا يوجد مكان يطابق بحثك.',
    unesco: y => 'تراث عالمي · اليونسكو ' + y,
    photo: 'تصوير',
    source: 'اقرأ المزيد في ويكيبيديا',
    prev: 'السابق',
    next: 'التالي',
    orbitPause: 'إيقاف',
    orbitPlay: 'دوران',
    close: 'العودة إلى العرض الكامل',
    hint: 'اسحب للتحريك · اسحب بالزر الأيمن أو مع Ctrl للتدوير والإمالة · مرّر للتكبير',
    reliefAuto: 'التضاريس: مُبرَزة',
    reliefTrue: 'التضاريس: بحجمها الحقيقي',
    hideList: 'إخفاء القائمة',
    showList: 'إظهار القائمة',
    credits: 'المصادر والحقوق',
    lat: v => Math.abs(v).toFixed(4) + '° ' + (v >= 0 ? 'شمالاً' : 'جنوباً'),
    lng: v => Math.abs(v).toFixed(4) + '° ' + (v >= 0 ? 'شرقاً' : 'غرباً'),
    attribution:
      'الصور: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2016</a> من EOX (CC BY 4.0) · ' +
      'التضاريس: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a> · ' +
      'الحدود: <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a> · ' +
      'صور الأماكن: <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">ويكيميديا كومنز</a> · ' +
      '<a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre</a> · ' +
      '<button type="button" data-open-credits>كل المصادر</button>',
    creditsHtml: {
      heading: 'المصادر والحقوق',
      intro: 'كل ما في هذه الخريطة حقيقي. لا شيء فيها مولَّد أو مختلَق.',
      mapHead: 'بيانات الخريطة',
      map: [
        '<b>صور الأقمار الصناعية.</b> <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> من EOX IT Services GmbH (تحتوي على بيانات Copernicus Sentinel المعدَّلة لعام 2016)، برخصة CC BY 4.0. دقة التفاصيل 10 أمتار لكل بكسل.',
        '<b>الارتفاعات.</b> <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a> على AWS Open Data، مبنية على بيانات SRTM (ناسا وهيئة المساحة الجيولوجية الأمريكية) و GMTED2010 و ETOPO1. <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">حقوق بيانات التضاريس كاملة</a>. يُرسم البحر مسطحاً عند مستوى سطح البحر.',
        '<b>إبراز التضاريس.</b> الارتفاعات حقيقية. تُضاعَف حتى أربع مرات عند النظر من بعيد لتظهر الجبال على مستوى المملكة، وتنخفض إلى 1.5 مرة عند الاقتراب. زر التضاريس يعرضها بحجمها الحقيقي.',
        '<b>الحدود.</b> <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a> بمقياس 1:10m، ملكية عامة.',
        '<b>محرك الخريطة.</b> <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre GL JS</a> برخصة BSD-3-Clause. الخط: IBM Plex Sans Arabic برخصة SIL Open Font License.'
      ],
      factsHead: 'المعلومات والإحداثيات',
      facts: 'المعلومات مأخوذة من مقالة ويكيبيديا المرتبطة في لوحة كل مكان. روجعت الإحداثيات على ويكيبيديا وويكي بيانات وخريطة الشارع المفتوحة (© مساهمو OpenStreetMap).',
      photosHead: 'الصور',
      photos: 'كل الصور من ويكيميديا كومنز. اسم المصوّر والرخصة مأخوذان من صفحة كل ملف في كومنز. تُعرض الصور بعد تصغيرها واقتصاصها لتناسب العرض.',
      moveHead: 'التنقل',
      move: 'اسحب للتحريك. اسحب بالزر الأيمن أو مع Ctrl للتدوير والإمالة. مرّر للتكبير. مفتاح Esc يعيدك إلى العرض الكامل. مفاتيح الأسهم تنقلك بين الأماكن.'
    }
  }
};
