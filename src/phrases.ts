/**
 * What the townsfolk say, in the language of the country they live in.
 *
 * **Loaded on the first conversation and not before**: it is thirty-one
 * languages of text that nothing needs until somebody is spoken to, so
 * `talk.ts` imports it dynamically and the world's first load never carries
 * it.
 *
 * ## One table a language, and English defines the shape
 *
 * A language is a set of lines under the same keys as English, with the same
 * number of variants under each key, because the English line with the same
 * key and index is what is shown beneath as the translation. `pnpm people`
 * holds every table to that and to the placeholders below.
 *
 * ## Templates that never inflect a name
 *
 * A name dropped into a sentence has to survive the grammar round it, and most
 * of the world's grammars decline, mutate or agree with a noun. So every
 * template puts a name where it stays as the source spells it: as the subject
 * of a nominal sentence (*{country} — прекрасная страна*), in apposition to a
 * common noun that takes the case instead (*в город {town}*, *στην πόλη
 * {town}*, *ve městě {town}*), behind a postposition or particle that does not
 * change (*{town}へようこそ*, *{town} में*), or set off by a colon or a comma
 * (*{country} : un beau pays*). Korean's particles depend on the last sound of
 * the word before them, so no Korean particle follows a placeholder; Turkish
 * suffixes harmonise, so no Turkish suffix does either. A direction is a whole
 * phrase in each language (`compass`), with its own preposition, because
 * *al norte*, *au nord*, *nördlich von hier* and *к северу отсюда* have
 * nothing in common but the north.
 *
 * The speakers are strangers of either sex, so a line never agrees with its
 * speaker or its listener where the language would make it choose: Polish
 * asks *Skąd jesteś?* and never *Byłeś tam?*, Thai leaves off *ครับ* and
 * *ค่ะ*, and a Russian says *вы не отсюда* rather than *не местный*.
 */

/** Every line a person can say, by what it is about. */
export const LINE_KEYS = [
  'morning',
  'afternoon',
  'evening',
  'night',
  'welcome',
  'capitalHere',
  'capitalThere',
  'big',
  'middling',
  'small',
  'coast',
  'inland',
  'landmark',
  'landmarkNear',
  'hot',
  'cold',
  'mild',
  'late',
  'country',
  'chat',
  'bye',
] as const;
export type LineKey = (typeof LINE_KEYS)[number];

