/*
 * i18n.js — all text, in English and Arabic.
 * In Arabic strings, {عربي|English} marks a medical term: it is shown as the Arabic name with
 * its English name beside it.
 */
(function (root) {
  'use strict';

  var EN = {
    title: 'One heartbeat',
    subtitle: 'An interactive model of the cardiac cycle',
    loading: 'Building the heart from code…',
    conditions: { normal: 'Normal', af: 'Atrial fibrillation', chb: 'Complete heart block', as: 'Aortic stenosis' },
    condShort: { normal: 'Normal', af: 'Atrial fibrillation', chb: 'Heart block', as: 'Aortic stenosis' },
    view: { whole: 'Whole', cut: 'Cut open', ghost: 'See-through' },
    layers: { blood: 'Blood', elec: 'Electrical signal', labels: 'Labels' },
    cutDepth: 'Cut depth', resetView: 'Reset view',
    hintView: 'Drag to rotate · scroll to zoom · Shift-drag to move · click a part',
    play: 'Play', pause: 'Pause', step: 'Next phase', speed: 'Speed',
    rate: { normal: 'Heart rate', af: 'Average ventricular rate', chb: 'Sinus (atrial) rate', as: 'Heart rate' },
    bpm: '/min', sound: 'Sound', soundOn: 'Sound on', soundOff: 'Sound off',
    simplifies: 'What this model simplifies',
    whatChanges: 'What changes ▾', hideChanges: 'Hide ▴',
    close: 'Close',
    disclaimer: 'For learning only. This is a teaching model, not a medical device, and it must not be used for diagnosis or treatment.',
    phaseNow: 'Phase', valves: 'Valves', open: 'open', closed: 'closed',
    valveNames: { mv: 'Mitral', tv: 'Tricuspid', av: 'Aortic', pv: 'Pulmonary' },
    phases: [
      { name: 'Atrial contraction', also: 'atrial systole', text: 'The atria squeeze and top up the ventricles. The P wave has just passed.' },
      { name: 'Isovolumetric contraction', also: 'left-side valves both closed', text: 'The ventricles start to squeeze. The inlet valves have just shut and the outlet valves have not opened yet, so pressure climbs but no blood leaves.' },
      { name: 'Rapid ejection', also: 'ventricular systole', text: 'Ventricular pressure passes the pressure in the arteries. The aortic and pulmonary valves open and blood rushes out.' },
      { name: 'Reduced ejection', also: 'ventricular systole', text: 'Blood is still leaving, but more slowly as the ventricles begin to recover. This is where the T wave appears.' },
      { name: 'Isovolumetric relaxation', also: 'left-side valves both closed', text: 'The ventricles relax. The aortic valve shuts, then the pulmonary valve an instant later, and pressure falls fast with no change in volume.' },
      { name: 'Rapid filling', also: 'early diastole', text: 'Ventricular pressure drops below atrial pressure. The mitral and tricuspid valves open and blood pours in.' },
      { name: 'Slow filling', also: 'diastasis', text: 'Filling slows to a trickle while the heart rests. This is the phase that shrinks most when the heart speeds up.' }
    ],
    path: { title: 'Signal', sa: 'SA node', atria: 'Atria', avn: 'AV node', his: 'Bundle of His', purk: 'Purkinje fibres', vent: 'Ventricles' },
    pathNote: {
      delay: 'held in the AV node for about a tenth of a second, so the ventricles finish filling first',
      block: 'blocked at the AV node: nothing gets through',
      chaos: 'chaotic waves in the atria; the AV node lets some through at irregular intervals',
      escape: 'a backup pacemaker in the ventricle fires on its own; the signal spreads slowly through muscle',
      plateau: 'ventricles fully activated and squeezing (ST segment)', recover: 'ventricles resetting for the next beat (T wave)', rest: 'waiting for the next beat'
    },
    chart: {
      ecg: 'ECG', ecgNote: 'one schematic lead', pressure: 'Left-side pressure', volume: 'Left ventricle volume', sounds: 'Heart sounds',
      lv: 'Left ventricle', ao: 'Aorta', la: 'Left atrium', mmHg: 'mmHg', mL: 'mL', mV: '1 mV', sec: '1 s',
      MC: 'mitral closes', AO: 'aortic opens', AC: 'aortic closes', MO: 'mitral opens', murmur: 'murmur', now: 'now'
    },
    vitals: {
      rate: 'Ventricular rate', atrialRate: 'Atrial rate', bp: 'Aortic pressure', sv: 'Stroke volume', ef: 'Ejection fraction', co: 'Output',
      lvPeak: 'LV peak pressure', grad: 'Mean gradient', perMin: '/min', mmHg: 'mmHg', mL: 'mL', lmin: 'L/min', model: 'model values'
    },
    timing: {
      title: 'One beat', sys: 'Pumping', sysAlso: 'systole', dia: 'Resting', diaAlso: 'diastole', ms: 'ms',
      ref: 'at 75/min', versus: 'vs 75/min', note: 'When the heart speeds up, the resting phase shrinks far more than the pumping phase.'
    },
    blood: {
      oxy: 'Oxygen-rich', deoxy: 'Oxygen-poor',
      note: 'Blue is a drawing convention. Real oxygen-poor blood is dark red, never blue.',
      route: 'Body → right atrium → right ventricle → lungs → left atrium → left ventricle → body'
    },
    info: { title: 'Selected part', none: 'Click any part of the heart to see what it is and what it does.' },
    condCard: {
      normal: { what: 'A healthy heart in sinus rhythm: each beat starts in the SA node.', motion: '', flow: '', ecg: '', sound: '' },
      af: {
        what: 'The atria have lost their organised beat. Chaotic electrical waves make them quiver, and the AV node passes impulses to the ventricles at irregular intervals.',
        motion: 'The atria quiver instead of contracting. The ventricles beat irregularly.',
        flow: 'There is no atrial top-up and the filling time changes every beat, so each beat pumps a different amount.',
        ecg: 'No P waves, a fine wavy baseline, and QRS complexes at irregular intervals.',
        sound: 'The first heart sound changes in loudness from beat to beat.'
      },
      chb: {
        what: 'No impulse gets through the AV node. The atria follow the SA node, while a slow backup pacemaker in the ventricles keeps them beating on their own.',
        motion: 'Atria and ventricles beat independently: the atria at the sinus rate, the ventricles at about 36 a minute in this model.',
        flow: 'The slow ventricular rate lowers the output. When the atria squeeze against closed valves, blood is pushed back into the veins.',
        ecg: 'P waves and QRS complexes are each regular but unrelated to each other. The QRS is wide because the beat starts inside the ventricle.',
        sound: 'The first heart sound changes in loudness. Moving the rate slider changes the atria only.'
      },
      as: {
        what: 'The aortic valve is stiff and narrowed, so the left ventricle has to produce much more pressure to push blood through it.',
        motion: 'The aortic cusps barely open. The left ventricle has a thick wall and a smaller cavity.',
        flow: 'A narrow, fast jet crosses the valve. During ejection, pressure in the ventricle is far above pressure in the aorta, and the aortic pressure rises slowly.',
        ecg: 'Tall QRS with ST and T-wave changes of left ventricular hypertrophy, drawn here as they appear in the left-sided leads.',
        sound: 'A harsh murmur during ejection that swells and fades. The second heart sound is softer.'
      },
      labels: { motion: 'Motion', flow: 'Flow', ecg: 'ECG', sound: 'Sound' }
    },
    parts: {
      1: ['Left ventricle', 'The thick-walled main pump. It pushes oxygen-rich blood through the aortic valve to the whole body.'],
      2: ['Right ventricle', 'A thinner-walled pump. It sends oxygen-poor blood through the pulmonary valve to the lungs, at much lower pressure than the left side.'],
      3: ['Left atrium', 'Receives oxygen-rich blood coming back from the lungs. It passes that blood through the mitral valve into the left ventricle.'],
      4: ['Right atrium', 'Receives oxygen-poor blood returning from the body. It passes that blood through the tricuspid valve into the right ventricle.'],
      5: ['Interventricular septum', 'The muscular wall between the two ventricles. It keeps the two bloodstreams apart and carries the bundle branches down toward the apex.'],
      6: ['Aorta', 'The body\'s largest artery. It carries oxygen-rich blood from the left ventricle to every organ, and its stretchy wall keeps pressure up between beats.'],
      7: ['Pulmonary trunk and arteries', 'Carry oxygen-poor blood from the right ventricle to the lungs. They are the only arteries drawn blue, because of what they carry.'],
      8: ['Superior vena cava', 'The large vein that brings oxygen-poor blood from the head, arms and upper body. It empties into the right atrium.'],
      9: ['Inferior vena cava', 'The large vein that brings oxygen-poor blood from the abdomen and legs. It empties into the right atrium from below.'],
      10: ['Pulmonary veins', 'Four veins that bring oxygen-rich blood from the lungs to the left atrium. They are the only veins that carry oxygen-rich blood.'],
      11: ['Mitral valve', 'Two leaflets between the left atrium and left ventricle. It opens to let the ventricle fill and snaps shut when the ventricle contracts, which makes most of the first heart sound.'],
      12: ['Tricuspid valve', 'Three leaflets between the right atrium and right ventricle. It opens for filling and closes when the right ventricle contracts.'],
      13: ['Aortic valve', 'Three cup-shaped cusps at the exit of the left ventricle. It opens during ejection and closes when the ventricle relaxes, which makes most of the second heart sound.'],
      14: ['Pulmonary valve', 'Three cusps at the exit of the right ventricle. It opens during ejection and closes just after the aortic valve.'],
      15: ['SA node (sinoatrial node)', 'The heart\'s natural pacemaker, in the wall of the right atrium. It fires on its own and each firing starts one heartbeat.'],
      16: ['AV node (atrioventricular node)', 'The only normal electrical route from the atria to the ventricles. It holds the signal for about a tenth of a second so the ventricles can finish filling.'],
      17: ['Bundle of His', 'A short cable of fast-conducting fibres leaving the AV node. It carries the signal through the insulating ring between atria and ventricles into the septum.'],
      18: ['Bundle branches', 'The left and right branches run down either side of the septum. They deliver the signal to both ventricles at almost the same moment.'],
      19: ['Purkinje fibres', 'A fast network lining the inside of both ventricles. It spreads the signal so the muscle contracts together, starting near the apex.'],
      20: ['Papillary muscles and chordae', 'Small muscles tied to the valve leaflets by thin cords. They tighten during contraction to stop the mitral and tricuspid leaflets from flipping backward.'],
      21: ['Coronary arteries', 'The heart\'s own blood supply, running over its surface. The muscle of the left ventricle receives most of its flow while the heart is relaxed.']
    },
    simplifyIntro: 'This is a teaching model. It keeps the timing, the order of valve events, the pressures and the ECG in line with standard physiology, and it simplifies the following.',
    simplifyList: [
      ['Layout', 'The heart is opened out the way textbook diagrams draw it, so one flat cut shows all four chambers and all four valves. In a real chest the right ventricle lies in front, the left atrium at the back, the heart is turned to the left, and the right pulmonary veins are short.'],
      ['Shape', 'The heart is built from smooth mathematical shapes, not from a scan of a person. Thin structures (atrial walls, vessel walls, valve leaflets) are drawn thicker than they are so they stay visible. Only the main coronary arteries are shown; cardiac veins and the pericardium are left out.'],
      ['Wall motion', 'Each chamber is drawn at the volume the simulation gives it, using a simple squeeze toward its axis plus the downward pull of the valve plane. The twisting of the left ventricle is not shown.'],
      ['Circulation', 'Pressures, volumes and flows come from a lumped model: each chamber is a muscle whose stiffness changes in time, each vessel bed is a single elastic compartment, and valves open and close from the pressure difference. The numbers are those of a typical resting adult, not measurements. Fine detail of real pressure tracings is missing or reduced: the small c wave of atrial pressure is absent and the notch in aortic pressure at valve closure is smaller than in a recording. Breathing is not modelled, so the second heart sound does not split with inspiration.'],
      ['Phases', 'The seven phases are named from the left side of the heart. The right side runs a few hundredths of a second differently, as in a real heart: the tricuspid valve closes just after the mitral, the pulmonary valve opens a little before the aortic and closes a little after it.'],
      ['No reflexes', 'The rate slider changes only how often the pacemaker fires, like pacing the heart. A real body also changes how hard the heart squeezes, how fast it relaxes, the tone of the vessels and how much blood returns. So at high rates the output of this model falls sooner than it would in a healthy person who is exercising.'],
      ['Timing against rate', 'The length of electrical and mechanical systole follows a square-root rule (the Bazett relation for the QT interval). Real hearts vary, and the rule is less accurate at very slow and very fast rates.'],
      ['ECG', 'One schematic lead, built from smooth waves tied to the conduction events. It is not a 12-lead recording. Atrial repolarisation and the U wave are not drawn. In aortic stenosis, the hypertrophy pattern is shown as it looks in the left-sided leads.'],
      ['Conduction', 'The signal crosses the atria as a smooth wave; separate internodal pathways are not drawn. The Purkinje network is generated by the program to show the idea, not copied from anatomy, and conduction times inside the ventricles are approximate.'],
      ['Heart sounds', 'The sounds are synthesised thumps triggered at the moment the model\'s valves close. They do not reproduce the true sound of a heart, extra sounds (S3, S4) or changes with breathing. In slow motion the sounds are not stretched.'],
      ['Conditions', 'Each condition is one typical example. Atrial fibrillation: irregular ventricular response only, with no clot formation or long-term change. Complete heart block: a ventricular backup rhythm fixed at about 36 a minute with a wide QRS; in real patients the backup rate and shape depend on where it arises. Aortic stenosis: a fixed severe narrowing with a thickened ventricle already in place.'],
      ['Blood', 'Each dot stands for a fixed volume of blood carried by the model\'s flows along guide paths. Real flow swirls. Blue for oxygen-poor blood is a drawing convention.']
    ],
    keys: 'Keys: Space play/pause · → next phase · 1–4 conditions',
    viewLabel: 'View', showLabel: 'Show', simplifiesShort: 'What it simplifies',
    prompt: 'Prompt', promptTitle: 'The prompt behind this page',
    promptIntro: 'This whole page was built with Fable from this one prompt. Copy it and try it yourself.',
    copy: 'Copy prompt', copied: 'Copied',
    themeLight: 'Switch to light', themeDark: 'Switch to dark',
    builtBy: 'Built live by Bader', orismLink: 'Learn to build with AI at Orism',
    mouseOverChart: 'P wave: atria activate (depolarise) · QRS: ventricles activate · T wave: ventricles reset (repolarise)',
    s1: 'S1', s2: 'S2'
  };

  var AR = {
    title: 'نبضة واحدة',
    subtitle: 'نموذج تفاعلي للدورة القلبية',
    loading: 'يُبنى القلب الآن من الكود…',
    conditions: { normal: 'طبيعي', af: '{الرجفان الأذيني|Atrial fibrillation}', chb: '{الإحصار القلبي التام|Complete heart block}', as: '{تضيّق الصمام الأبهري|Aortic stenosis}' },
    condShort: { normal: 'طبيعي', af: '{الرجفان الأذيني|AF}', chb: '{الإحصار التام|Heart block}', as: '{تضيّق الأبهري|Aortic stenosis}' },
    view: { whole: 'كامل', cut: 'مقطع مفتوح', ghost: 'شفاف' },
    layers: { blood: 'الدم', elec: 'الإشارة الكهربائية', labels: 'الأسماء' },
    cutDepth: 'عمق القطع', resetView: 'إعادة العرض',
    hintView: 'اسحب للتدوير · مرّر للتكبير · Shift مع السحب للتحريك · اضغط على أي جزء',
    play: 'تشغيل', pause: 'إيقاف مؤقت', step: 'المرحلة التالية', speed: 'السرعة',
    rate: { normal: 'معدل النبض', af: 'متوسط معدل البطينين', chb: 'معدل الأذينين (الجيبي)', as: 'معدل النبض' },
    bpm: '/دقيقة', sound: 'الصوت', soundOn: 'الصوت يعمل', soundOff: 'الصوت متوقف',
    simplifies: 'ما الذي يبسّطه هذا النموذج',
    whatChanges: 'ما الذي يتغيّر ▾', hideChanges: 'إخفاء ▴',
    close: 'إغلاق',
    disclaimer: 'للتعلّم فقط. هذا نموذج تعليمي وليس جهازًا طبيًا، ولا يُستخدم للتشخيص أو العلاج.',
    phaseNow: 'المرحلة', valves: 'الصمامات', open: 'مفتوح', closed: 'مغلق',
    valveNames: { mv: '{التاجي|Mitral}', tv: '{ثلاثي الشرفات|Tricuspid}', av: '{الأبهري|Aortic}', pv: '{الرئوي|Pulmonary}' },
    phases: [
      { name: '{انقباض الأذينين|Atrial contraction}', also: 'atrial systole', text: 'ينقبض الأذينان ويُكملان امتلاء البطينين. موجة P مرّت للتو.' },
      { name: '{الانقباض متساوي الحجم|Isovolumetric contraction}', also: 'صماما الجهة اليسرى مغلقان', text: 'يبدأ البطينان بالانقباض. صمامات الدخول انغلقت للتو وصمامات الخروج لم تنفتح بعد، فيرتفع الضغط ولا يخرج الدم.' },
      { name: '{القذف السريع|Rapid ejection}', also: 'ventricular systole', text: 'يتجاوز ضغط البطينين ضغط الشرايين، فينفتح الصمامان الأبهري والرئوي ويندفع الدم إلى الخارج.' },
      { name: '{القذف البطيء|Reduced ejection}', also: 'ventricular systole', text: 'ما زال الدم يخرج لكن بسرعة أقل، والبطينان يبدآن بالاستعادة. هنا تظهر موجة T.' },
      { name: '{الارتخاء متساوي الحجم|Isovolumetric relaxation}', also: 'صماما الجهة اليسرى مغلقان', text: 'يرتخي البطينان. ينغلق الصمام الأبهري ثم الرئوي بعده بلحظة، وينخفض الضغط بسرعة من دون تغيّر في الحجم.' },
      { name: '{الامتلاء السريع|Rapid filling}', also: 'early diastole', text: 'ينخفض ضغط البطينين عن ضغط الأذينين، فينفتح الصمامان التاجي وثلاثي الشرفات ويتدفق الدم إلى الداخل.' },
      { name: '{الامتلاء البطيء|Slow filling}', also: 'diastasis', text: 'يتباطأ الامتلاء والقلب في راحة. هذه هي المرحلة التي تقصر أكثر من غيرها حين يتسارع القلب.' }
    ],
    path: { title: 'الإشارة', sa: '{العقدة الجيبية الأذينية|SA node}', atria: '{الأذينان|Atria}', avn: '{العقدة الأذينية البطينية|AV node}', his: '{حزمة هيس|Bundle of His}', purk: '{ألياف بوركنجي|Purkinje fibres}', vent: '{البطينان|Ventricles}' },
    pathNote: {
      delay: 'تتأخر الإشارة في العقدة الأذينية البطينية نحو عُشر ثانية، ليكتمل امتلاء البطينين أولًا',
      block: 'الإشارة محجوبة عند العقدة الأذينية البطينية: لا يمرّ شيء',
      chaos: 'موجات فوضوية في الأذينين، والعقدة الأذينية البطينية تمرّر بعضها على فترات غير منتظمة',
      escape: 'ناظمة احتياطية في البطين تطلق الإشارة وحدها، فتنتشر ببطء عبر العضلة',
      plateau: 'البطينان مُفعَّلان بالكامل وينقبضان (القطعة ST)', recover: 'البطينان يستعدّان للنبضة التالية (موجة T)', rest: 'بانتظار النبضة التالية'
    },
    chart: {
      ecg: '{تخطيط القلب|ECG}', ecgNote: 'اشتقاق واحد تخطيطي', pressure: 'ضغط الجهة اليسرى', volume: 'حجم البطين الأيسر', sounds: 'أصوات القلب',
      lv: 'البطين الأيسر', ao: 'الأبهر', la: 'الأذين الأيسر', mmHg: 'ملم زئبق', mL: 'مل', mV: '1 ملي فولت', sec: '1 ث',
      MC: 'انغلاق التاجي', AO: 'انفتاح الأبهري', AC: 'انغلاق الأبهري', MO: 'انفتاح التاجي', murmur: 'نفخة', now: 'الآن'
    },
    vitals: {
      rate: 'معدل البطينين', atrialRate: 'معدل الأذينين', bp: 'ضغط الأبهر', sv: '{حجم الضربة|Stroke volume}', ef: '{الكسر القذفي|Ejection fraction}', co: '{النتاج القلبي|Output}',
      lvPeak: 'أعلى ضغط في البطين الأيسر', grad: 'فرق الضغط عبر الصمام', perMin: '/دقيقة', mmHg: 'ملم زئبق', mL: 'مل', lmin: 'لتر/دقيقة', model: 'قيم النموذج'
    },
    timing: {
      title: 'نبضة واحدة', sys: 'الضخ', sysAlso: '{الانقباض|systole}', dia: 'الراحة', diaAlso: '{الانبساط|diastole}', ms: 'ملي ثانية',
      ref: 'عند 75/دقيقة', versus: 'مقارنةً بـ 75/دقيقة', note: 'حين يتسارع القلب، تقصر مرحلة الراحة أكثر بكثير من مرحلة الضخ.'
    },
    blood: {
      oxy: 'غني بالأكسجين', deoxy: 'قليل الأكسجين',
      note: 'اللون الأزرق اصطلاح في الرسم فقط. الدم قليل الأكسجين أحمر داكن في الحقيقة، وليس أزرق أبدًا.',
      route: 'الجسم ← الأذين الأيمن ← البطين الأيمن ← الرئتان ← الأذين الأيسر ← البطين الأيسر ← الجسم'
    },
    info: { title: 'الجزء المحدد', none: 'اضغط على أي جزء من القلب لتعرف اسمه ووظيفته.' },
    condCard: {
      normal: { what: 'قلب سليم بنظم جيبي: كل نبضة تبدأ من العقدة الجيبية الأذينية.', motion: '', flow: '', ecg: '', sound: '' },
      af: {
        what: 'فقد الأذينان نبضهما المنتظم. موجات كهربائية فوضوية تجعلهما يرتجفان، والعقدة الأذينية البطينية تمرّر الإشارات إلى البطينين على فترات غير منتظمة.',
        motion: 'الأذينان يرتجفان بدل أن ينقبضا. البطينان ينبضان بلا انتظام.',
        flow: 'لا توجد دفعة أذينية تُكمل الامتلاء، وزمن الامتلاء يتغيّر مع كل نبضة، فتضخ كل نبضة كمية مختلفة.',
        ecg: 'لا توجد موجات P، وخط القاعدة متموّج تموّجًا دقيقًا، ومركّبات QRS تأتي على فترات غير منتظمة.',
        sound: 'تتغيّر شدة صوت القلب الأول من نبضة إلى أخرى.'
      },
      chb: {
        what: 'لا تمرّ أي إشارة عبر العقدة الأذينية البطينية. الأذينان يتبعان العقدة الجيبية الأذينية، وناظمة احتياطية بطيئة في البطينين تُبقيهما ينبضان وحدهما.',
        motion: 'الأذينان والبطينان ينبضان كلٌّ بمفرده: الأذينان بالمعدل الجيبي، والبطينان بنحو 36 نبضة في الدقيقة في هذا النموذج.',
        flow: 'بطء البطينين يقلّل النتاج القلبي. وحين ينقبض الأذينان والصمامات مغلقة، يُدفع الدم راجعًا إلى الأوردة.',
        ecg: 'موجات P منتظمة ومركّبات QRS منتظمة، لكن لا علاقة بينهما. ومركّب QRS عريض لأن النبضة تبدأ من داخل البطين.',
        sound: 'تتغيّر شدة صوت القلب الأول. وتحريك شريط المعدل يغيّر معدل الأذينين فقط.'
      },
      as: {
        what: 'الصمام الأبهري متيبّس وضيّق، فيضطر البطين الأيسر إلى توليد ضغط أعلى بكثير ليدفع الدم عبره.',
        motion: 'شرفات الصمام الأبهري تكاد لا تنفتح. جدار البطين الأيسر سميك وتجويفه أصغر.',
        flow: 'يمرّ الدم عبر الصمام في تيار ضيّق سريع. في أثناء القذف يكون ضغط البطين أعلى بكثير من ضغط الأبهر، ويرتفع ضغط الأبهر ببطء.',
        ecg: 'مركّب QRS مرتفع مع تغيّرات في ST وموجة T تدل على تضخّم البطين الأيسر، مرسومة كما تظهر في الاشتقاقات اليسرى.',
        sound: 'نفخة خشنة في أثناء القذف تشتد ثم تخفت. وصوت القلب الثاني أضعف.'
      },
      labels: { motion: 'الحركة', flow: 'الجريان', ecg: '{التخطيط|ECG}', sound: 'الصوت' }
    },
    parts: {
      1: ['{البطين الأيسر|Left ventricle}', 'المضخة الرئيسية ذات الجدار السميك. يدفع الدم الغني بالأكسجين عبر الصمام الأبهري إلى الجسم كله.'],
      2: ['{البطين الأيمن|Right ventricle}', 'مضخة جدارها أرقّ. يرسل الدم قليل الأكسجين عبر الصمام الرئوي إلى الرئتين، بضغط أقل كثيرًا من ضغط الجهة اليسرى.'],
      3: ['{الأذين الأيسر|Left atrium}', 'يستقبل الدم الغني بالأكسجين العائد من الرئتين. ثم يمرّره عبر الصمام التاجي إلى البطين الأيسر.'],
      4: ['{الأذين الأيمن|Right atrium}', 'يستقبل الدم قليل الأكسجين العائد من الجسم. ثم يمرّره عبر الصمام ثلاثي الشرفات إلى البطين الأيمن.'],
      5: ['{الحاجز بين البطينين|Interventricular septum}', 'الجدار العضلي بين البطينين. يفصل بين مجريَي الدم ويحمل فرعَي الحزمة نزولًا نحو قمة القلب.'],
      6: ['{الأبهر|Aorta}', 'أكبر شرايين الجسم. يحمل الدم الغني بالأكسجين من البطين الأيسر إلى كل الأعضاء، وجداره المرن يحافظ على الضغط بين النبضات.'],
      7: ['{الجذع الرئوي والشرايين الرئوية|Pulmonary trunk and arteries}', 'تحمل الدم قليل الأكسجين من البطين الأيمن إلى الرئتين. وهي الشرايين الوحيدة التي تُرسم بالأزرق، بسبب ما تحمله.'],
      8: ['{الوريد الأجوف العلوي|Superior vena cava}', 'الوريد الكبير الذي يعيد الدم قليل الأكسجين من الرأس والذراعين وأعلى الجسم. يصبّ في الأذين الأيمن.'],
      9: ['{الوريد الأجوف السفلي|Inferior vena cava}', 'الوريد الكبير الذي يعيد الدم قليل الأكسجين من البطن والساقين. يصبّ في الأذين الأيمن من الأسفل.'],
      10: ['{الأوردة الرئوية|Pulmonary veins}', 'أربعة أوردة تعيد الدم الغني بالأكسجين من الرئتين إلى الأذين الأيسر. وهي الأوردة الوحيدة التي تحمل دمًا غنيًا بالأكسجين.'],
      11: ['{الصمام التاجي|Mitral valve}', 'وريقتان بين الأذين الأيسر والبطين الأيسر. ينفتح ليمتلئ البطين وينغلق بقوة حين ينقبض، وانغلاقه يصنع معظم صوت القلب الأول.'],
      12: ['{الصمام ثلاثي الشرفات|Tricuspid valve}', 'ثلاث وريقات بين الأذين الأيمن والبطين الأيمن. ينفتح عند الامتلاء وينغلق حين ينقبض البطين الأيمن.'],
      13: ['{الصمام الأبهري|Aortic valve}', 'ثلاث شرفات على شكل جيوب عند مخرج البطين الأيسر. ينفتح في أثناء القذف وينغلق حين يرتخي البطين، وانغلاقه يصنع معظم صوت القلب الثاني.'],
      14: ['{الصمام الرئوي|Pulmonary valve}', 'ثلاث شرفات عند مخرج البطين الأيمن. ينفتح في أثناء القذف وينغلق بعد الصمام الأبهري بقليل.'],
      15: ['{العقدة الجيبية الأذينية|SA node}', 'ناظمة القلب الطبيعية، في جدار الأذين الأيمن. تطلق الإشارة من تلقاء نفسها، وكل إشارة تبدأ نبضة واحدة.'],
      16: ['{العقدة الأذينية البطينية|AV node}', 'الطريق الكهربائي الطبيعي الوحيد من الأذينين إلى البطينين. تؤخّر الإشارة نحو عُشر ثانية ليكتمل امتلاء البطينين.'],
      17: ['{حزمة هيس|Bundle of His}', 'كابل قصير من ألياف سريعة التوصيل يخرج من العقدة الأذينية البطينية. يحمل الإشارة عبر الحلقة العازلة بين الأذينين والبطينين إلى الحاجز.'],
      18: ['{فرعا الحزمة|Bundle branches}', 'الفرعان الأيسر والأيمن ينزلان على جانبَي الحاجز. يوصلان الإشارة إلى البطينين في اللحظة نفسها تقريبًا.'],
      19: ['{ألياف بوركنجي|Purkinje fibres}', 'شبكة سريعة تبطّن البطينين من الداخل. تنشر الإشارة لتنقبض العضلة معًا، ابتداءً من قرب قمة القلب.'],
      20: ['{العضلات الحليمية والحبال الوترية|Papillary muscles and chordae}', 'عضلات صغيرة مربوطة بوريقات الصمامين بحبال رفيعة. تشدّ في أثناء الانقباض فتمنع وريقات الصمامين التاجي وثلاثي الشرفات من الانقلاب إلى الخلف.'],
      21: ['{الشرايين التاجية|Coronary arteries}', 'تروية القلب نفسه، وتمتد على سطحه. عضلة البطين الأيسر تتلقى معظم دمها والقلب مرتخٍ.']
    },
    simplifyIntro: 'هذا نموذج تعليمي. يُبقي التوقيت وترتيب حركة الصمامات والضغوط وتخطيط القلب مطابقة لعلم وظائف الأعضاء المعتمد، ويبسّط ما يلي.',
    simplifyList: [
      ['الترتيب', 'القلب مبسوط كما ترسمه الكتب، ليُظهر قطع مستوٍ واحد الحجرات الأربع والصمامات الأربعة. في الصدر الحقيقي يقع البطين الأيمن في الأمام والأذين الأيسر في الخلف، والقلب ملتفّ نحو اليسار، والأوردة الرئوية اليمنى قصيرة.'],
      ['الشكل', 'القلب مبني من أشكال رياضية ملساء، لا من تصوير شخص حقيقي. الأجزاء الرقيقة (جدران الأذينين وجدران الأوعية ووريقات الصمامات) مرسومة أسمك من حقيقتها لتبقى ظاهرة. تظهر الشرايين التاجية الرئيسية فقط، ولا تظهر أوردة القلب ولا التامور.'],
      ['حركة الجدار', 'كل حجرة تُرسم بالحجم الذي تعطيه المحاكاة، بانقباض بسيط نحو محورها مع انسحاب مستوى الصمامات نحو القمة. التواء البطين الأيسر غير ظاهر.'],
      ['الدورة الدموية', 'الضغوط والأحجام والجريان تأتي من نموذج مبسّط: كل حجرة عضلة تتغيّر صلابتها مع الزمن، وكل شبكة أوعية حيّز مرن واحد، والصمامات تنفتح وتنغلق بحسب فرق الضغط. الأرقام تمثّل بالغًا عاديًا في الراحة وليست قياسات. بعض التفاصيل الدقيقة في منحنيات الضغط الحقيقية غائبة أو أصغر: الموجة c الصغيرة في ضغط الأذين غير موجودة، والثلمة في ضغط الأبهر عند انغلاق الصمام أصغر مما في التسجيل الحقيقي. التنفس غير ممثَّل، فلا ينقسم صوت القلب الثاني مع الشهيق.'],
      ['المراحل', 'المراحل السبع مسمّاة بحسب الجهة اليسرى من القلب. الجهة اليمنى تختلف عنها بأجزاء قليلة من مئة من الثانية، كما في القلب الحقيقي: ينغلق الصمام ثلاثي الشرفات بعد التاجي بقليل، وينفتح الصمام الرئوي قبل الأبهري بقليل وينغلق بعده بقليل.'],
      ['لا منعكسات', 'شريط المعدل يغيّر فقط عدد مرات إطلاق الناظمة، كما في تنظيم ضربات القلب بجهاز. الجسم الحقيقي يغيّر أيضًا قوة الانقباض وسرعة الارتخاء وتوتّر الأوعية وكمية الدم العائدة. لذلك ينخفض نتاج هذا النموذج عند المعدلات العالية أبكر مما يحدث عند شخص سليم يمارس الرياضة.'],
      ['التوقيت والمعدل', 'طول الانقباض الكهربائي والميكانيكي يتبع قاعدة الجذر التربيعي (علاقة بازيت لفترة QT). القلوب الحقيقية تتفاوت، والقاعدة أقل دقة عند المعدلات البطيئة جدًا والسريعة جدًا.'],
      ['تخطيط القلب', 'اشتقاق واحد تخطيطي، مبني من موجات ملساء مربوطة بأحداث التوصيل. ليس تخطيطًا من 12 اشتقاقًا. عودة استقطاب الأذينين وموجة U غير مرسومتين. في تضيّق الأبهري يظهر نمط التضخّم كما يبدو في الاشتقاقات اليسرى.'],
      ['التوصيل', 'تعبر الإشارة الأذينين كموجة ملساء، والمسارات بين العقدتين غير مرسومة منفصلة. شبكة بوركنجي يولّدها البرنامج لتوضيح الفكرة وليست منقولة عن التشريح، وأزمنة التوصيل داخل البطينين تقريبية.'],
      ['أصوات القلب', 'الأصوات نبضات صوتية مصنوعة بالكود، تُطلق لحظة انغلاق صمامات النموذج. لا تحاكي الصوت الحقيقي للقلب ولا الأصوات الإضافية (S3 و S4) ولا التغيّر مع التنفس. وفي الحركة البطيئة لا تُمدَّد الأصوات.'],
      ['الحالات', 'كل حالة مثال واحد نموذجي. الرجفان الأذيني: استجابة بطينية غير منتظمة فقط، بلا تكوّن جلطات ولا تغيّرات طويلة الأمد. الإحصار القلبي التام: نظم احتياطي بطيني ثابت عند نحو 36 في الدقيقة مع QRS عريض، وفي المرضى يختلف المعدل والشكل بحسب مكان نشوئه. تضيّق الأبهري: تضيّق شديد ثابت مع بطين سميك الجدار من البداية.'],
      ['الدم', 'كل نقطة تمثّل حجمًا ثابتًا من الدم يحمله جريان النموذج على مسارات إرشادية. الجريان الحقيقي فيه دوّامات. واللون الأزرق للدم قليل الأكسجين اصطلاح في الرسم.']
    ],
    keys: 'المفاتيح: المسافة تشغيل/إيقاف · → المرحلة التالية · 1–4 الحالات',
    viewLabel: 'العرض', showLabel: 'إظهار', simplifiesShort: 'ما الذي يبسّطه',
    prompt: 'البرومبت', promptTitle: 'البرومبت الذي بنى هذه الصفحة',
    promptIntro: 'بُنيت هذه الصفحة كلها باستخدام Fable من هذا البرومبت وحده. انسخه وجرّبه بنفسك.',
    copy: 'انسخ البرومبت', copied: 'تم النسخ',
    themeLight: 'الوضع الفاتح', themeDark: 'الوضع الداكن',
    builtBy: 'بناها بدر في بث مباشر', orismLink: 'تعلّم البناء بالذكاء الاصطناعي مع اورسم',
    mouseOverChart: 'موجة P: تفعيل الأذينين (زوال الاستقطاب) · مركّب QRS: تفعيل البطينين · موجة T: عودة البطينين إلى حالة الراحة (عودة الاستقطاب)',
    s1: 'S1', s2: 'S2'
  };

  var DICT = { en: EN, ar: AR };
  var lang = 'en';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  /* turn {عربي|English} into markup; plain text otherwise */
  function html(s) {
    return esc(s).replace(/\{([^|}]+)\|([^}]+)\}/g, function (m, ar, en) {
      return '<span class="term">' + ar + ' <bdi class="en" dir="ltr">' + en + '</bdi></span>';
    });
  }
  /* plain text for canvas labels: Arabic name only, or "Arabic (English)" when both=true */
  function plain(s, both) {
    return String(s).replace(/\{([^|}]+)\|([^}]+)\}/g, function (m, ar, en) { return both ? ar + ' (' + en + ')' : ar; });
  }
  function get(path) {
    var o = DICT[lang], parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (o === undefined || o === null) return path; o = o[parts[i]]; }
    return o === undefined ? path : o;
  }

  root.I18N = {
    setLang: function (l) { lang = DICT[l] ? l : 'en'; },
    lang: function () { return lang; },
    rtl: function () { return lang === 'ar'; },
    t: get, html: function (path) { return html(get(path)); }, plain: function (path, both) { return plain(get(path), both); },
    markup: html, strip: plain, dict: DICT
  };
})(typeof self !== 'undefined' ? self : this);
