import type { IconName } from './icons';

/* Toutes les données ci-dessous sont FICTIVES (démonstration). */

/* Villes et catégories sont désormais administrables : leurs identifiants
   ne sont plus un type fermé. Les valeurs ci-dessous servent de repli
   (Supabase non configuré) et le registre est alimenté par le store. */
export type Cat = string;
export type City = string;
export type Freight = 'air' | 'sea';

/** Blocs optionnels affichables sur une fiche, selon la catégorie. */
export type FieldBlock = 'moq' | 'hours' | 'cuisine' | 'halal' | 'freight' | 'goods' | 'senegal';
export const FIELD_BLOCKS: { id: FieldBlock; label: string }[] = [
  { id: 'moq', label: 'Minimum de commande' },
  { id: 'hours', label: 'Horaires' },
  { id: 'cuisine', label: 'Type de cuisine' },
  { id: 'halal', label: 'Halal' },
  { id: 'freight', label: 'Type de fret (aérien / maritime)' },
  { id: 'goods', label: 'Marchandises acceptées' },
  { id: 'senegal', label: 'Destination au Sénégal' },
];

export interface Category {
  id: Cat; label: string; labelCn?: string; icon: IconName; ctaLabel?: string;
  tagsLabel: string; fields: FieldBlock[]; isFreight: boolean; active: boolean; sort: number;
}
export interface CityRef { id: City; name: string; nameCn?: string; lat?: number; lng?: number; active: boolean; sort: number }
export interface District { id?: string; cityId: City; name: string; lat: number; lng: number; active: boolean; sort: number }
export interface ProductTag { id: string; categoryId: Cat; label: string; labelCn?: string; active: boolean; sort: number }

export const STATIC_CATEGORIES: Category[] = [
  { id: 'gros', label: 'Achats en gros', labelCn: '批发', icon: 'box', ctaLabel: 'Contacter le fournisseur', tagsLabel: 'Produits proposés', fields: ['moq', 'hours'], isFreight: false, active: true, sort: 1 },
  { id: 'hotel', label: 'Hôtels', labelCn: '酒店', icon: 'bed', ctaLabel: 'Contacter pour réserver', tagsLabel: 'Services', fields: [], isFreight: false, active: true, sort: 2 },
  { id: 'resto', label: 'Restaurants', labelCn: '餐厅', icon: 'utensils', ctaLabel: 'Contacter le restaurant', tagsLabel: 'Spécialités', fields: ['cuisine', 'hours', 'halal'], isFreight: false, active: true, sort: 3 },
  { id: 'transport', label: 'Transporteurs', labelCn: '运输', icon: 'truck', ctaLabel: 'Contacter le transporteur', tagsLabel: 'Services', fields: ['freight', 'goods', 'senegal'], isFreight: true, active: true, sort: 4 },
  { id: 'transitaire', label: 'Transitaires', labelCn: '货代', icon: 'ship', ctaLabel: 'Contacter le transitaire', tagsLabel: 'Services', fields: ['freight', 'goods', 'senegal'], isFreight: true, active: true, sort: 5 },
];
export const STATIC_CITIES: CityRef[] = [
  { id: 'guangzhou', name: 'Guangzhou', nameCn: '广州', lat: 23.13, lng: 113.27, active: true, sort: 1 },
  { id: 'shenzhen', name: 'Shenzhen', nameCn: '深圳', lat: 22.54, lng: 114.06, active: true, sort: 2 },
];
export const STATIC_DISTRICTS: District[] = [
  { cityId: 'guangzhou', name: 'Baiyun', lat: 23.16, lng: 113.27, active: true, sort: 1 },
  { cityId: 'guangzhou', name: 'Haizhu', lat: 23.09, lng: 113.32, active: true, sort: 2 },
  { cityId: 'guangzhou', name: 'Liwan', lat: 23.12, lng: 113.24, active: true, sort: 3 },
  { cityId: 'guangzhou', name: 'Yuexiu', lat: 23.13, lng: 113.27, active: true, sort: 4 },
  { cityId: 'guangzhou', name: 'Tianhe', lat: 23.13, lng: 113.36, active: true, sort: 5 },
  { cityId: 'shenzhen', name: 'Futian', lat: 22.54, lng: 114.06, active: true, sort: 1 },
  { cityId: 'shenzhen', name: 'Nanshan', lat: 22.53, lng: 113.93, active: true, sort: 2 },
];