/** What a template may ask to have filled in, as `{name}`. */
export const PLACEHOLDERS = ['town', 'country', 'capital', 'landmark', 'km', 'dir'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export interface Language {
  /** Its BCP 47 tag, for `Intl` and for the page's `lang`. */
  locale: string;
  /** Its name in English, for the translation line. */
  name: string;
  /** Written right to left. */
  rtl?: boolean;
  /** Between two sentences said together: a space, or nothing in scripts that do not space them. */
  join: string;
  /**
   * Where a place lies, as the phrase each template puts after a distance:
   * north first and then clockwise by eighths.
   */
  compass: readonly [string, string, string, string, string, string, string, string];
  lines: Readonly<Record<LineKey, readonly string[]>>;
}

const EN: Language = {
  locale: 'en',
  name: 'English',
  join: ' ',
  compass: ['to the north', 'to the northeast', 'to the east', 'to the southeast', 'to the south', 'to the southwest', 'to the west', 'to the northwest'],
  lines: {
    morning: ['Good morning!'],
    afternoon: ['Good afternoon!'],
    evening: ['Good evening!'],
    night: ["Good evening! It's late, isn't it?"],
    welcome: ['Welcome to {town}!', 'This is {town}. Are you visiting?'],
    capitalHere: ['{town} is the capital of our country.'],
    capitalThere: ["Our capital is {capital}. It's worth a visit."],
    big: ["This is a big city. It's easy to get lost here!"],
    middling: ['Not a big town, not a small one. Just right.'],
    small: ["It's a small place. Everybody knows everybody here."],
    coast: ['We live by the water here. The fish is very good.'],
    inland: ['We are far from the sea, but the land here is beautiful.'],
    landmark: ["Don't miss {landmark}! It's about {km} km {dir}."],
    landmarkNear: ["{landmark} is very close. You can't miss it!"],
    hot: ["It's hot today! Find some shade."],
    cold: ["Brr, it's cold today! Keep warm."],
    mild: ['What lovely weather today.'],
    late: ["It's late. The streets are quiet at night."],
    country: ['{country} is a beautiful country. Enjoy it!'],
    chat: ["Where are you from? You're not from around here.", 'Take your time and look around. There is a lot to see.'],
    bye: ['Goodbye! Have a good trip.'],
  },
};

const ES: Language = {
  locale: 'es',
  name: 'Spanish',
  join: ' ',
  compass: ['al norte', 'al noreste', 'al este', 'al sureste', 'al sur', 'al suroeste', 'al oeste', 'al noroeste'],
  lines: {
    morning: ['¡Buenos días!'],
    afternoon: ['¡Buenas tardes!'],
    evening: ['¡Buenas noches!'],
    night: ['¡Buenas noches! Es tarde, ¿verdad?'],
    welcome: ['¡Bienvenido a {town}!', 'Esto es {town}. ¿Estás de visita?'],
    capitalHere: ['{town} es la capital de nuestro país.'],
    capitalThere: ['Nuestra capital es {capital}. Merece una visita.'],
    big: ['Esta es una ciudad grande. ¡Aquí es fácil perderse!'],
    middling: ['Ni grande ni pequeña. Justo como debe ser.'],
    small: ['Es un sitio pequeño. Aquí todos nos conocemos.'],
    coast: ['Aquí vivimos junto al agua. El pescado es muy bueno.'],
    inland: ['Estamos lejos del mar, pero esta tierra es preciosa.'],
    landmark: ['¡No te pierdas {landmark}! Está a unos {km} km {dir}.'],
    landmarkNear: ['{landmark} está muy cerca. ¡No tiene pérdida!'],
    hot: ['¡Hoy hace calor! Busca un poco de sombra.'],
    cold: ['¡Brr, hoy hace frío! Abrígate bien.'],
    mild: ['Qué buen tiempo hace hoy.'],
    late: ['Ya es tarde. Por la noche las calles están tranquilas.'],
    country: ['{country} es un país precioso. ¡Disfrútalo!'],
    chat: ['¿De dónde eres? No eres de por aquí.', 'Tómate tu tiempo y mira a tu alrededor. Hay mucho que ver.'],
    bye: ['¡Adiós! Buen viaje.'],
  },
};

const FR: Language = {
  locale: 'fr',
  name: 'French',
  join: ' ',
  compass: ['au nord', 'au nord-est', "à l'est", 'au sud-est', 'au sud', 'au sud-ouest', "à l'ouest", 'au nord-ouest'],
  lines: {
    morning: ['Bonjour !'],
    afternoon: ['Bonjour !'],
    evening: ['Bonsoir !'],
    night: ['Bonsoir ! Il est tard, non ?'],
    welcome: ['Bienvenue à {town} !', "Ici, c'est {town}. Vous êtes de passage ?"],
    capitalHere: ['{town} est la capitale de notre pays.'],
    capitalThere: ["Notre capitale, c'est {capital}. Elle vaut le détour."],
    big: ["C'est une grande ville. On s'y perd facilement !"],
    middling: ['Ni grande ni petite. Juste comme il faut.'],
    small: ["C'est un petit endroit. Ici, tout le monde se connaît."],
    coast: ["Ici, on vit au bord de l'eau. Le poisson est excellent."],
    inland: ['On est loin de la mer, mais la région est magnifique.'],
    landmark: ["Ne manquez pas {landmark} ! C'est à environ {km} km {dir}."],
    landmarkNear: ['{landmark} est tout près. Vous ne pouvez pas vous tromper !'],
    hot: ["Il fait chaud aujourd'hui ! Mettez-vous à l'ombre."],
    cold: ["Brr, il fait froid aujourd'hui ! Couvrez-vous bien."],
    mild: ["Quel beau temps aujourd'hui."],
    late: ['Il est tard. La nuit, les rues sont calmes.'],
    country: ['{country}, quel beau pays ! Profitez-en.'],
    chat: ["Vous venez d'où ? Vous n'êtes pas d'ici.", 'Prenez votre temps, regardez autour de vous. Il y a beaucoup à voir.'],
    bye: ['Au revoir ! Bon voyage.'],
  },
};

const DE: Language = {
  locale: 'de',
  name: 'German',
  join: ' ',
  compass: [
    'nördlich von hier', 'nordöstlich von hier', 'östlich von hier', 'südöstlich von hier',
    'südlich von hier', 'südwestlich von hier', 'westlich von hier', 'nordwestlich von hier',
  ],
  lines: {
    morning: ['Guten Morgen!'],
    afternoon: ['Guten Tag!'],
    evening: ['Guten Abend!'],
    night: ['Guten Abend! Ganz schön spät, oder?'],
    welcome: ['Willkommen in {town}!', 'Das hier ist {town}. Sind Sie zu Besuch?'],
    capitalHere: ['{town} ist die Hauptstadt unseres Landes.'],
    capitalThere: ['Unsere Hauptstadt ist {capital}. Sie ist einen Besuch wert.'],
    big: ['Das ist eine große Stadt. Hier verläuft man sich leicht!'],
    middling: ['Nicht groß, nicht klein. Genau richtig.'],
    small: ['Es ist ein kleiner Ort. Hier kennt jeder jeden.'],
    coast: ['Wir leben hier am Wasser. Der Fisch ist sehr gut.'],
    inland: ['Das Meer ist weit weg, aber die Landschaft hier ist wunderschön.'],
    landmark: ['Verpassen Sie {landmark} nicht! Das liegt etwa {km} km {dir}.'],
    landmarkNear: ['{landmark} ist ganz in der Nähe. Nicht zu verfehlen!'],
    hot: ['Heute ist es heiß! Suchen Sie sich etwas Schatten.'],
    cold: ['Brr, heute ist es kalt! Ziehen Sie sich warm an.'],
    mild: ['Was für ein schönes Wetter heute.'],
    late: ['Es ist spät. Nachts sind die Straßen ruhig.'],
    country: ['{country} – ein wunderschönes Land. Genießen Sie es!'],
    chat: ['Woher kommen Sie? Sie sind nicht von hier, oder?', 'Lassen Sie sich Zeit und schauen Sie sich um. Es gibt viel zu sehen.'],
    bye: ['Auf Wiedersehen! Gute Reise.'],
  },
};

const IT: Language = {
  locale: 'it',
  name: 'Italian',
  join: ' ',
  compass: ['a nord', 'a nord-est', 'a est', 'a sud-est', 'a sud', 'a sud-ovest', 'a ovest', 'a nord-ovest'],
  lines: {
    morning: ['Buongiorno!'],
    afternoon: ['Buon pomeriggio!'],
    evening: ['Buonasera!'],
    night: ['Buonasera! È tardi, vero?'],
    welcome: ['Benvenuto a {town}!', 'Questa è {town}. Sei in visita?'],
    capitalHere: ['{town} è la capitale del nostro paese.'],
    capitalThere: ['La nostra capitale è {capital}. Merita una visita.'],
    big: ['È una grande città. Qui è facile perdersi!'],
    middling: ['Né grande né piccola. Proprio giusta.'],
    small: ['È un posto piccolo. Qui ci conosciamo tutti.'],
    coast: ["Qui viviamo sull'acqua. Il pesce è ottimo."],
    inland: ['Siamo lontani dal mare, ma questa terra è bellissima.'],
    landmark: ['Non perderti {landmark}! È a circa {km} km {dir}.'],
    landmarkNear: ['{landmark} è qui vicino. Non puoi sbagliare!'],
    hot: ["Oggi fa caldo! Cerca un po' d'ombra."],
    cold: ['Brr, oggi fa freddo! Copriti bene.'],
    mild: ['Che bel tempo oggi.'],
    late: ['È tardi. Di notte le strade sono tranquille.'],
    country: ['{country}: un paese bellissimo. Goditelo!'],
    chat: ['Di dove sei? Non sei di qui.', "Prenditi il tuo tempo e guardati intorno. C'è molto da vedere."],
    bye: ['Arrivederci! Buon viaggio.'],
  },
};

const PT: Language = {
  locale: 'pt',
  name: 'Portuguese',
  join: ' ',
  compass: ['ao norte', 'a nordeste', 'a leste', 'a sudeste', 'ao sul', 'a sudoeste', 'a oeste', 'a noroeste'],
  lines: {
    morning: ['Bom dia!'],
    afternoon: ['Boa tarde!'],
    evening: ['Boa noite!'],
    night: ['Boa noite! Já é tarde, não é?'],
    welcome: ['Bem-vindo a {town}!', 'Aqui é {town}. Está de visita?'],
    capitalHere: ['{town} é a capital do nosso país.'],
    capitalThere: ['A nossa capital é {capital}. Vale a visita.'],
    big: ['Esta é uma cidade grande. É fácil perder-se aqui!'],
    middling: ['Nem grande, nem pequena. Na medida certa.'],
    small: ['É um lugar pequeno. Aqui todos se conhecem.'],
    coast: ['Aqui vivemos à beira da água. O peixe é muito bom.'],
    inland: ['Estamos longe do mar, mas esta terra é linda.'],
    landmark: ['Não perca {landmark}! Fica a uns {km} km {dir}.'],
    landmarkNear: ['{landmark} fica bem perto. Não tem como errar!'],
    hot: ['Hoje está calor! Procure uma sombra.'],
    cold: ['Brr, hoje está frio! Agasalhe-se bem.'],
    mild: ['Que tempo bom hoje.'],
    late: ['Já é tarde. À noite as ruas ficam tranquilas.'],
    country: ['{country}: um país lindo. Aproveite!'],
    chat: ['De onde você é? Não é daqui.', 'Com calma, olhe à sua volta. Há muito para ver.'],
    bye: ['Até logo! Boa viagem.'],
  },
};

const NL: Language = {
  locale: 'nl',
  name: 'Dutch',
  join: ' ',
  compass: [
    'ten noorden van hier', 'ten noordoosten van hier', 'ten oosten van hier', 'ten zuidoosten van hier',
    'ten zuiden van hier', 'ten zuidwesten van hier', 'ten westen van hier', 'ten noordwesten van hier',
  ],
  lines: {
    morning: ['Goedemorgen!'],
    afternoon: ['Goedemiddag!'],
    evening: ['Goedenavond!'],
    night: ['Goedenavond! Het is al laat, hè?'],
    welcome: ['Welkom in {town}!', 'Dit is {town}. Bent u op bezoek?'],
    capitalHere: ['{town} is de hoofdstad van ons land.'],
    capitalThere: ['Onze hoofdstad is {capital}. Een bezoek waard.'],
    big: ['Dit is een grote stad. Je verdwaalt hier makkelijk!'],
    middling: ['Niet groot, niet klein. Precies goed.'],
    small: ['Het is een klein plaatsje. Iedereen kent iedereen hier.'],
    coast: ['We wonen hier aan het water. De vis is heel lekker.'],
    inland: ['De zee is ver weg, maar het land hier is prachtig.'],
    landmark: ['Mis {landmark} niet! Het ligt ongeveer {km} km {dir}.'],
    landmarkNear: ['{landmark} is heel dichtbij. U kunt het niet missen!'],
    hot: ['Het is warm vandaag! Zoek wat schaduw op.'],
    cold: ['Brr, het is koud vandaag! Kleed u warm aan.'],
    mild: ['Wat een heerlijk weer vandaag.'],
    late: ["Het is laat. 's Nachts zijn de straten rustig."],
    country: ['{country} is een prachtig land. Geniet ervan!'],
    chat: ['Waar komt u vandaan? U bent niet van hier.', 'Neem de tijd en kijk rond. Er is veel te zien.'],
    bye: ['Tot ziens! Goede reis.'],
  },
};

const SV: Language = {
  locale: 'sv',
  name: 'Swedish',
  join: ' ',
  compass: ['norrut', 'åt nordost', 'österut', 'åt sydost', 'söderut', 'åt sydväst', 'västerut', 'åt nordväst'],
  lines: {
    morning: ['God morgon!'],
    afternoon: ['God middag!'],
    evening: ['God kväll!'],
    night: ['God kväll! Det är sent, eller hur?'],
    welcome: ['Välkommen till {town}!', 'Det här är {town}. Är du på besök?'],
    capitalHere: ['{town} är vårt lands huvudstad.'],
    capitalThere: ['Vår huvudstad är {capital}. Den är värd ett besök.'],
    big: ['Det här är en stor stad. Det är lätt att gå vilse här!'],
    middling: ['Inte stor, inte liten. Lagom.'],
    small: ['Det är en liten ort. Här känner alla varandra.'],
    coast: ['Vi bor vid vattnet här. Fisken är jättegod.'],
    inland: ['Havet är långt borta, men landskapet här är vackert.'],
    landmark: ['Missa inte {landmark}! Det ligger ungefär {km} km {dir}.'],
    landmarkNear: ['{landmark} ligger alldeles i närheten. Du kan inte missa det!'],
    hot: ['Det är varmt i dag! Sök lite skugga.'],
    cold: ['Brr, det är kallt i dag! Klä dig varmt.'],
    mild: ['Vilket härligt väder i dag.'],
    late: ['Det är sent. På natten är gatorna lugna.'],
    country: ['{country} är ett vackert land. Njut av det!'],
    chat: ['Var kommer du ifrån? Du är inte härifrån.', 'Ta den tid du behöver och se dig omkring. Det finns mycket att se.'],
    bye: ['Hej då! Trevlig resa.'],
  },
};

const PL: Language = {
  locale: 'pl',
  name: 'Polish',
  join: ' ',
  compass: [
    'na północ stąd', 'na północny wschód stąd', 'na wschód stąd', 'na południowy wschód stąd',
    'na południe stąd', 'na południowy zachód stąd', 'na zachód stąd', 'na północny zachód stąd',
  ],
  lines: {
    morning: ['Dzień dobry!'],
    afternoon: ['Dzień dobry!'],
    evening: ['Dobry wieczór!'],
    night: ['Dobry wieczór! Późno już, prawda?'],
    welcome: ['Witamy w mieście {town}!', 'To jest {town}. Jesteś tu z wizytą?'],
    capitalHere: ['{town} to stolica naszego kraju.'],
    capitalThere: ['Stolica naszego kraju to {capital}. Warto ją odwiedzić.'],
    big: ['To duże miasto. Łatwo się tu zgubić!'],
    middling: ['Ani duże, ani małe. W sam raz.'],
    small: ['To małe miejsce. Wszyscy się tu znają.'],
    coast: ['Mieszkamy tu nad wodą. Ryby są bardzo dobre.'],
    inland: ['Morze jest daleko, ale okolica jest piękna.'],
    landmark: ['Koniecznie zobacz {landmark}! To około {km} km {dir}.'],
    landmarkNear: ['{landmark} jest bardzo blisko. Nie da się przeoczyć!'],
    hot: ['Dziś jest gorąco! Poszukaj trochę cienia.'],
    cold: ['Brr, dziś jest zimno! Ubierz się ciepło.'],
    mild: ['Jaka piękna dziś pogoda.'],
    late: ['Już późno. Nocą ulice są spokojne.'],
    country: ['{country} to piękny kraj. Ciesz się nim!'],
    chat: ['Skąd jesteś? Nie jesteś stąd.', 'Nie spiesz się i rozejrzyj się. Jest tu wiele do zobaczenia.'],
    bye: ['Do widzenia! Szczęśliwej podróży.'],
  },
};

const RU: Language = {
  locale: 'ru',
  name: 'Russian',
  join: ' ',
  compass: [
    'к северу отсюда', 'к северо-востоку отсюда', 'к востоку отсюда', 'к юго-востоку отсюда',
    'к югу отсюда', 'к юго-западу отсюда', 'к западу отсюда', 'к северо-западу отсюда',
  ],
  lines: {
    morning: ['Доброе утро!'],
    afternoon: ['Добрый день!'],
    evening: ['Добрый вечер!'],
    night: ['Добрый вечер! Уже поздно, правда?'],
    welcome: ['Добро пожаловать в город {town}!', 'Это город {town}. Вы к нам в гости?'],
    capitalHere: ['Город {town} — столица нашей страны.'],
    capitalThere: ['Наша столица — {capital}. Там стоит побывать.'],
    big: ['Это большой город. Здесь легко заблудиться!'],
    middling: ['Не большой и не маленький. В самый раз.'],
    small: ['Это небольшое место. Здесь все друг друга знают.'],
    coast: ['Мы живём у воды. Рыба здесь очень хорошая.'],
    inland: ['Море далеко, но земля здесь красивая.'],
    landmark: ['Обязательно посмотрите {landmark}! Это примерно в {km} км {dir}.'],
    landmarkNear: ['{landmark} совсем рядом. Мимо не пройдёте!'],
    hot: ['Сегодня жарко! Найдите тень.'],
    cold: ['Брр, сегодня холодно! Оденьтесь потеплее.'],
    mild: ['Какая сегодня чудесная погода.'],
    late: ['Уже поздно. Ночью на улицах тихо.'],
    country: ['{country} — прекрасная страна. Наслаждайтесь!'],
    chat: ['Откуда вы? Вы ведь не отсюда.', 'Не спешите, осмотритесь. Здесь есть что посмотреть.'],
    bye: ['До свидания! Счастливого пути.'],
  },
};

const UK: Language = {
  locale: 'uk',
  name: 'Ukrainian',
  join: ' ',
  compass: [
    'на північ звідси', 'на північний схід звідси', 'на схід звідси', 'на південний схід звідси',
    'на південь звідси', 'на південний захід звідси', 'на захід звідси', 'на північний захід звідси',
  ],
  lines: {
    morning: ['Доброго ранку!'],
    afternoon: ['Добрий день!'],
    evening: ['Добрий вечір!'],
    night: ['Добрий вечір! Уже пізно, правда?'],
    welcome: ['Ласкаво просимо до міста {town}!', 'Це місто {town}. Ви до нас у гості?'],
    capitalHere: ['Місто {town} — столиця нашої країни.'],
    capitalThere: ['Наша столиця — {capital}. Там варто побувати.'],
    big: ['Це велике місто. Тут легко заблукати!'],
    middling: ['Не велике й не мале. Саме те, що треба.'],
    small: ['Це невелике містечко. Тут усі одне одного знають.'],
    coast: ['Ми живемо біля води. Риба тут дуже смачна.'],
    inland: ['Море далеко, але земля тут гарна.'],
    landmark: ["Обов'язково подивіться {landmark}! Це приблизно за {km} км {dir}."],
    landmarkNear: ['{landmark} зовсім поруч. Не пропустите!'],
    hot: ['Сьогодні спекотно! Знайдіть тінь.'],
    cold: ['Брр, сьогодні холодно! Одягніться тепліше.'],
    mild: ['Яка сьогодні чудова погода.'],
    late: ['Уже пізно. Уночі на вулицях тихо.'],
    country: ['{country} — чудова країна. Насолоджуйтеся!'],
    chat: ['Звідки ви? Ви ж не звідси.', 'Не поспішайте, роздивіться. Тут є що побачити.'],
    bye: ['До побачення! Щасливої дороги.'],
  },
};

const TR: Language = {
  locale: 'tr',
  name: 'Turkish',
  join: ' ',
  compass: ['kuzeyde', 'kuzeydoğuda', 'doğuda', 'güneydoğuda', 'güneyde', 'güneybatıda', 'batıda', 'kuzeybatıda'],
  lines: {
    morning: ['Günaydın!'],
    afternoon: ['İyi günler!'],
    evening: ['İyi akşamlar!'],
    night: ['İyi akşamlar! Epey geç oldu, değil mi?'],
    welcome: ['Hoş geldiniz! Burası {town}.', 'Burası {town}. Gezmeye mi geldiniz?'],
    capitalHere: ['{town}, ülkemizin başkenti.'],
    capitalThere: ['Başkentimiz {capital}. Görmeye değer.'],
    big: ['Burası büyük bir şehir. Kaybolmak çok kolay!'],
    middling: ['Ne büyük ne küçük. Tam kararında.'],
    small: ['Burası küçük bir yer. Herkes birbirini tanır.'],
    coast: ['Burada suyun kenarında yaşıyoruz. Balığı çok güzeldir.'],
    inland: ['Denizden uzağız ama buranın doğası çok güzel.'],
    landmark: ['Mutlaka görmeniz gereken bir yer: {landmark}! Buradan yaklaşık {km} km {dir}.'],
    landmarkNear: ['{landmark} çok yakında. Kaçırmanız imkânsız!'],
    hot: ['Bugün hava sıcak! Biraz gölge bulun.'],
    cold: ['Brr, bugün hava soğuk! Sıkı giyinin.'],
    mild: ['Bugün hava ne kadar güzel.'],
    late: ['Geç oldu. Geceleri sokaklar sakindir.'],
    country: ['{country} çok güzel bir ülke. Tadını çıkarın!'],
    chat: ['Nerelisiniz? Buralı değilsiniz galiba.', 'Acele etmeyin, etrafa bakın. Görülecek çok şey var.'],
    bye: ['Hoşça kalın! İyi yolculuklar.'],
  },
};

const EL: Language = {
  locale: 'el',
  name: 'Greek',
  join: ' ',
  compass: [
    'βόρεια από εδώ', 'βορειοανατολικά από εδώ', 'ανατολικά από εδώ', 'νοτιοανατολικά από εδώ',
    'νότια από εδώ', 'νοτιοδυτικά από εδώ', 'δυτικά από εδώ', 'βορειοδυτικά από εδώ',
  ],
  lines: {
    morning: ['Καλημέρα!'],
    afternoon: ['Καλησπέρα!'],
    evening: ['Καλησπέρα!'],
    night: ['Καλησπέρα! Είναι αργά, έτσι δεν είναι;'],
    welcome: ['Καλώς ήρθατε στην πόλη {town}!', 'Εδώ είναι η πόλη {town}. Ήρθατε για επίσκεψη;'],
    capitalHere: ['Η πόλη {town} είναι η πρωτεύουσα της χώρας μας.'],
    capitalThere: ['Πρωτεύουσά μας είναι η πόλη {capital}. Αξίζει να την επισκεφθείτε.'],
    big: ['Είναι μεγάλη πόλη. Εδώ χάνεσαι εύκολα!'],
    middling: ['Ούτε μεγάλη ούτε μικρή. Ό,τι πρέπει.'],
    small: ['Είναι ένα μικρό μέρος. Εδώ όλοι γνωρίζονται.'],
    coast: ['Εδώ ζούμε δίπλα στο νερό. Το ψάρι είναι εξαιρετικό.'],
    inland: ['Είμαστε μακριά από τη θάλασσα, αλλά ο τόπος είναι πανέμορφος.'],
    landmark: ['Μην χάσετε το αξιοθέατο {landmark}! Είναι περίπου {km} χλμ. {dir}.'],
    landmarkNear: ['Το αξιοθέατο {landmark} είναι πολύ κοντά. Δεν μπορείτε να το χάσετε!'],
    hot: ['Κάνει ζέστη σήμερα! Βρείτε λίγη σκιά.'],
    cold: ['Μπρρ, κάνει κρύο σήμερα! Ντυθείτε ζεστά.'],
    mild: ['Τι ωραίος καιρός σήμερα.'],
    late: ['Είναι αργά. Τη νύχτα οι δρόμοι είναι ήσυχοι.'],
    country: ['{country}: μια πανέμορφη χώρα. Απολαύστε τη!'],
    chat: ['Από πού είστε; Δεν είστε από εδώ.', 'Με την ησυχία σας, κοιτάξτε γύρω. Έχει πολλά να δείτε.'],
    bye: ['Αντίο! Καλό ταξίδι.'],
  },
};

const RO: Language = {
  locale: 'ro',
  name: 'Romanian',
  join: ' ',
  compass: ['spre nord', 'spre nord-est', 'spre est', 'spre sud-est', 'spre sud', 'spre sud-vest', 'spre vest', 'spre nord-vest'],
  lines: {
    morning: ['Bună dimineața!'],
    afternoon: ['Bună ziua!'],
    evening: ['Bună seara!'],
    night: ['Bună seara! E cam târziu, nu?'],
    welcome: ['Bine ați venit în {town}!', 'Aici e {town}. Sunteți în vizită?'],
    capitalHere: ['{town} este capitala țării noastre.'],
    capitalThere: ['Capitala noastră este {capital}. Merită vizitată.'],
    big: ['E un oraș mare. Aici te pierzi ușor!'],
    middling: ['Nici mare, nici mic. Exact cât trebuie.'],
    small: ['E un loc mic. Aici toată lumea se cunoaște.'],
    coast: ['Aici trăim lângă apă. Peștele e foarte bun.'],
    inland: ['Suntem departe de mare, dar locurile sunt minunate.'],
    landmark: ['Nu ratați {landmark}! E la vreo {km} km {dir}.'],
    landmarkNear: ['{landmark} e foarte aproape. Nu aveți cum să greșiți!'],
    hot: ['E cald azi! Căutați puțină umbră.'],
    cold: ['Brr, e frig azi! Îmbrăcați-vă bine.'],
    mild: ['Ce vreme frumoasă e azi.'],
    late: ['E târziu. Noaptea străzile sunt liniștite.'],
    country: ['{country} e o țară frumoasă. Bucurați-vă de ea!'],
    chat: ['De unde sunteți? Nu sunteți de pe aici.', 'Nu vă grăbiți, uitați-vă în jur. Sunt multe de văzut.'],
    bye: ['La revedere! Drum bun.'],
  },
};

const CS: Language = {
  locale: 'cs',
  name: 'Czech',
  join: ' ',
  compass: [
    'severně odtud', 'severovýchodně odtud', 'východně odtud', 'jihovýchodně odtud',
    'jižně odtud', 'jihozápadně odtud', 'západně odtud', 'severozápadně odtud',
  ],
  lines: {
    morning: ['Dobré ráno!'],
    afternoon: ['Dobré odpoledne!'],
    evening: ['Dobrý večer!'],
    night: ['Dobrý večer! Už je pozdě, že?'],
    welcome: ['Vítejte ve městě {town}!', 'Tohle je {town}. Jste tu na návštěvě?'],
    capitalHere: ['{town} je hlavní město naší země.'],
    capitalThere: ['Naše hlavní město je {capital}. Stojí za návštěvu.'],
    big: ['Tohle je velké město. Snadno se tu ztratíte!'],
    middling: ['Ani velké, ani malé. Akorát.'],
    small: ['Je to malé místo. Tady se všichni znají.'],
    coast: ['Žijeme tady u vody. Ryby jsou výborné.'],
    inland: ['Moře je daleko, ale krajina je tu krásná.'],
    landmark: ['Nenechte si ujít {landmark}! Je to asi {km} km {dir}.'],
    landmarkNear: ['{landmark} je úplně blízko. Nemůžete to minout!'],
    hot: ['Dnes je horko! Najděte si stín.'],
    cold: ['Brr, dnes je zima! Oblečte se teple.'],
    mild: ['To je dnes krásné počasí.'],
    late: ['Už je pozdě. V noci jsou ulice tiché.'],
    country: ['{country} je krásná země. Užijte si ji!'],
    chat: ['Odkud jste? Nejste odsud.', 'Nespěchejte a rozhlédněte se. Je tu co vidět.'],
    bye: ['Na shledanou! Šťastnou cestu.'],
  },
};

const JA: Language = {
  locale: 'ja',
  name: 'Japanese',
  join: '',
  compass: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'],
  lines: {
    morning: ['おはようございます！'],
    afternoon: ['こんにちは！'],
    evening: ['こんばんは！'],
    night: ['こんばんは！もう遅い時間ですね。'],
    welcome: ['{town}へようこそ！', 'ここは{town}です。観光ですか？'],
    capitalHere: ['{town}はこの国の首都です。'],
    capitalThere: ['首都は{capital}です。一度は行く価値がありますよ。'],
    big: ['ここは大きな街です。迷子になりやすいですよ！'],
    middling: ['大きすぎず、小さすぎず。ちょうどいい街です。'],
    small: ['ここは小さな町です。みんな顔見知りなんですよ。'],
    coast: ['ここは水辺の町です。魚がとてもおいしいですよ。'],
    inland: ['海からは遠いですが、このあたりの景色はきれいです。'],
    landmark: ['{landmark}はぜひ見てください！ここから{dir}に約{km}キロです。'],
    landmarkNear: ['{landmark}はすぐ近くです。すぐにわかりますよ！'],
    hot: ['今日は暑いですね！日陰で休んでください。'],
    cold: ['うう、今日は寒いですね！暖かくしてください。'],
    mild: ['今日はいい天気ですね。'],
    late: ['もう遅いですね。夜は通りが静かです。'],
    country: ['{country}は素敵な国です。楽しんでください！'],
    chat: ['どちらから来たんですか？この辺の人じゃないですよね。', 'ゆっくり見ていってください。見どころがたくさんありますよ。'],
    bye: ['さようなら！良い旅を。'],
  },
};

const ZH: Language = {
  locale: 'zh-Hans',
  name: 'Chinese',
  join: '',
  compass: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'],
  lines: {
    morning: ['早上好！'],
    afternoon: ['下午好！'],
    evening: ['晚上好！'],
    night: ['晚上好！已经很晚了，是吧？'],
    welcome: ['欢迎来到{town}！', '这里是{town}。你是来旅游的吗？'],
    capitalHere: ['{town}是我们国家的首都。'],
    capitalThere: ['我们的首都是{capital}，值得去看看。'],
    big: ['这是一座大城市，在这里很容易迷路！'],
    middling: ['不大也不小，刚刚好。'],
    small: ['这是个小地方，大家都互相认识。'],
    coast: ['我们住在水边，这里的鱼很好吃。'],
    inland: ['这里离海很远，但风景很美。'],
    landmark: ['一定要去看看{landmark}！从这里往{dir}大约{km}公里。'],
    landmarkNear: ['{landmark}就在附近，你一定能找到！'],
    hot: ['今天真热！找个阴凉的地方吧。'],
    cold: ['哎呀，今天好冷！多穿点衣服。'],
    mild: ['今天天气真好。'],
    late: ['已经很晚了，晚上街上很安静。'],
    country: ['{country}是一个美丽的国家，好好享受吧！'],
    chat: ['你是哪里人？你不是本地人吧。', '慢慢逛，这里有很多值得看的东西。'],
    bye: ['再见！一路顺风。'],
  },
};

const ZH_HANT: Language = {
  locale: 'zh-Hant',
  name: 'Chinese',
  join: '',
  compass: ['北', '東北', '東', '東南', '南', '西南', '西', '西北'],
  lines: {
    morning: ['早安！'],
    afternoon: ['午安！'],
    evening: ['晚上好！'],
    night: ['晚上好！已經很晚了，對吧？'],
    welcome: ['歡迎來到{town}！', '這裡是{town}。你是來旅遊的嗎？'],
    capitalHere: ['{town}是我們國家的首都。'],
    capitalThere: ['我們的首都是{capital}，值得去看看。'],
    big: ['這是一座大城市，在這裡很容易迷路！'],
    middling: ['不大也不小，剛剛好。'],
    small: ['這是個小地方，大家都互相認識。'],
    coast: ['我們住在水邊，這裡的魚很好吃。'],
    inland: ['這裡離海很遠，但風景很美。'],
    landmark: ['一定要去看看{landmark}！從這裡往{dir}大約{km}公里。'],
    landmarkNear: ['{landmark}就在附近，你一定找得到！'],
    hot: ['今天真熱！找個陰涼的地方吧。'],
    cold: ['哎呀，今天好冷！多穿點衣服。'],
    mild: ['今天天氣真好。'],
    late: ['已經很晚了，晚上街上很安靜。'],
    country: ['{country}是一個美麗的國家，好好享受吧！'],
    chat: ['你是哪裡人？你不是本地人吧。', '慢慢逛，這裡有很多值得看的東西。'],
    bye: ['再見！一路順風。'],
  },
};

const KO: Language = {
  locale: 'ko',
  name: 'Korean',
  join: ' ',
  compass: ['북쪽으로', '북동쪽으로', '동쪽으로', '남동쪽으로', '남쪽으로', '남서쪽으로', '서쪽으로', '북서쪽으로'],
  lines: {
    morning: ['좋은 아침이에요!'],
    afternoon: ['안녕하세요!'],
    evening: ['안녕하세요!'],
    night: ['안녕하세요! 시간이 꽤 늦었네요.'],
    welcome: ['{town}에 오신 것을 환영합니다!', '여기는 {town}입니다. 여행 오셨어요?'],
    capitalHere: ['{town}, 바로 우리나라의 수도예요.'],
    capitalThere: ['우리나라의 수도는 {capital}입니다. 꼭 가 보세요.'],
    big: ['여기는 큰 도시예요. 길을 잃기 쉬워요!'],
    middling: ['크지도 작지도 않아요. 딱 좋아요.'],
    small: ['여기는 작은 동네예요. 다들 서로 알아요.'],
    coast: ['우리는 물가에 살아요. 생선이 정말 맛있어요.'],
    inland: ['바다에서는 멀지만, 이곳 풍경이 참 아름다워요.'],
    landmark: ['{landmark}, 꼭 보세요! 여기서 {dir} 약 {km}km 거리예요.'],
    landmarkNear: ['{landmark}, 바로 근처에 있어요. 금방 찾을 거예요!'],
    hot: ['오늘 덥네요! 그늘을 찾으세요.'],
    cold: ['으, 오늘 춥네요! 따뜻하게 입으세요.'],
    mild: ['오늘 날씨 참 좋네요.'],
    late: ['늦었네요. 밤에는 거리가 조용해요.'],
    country: ['{country}, 정말 아름다운 나라예요. 즐거운 시간 보내세요!'],
    chat: ['어디서 오셨어요? 이 동네 분이 아니시죠?', '천천히 둘러보세요. 볼거리가 많아요.'],
    bye: ['안녕히 가세요! 즐거운 여행 되세요.'],
  },
};

const AR: Language = {
  locale: 'ar',
  name: 'Arabic',
  rtl: true,
  join: ' ',
  compass: ['شمالًا', 'إلى الشمال الشرقي', 'شرقًا', 'إلى الجنوب الشرقي', 'جنوبًا', 'إلى الجنوب الغربي', 'غربًا', 'إلى الشمال الغربي'],
  lines: {
    morning: ['صباح الخير!'],
    afternoon: ['مساء الخير!'],
    evening: ['مساء الخير!'],
    night: ['مساء الخير! الوقت متأخر، أليس كذلك؟'],
    welcome: ['أهلًا بك في {town}!', 'هذه {town}. هل جئت للزيارة؟'],
    capitalHere: ['{town} هي عاصمة بلدنا.'],
    capitalThere: ['عاصمتنا هي {capital}. تستحق الزيارة.'],
    big: ['هذه مدينة كبيرة. من السهل أن تضيع هنا!'],
    middling: ['ليست كبيرة ولا صغيرة. مناسبة تمامًا.'],
    small: ['إنه مكان صغير. الجميع هنا يعرفون بعضهم.'],
    coast: ['نعيش هنا بجانب الماء. السمك لذيذ جدًا.'],
    inland: ['نحن بعيدون عن البحر، لكن الأرض هنا جميلة.'],
    landmark: ['لا تفوّت {landmark}! يبعد نحو {km} كم {dir}.'],
    landmarkNear: ['{landmark} قريب جدًا من هنا. لا يمكن أن يفوتك!'],
    hot: ['الجو حار اليوم! ابحث عن بعض الظل.'],
    cold: ['برر، الجو بارد اليوم! تدفّأ جيدًا.'],
    mild: ['ما أجمل الطقس اليوم.'],
    late: ['لقد تأخر الوقت. الشوارع هادئة في الليل.'],
    country: ['{country} بلد جميل. استمتع به!'],
    chat: ['من أين أنت؟ لست من هنا.', 'خذ وقتك وتجوّل. هناك الكثير لتراه.'],
    bye: ['مع السلامة! رحلة سعيدة.'],
  },
};

const FA: Language = {
  locale: 'fa',
  name: 'Persian',
  rtl: true,
  join: ' ',
  compass: [
    'به سمت شمال', 'به سمت شمال شرقی', 'به سمت شرق', 'به سمت جنوب شرقی',
    'به سمت جنوب', 'به سمت جنوب غربی', 'به سمت غرب', 'به سمت شمال غربی',
  ],
  lines: {
    morning: ['صبح بخیر!'],
    afternoon: ['روز بخیر!'],
    evening: ['عصر بخیر!'],
    night: ['سلام! دیروقت است، نه؟'],
    welcome: ['به {town} خوش آمدید!', 'اینجا {town} است. برای دیدن آمده‌اید؟'],
    capitalHere: ['{town} پایتخت کشور ماست.'],
    capitalThere: ['پایتخت ما {capital} است. ارزش دیدن دارد.'],
    big: ['اینجا شهر بزرگی است. راحت گم می‌شوید!'],
    middling: ['نه بزرگ است، نه کوچک. درست اندازه.'],
    small: ['اینجا جای کوچکی است. همه همدیگر را می‌شناسند.'],
    coast: ['ما اینجا کنار آب زندگی می‌کنیم. ماهی‌اش عالی است.'],
    inland: ['از دریا دوریم، اما اینجا سرزمین زیبایی است.'],
    landmark: ['{landmark} را از دست ندهید! از اینجا حدود {km} کیلومتر {dir} است.'],
    landmarkNear: ['{landmark} خیلی نزدیک است. حتماً پیدایش می‌کنید!'],
    hot: ['امروز هوا گرم است! یک سایه پیدا کنید.'],
    cold: ['برر، امروز هوا سرد است! لباس گرم بپوشید.'],
    mild: ['امروز چه هوای خوبی است.'],
    late: ['دیروقت است. شب‌ها خیابان‌ها آرام‌اند.'],
    country: ['{country} کشور زیبایی است. لذت ببرید!'],
    chat: ['اهل کجایید؟ اهل اینجا نیستید.', 'با حوصله اطراف را ببینید. چیزهای زیادی برای دیدن هست.'],
    bye: ['خداحافظ! سفر به خیر.'],
  },
};

const HE: Language = {
  locale: 'he',
  name: 'Hebrew',
  rtl: true,
  join: ' ',
  compass: [
    'צפונה מכאן', 'צפון-מזרחה מכאן', 'מזרחה מכאן', 'דרום-מזרחה מכאן',
    'דרומה מכאן', 'דרום-מערבה מכאן', 'מערבה מכאן', 'צפון-מערבה מכאן',
  ],
  lines: {
    morning: ['בוקר טוב!'],
    afternoon: ['צהריים טובים!'],
    evening: ['ערב טוב!'],
    night: ['ערב טוב! כבר מאוחר, נכון?'],
    welcome: ['ברוכים הבאים לעיר {town}!', 'זו העיר {town}. באתם לביקור?'],
    capitalHere: ['{town} היא בירת המדינה שלנו.'],
    capitalThere: ['הבירה שלנו היא {capital}. שווה לבקר שם.'],
    big: ['זו עיר גדולה. קל ללכת כאן לאיבוד!'],
    middling: ['לא גדולה ולא קטנה. בדיוק במידה.'],
    small: ['זה מקום קטן. כאן כולם מכירים את כולם.'],
    coast: ['אנחנו גרים כאן ליד המים. הדגים מצוינים.'],
    inland: ['אנחנו רחוקים מהים, אבל הנוף כאן יפהפה.'],
    landmark: ['אל תפספסו את {landmark}! זה בערך {km} ק״מ {dir}.'],
    landmarkNear: ['{landmark} ממש קרוב. אי אפשר לפספס!'],
    hot: ['חם היום! חפשו קצת צל.'],
    cold: ['ברר, קר היום! תתלבשו חם.'],
    mild: ['איזה מזג אוויר נהדר היום.'],
    late: ['כבר מאוחר. בלילה הרחובות שקטים.'],
    country: ['{country} היא ארץ יפה. תיהנו!'],
    chat: ['מאיפה אתם? אתם לא מכאן.', 'קחו את הזמן ותסתכלו מסביב. יש הרבה מה לראות.'],
    bye: ['להתראות! נסיעה טובה.'],
  },
};

const HI: Language = {
  locale: 'hi',
  name: 'Hindi',
  join: ' ',
  compass: ['उत्तर में', 'उत्तर-पूर्व में', 'पूर्व में', 'दक्षिण-पूर्व में', 'दक्षिण में', 'दक्षिण-पश्चिम में', 'पश्चिम में', 'उत्तर-पश्चिम में'],
  lines: {
    morning: ['सुप्रभात!'],
    afternoon: ['नमस्ते!'],
    evening: ['शुभ संध्या!'],
    night: ['नमस्ते! काफ़ी देर हो गई है, है ना?'],
    welcome: ['{town} में आपका स्वागत है!', 'यह {town} है। क्या आप घूमने आए हैं?'],
    capitalHere: ['{town} हमारे देश की राजधानी है।'],
    capitalThere: ['हमारी राजधानी {capital} है। वहाँ ज़रूर जाइए।'],
    big: ['यह एक बड़ा शहर है। यहाँ रास्ता भटकना आसान है!'],
    middling: ['न बहुत बड़ा, न बहुत छोटा। बिलकुल सही।'],
    small: ['यह एक छोटी-सी जगह है। यहाँ सब एक-दूसरे को जानते हैं।'],
    coast: ['हम यहाँ पानी के किनारे रहते हैं। यहाँ की मछली बहुत अच्छी है।'],
    inland: ['समुद्र यहाँ से दूर है, लेकिन यह इलाक़ा बहुत सुंदर है।'],
    landmark: ['{landmark} ज़रूर देखिए! यह यहाँ से लगभग {km} किमी {dir} है।'],
    landmarkNear: ['{landmark} बहुत पास है। आप उसे ज़रूर देख लेंगे!'],
    hot: ['आज बहुत गर्मी है! थोड़ी छाँव ढूँढ लीजिए।'],
    cold: ['ब्र्र, आज ठंड है! गर्म कपड़े पहन लीजिए।'],
    mild: ['आज मौसम कितना अच्छा है।'],
    late: ['देर हो गई है। रात में सड़कें शांत रहती हैं।'],
    country: ['{country} एक सुंदर देश है। इसका आनंद लीजिए!'],
    chat: ['आप कहाँ से हैं? आप यहाँ के नहीं लगते।', 'आराम से घूमिए। यहाँ देखने को बहुत कुछ है।'],
    bye: ['अलविदा! आपकी यात्रा शुभ हो।'],
  },
};

const BN: Language = {
  locale: 'bn',
  name: 'Bengali',
  join: ' ',
  compass: ['উত্তরে', 'উত্তর-পূর্বে', 'পূর্বে', 'দক্ষিণ-পূর্বে', 'দক্ষিণে', 'দক্ষিণ-পশ্চিমে', 'পশ্চিমে', 'উত্তর-পশ্চিমে'],
  lines: {
    morning: ['শুভ সকাল!'],
    afternoon: ['শুভ অপরাহ্ন!'],
    evening: ['শুভ সন্ধ্যা!'],
    night: ['শুভ সন্ধ্যা! অনেক রাত হয়ে গেছে, তাই না?'],
    welcome: ['{town}-এ আপনাকে স্বাগতম!', 'এটা {town}। আপনি কি বেড়াতে এসেছেন?'],
    capitalHere: ['{town} আমাদের দেশের রাজধানী।'],
    capitalThere: ['আমাদের রাজধানী {capital}। সেখানে একবার যাওয়ার মতো।'],
    big: ['এটা একটা বড় শহর। এখানে সহজেই পথ হারানো যায়!'],
    middling: ['খুব বড়ও না, খুব ছোটও না। ঠিকঠাক।'],
    small: ['এটা একটা ছোট জায়গা। এখানে সবাই সবাইকে চেনে।'],
    coast: ['আমরা এখানে পানির ধারে থাকি। মাছ খুব ভালো।'],
    inland: ['সাগর অনেক দূরে, কিন্তু এখানকার প্রকৃতি খুব সুন্দর।'],
    landmark: ['{landmark} অবশ্যই দেখবেন! এখান থেকে প্রায় {km} কিমি {dir}।'],
    landmarkNear: ['{landmark} খুব কাছেই। আপনি সহজেই খুঁজে পাবেন!'],
    hot: ['আজ খুব গরম! একটু ছায়া খুঁজে নিন।'],
    cold: ['উফ, আজ বেশ ঠান্ডা! গরম কাপড় পরে নিন।'],
    mild: ['আজ আবহাওয়াটা কী সুন্দর।'],
    late: ['রাত হয়ে গেছে। রাতে রাস্তাগুলো শান্ত থাকে।'],
    country: ['{country} একটি সুন্দর দেশ। উপভোগ করুন!'],
    chat: ['আপনি কোথা থেকে এসেছেন? আপনি তো এখানকার নন।', 'ধীরে-সুস্থে ঘুরে দেখুন। এখানে দেখার অনেক কিছু আছে।'],
    bye: ['বিদায়! আপনার যাত্রা শুভ হোক।'],
  },
};

const UR: Language = {
  locale: 'ur',
  name: 'Urdu',
  rtl: true,
  join: ' ',
  compass: ['شمال میں', 'شمال مشرق میں', 'مشرق میں', 'جنوب مشرق میں', 'جنوب میں', 'جنوب مغرب میں', 'مغرب میں', 'شمال مغرب میں'],
  lines: {
    morning: ['صبح بخیر!'],
    afternoon: ['السلام علیکم!'],
    evening: ['شام بخیر!'],
    night: ['شام بخیر! کافی دیر ہو گئی ہے، ہے نا؟'],
    welcome: ['{town} میں خوش آمدید!', 'یہ {town} ہے۔ کیا آپ گھومنے آئے ہیں؟'],
    capitalHere: ['{town} ہمارے ملک کا دارالحکومت ہے۔'],
    capitalThere: ['ہمارا دارالحکومت {capital} ہے۔ وہاں ضرور جائیے۔'],
    big: ['یہ ایک بڑا شہر ہے۔ یہاں راستہ بھٹکنا آسان ہے!'],
    middling: ['نہ بہت بڑا، نہ بہت چھوٹا۔ بالکل ٹھیک۔'],
    small: ['یہ ایک چھوٹی سی جگہ ہے۔ یہاں سب ایک دوسرے کو جانتے ہیں۔'],
    coast: ['ہم یہاں پانی کے کنارے رہتے ہیں۔ یہاں کی مچھلی بہت اچھی ہے۔'],
    inland: ['سمندر یہاں سے دور ہے، لیکن یہ علاقہ بہت خوبصورت ہے۔'],
    landmark: ['{landmark} ضرور دیکھیے! یہ یہاں سے تقریباً {km} کلومیٹر {dir} ہے۔'],
    landmarkNear: ['{landmark} بہت قریب ہے۔ آپ اسے ضرور دیکھ لیں گے!'],
    hot: ['آج بہت گرمی ہے! تھوڑا سایہ ڈھونڈ لیجیے۔'],
    cold: ['برر، آج سردی ہے! گرم کپڑے پہن لیجیے۔'],
    mild: ['آج موسم کتنا اچھا ہے۔'],
    late: ['دیر ہو گئی ہے۔ رات کو سڑکیں پرسکون رہتی ہیں۔'],
    country: ['{country} ایک خوبصورت ملک ہے۔ لطف اٹھائیے!'],
    chat: ['آپ کہاں سے ہیں؟ آپ یہاں کے نہیں لگتے۔', 'آرام سے گھومیے۔ یہاں دیکھنے کو بہت کچھ ہے۔'],
    bye: ['خدا حافظ! آپ کا سفر اچھا گزرے۔'],
  },
};

const TH: Language = {
  locale: 'th',
  name: 'Thai',
  join: ' ',
  compass: [
    'ทางเหนือ', 'ทางตะวันออกเฉียงเหนือ', 'ทางตะวันออก', 'ทางตะวันออกเฉียงใต้',
    'ทางใต้', 'ทางตะวันตกเฉียงใต้', 'ทางตะวันตก', 'ทางตะวันตกเฉียงเหนือ',
  ],
  lines: {
    morning: ['อรุณสวัสดิ์!'],
    afternoon: ['สวัสดี!'],
    evening: ['สวัสดีตอนเย็น!'],
    night: ['สวัสดี! ดึกแล้วนะ ว่าไหม'],
    welcome: ['ยินดีต้อนรับสู่ {town}!', 'ที่นี่คือ {town} มาเที่ยวเหรอ'],
    capitalHere: ['{town} เป็นเมืองหลวงของประเทศเรา'],
    capitalThere: ['เมืองหลวงของเราคือ {capital} น่าไปเที่ยวนะ'],
    big: ['ที่นี่เป็นเมืองใหญ่ หลงทางง่ายมาก!'],
    middling: ['ไม่ใหญ่ไม่เล็ก กำลังดี'],
    small: ['ที่นี่เป็นเมืองเล็ก ๆ ทุกคนรู้จักกันหมด'],
    coast: ['เราอยู่ริมน้ำ ปลาที่นี่อร่อยมาก'],
    inland: ['ที่นี่ไกลทะเล แต่ธรรมชาติสวยมาก'],
    landmark: ['ต้องไปดู {landmark} ให้ได้นะ! อยู่ห่างจากที่นี่ไป{dir}ประมาณ {km} กม.'],
    landmarkNear: ['{landmark} อยู่ใกล้ ๆ นี่เอง หาไม่ยากหรอก!'],
    hot: ['วันนี้ร้อนจัง! หาที่ร่มหลบแดดนะ'],
    cold: ['บรื๋อ วันนี้หนาวจัง! ใส่เสื้อหนา ๆ นะ'],
    mild: ['วันนี้อากาศดีจังเลย'],
    late: ['ดึกแล้ว ตอนกลางคืนถนนเงียบสงบ'],
    country: ['{country} เป็นประเทศที่สวยงาม ขอให้สนุกนะ!'],
    chat: ['มาจากไหนเหรอ ไม่ใช่คนแถวนี้ใช่ไหม', 'ค่อย ๆ เดินดูนะ ที่นี่มีอะไรให้ดูเยอะเลย'],
    bye: ['ลาก่อน! เดินทางปลอดภัยนะ'],
  },
};

const VI: Language = {
  locale: 'vi',
  name: 'Vietnamese',
  join: ' ',
  compass: ['bắc', 'đông bắc', 'đông', 'đông nam', 'nam', 'tây nam', 'tây', 'tây bắc'],
  lines: {
    morning: ['Chào buổi sáng!'],
    afternoon: ['Chào buổi chiều!'],
    evening: ['Chào buổi tối!'],
    night: ['Chào buổi tối! Muộn rồi nhỉ?'],
    welcome: ['Chào mừng bạn đến {town}!', 'Đây là {town}. Bạn đến tham quan à?'],
    capitalHere: ['{town} là thủ đô của nước chúng tôi.'],
    capitalThere: ['Thủ đô của chúng tôi là {capital}. Đáng để ghé thăm lắm.'],
    big: ['Đây là một thành phố lớn. Ở đây dễ bị lạc lắm!'],
    middling: ['Không lớn cũng không nhỏ. Vừa vặn.'],
    small: ['Đây là một nơi nhỏ. Ở đây ai cũng biết nhau.'],
    coast: ['Chúng tôi sống bên sông nước. Cá ở đây ngon lắm.'],
    inland: ['Ở đây xa biển, nhưng cảnh vật rất đẹp.'],
    landmark: ['Nhất định phải xem {landmark} nhé! Cách đây khoảng {km} km về phía {dir}.'],
    landmarkNear: ['{landmark} ở ngay gần đây. Bạn không thể bỏ lỡ đâu!'],
    hot: ['Hôm nay nóng quá! Tìm chỗ râm mát nhé.'],
    cold: ['Brr, hôm nay lạnh quá! Mặc ấm vào nhé.'],
    mild: ['Hôm nay trời đẹp quá.'],
    late: ['Muộn rồi. Ban đêm đường phố yên tĩnh lắm.'],
    country: ['{country} là một đất nước tuyệt đẹp. Hãy tận hưởng nhé!'],
    chat: ['Bạn từ đâu đến? Bạn không phải người ở đây nhỉ.', 'Cứ thong thả mà ngắm nhìn. Ở đây có nhiều thứ để xem lắm.'],
    bye: ['Tạm biệt! Chúc bạn thượng lộ bình an.'],
  },
};

/** Bahasa Indonesia and Bahasa Melayu point the same way. */
const NUSANTARA_COMPASS: Language['compass'] = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];

