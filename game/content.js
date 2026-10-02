/*
  Innhold: quizspørsmål (runde 2, 6, 9 og 10) og ord til forklar-mime (runde 4).
  Spørsmål: { c: kategori, q: spørsmål, a: [fire alternativer], r: indeks for riktig svar }
  Legg gjerne til flere. Alternativene stokkes når spørsmålet brukes.
*/

const QUESTIONS = [
  // Geografi
  { c: "Geografi", q: "Hva er hovedstaden i Australia?", a: ["Sydney", "Canberra", "Melbourne", "Perth"], r: 1 },
  { c: "Geografi", q: "Hvilken er Norges lengste elv?", a: ["Glomma", "Tana", "Numedalslågen", "Gudbrandsdalslågen"], r: 0 },
  { c: "Geografi", q: "Hvilket land har flest innbyggere i Afrika?", a: ["Egypt", "Etiopia", "Nigeria", "Sør-Afrika"], r: 2 },
  { c: "Geografi", q: "Hva er Norges høyeste fjell?", a: ["Glittertind", "Galdhøpiggen", "Store Skagastølstind", "Snøhetta"], r: 1 },
  { c: "Geografi", q: "Hvilket hav ligger mellom Europa og Nord-Amerika?", a: ["Stillehavet", "Indiahavet", "Atlanterhavet", "Nordishavet"], r: 2 },
  { c: "Geografi", q: "Hva er hovedstaden i Canada?", a: ["Toronto", "Vancouver", "Montreal", "Ottawa"], r: 3 },
  { c: "Geografi", q: "Hvilken by kalles «Den evige stad»?", a: ["Athen", "Roma", "Jerusalem", "Istanbul"], r: 1 },
  { c: "Geografi", q: "Hvilket land har formen som en støvel?", a: ["Hellas", "Spania", "Italia", "Portugal"], r: 2 },
  { c: "Geografi", q: "Hvilken er verdens største ørken (regnet med polarørkener)?", a: ["Sahara", "Antarktis", "Gobi", "Kalahari"], r: 1 },
  { c: "Geografi", q: "Hvor mange fylker har Norge fra 2024?", a: ["11", "15", "19", "13"], r: 1 },
  { c: "Geografi", q: "Hva er hovedstaden i Island?", a: ["Reykjavík", "Akureyri", "Tórshavn", "Nuuk"], r: 0 },
  { c: "Geografi", q: "Hvilken elv renner gjennom Kairo?", a: ["Niger", "Kongo", "Nilen", "Eufrat"], r: 2 },
  { c: "Geografi", q: "Hvilket land har flest innbyggere i verden (2024)?", a: ["Kina", "USA", "India", "Indonesia"], r: 2 },
  { c: "Geografi", q: "I hvilken by ligger Nidarosdomen?", a: ["Bergen", "Stavanger", "Trondheim", "Hamar"], r: 2 },
  { c: "Geografi", q: "Hvilket land ligger IKKE i Skandinavia?", a: ["Norge", "Sverige", "Danmark", "Polen"], r: 3 },
  { c: "Geografi", q: "Hva er verdens minste land?", a: ["Monaco", "Vatikanstaten", "San Marino", "Liechtenstein"], r: 1 },

  // Historie
  { c: "Historie", q: "Hvilket år ble Norges grunnlov underskrevet?", a: ["1814", "1905", "1884", "1772"], r: 0 },
  { c: "Historie", q: "Hvilket år ble unionen med Sverige oppløst?", a: ["1814", "1905", "1945", "1885"], r: 1 },
  { c: "Historie", q: "Hvem var den første personen på månen?", a: ["Buzz Aldrin", "Juri Gagarin", "Neil Armstrong", "Michael Collins"], r: 2 },
  { c: "Historie", q: "Hvilket år falt Berlinmuren?", a: ["1987", "1989", "1991", "1985"], r: 1 },
  { c: "Historie", q: "Hvem var Norges første kvinnelige statsminister?", a: ["Erna Solberg", "Gro Harlem Brundtland", "Kari Lise Holmberg", "Siv Jensen"], r: 1 },
  { c: "Historie", q: "Hvilket skip sank på sin første tur i 1912?", a: ["Lusitania", "Titanic", "Britannic", "Olympic"], r: 1 },
  { c: "Historie", q: "Hvem nådde Sydpolen først?", a: ["Robert F. Scott", "Fridtjof Nansen", "Roald Amundsen", "Ernest Shackleton"], r: 2 },
  { c: "Historie", q: "Hvilket år startet andre verdenskrig?", a: ["1939", "1914", "1941", "1936"], r: 0 },
  { c: "Historie", q: "Hva het vikingen som ifølge sagaene kom til Amerika rundt år 1000?", a: ["Erik Raude", "Leiv Eiriksson", "Olav Tryggvason", "Harald Hardråde"], r: 1 },
  { c: "Historie", q: "Hvilken by var hovedstad i Norge før Oslo i middelalderen?", a: ["Bergen", "Stavanger", "Tønsberg", "Hamar"], r: 0 },
  { c: "Historie", q: "Hvem malte «Skrik»?", a: ["Edvard Munch", "Edvard Grieg", "Henrik Ibsen", "Gustav Vigeland"], r: 0 },
  { c: "Historie", q: "Hvilket land ga Frihetsgudinnen til USA?", a: ["Storbritannia", "Spania", "Frankrike", "Nederland"], r: 2 },
  { c: "Historie", q: "Hva het den første kongen etter at Norge ble selvstendig i 1905?", a: ["Olav V", "Haakon VII", "Harald V", "Oscar II"], r: 1 },
  { c: "Historie", q: "Hvilket år ble det første OL i moderne tid arrangert?", a: ["1896", "1900", "1912", "1888"], r: 0 },
  { c: "Historie", q: "Hvilket år ble Norge okkupert av Tyskland?", a: ["1939", "1940", "1941", "1942"], r: 1 },
  { c: "Historie", q: "Hvem skrev «Et dukkehjem»?", a: ["Bjørnstjerne Bjørnson", "Henrik Ibsen", "Knut Hamsun", "Sigrid Undset"], r: 1 },

  // Sport
  { c: "Sport", q: "Hvor mange spillere har et fotballag på banen samtidig?", a: ["9", "10", "11", "12"], r: 2 },
  { c: "Sport", q: "Hvilket land har vunnet flest fotball-VM for menn?", a: ["Tyskland", "Italia", "Argentina", "Brasil"], r: 3 },
  { c: "Sport", q: "Hvilken by arrangerte vinter-OL i 1994?", a: ["Oslo", "Lillehammer", "Albertville", "Calgary"], r: 1 },
  { c: "Sport", q: "Hvor mange poeng er en touchdown verdt i amerikansk fotball?", a: ["3", "6", "7", "5"], r: 1 },
  { c: "Sport", q: "Hvilken sport forbindes med Magnus Carlsen?", a: ["Poker", "Sjakk", "Tennis", "Golf"], r: 1 },
  { c: "Sport", q: "Hvor lang er et maratonløp?", a: ["40 km", "42,195 km", "45 km", "38,5 km"], r: 1 },
  { c: "Sport", q: "Hvilken idrett driver Karsten Warholm med?", a: ["Skiskyting", "Friidrett", "Svømming", "Sykling"], r: 1 },
  { c: "Sport", q: "Hvor mange ringer er det i OL-symbolet?", a: ["4", "5", "6", "7"], r: 1 },
  { c: "Sport", q: "Hva kalles det når man får tre mål i én kamp?", a: ["Hat-trick", "Triple", "Treer", "Strike"], r: 0 },
  { c: "Sport", q: "Hvilken klubb spiller Erling Braut Haaland for (2024)?", a: ["Manchester United", "Real Madrid", "Manchester City", "Liverpool"], r: 2 },
  { c: "Sport", q: "I hvilken idrett bruker man en «puck»?", a: ["Curling", "Ishockey", "Bandy", "Polo"], r: 1 },
  { c: "Sport", q: "Hvor mange hull spiller man på en vanlig golfrunde?", a: ["9", "12", "18", "21"], r: 2 },
  { c: "Sport", q: "Hvilket land vant fotball-VM for menn i 2022?", a: ["Frankrike", "Argentina", "Kroatia", "Brasil"], r: 1 },
  { c: "Sport", q: "Hva heter den berømte sykkelkonkurransen i Frankrike?", a: ["Giro d'Italia", "Tour de France", "Vuelta", "Paris–Roubaix"], r: 1 },
  { c: "Sport", q: "Hvor mange spillere er det på et håndballag på banen (inkludert keeper)?", a: ["6", "7", "8", "5"], r: 1 },
  { c: "Sport", q: "Hvilken utøver har flest OL-medaljer i vinter-OL (per 2024)?", a: ["Bjørn Dæhlie", "Marit Bjørgen", "Ole Einar Bjørndalen", "Johannes Høsflot Klæbo"], r: 1 },

  // Natur og vitenskap
  { c: "Natur og vitenskap", q: "Hva er det kjemiske symbolet for gull?", a: ["Gd", "Go", "Au", "Ag"], r: 2 },
  { c: "Natur og vitenskap", q: "Hvilken planet er nærmest sola?", a: ["Venus", "Merkur", "Mars", "Jorden"], r: 1 },
  { c: "Natur og vitenskap", q: "Hvor mange bein har en edderkopp?", a: ["6", "8", "10", "12"], r: 1 },
  { c: "Natur og vitenskap", q: "Ved hvor mange grader koker vann ved havnivå?", a: ["90 °C", "100 °C", "110 °C", "120 °C"], r: 1 },
  { c: "Natur og vitenskap", q: "Hva er verdens største pattedyr?", a: ["Elefant", "Blåhval", "Spermhval", "Sjiraff"], r: 1 },
  { c: "Natur og vitenskap", q: "Hvilken gass trenger planter for fotosyntese?", a: ["Oksygen", "Nitrogen", "Karbondioksid", "Helium"], r: 2 },
  { c: "Natur og vitenskap", q: "Hvor mange bein har et voksent menneske omtrent?", a: ["156", "206", "256", "306"], r: 1 },
  { c: "Natur og vitenskap", q: "Hvilken planet kalles «den røde planeten»?", a: ["Jupiter", "Saturn", "Mars", "Venus"], r: 2 },
  { c: "Natur og vitenskap", q: "Hva er H2O?", a: ["Hydrogen", "Vann", "Salt", "Oksygen"], r: 1 },
  { c: "Natur og vitenskap", q: "Hvilket organ pumper blod rundt i kroppen?", a: ["Lungene", "Leveren", "Hjertet", "Nyrene"], r: 2 },
  { c: "Natur og vitenskap", q: "Hva er den største planeten i solsystemet?", a: ["Saturn", "Jupiter", "Neptun", "Uranus"], r: 1 },
  { c: "Natur og vitenskap", q: "Hvor fort går lyset omtrent?", a: ["300 km/s", "3 000 km/s", "300 000 km/s", "3 000 000 km/s"], r: 2 },
  { c: "Natur og vitenskap", q: "Hvilken fugl er Norges nasjonalfugl?", a: ["Havørn", "Fossekall", "Lunde", "Kongeørn"], r: 1 },
  { c: "Natur og vitenskap", q: "Hva måles i hertz?", a: ["Frekvens", "Temperatur", "Trykk", "Spenning"], r: 0 },
  { c: "Natur og vitenskap", q: "Hvor mange hjerter har en blekksprut?", a: ["1", "2", "3", "4"], r: 2 },
  { c: "Natur og vitenskap", q: "Hva er det hardeste naturlige stoffet?", a: ["Jern", "Diamant", "Granitt", "Kvarts"], r: 1 },

  // Film og musikk
  { c: "Film og musikk", q: "Hvilket band ga ut «Take On Me»?", a: ["Röyksopp", "a-ha", "Kygo", "Madcon"], r: 1 },
  { c: "Film og musikk", q: "Hva heter løven i «Løvenes konge»?", a: ["Mufasa", "Simba", "Scar", "Nala"], r: 1 },
  { c: "Film og musikk", q: "Hvem spilte Jack i filmen «Titanic» (1997)?", a: ["Brad Pitt", "Leonardo DiCaprio", "Matt Damon", "Tom Cruise"], r: 1 },
  { c: "Film og musikk", q: "Hvilken svensk gruppe vant Eurovision med «Waterloo»?", a: ["Roxette", "ABBA", "Ace of Base", "Europe"], r: 1 },
  { c: "Film og musikk", q: "Hvem vant Eurovision for Norge i 2009?", a: ["Alexander Rybak", "Bobbysocks", "Secret Garden", "Kygo"], r: 0 },
  { c: "Film og musikk", q: "Hva heter trollmannsskolen i Harry Potter?", a: ["Narnia", "Galtvort", "Mordor", "Hogsmeade"], r: 1 },
  { c: "Film og musikk", q: "Hvem komponerte «I Dovregubbens hall»?", a: ["Edvard Grieg", "Ole Bull", "Johan Svendsen", "Mozart"], r: 0 },
  { c: "Film og musikk", q: "Hvilken farge har Shrek?", a: ["Blå", "Grønn", "Brun", "Gul"], r: 1 },
  { c: "Film og musikk", q: "Hvem er kjent som «The King of Pop»?", a: ["Elvis Presley", "Prince", "Michael Jackson", "Freddie Mercury"], r: 2 },
  { c: "Film og musikk", q: "Hvilken film handler om snømannen Olaf?", a: ["Frost", "Moana", "Tangled", "Brave"], r: 0 },
  { c: "Film og musikk", q: "Hvor mange medlemmer hadde The Beatles?", a: ["3", "4", "5", "6"], r: 1 },
  { c: "Film og musikk", q: "Hva heter Batmans butler?", a: ["Alfred", "James", "Robin", "Lucius"], r: 0 },
  { c: "Film og musikk", q: "Hvilken norsk DJ står bak «Firestone»?", a: ["Alan Walker", "Kygo", "Matoma", "Cashmere Cat"], r: 1 },
  { c: "Film og musikk", q: "Hvilken filmserie har figuren Darth Vader?", a: ["Star Trek", "Star Wars", "Alien", "Dune"], r: 1 },
  { c: "Film og musikk", q: "Hva heter den norske julefilmen fra 1975 med Reodor Felgen?", a: ["Flåklypa Grand Prix", "Tre nøtter til Askepott", "Olsenbanden", "Reisen til julestjernen"], r: 0 },
  { c: "Film og musikk", q: "Hvem sang «Bohemian Rhapsody»?", a: ["The Rolling Stones", "Queen", "Led Zeppelin", "Pink Floyd"], r: 1 },

  // Mat og hverdag
  { c: "Mat og hverdag", q: "Hva er hovedingrediensen i guacamole?", a: ["Agurk", "Avokado", "Erter", "Spinat"], r: 1 },
  { c: "Mat og hverdag", q: "Hvilket land kommer pizza opprinnelig fra?", a: ["Hellas", "Frankrike", "Italia", "USA"], r: 2 },
  { c: "Mat og hverdag", q: "Hva er Norges nasjonalrett (kåret i 2014)?", a: ["Fårikål", "Pinnekjøtt", "Lutefisk", "Kjøttkaker"], r: 0 },
  { c: "Mat og hverdag", q: "Hvor mange minutter er det i et døgn?", a: ["1240", "1440", "1640", "2400"], r: 1 },
  { c: "Mat og hverdag", q: "Hva lages brunost hovedsakelig av?", a: ["Ost og sukker", "Myse", "Fløte og honning", "Kakao"], r: 1 },
  { c: "Mat og hverdag", q: "Hvilket krydder gir karri den gule fargen?", a: ["Safran", "Gurkemeie", "Paprika", "Kanel"], r: 1 },
  { c: "Mat og hverdag", q: "Hva kalles japansk rå fisk servert uten ris?", a: ["Sushi", "Sashimi", "Tempura", "Ramen"], r: 1 },
  { c: "Mat og hverdag", q: "Hvor mange sider har en terning?", a: ["4", "6", "8", "12"], r: 1 },
  { c: "Mat og hverdag", q: "Hvilken frukt brukes i en tradisjonell tarte tatin?", a: ["Pære", "Eple", "Plomme", "Fersken"], r: 1 },
  { c: "Mat og hverdag", q: "Hvilken nøtt brukes i marsipan?", a: ["Hasselnøtt", "Valnøtt", "Mandel", "Peanøtt"], r: 2 },
  { c: "Mat og hverdag", q: "Hva er raspeball også kjent som?", a: ["Komle", "Lefse", "Lompe", "Klubb"], r: 0 },
  { c: "Mat og hverdag", q: "Hvilken farge får du om du blander blått og gult?", a: ["Lilla", "Oransje", "Grønn", "Brun"], r: 2 },
  { c: "Mat og hverdag", q: "Hvor mange kort er det i en vanlig kortstokk uten jokere?", a: ["48", "52", "54", "56"], r: 1 },
  { c: "Mat og hverdag", q: "Hva heter den norske oppfinnelsen for å skjære ost?", a: ["Ostehøvel", "Ostekniv", "Ostesag", "Ostestikk"], r: 0 },
  { c: "Mat og hverdag", q: "Hvilket land er kjent for retten paella?", a: ["Mexico", "Spania", "Italia", "Portugal"], r: 1 },
  { c: "Mat og hverdag", q: "Hvor mange dager har et skuddår?", a: ["364", "365", "366", "367"], r: 2 }
];