/* Registre alimenté par le store au chargement des taxonomies. Il permet aux
   helpers appelés en profondeur (catLabel, districtPos…) de rester des
   fonctions simples : le re-rendu est déclenché par l'état du store. */
interface Registry { categories: Category[]; cities: CityRef[]; districts: District[]; tags: ProductTag[] }
let REG: Registry = { categories: STATIC_CATEGORIES, cities: STATIC_CITIES, districts: STATIC_DISTRICTS, tags: [] };
export const setTaxonomies = (t: Partial<Registry>) => { REG = { ...REG, ...t }; };

export const catLabel = (c: Cat) => REG.categories.find((x) => x.id === c)?.label ?? c;
export const catIcon = (c: Cat): IconName => REG.categories.find((x) => x.id === c)?.icon ?? 'box';
export const category = (c: Cat) => REG.categories.find((x) => x.id === c) ?? null;
export const isFreight = (c: Cat) => REG.categories.find((x) => x.id === c)?.isFreight ?? false;
export const cityName = (c: City) => REG.cities.find((x) => x.id === c)?.name ?? c;
export const districtsOf = (city: City) => REG.districts.filter((d) => d.cityId === city && d.active);
export const allDistricts = () => REG.districts;
export const tagLabel = (id: string) => REG.tags.find((t) => t.id === id)?.label ?? id;
export const tagsOf = (cat: Cat) => REG.tags.filter((t) => t.categoryId === cat && t.active);