const ID: Language = {
  locale: 'id',
  name: 'Indonesian',
  join: ' ',
  compass: NUSANTARA_COMPASS,
  lines: {
    morning: ['Selamat pagi!'],
    afternoon: ['Selamat siang!'],
    evening: ['Selamat sore!'],
    night: ['Selamat malam! Sudah larut, ya?'],
    welcome: ['Selamat datang di {town}!', 'Ini {town}. Sedang berkunjung?'],
    capitalHere: ['{town} adalah ibu kota negara kami.'],
    capitalThere: ['Ibu kota kami adalah {capital}. Layak dikunjungi.'],
    big: ['Ini kota besar. Mudah sekali tersesat di sini!'],
    middling: ['Tidak besar, tidak kecil. Pas.'],
    small: ['Ini tempat kecil. Semua orang di sini saling kenal.'],
    coast: ['Kami tinggal di tepi air. Ikannya enak sekali.'],
    inland: ['Kami jauh dari laut, tapi alamnya indah.'],
    landmark: ['Jangan lewatkan {landmark}! Jaraknya sekitar {km} km ke arah {dir} dari sini.'],
    landmarkNear: ['{landmark} dekat sekali. Pasti ketemu!'],
    hot: ['Hari ini panas! Cari tempat teduh, ya.'],
    cold: ['Brr, hari ini dingin! Pakai baju hangat.'],
    mild: ['Cuacanya bagus sekali hari ini.'],
    late: ['Sudah larut. Malam hari jalanan sepi.'],
    country: ['{country} negara yang indah. Selamat menikmati!'],
    chat: ['Dari mana asalnya? Sepertinya bukan orang sini.', 'Santai saja, lihat-lihat. Banyak yang bisa dilihat di sini.'],
    bye: ['Sampai jumpa! Selamat jalan.'],
  },
};

