export const defaultLocale = "sw";
export type Locale = "sw" | "en";

const sw = {
  brand: "Mtaa Connect",
  tagline: "Taarifa za mtaa wako, karibu nawe.",
  skip: "Ruka kwenda maudhui",
  learnMore: "Jinsi itakavyofanya kazi",
  eyebrow: "KWA JAMII ZETU, TANZANIA",
  title: "Mtaa wako. Taarifa zako. Pamoja.",
  description: "Njia rahisi ya kupokea taarifa muhimu kutoka kwa uongozi wa mtaa wako kupitia SMS. Bila programu ya simu. Bila intaneti kupokea SMS.",
  status: "Usajili wa wakazi",
  statusDetail: "Jisajili bila akaunti. Ada ni TSh 3,000 kwa miezi 6; usajili wako utaanza baada ya malipo na makazi yako kuthibitishwa.",
  howTitle: "Mawasiliano rahisi kwa kila mkazi",
  howDescription: "Fuata hatua hizi kujiunga na kupokea taarifa muhimu za mtaa wako.",
  steps: [
    { title: "Chagua mtaa wako", description: "Tambua mkoa, wilaya, kata, mtaa na eneo lako la Balozi." },
    { title: "Kamilisha usajili", description: "Weka jina na namba ya simu, toa ridhaa na fuata hatua za uthibitisho wa mtaa wako." },
    { title: "Pokea taarifa kwa SMS", description: "Baada ya uthibitisho na malipo ya usajili, pokea taarifa muhimu kwenye simu yako." },
  ],
  accessTitle: "Simu yako inatosha",
  accessDescription: "Imeandaliwa kwa simu za kawaida na simu janja. Taarifa muhimu zitakufikia kupitia SMS.",
  privacy: "Jina, namba ya simu na taarifa za usajili zitatumika kuwezesha mawasiliano ya mtaa wako. Maelezo ya matumizi na ridhaa yatatolewa wakati wa usajili.",
  footer: "Kuunganisha wakazi na uongozi wa mtaa.",
  loading: "Inapakia…",
  errorTitle: "Imeshindikana kufungua ukurasa",
  errorDescription: "Tafadhali jaribu tena baada ya muda mfupi.",
  retry: "Jaribu tena",
  notFound: "Ukurasa haupatikani",
  notFoundDescription: "Ukurasa huu haupo au bado haujapatikana.",
  home: "Rudi mwanzo",
};

type Dictionary = typeof sw;
const en: Dictionary = {
  brand: "Mtaa Connect",
  tagline: "Your community, within reach.",
  skip: "Skip to content",
  learnMore: "How it will work",
  eyebrow: "FOR OUR COMMUNITIES, TANZANIA",
  title: "Your street. Your updates. Together.",
  description: "A simple way to receive important updates from your Mtaa leadership by SMS. No mobile app. No internet needed to receive messages.",
  status: "Resident registration",
  statusDetail: "Register without an account. The fee is TSh 3,000 for six months; membership starts after payment and residence approval.",
  howTitle: "Simple communication for every resident",
  howDescription: "When the service launches, these steps will connect you to your community updates.",
  steps: [
    { title: "Choose your Mtaa", description: "Select your region, district, ward, Mtaa and Balozi area." },
    { title: "Complete registration", description: "Provide your name and phone number, give consent and follow your Mtaa verification process." },
    { title: "Receive SMS updates", description: "After verification and subscription payment, receive important updates on your phone." },
  ],
  accessTitle: "All you need is your phone",
  accessDescription: "Designed for basic phones and smartphones. Important information will reach you through SMS.",
  privacy: "Your name, phone number and registration details will support communication within your Mtaa. Purpose and consent information will be provided during registration.",
  footer: "Connecting residents with local leadership.",
  loading: "Loading…",
  errorTitle: "Unable to load this page",
  errorDescription: "Please try again in a moment.",
  retry: "Try again",
  notFound: "Page not found",
  notFoundDescription: "This page does not exist or is not available yet.",
  home: "Back to home",
};

export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return locale === "en" ? en : sw;
}