export interface Provider {
  id: string;
  name: string;
  cn: string;
  cat: Cat;
  city: City;
  district: string;
  lat: number;
  lng: number;
  featured?: boolean;
  verified: string; // date de dernière vérification
  desc: string;
  addrCn: string;
  addrFr: string;
  entree?: string;
  reperes?: string;
  metro?: string;
  tel?: string;
  wechat?: string;
  products?: string[];      // texte libre (« Autre »)
  productTags?: string[];   // ids du catalogue produits/services
  moq?: string;
  services?: string[];
  cuisine?: string;
  hours?: string;
  halal?: string;
  freight?: Freight[];
  goods?: string;
  senegal?: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'baiyun', name: 'Baiyun Textile Trading', cn: '白云纺织贸易有限公司', cat: 'gros', city: 'guangzhou', district: 'Baiyun',
    lat: 23.17, lng: 113.26, featured: true, verified: '12 sept. 2026',
    desc: 'Grossiste en tissus et textiles pour la confection : wax, bazin, coton imprimé et dentelle. Vente en gros, sur présentation au stand.',
    addrCn: '广东省广州市白云区示例路88号 三楼312档', addrFr: '88, route Shili (adresse fictive), 3e étage, stand 312, district de Baiyun, Guangzhou',
    entree: 'Entrée par la porte nord, côté parking. Ascenseur à gauche, puis stand 312 au fond du couloir.',
    reperes: 'En face d’un magasin de boutons et de fermetures à glissière ; enseigne verte au-dessus du stand.',
    metro: 'Ligne 2 · Station Sanyuanli (三元里) · Sortie B, puis 6 min à pied',
    tel: '+86 130 0000 0000', wechat: 'baiyun_textile_demo',
    products: ['Tissus wax et imprimés', 'Bazin riche', 'Coton et popeline', 'Dentelle et broderie'], moq: '50 pièces par référence',
  },
  {
    id: 'zhongda', name: 'Zhongda Fabric Market, stand 217', cn: '中大布匹市场217档', cat: 'gros', city: 'guangzhou', district: 'Haizhu',
    lat: 23.08, lng: 113.34, verified: '3 sept. 2026',
    desc: 'Stand de tissus au marché de gros de Zhongda : tissus d’ameublement et étoffes au mètre.',
    addrCn: '广东省广州市海珠区示例路217号', addrFr: '217, route de l’Exemple (adresse fictive), district de Haizhu, Guangzhou',
    tel: '+86 134 0000 0000', products: ['Tissus au mètre', 'Tissus d’ameublement'],
  },
  {
    id: 'lihua', name: 'Lihua Lace & Bazin', cn: '丽华蕾丝布行', cat: 'gros', city: 'guangzhou', district: 'Liwan',
    lat: 23.11, lng: 113.23, verified: '28 août 2026',
    desc: 'Boutique de dentelles et de bazin, vente en gros et au détail.',
    addrCn: '广东省广州市荔湾区示例街9号', addrFr: '9, rue de l’Exemple (adresse fictive), district de Liwan, Guangzhou',
    wechat: 'lihua_lace_demo', products: ['Dentelle', 'Bazin'],
  },
  {
    id: 'jinyuan', name: 'Jinyuan Business Hotel', cn: '金源商务酒店', cat: 'hotel', city: 'guangzhou', district: 'Yuexiu',
    lat: 23.14, lng: 113.26, featured: true, verified: '8 sept. 2026',
    desc: 'Hôtel d’affaires à proximité de la gare de Guangzhou, adapté aux séjours de quelques nuits pour les acheteurs en déplacement.',
    addrCn: '广东省广州市越秀区示例大道26号', addrFr: '26, avenue de l’Exemple (adresse fictive), district de Yuexiu, Guangzhou',
    entree: 'Entrée principale sur l’avenue, réception au rez-de-chaussée.', reperes: 'À côté d’une pharmacie ; l’enseigne est visible depuis la sortie de métro.',
    metro: 'Ligne 2 · Gare de Guangzhou (广州火车站) · Sortie C, puis 4 min à pied',
    tel: '+86 131 0000 0000', wechat: 'jinyuan_hotel_demo',
    services: ['Wi-Fi dans les chambres', 'Petit-déjeuner disponible', 'Bagagerie', 'Chambres pour 1 à 3 personnes'],
  },
  {
    id: 'alnour', name: 'Lanzhou Al-Nour', cn: '兰州清真拉面馆', cat: 'resto', city: 'guangzhou', district: 'Yuexiu',
    lat: 23.135, lng: 113.275, verified: '5 sept. 2026',
    desc: 'Restaurant de nouilles tirées à la main, souvent fréquenté par des commerçants africains du quartier.',
    addrCn: '广东省广州市越秀区示例街15号 一楼', addrFr: '15, rue de l’Exemple (adresse fictive), rez-de-chaussée, district de Yuexiu, Guangzhou',
    entree: 'Porte vitrée donnant sur la rue, à côté d’un magasin de téléphones.', reperes: 'Grande enseigne rouge avec des caractères dorés.',
    metro: 'Ligne 5 · Station proche (exemple) · Sortie A, puis 3 min à pied',
    tel: '+86 132 0000 0000', wechat: 'alnour_demo',
    cuisine: 'Chinoise, nouilles tirées à la main', hours: '10 h 30 – 22 h 00', halal: 'Indiquée par l’établissement, à confirmer sur place',
  },
  {
    id: 'sinodakar', name: 'Sino-Dakar Cargo', cn: '中达国际货运代理有限公司', cat: 'transitaire', city: 'guangzhou', district: 'Baiyun',
    lat: 23.155, lng: 113.29, verified: '10 sept. 2026',
    desc: 'Transitaire spécialisé dans l’envoi de marchandises depuis Guangzhou vers l’Afrique de l’Ouest.',
    addrCn: '广东省广州市白云区示例路120号 B座 508室', addrFr: '120, route de l’Exemple (adresse fictive), tour B, bureau 508, district de Baiyun, Guangzhou',
    entree: 'Tour B, entrée côté ouest. Prendre l’ascenseur jusqu’au 5e étage.', reperes: 'Face à un entrepôt de colis, près du carrefour principal.',
    metro: 'Ligne 3 · Station proche (exemple) · Sortie D, puis 8 min à pied',
    tel: '+86 133 0000 0000', wechat: 'sinodakar_demo',
    freight: ['air', 'sea'], goods: 'Textiles, pièces détachées, appareils électroménagers', senegal: 'Dakar : port et aéroport',
  },
  {
    id: 'huaqiang', name: 'Huaqiang Digital Parts', cn: '华强数码配件', cat: 'gros', city: 'shenzhen', district: 'Futian',
    lat: 22.545, lng: 114.085, featured: true, verified: '9 sept. 2026',
    desc: 'Accessoires et pièces pour téléphones : coques, câbles, chargeurs, écouteurs.',
    addrCn: '深圳市福田区示例路华强北 远望数码城 2楼', addrFr: 'Huaqiangbei, marché Yuanwang, 2e étage (adresse fictive), Futian, Shenzhen',
    tel: '+86 135 0000 0000', products: ['Coques', 'Câbles', 'Chargeurs', 'Écouteurs'],
  },
];