const QUESTION_CATEGORIES = [...new Set(QUESTIONS.map(q => q.c))];

const WORDS = {
  "Dyr": ["Elefant", "Pingvin", "Kenguru", "Slange", "Ape", "Krokodille", "Blekksprut", "Flodhest", "Ugle", "Krabbe", "Giraff", "Kanin", "Edderkopp", "Hummer", "Flamingo", "Skilpadde"],
  "Yrker": ["Tannlege", "Brannmann", "Kokk", "Pilot", "Frisør", "Dirigent", "Snekker", "Bonde", "Fotograf", "Astronaut", "Kirurg", "Bartender", "Postbud", "Dykker", "Tryllekunstner", "Gartner"],
  "Sport": ["Svømming", "Boksing", "Golf", "Skihopp", "Curling", "Bueskyting", "Tennis", "Fekting", "Surfing", "Bowling", "Turn", "Roing", "Skøyter", "Volleyball", "Sjakk", "Klatring"],
  "Hverdag": ["Støvsuge", "Pusse tenner", "Lage pannekaker", "Henge opp klær", "Skifte dekk", "Bære handleposer", "Ta selfie", "Male vegg", "Pakke kofferten", "Gå tur med hund", "Skrelle poteter", "Strikke", "Fiske", "Barbere seg", "Rydde oppvaskmaskin", "Knyte slips"]
};

const WORD_CATEGORIES = Object.keys(WORDS);

module.exports = { QUESTIONS, QUESTION_CATEGORIES, WORDS, WORD_CATEGORIES };