const MS: Language = {
  locale: 'ms',
  name: 'Malay',
  join: ' ',
  compass: NUSANTARA_COMPASS,
  lines: {
    morning: ['Selamat pagi!'],
    afternoon: ['Selamat tengah hari!'],
    evening: ['Selamat petang!'],
    night: ['Selamat malam! Sudah lewat malam, kan?'],
    welcome: ['Selamat datang ke {town}!', 'Ini {town}. Datang melawat?'],
    capitalHere: ['{town} ialah ibu negara kami.'],
    capitalThere: ['Ibu negara kami ialah {capital}. Memang berbaloi dilawati.'],
    big: ['Ini bandar besar. Senang sesat di sini!'],
    middling: ['Tidak besar, tidak kecil. Sedang elok.'],
    small: ['Ini tempat kecil. Semua orang di sini kenal satu sama lain.'],
    coast: ['Kami tinggal di tepi air. Ikannya sangat sedap.'],
    inland: ['Kami jauh dari laut, tetapi alamnya cantik.'],
    landmark: ['Jangan lepaskan peluang melihat {landmark}! Jaraknya kira-kira {km} km ke arah {dir} dari sini.'],
    landmarkNear: ['{landmark} sangat dekat. Pasti jumpa!'],
    hot: ['Panasnya hari ini! Carilah tempat teduh.'],
    cold: ['Brr, sejuknya hari ini! Pakai baju tebal.'],
    mild: ['Cantiknya cuaca hari ini.'],
    late: ['Sudah lewat malam. Pada waktu malam jalan-jalan sunyi.'],
    country: ['{country} negara yang indah. Selamat menikmatinya!'],
    chat: ['Dari mana asal awak? Awak bukan orang sini, kan?', 'Ambil masa, lihat-lihat sekeliling. Banyak yang boleh dilihat di sini.'],
    bye: ['Selamat jalan! Semoga perjalanan anda menyeronokkan.'],
  },
};