export type Status =
  | 'Brouillon' | 'Soumise' | 'En vérification' | 'Complément demandé' | 'Publiée' | 'Rattachée à une adresse existante' | 'Refusée';
export const STATUSES: Status[] = ['Brouillon', 'Soumise', 'En vérification', 'Complément demandé', 'Publiée', 'Rattachée à une adresse existante', 'Refusée'];
export const STATUS_STYLE: Record<Status, { icon: IconName; bg: string; fg: string }> = {
  'Brouillon': { icon: 'pen', bg: '#E6EAF3', fg: '#2F3C57' },
  'Soumise': { icon: 'send', bg: '#E3ECF7', fg: '#1F4A7A' },
  'En vérification': { icon: 'eye', bg: '#FBF1D6', fg: '#6F5010' },
  'Complément demandé': { icon: 'alert', bg: '#FDE9D3', fg: '#8A4310' },
  'Publiée': { icon: 'check', bg: '#E0F0E6', fg: '#1B6B3E' },
  'Rattachée à une adresse existante': { icon: 'link', bg: '#EAE4F5', fg: '#4B3A7A' },
  'Refusée': { icon: 'x', bg: '#FBE6E3', fg: '#A1261F' },
};

export interface Proposal {
  id: string;
  name: string;
  cn: string;
  cat: Cat;
  city: City;
  loc: string;
  products: string;        // texte libre (« Autre »)
  productTags: string[];   // ids du catalogue produits/services
  moq: string;
  tel: string;
  wechat: string;
  addrCn: string;
  photos: number;
  cardFront: boolean;
  cardBack: boolean;
  photoPaths: string[];    // chemins dans le bucket proposal-photos
  cardFrontPath?: string;
  cardBackPath?: string;
  status: Status;
  date: string; // dernière mise à jour affichée
  feedback?: string;
  author: string;
}

export const emptyProposal = (): Proposal => ({
  id: 'draft', name: '', cn: '', cat: 'gros', city: 'guangzhou', loc: '', products: '', productTags: [], moq: '', tel: '', wechat: '', addrCn: '',
  photos: 0, cardFront: false, cardBack: false, photoPaths: [], status: 'Brouillon', date: '', author: 'Bacary D.',
});

const P = (o: Partial<Proposal> & Pick<Proposal, 'id' | 'name' | 'cn' | 'cat' | 'city' | 'status' | 'date'>): Proposal => ({
  ...emptyProposal(), loc: 'Quartier à préciser', author: 'Bacary D.', ...o,
});

