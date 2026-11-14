import { globalBounds, type Bounds } from './projection';

export type Language = 'en' | 'tr';
export type Localized = Record<Language, string>;
export type Point = { x: number; y: number };
export type Polarity = -1 | 1;
export type Signal = { polarity: Polarity | 0; coverage: number; nearby?: boolean };
type RgbClassifier = (red: number, green: number, blue: number) => Polarity | 0;

export interface Dataset {
  id: string;
  title: Localized;
  description: Localized;
  period: string;
  image: string;
  category: Localized;
  geography?: { projection: 'equirectangular'; bounds: Bounds };
  density?: { point: number; column: number };
  flowRegister?: number;
  width: number;
  height: number;
  source: { url: string; credit: string; processing: Localized };
  mapping: Localized;
  signs: Record<Polarity, Localized>;
  regions: readonly { name: Localized; point: Point }[];
  classify: RgbClassifier;
}

const map = (file: string) => import.meta.env.BASE_URL + 'maps/' + file;
const credit = 'NASA’s Scientific Visualization Studio';

export const datasets: readonly Dataset[] = [
  {
    id: 'night',
    category: { en: 'Human activity', tr: 'İnsan faaliyetleri' },
    title: { en: 'Night Lights', tr: 'Gece Işıkları' },
    description: { en: 'Hear where Earth’s night lights grew brighter or dimmer between 2012 and 2023.', tr: '2012 ile 2023 arasında Dünya’nın gece ışıklarının nerede arttığını veya azaldığını dinle.' },
    period: '2012–2023',
    image: map('night-lights.png'),
    geography: { projection: 'equirectangular', bounds: globalBounds },
    width: 1496,
    height: 864,
    source: {
      url: 'https://svs.gsfc.nasa.gov/5313/',
      credit: credit + ' · Kel Elkins · Black Marble / VIIRS',
      processing: { en: 'EIC video at 00:12.000. The leftmost 3740 × 2160 pixels isolate the map from the wide display. The crop was resized to 1496 × 864.', tr: 'EIC videosu, 00:12.000. Geniş görüntünün en soldaki 3740 × 2160 piksellik bölümü haritayı ayırır. Bu bölüm 1496 × 864 piksele küçültüldü.' },
    },
    mapping: { en: 'We count purple and orange pixels in a small patch or scan column. Purple marks more light and plays rising notes. Orange marks less light and plays falling notes. When both colors are strong and balanced, the phrase rises then falls. More matching pixels widen the pitch interval.', tr: 'Küçük bir alandaki veya tarama sütunundaki mor ve turuncu pikselleri sayıyoruz. Mor, artan ışığı gösterir ve yükselen notalar çalar. Turuncu, azalan ışığı gösterir ve alçalan notalar çalar. İki renk de güçlü ve dengeliyse notalar önce yükselir, sonra alçalır. Eşleşen piksel sayısı arttıkça nota aralığı genişler.' },
    signs: { 1: { en: 'More light', tr: 'Daha fazla ışık' }, '-1': { en: 'Less light', tr: 'Daha az ışık' } },
    regions: [
      { name: { en: 'Western India', tr: 'Batı Hindistan' }, point: { x: .690, y: .378 } },
      { name: { en: 'Western Europe', tr: 'Batı Avrupa' }, point: { x: .466, y: .270 } },
      { name: { en: 'Pearl River Delta', tr: 'İnci Nehri Deltası' }, point: { x: 0.804, y: 0.383 } },
      { name: { en: 'Java', tr: 'Cava' }, point: { x: 0.791, y: 0.542 } },
      { name: { en: 'Central Ukraine', tr: 'Orta Ukrayna' }, point: { x: 0.575, y: 0.237 } },
      { name: { en: 'Nile Delta', tr: 'Nil Deltası' }, point: { x: 0.577, y: 0.333 } },
    ],
    classify(r, g, b) {
      if (b >= 35 && b - g >= 10 && r - g >= 5) return 1;
      if (r >= 38 && r - g >= 9 && g - b >= 6 && r - b >= 22) return -1;
      return 0;
    },
  },
  {
    id: 'ocean',
    category: { en: 'Oceans', tr: 'Okyanuslar' },
    title: { en: 'Ocean Currents', tr: 'Okyanus Akıntıları' },
    description: { en: 'Listen to the warm and cool colors of NASA’s sea surface currents visualization.', tr: 'NASA’nın deniz yüzeyi akıntıları görselindeki sıcak ve soğuk renkleri dinle.' },
    period: 'ECCO2',
    image: map('ocean.webp'),
    geography: { projection: 'equirectangular', bounds: globalBounds },
    flowRegister: -5,
    width: 1440,
    height: 720,
    source: {
      url: 'https://svs.gsfc.nasa.gov/3912/',
      credit: credit + ' · Greg Shirah, Horace Mitchell, Eric Sokolowsky · MIT/JPL ECCO2',
      processing: { en: 'Published still 25000, resized and saved as lossless WebP. The source sequence spans March 2007 to March 2008.', tr: 'Yayımlanmış 25000 numaralı kare yeniden boyutlandırıldı ve kayıpsız WebP olarak kaydedildi. Kaynak animasyon Mart 2007 ile Mart 2008 arasını kapsıyor.' },
    },
    mapping: { en: 'Red, orange and yellow flow pixels play rising notes. Blue and cyan pixels play falling notes. More matching pixels widen the interval. This ocean-inspired sonification uses color categories from a model visualization.', tr: 'Kırmızı, turuncu ve sarı akıntı pikselleri yükselen notalar çalar. Mavi ve camgöbeği pikselleri alçalan notalar çalar. Eşleşen piksel sayısı arttıkça nota aralığı genişler. Okyanustan esinlenen bu seslendirme, model görselindeki renk kategorilerini kullanır.' },
    signs: { 1: { en: 'Warm colors', tr: 'Sıcak renkler' }, '-1': { en: 'Cool colors', tr: 'Soğuk renkler' } },
    regions: [
      { name: { en: 'Equatorial Pacific', tr: 'Ekvator Pasifiği' }, point: { x: .145, y: .502 } },
      { name: { en: 'Southern Ocean', tr: 'Güney Okyanusu' }, point: { x: .441, y: .826 } },
      { name: { en: 'Gulf Stream', tr: 'Körfez Akıntısı' }, point: { x: 0.32, y: 0.3 } },
      { name: { en: 'Kuroshio', tr: 'Kuroşiyo Akıntısı' }, point: { x: 0.89, y: 0.31 } },
      { name: { en: 'Indian Ocean', tr: 'Hint Okyanusu' }, point: { x: 0.7, y: 0.61 } },
      { name: { en: 'Labrador Sea', tr: 'Labrador Denizi' }, point: { x: 0.351, y: 0.18 } },
    ],
    classify(r, g, b) {
      if (r >= 46 && r >= g - 8 && g >= b + 9 && r >= b + 25) return 1;
      if (b >= 32 && b >= g - 5 && b >= r + 20) return -1;
      return 0;
    },
  },
  {
    id: 'gedi',
    category: { en: 'Forests', tr: 'Ormanlar' },
    title: { en: 'GEDI Forest Height', tr: 'GEDI Orman Yüksekliği' },
    description: { en: 'Compare the vegetation height colors in a GEDI globe rendering.', tr: 'GEDI küre görselindeki bitki örtüsü yükseklik renklerini karşılaştır.' },
    period: '2018–2019',
    image: map('gedi.webp'),
    width: 1024,
    height: 576,
    flowRegister: 3,
    source: {
      url: 'https://svs.gsfc.nasa.gov/4950/',
      credit: credit + ' · Kel Elkins, Horace Mitchell, Greg Shirah · GEDI',
      processing: {
        en: 'NASA SVS 4950, GEDI_global.0900_print.jpg. The legend-free globe still was converted to lossless WebP at its published size. This version shows April 2018 to April 2019. NASA exaggerates height in the rendering.',
        tr: 'NASA SVS 4950, GEDI_global.0900_print.jpg. Renk ölçeği içermeyen küre karesi özgün boyutunda kayıpsız WebP’ye dönüştürüldü. Bu sürüm Nisan 2018–Nisan 2019 dönemini gösterir. Görselde yükseklik abartılmıştır.',
      },
    },
    mapping: {
      en: 'Light green canopy colors play rising notes. Brown and dark green play falling notes. The classifier approximates the documented short and tall visual classes from the still. Coverage describes colored pixels in the rendering.',
      tr: 'Açık yeşil örtü renkleri yükselen, kahverengi ve koyu yeşil renkler alçalan notalar çalar. Görselde belgelenen kısa ve uzun bitki sınıfları yaklaşık olarak renklerden belirlenir. Oran, görseldeki renkli piksellere aittir.',
    },
    signs: { 1: { en: 'Taller vegetation colors', tr: 'Uzun bitki örtüsü renkleri' }, '-1': { en: 'Shorter vegetation colors', tr: 'Kısa bitki örtüsü renkleri' } },
    regions: [
      { name: { en: 'Central Africa', tr: 'Orta Afrika' }, point: { x: .42, y: .48 } },
      { name: { en: 'Northeast Africa', tr: 'Kuzeydoğu Afrika' }, point: { x: .47, y: .42 } },
    ],
    classify(r, g, b) {
      if (g >= 110 && r >= 75 && g >= r * .94 && g >= b + 20) return 1;
      if (g >= 38 && g < 105 && r >= 30 && g >= r * .86 && r >= b + 9 && g >= b + 12) return -1;
      return 0;
    },
  },
  {
    id: 'lightning',
    category: { en: 'Atmosphere', tr: 'Atmosfer' },
    title: { en: 'ISS Lightning', tr: 'ISS Yıldırım Gözlemleri' },
    description: { en: 'Explore the density of visible ISS lightning marks in a NASA still.', tr: 'NASA karesindeki görünür ISS yıldırım işaretlerinin yoğunluğunu keşfet.' },
    period: 'ISS LIS',
    image: map('lightning.webp'),
    geography: { projection: 'equirectangular', bounds: globalBounds },
    width: 1024,
    height: 512,
    flowRegister: 7,
    density: { point: .05, column: .009 },
    source: {
      url: 'https://svs.gsfc.nasa.gov/5011/',
      credit: credit + ' · Michala Garrison, Greg Shirah, Kel Elkins, Alex Kekesi · ISS LIS',
      processing: {
        en: 'NASA SVS 5011 Science on a Sphere debug still 00420, converted to lossless WebP. The source SOS series covers March 2017–July 2023 and uses a rolling ten-day window. The neutral geographic guides and base map are excluded by the yellow mark filter.',
        tr: 'NASA SVS 5011 Science on a Sphere denetim karesi 00420, kayıpsız WebP’ye dönüştürüldü. SOS dizisi Mart 2017–Temmuz 2023 dönemini kapsar ve kayan on günlük pencere kullanır. Sarı işaret filtresi nötr kılavuzları ve taban haritasını örneklemeye katmaz.',
      },
    },
    mapping: {
      en: 'Dense yellow marks play rising notes and sparse marks play falling notes. This is the fraction of visible mark pixels in the patch or scan column. It does not count individual lightning events.',
      tr: 'Yoğun sarı işaretler yükselen, seyrek işaretler alçalan notalar çalar. Oran, alandaki veya tarama sütunundaki görünür işaret piksellerine aittir. Her bir yıldırım olayı ayrı sayılmaz.',
    },
    signs: { 1: { en: 'Dense event marks', tr: 'Yoğun olay işaretleri' }, '-1': { en: 'Sparse event marks', tr: 'Seyrek olay işaretleri' } },
    regions: [
      { name: { en: 'Southern Africa', tr: 'Güney Afrika' }, point: { x: .54, y: .64 } },
      { name: { en: 'Maritime Southeast Asia', tr: 'Denizel Güneydoğu Asya' }, point: { x: .78, y: .51 } },
    ],
    classify(r, g, b) {
      return r >= 72 && g >= 60 && Math.min(r, g) - b >= 30 ? 1 : 0;
    },
  },
];