const SW: Language = {
  locale: 'sw',
  name: 'Swahili',
  join: ' ',
  compass: [
    'upande wa kaskazini', 'upande wa kaskazini-mashariki', 'upande wa mashariki', 'upande wa kusini-mashariki',
    'upande wa kusini', 'upande wa kusini-magharibi', 'upande wa magharibi', 'upande wa kaskazini-magharibi',
  ],
  lines: {
    morning: ['Habari za asubuhi!'],
    afternoon: ['Habari za mchana!'],
    evening: ['Habari za jioni!'],
    night: ['Habari za usiku! Ni usiku sana, sivyo?'],
    welcome: ['Karibu {town}!', 'Hapa ni {town}. Umekuja kutembelea?'],
    capitalHere: ['{town} ni mji mkuu wa nchi yetu.'],
    capitalThere: ['Mji mkuu wetu ni {capital}. Unafaa kutembelewa.'],
    big: ['Huu ni mji mkubwa. Ni rahisi kupotea hapa!'],
    middling: ['Si mkubwa, si mdogo. Unafaa kabisa.'],
    small: ['Hapa ni mahali padogo. Kila mtu anamjua mwenzake.'],
    coast: ['Tunaishi kando ya maji hapa. Samaki ni watamu sana.'],
    inland: ['Tuko mbali na bahari, lakini nchi hii ni nzuri sana.'],
    landmark: ['Usikose kuona {landmark}! Iko umbali wa kilomita {km} hivi {dir}.'],
    landmarkNear: ['{landmark} iko karibu sana. Huwezi kukosa!'],
    hot: ['Leo kuna joto! Tafuta kivuli kidogo.'],
    cold: ['Brr, leo kuna baridi! Vaa nguo za joto.'],
    mild: ['Hali ya hewa ni nzuri sana leo.'],
    late: ['Ni usiku sasa. Usiku mitaa huwa kimya.'],
    country: ['{country} ni nchi nzuri. Furahia!'],
    chat: ['Unatoka wapi? Wewe si mwenyeji wa hapa.', 'Usiwe na haraka, angalia huku na huko. Kuna mengi ya kuona.'],
    bye: ['Kwaheri! Safari njema.'],
  },
};