export const SEED_PROPOSALS: Proposal[] = [
  P({ id: 'p1', name: 'Huaqiang Digital Parts', cn: '华强数码配件', cat: 'gros', city: 'shenzhen', status: 'Brouillon', date: 'Enregistré le 20 sept.',
      loc: 'Huaqiangbei, marché Yuanwang, 2e étage', products: 'Coques de téléphone, câbles, chargeurs, écouteurs.', tel: '+86 130 0000 0000', wechat: 'huaqiang_parts_demo', addrCn: '福田区华强北路 远望数码城 2楼', photos: 2, cardFront: true }),
  P({ id: 'p2', name: 'Tianhe Sample Hotel', cn: '天河示例酒店', cat: 'hotel', city: 'guangzhou', status: 'Soumise', date: 'Envoyée le 19 sept.', loc: 'Tianhe, près de la gare Est' }),
  P({ id: 'p3', name: 'Nanshan Cargo Express', cn: '南山快运', cat: 'transport', city: 'shenzhen', status: 'En vérification', date: 'Envoyée le 18 sept.', loc: 'Nanshan' }),
  P({ id: 'p4', name: 'Yuexiu Halal Kitchen', cn: '越秀清真小厨', cat: 'resto', city: 'guangzhou', status: 'Complément demandé', date: 'Envoyée le 16 sept.', loc: 'Yuexiu',
      feedback: 'Merci pour votre proposition. Pour la publier, il nous manque : un numéro de téléphone joignable et une photo de la devanture ou de l’enseigne.' }),
  P({ id: 'p5', name: 'Liwan Lace House', cn: '荔湾蕾丝行', cat: 'gros', city: 'guangzhou', status: 'Publiée', date: 'Publiée le 15 sept.', loc: 'Liwan',
      feedback: 'Votre proposition est publiée. Merci pour votre contribution.' }),
  P({ id: 'p6', name: 'Baiyun Textiles Co.', cn: '白云纺织有限公司', cat: 'gros', city: 'guangzhou', status: 'Rattachée à une adresse existante', date: 'Traitée le 14 sept.', loc: 'Baiyun',
      feedback: 'Cette adresse existait déjà dans Diaba Guide. Votre proposition a été rattachée à la fiche existante et vos informations l’ont complétée.' }),
  P({ id: 'p7', name: 'Shekou Guesthouse', cn: '蛇口民宿', cat: 'hotel', city: 'shenzhen', status: 'Refusée', date: 'Traitée le 11 sept.', loc: 'Shekou',
      feedback: 'Motif : établissement fermé. Selon nos vérifications, cette adresse n’est plus en activité. Vous pouvez proposer une autre adresse à tout moment.' }),
];

export interface Decision { date: string; proposalName: string; cn: string; decision: Status; note: string; by: string; lastCheck: string }
export const SEED_DECISIONS: Decision[] = [
  { date: '20 sept. 2026, 09:10', proposalName: 'Liwan Lace House', cn: '荔湾蕾丝行', decision: 'Publiée', note: 'Fiche créée, vérifiée par téléphone.', by: 'Agent Diaba', lastCheck: '20 sept. 2026' },
  { date: '19 sept. 2026, 17:30', proposalName: 'Yuexiu Halal Kitchen', cn: '越秀清真小厨', decision: 'Complément demandé', note: 'Téléphone et photo de la devanture demandés.', by: 'Agent Diaba', lastCheck: '—' },
  { date: '14 sept. 2026, 11:02', proposalName: 'Baiyun Textiles Co.', cn: '白云纺织有限公司', decision: 'Rattachée à une adresse existante', note: 'Doublon de « Baiyun Textile Trading ».', by: 'Agent Diaba', lastCheck: '12 sept. 2026' },
  { date: '11 sept. 2026, 15:45', proposalName: 'Shekou Guesthouse', cn: '蛇口民宿', decision: 'Refusée', note: 'Motif : établissement fermé.', by: 'Agent Diaba', lastCheck: '—' },
];

export const TEAM_QUEUE_EXTRA: Proposal[] = [
  P({ id: 't1', name: 'Panyu Sea Freight', cn: '番禺海运代理', cat: 'transitaire', city: 'guangzhou', status: 'Soumise', date: '20 sept.', author: 'A. Ndiaye' }),
  P({ id: 't2', name: 'Futian Phone Cases', cn: '福田手机壳批发', cat: 'gros', city: 'shenzhen', status: 'En vérification', date: '17 sept.', author: 'M. Sow' }),
];
