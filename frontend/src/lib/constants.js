/**
 * Site copy and config – single source of truth for easy updates
 */

export const SITE = {
  name: 'Obula',
  tagline: 'Professional AI video editing',
};

export const HERO = {
  badge: 'Professional AI video editing',
  headline: ['Your Videos,', 'Perfectly Edited.', 'No Editing Skills Required.'],
  tagline: 'Upload. Click. Done. Viral-Ready Videos.',
  subheadline: 'Because Your Content Deserves Great Text (Without the Headache)',
  ctaPrimary: 'Create your first clip',
  ctaSecondary: 'View pricing',
  socialProof: 'Tested by',
  socialProofCount: '2,000+',
  socialProofSuffix: 'creators',
};

export const SECTIONS = {
  testimonials: {
    label: 'Testimonials',
    title: 'Trusted by professionals',
  },
  howItWorks: {
    label: 'Process',
    title: 'Simple, powerful workflow',
  },
  pricing: {
    label: 'Pricing',
    title: 'Transparent pricing',
    subtitle: 'No subscriptions. No hidden fees. Pay per clip.',
  },
  features: {
    label: 'Features',
    title: 'Professional editing, automated',
  },
  cta: {
    headline: ['Ready to create', 'professional clips?'],
    subheadline: 'Join creators who produce more, stress less.\nStart with one clip. No credit card required.',
    primary: 'Get started',
    secondary: 'View pricing',
    tertiary: 'Contact',
  },
};

export const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Upload your video',
    desc: "Share your footage with us. We'll transform it with our signature editing styles.",
    icon: '📤',
    color: '#C9A962',
  },
  {
    step: '2',
    title: 'AI generates your clips',
    desc: 'Our AI transcribes your video, detects viral-worthy moments, and creates shareable clips with captions and B-roll.',
    icon: '🤖',
    color: '#D4AF37',
  },
  {
    step: '3',
    title: 'Customize & export',
    desc: 'Fine-tune captions, pick your format, and export to every platform in seconds.',
    icon: '✨',
    color: '#B8A988',
  },
];

export const FEATURE_TABS = [
  {
    id: 'captions',
    label: 'Captions',
    icon: '✍️',
    desc: 'Word-level captions with custom styles, colors, and animations that keep viewers hooked.',
  },
  {
    id: 'broll',
    label: 'B-Roll',
    icon: '🎬',
    desc: 'AI finds perfect B-roll moments and places them automatically at just the right time.',
  },
  {
    id: 'effects',
    label: 'Effects',
    icon: '✨',
    desc: 'Cinematic transitions and style presets that make your content stand out instantly.',
  },
  {
    id: 'export',
    label: 'Export',
    icon: '📤',
    desc: 'One-click export for Instagram, TikTok, YouTube Shorts. Perfectly sized, every time.',
  },
];

export const TESTIMONIALS = [
  { quote: "Obula turned my 1-hour podcast into 5 viral clips in minutes. My reach tripled this month.", author: 'Arjun', role: 'Fitness creator', initials: 'A' },
  { quote: "I posted 3 Reels in a day for the first time ever. The captions are so on point.", author: 'Kavya', role: 'Podcast host', initials: 'K' },
  { quote: "The AI just gets what makes a clip worth watching. I don't have to think about it anymore.", author: 'Rahul', role: 'Marketing lead', initials: 'R' },
  { quote: "From a 45-minute interview to three Instagram-ready clips in under 8 minutes. Insane.", author: 'Priya', role: 'Content creator', initials: 'P' },
  { quote: "Finally, an editor that doesn't need babysitting. It just works.", author: 'Aditya', role: 'YouTuber', initials: 'AD' },
  { quote: "I used to dread editing. Now I just upload and go. Obula handles the rest.", author: 'Varun', role: 'Brand manager', initials: 'V' },
  { quote: "Went from 2 Reels a week to 14. Same effort. More results. This is the tool.", author: 'Riya', role: 'Lifestyle creator', initials: 'RI' },
  { quote: "The clip quality is better than what I used to spend hours producing manually.", author: 'Karan', role: 'Tech YouTuber', initials: 'KA' },
  { quote: "My engagement doubled the week I started using Obula. The clips just hit differently.", author: 'Ananya', role: 'Wellness creator', initials: 'AN' },
];