const TL: Language = {
  locale: 'fil',
  name: 'Filipino',
  join: ' ',
  compass: [
    'sa hilaga', 'sa hilagang-silangan', 'sa silangan', 'sa timog-silangan',
    'sa timog', 'sa timog-kanluran', 'sa kanluran', 'sa hilagang-kanluran',
  ],
  lines: {
    morning: ['Magandang umaga!'],
    afternoon: ['Magandang hapon!'],
    evening: ['Magandang gabi!'],
    night: ["Magandang gabi! Gabi na, 'di ba?"],
    welcome: ['Maligayang pagdating sa {town}!', 'Ito ang {town}. Namamasyal ka ba?'],
    capitalHere: ['Ang {town} ang kabisera ng aming bansa.'],
    capitalThere: ['Ang aming kabisera ay {capital}. Sulit itong puntahan.'],
    big: ['Malaking lungsod ito. Madaling maligaw dito!'],
    middling: ['Hindi malaki, hindi maliit. Sakto lang.'],
    small: ['Maliit na lugar ito. Magkakakilala ang lahat dito.'],
    coast: ['Nakatira kami sa tabi ng tubig. Napakasarap ng isda rito.'],
    inland: ['Malayo kami sa dagat, pero maganda ang lugar dito.'],
    landmark: ['Huwag palampasin ang {landmark}! Mga {km} km ito {dir}.'],
    landmarkNear: ['Napakalapit lang ng {landmark}. Hindi mo ito malalampasan!'],
    hot: ['Ang init ngayon! Humanap ka ng lilim.'],
    cold: ['Brr, ang lamig ngayon! Magbalot ka nang mabuti.'],
    mild: ['Ang ganda ng panahon ngayon.'],
    late: ['Gabi na. Tahimik ang mga kalye sa gabi.'],
    country: ['Magandang bansa ang {country}. Mag-enjoy ka!'],
    chat: ['Taga-saan ka? Hindi ka taga-rito, ano?', 'Dahan-dahan lang, tumingin-tingin ka. Maraming makikita rito.'],
    bye: ['Paalam! Ingat sa biyahe.'],
  },
};

/** Every language, English first: the one that defines the tables' shape. */
export const LANGUAGES: Readonly<Record<string, Language>> = {
  en: EN, es: ES, fr: FR, de: DE, it: IT, pt: PT, nl: NL, sv: SV, pl: PL, ru: RU, uk: UK, tr: TR, el: EL,
  ro: RO, cs: CS, ja: JA, zh: ZH, 'zh-Hant': ZH_HANT, ko: KO, ar: AR, fa: FA, he: HE, hi: HI, bn: BN, ur: UR,
  th: TH, vi: VI, id: ID, ms: MS, sw: SW, tl: TL,
};

/**
 * What each country speaks to a stranger, by its outline code, as `[language,
 * ISO 3166 alpha-2]`; the second is what `Intl.DisplayNames` names the country
 * by in that language. Mostly GeoNames' first language for the country
 * (`countries-info.json`), and where it is not the one a person in the street
 * would greet you in, the one they would: Hindi in India, where GeoNames puts
 * English first; Swahili in Kenya; Russian in Belarus, Kazakhstan and
 * Kyrgyzstan; French in Cameroon, Haiti and Luxembourg. A country not listed
 * is spoken to in English, which is what a traveller would try there.
 */
export const SPOKEN: Readonly<Record<string, readonly [string, string]>> = {
  // Spanish
  ARG: ['es', 'AR'], BOL: ['es', 'BO'], CHL: ['es', 'CL'], COL: ['es', 'CO'], CRI: ['es', 'CR'], CUB: ['es', 'CU'],
  DOM: ['es', 'DO'], ECU: ['es', 'EC'], SLV: ['es', 'SV'], GNQ: ['es', 'GQ'], GTM: ['es', 'GT'], HND: ['es', 'HN'],
  MEX: ['es', 'MX'], NIC: ['es', 'NI'], PAN: ['es', 'PA'], PRY: ['es', 'PY'], PER: ['es', 'PE'], ESP: ['es', 'ES'],
  URY: ['es', 'UY'], VEN: ['es', 'VE'], PRI: ['es', 'PR'],
  // French
  BEN: ['fr', 'BJ'], BFA: ['fr', 'BF'], BDI: ['fr', 'BI'], CAF: ['fr', 'CF'], TCD: ['fr', 'TD'], CIV: ['fr', 'CI'],
  COD: ['fr', 'CD'], DJI: ['fr', 'DJ'], FRA: ['fr', 'FR'], PYF: ['fr', 'PF'], ATF: ['fr', 'TF'], GAB: ['fr', 'GA'],
  GIN: ['fr', 'GN'], MDG: ['fr', 'MG'], MLI: ['fr', 'ML'], NCL: ['fr', 'NC'], NER: ['fr', 'NE'], COG: ['fr', 'CG'],
  SPM: ['fr', 'PM'], MAF: ['fr', 'MF'], SEN: ['fr', 'SN'], TGO: ['fr', 'TG'], WLF: ['fr', 'WF'], CMR: ['fr', 'CM'],
  HTI: ['fr', 'HT'], LUX: ['fr', 'LU'], MCO: ['fr', 'MC'],
  // Arabic
  DZA: ['ar', 'DZ'], BHR: ['ar', 'BH'], COM: ['ar', 'KM'], EGY: ['ar', 'EG'], IRQ: ['ar', 'IQ'], JOR: ['ar', 'JO'],
  KWT: ['ar', 'KW'], LBN: ['ar', 'LB'], LBY: ['ar', 'LY'], MRT: ['ar', 'MR'], MAR: ['ar', 'MA'], OMN: ['ar', 'OM'],
  PSE: ['ar', 'PS'], QAT: ['ar', 'QA'], SAU: ['ar', 'SA'], SDN: ['ar', 'SD'], SYR: ['ar', 'SY'], TUN: ['ar', 'TN'],
  ARE: ['ar', 'AE'], ESH: ['ar', 'EH'], YEM: ['ar', 'YE'],
  // Portuguese
  AGO: ['pt', 'AO'], BRA: ['pt', 'BR'], GNB: ['pt', 'GW'], MOZ: ['pt', 'MZ'], PRT: ['pt', 'PT'], CPV: ['pt', 'CV'],
  STP: ['pt', 'ST'], TLS: ['pt', 'TL'],
  // Dutch, German, Italian, Swedish
  ABW: ['nl', 'AW'], BEL: ['nl', 'BE'], CUW: ['nl', 'CW'], NLD: ['nl', 'NL'], SUR: ['nl', 'SR'],
  AUT: ['de', 'AT'], DEU: ['de', 'DE'], LIE: ['de', 'LI'], CHE: ['de', 'CH'],
  ITA: ['it', 'IT'], SMR: ['it', 'SM'], VAT: ['it', 'VA'],
  ALA: ['sv', 'AX'], SWE: ['sv', 'SE'],
  // Chinese
  CHN: ['zh', 'CN'], SGP: ['zh', 'SG'], HKG: ['zh-Hant', 'HK'], MAC: ['zh-Hant', 'MO'], TWN: ['zh-Hant', 'TW'],
  // The rest, one or a few countries each
  AFG: ['fa', 'AF'], IRN: ['fa', 'IR'],
  BRN: ['ms', 'BN'], MYS: ['ms', 'MY'],
  CYP: ['el', 'CY'], GRC: ['el', 'GR'],
  PRK: ['ko', 'KP'], KOR: ['ko', 'KR'],
  MDA: ['ro', 'MD'], ROU: ['ro', 'RO'],
  RUS: ['ru', 'RU'], BLR: ['ru', 'BY'], KAZ: ['ru', 'KZ'], KGZ: ['ru', 'KG'],
  TZA: ['sw', 'TZ'], KEN: ['sw', 'KE'],
  TUR: ['tr', 'TR'], CYN: ['tr', ''],
  PHL: ['tl', 'PH'], BGD: ['bn', 'BD'], CZE: ['cs', 'CZ'], ISR: ['he', 'IL'], IND: ['hi', 'IN'],
  IDN: ['id', 'ID'], JPN: ['ja', 'JP'], POL: ['pl', 'PL'], THA: ['th', 'TH'], UKR: ['uk', 'UA'],
  PAK: ['ur', 'PK'], VNM: ['vi', 'VN'],
};

/** The language a country's people speak to a stranger, and its alpha-2 code ('' if it has none). */
export function languageOf(iso: string): { language: Language; alpha2: string } {
  const spoken = SPOKEN[iso];
  const language = spoken === undefined ? undefined : LANGUAGES[spoken[0]];
  return language === undefined ? { language: EN, alpha2: '' } : { language, alpha2: spoken![1] };
}

/** `{name}` in a template, and the names a template uses. */
export const PLACEHOLDER_PATTERN = /\{([a-zA-Z]+)\}/g;

/**
 * A template with its placeholders filled in. Each value is set off in
 * Unicode's first-strong isolates, so a Latin name in an Arabic sentence
 * keeps its own direction and does not drag the punctuation after it across
 * the line.
 */
export function fill(template: string, values: Readonly<Partial<Record<Placeholder, string>>>, isolate = true): string {
  return template.replace(PLACEHOLDER_PATTERN, (whole, name: string) => {
    const value = values[name as Placeholder];
    if (value === undefined) return whole;
    return isolate ? `⁨${value}⁩` : value;
  });
}