export const PRICING = {
  price: '₹89',
  unit: 'per clip',
  comparisonCards: [
    { icon: '🚕', value: 'One cab ride', desc: 'What a 2km Ola costs in most cities' },
    { icon: '🚇', value: '3 metro tickets', desc: 'Delhi or Bangalore metro, 3 trips' },
    { icon: '📺', value: 'Half of Netflix', desc: 'Netflix Basic is ₹199/month' },
  ],
  cta: 'Create your first clip',
};

export const GRID_PLACEMENT = {
  0: 'lg:col-start-1 lg:row-start-1',
  1: 'lg:col-span-2 lg:row-span-2 lg:col-start-2 lg:row-start-1',
  2: 'lg:col-start-4 lg:row-start-1',
  3: 'lg:col-start-1 lg:row-start-2',
  4: 'lg:col-span-2 lg:row-span-2 lg:col-start-4 lg:row-start-2',
  5: 'lg:col-start-1 lg:row-start-3',
  6: 'lg:col-span-2 lg:col-start-2 lg:row-start-3',
};

export const COLORS = {
  background: '#09090B',
  surface: '#0a0a0b',
  muted: '#a1a1aa',
};

export const CHEAPER_THAN = {
  single: [
    // food & drinks
    "a Domino's regular pizza", "a PVR Blockbuster Tuesday ticket", "a Rapido bike ride across town",
    "a Bournville dark chocolate bar", "a bag of Haldiram's bhujia", "two cups of café chai at Chaayos",
    "a plate of chole bhature at a dhaba", "a local salon haircut",
    "a 1L Tropicana from the supermarket", "a Chaayos large masala chai",
    "a KFC Krushers small", "a fresh mango juice at a restaurant", "a 500ml energy drink",
    "a cold-pressed juice at a juice bar", "half a vada pav at Mumbai airport",
    "a chai and samosa... at an airport", "a bubble tea at any mall",
    "a cold brew at a Third Wave café", "a large popcorn at a multiplex",
    // creator / youngster
    "a month of YouTube Premium", "a month of Spotify Premium Lite",
    "a month of Discord Nitro Basic",
    "one reel edit from your college friend (he charged)", "a small jar of Nutella",
    "one mediocre caption reel from Fiverr", "one awkward freelancer consultation call",
    "one hour of your gym membership you never use",
  ],
  saver: [
    // food & drinks
    "one latte at Blue Tokai", "a Domino's medium pizza",
    "one drink at Starbucks", "an Uber across the city", "a JioHotstar Super monthly",
    "two cups of Third Wave filter coffee", "a Behrouz Biryani half portion",
    "a glass of beer at a bar", "a multiplex popcorn and Coke combo",
    "a Swiggy One monthly subscription",
    "a plate of butter chicken at a dhaba", "a craft beer at a microbrewery",
    "a Subway footlong veg classic", "a hair wash and blow-dry at a salon",
    "a weekend INOX popcorn bucket", "a tank of petrol for your bike",
    "a bubble tea combo for two", "a café brunch for yourself",
    // creator / youngster
    "a month of CapCut Pro", "a month of InShot Pro", "a month of Discord Nitro",
    "a month of Spotify Premium Platinum",
    "a BGMI UC top-up (the decent one)", "a Bewakoof phone cover",
    "a month of Notion Plus", "one boAt neckband that lasts 6 months",
    "a branded college hoodie from any campus shop",
    "your last Swiggy order that arrived cold",
    "a Zomato order at midnight with surge fees",
    "one hour with a 'social media expert' who posts twice a week",
    "a Delhi-to-Noida Uber at 11 PM", "a 'viral content package' from a random agency",
    "a ring light that flickers after a week",
  ],
};

export const PRICE_PLANS = {
  single: { price: '₹99', label: 'per clip', detail: null },
  saver: { price: '₹199', label: 'for 3 clips', detail: [{ text: '₹66 / clip', gold: true }, { text: 'Save ₹98', gold: false }] },
};

export const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#@!&%';
