// HINDI, WITHOUT A HINDI INTERFACE (REQUIREMENTS §89).
//
// The screens are English or Gujarati; nobody has asked for Hindi screens. But
// people ask Mitra in Hindi, and Mitra answers them in Hindi through the model
// (backend/mitraAgent.ts LANGUAGE_RULE). These are the few Hindi sentences DCRS
// writes itself:
//
//   note        put in front of an answer the app gives from its own records
//               (engine/assistantLocal.ts) to a question asked in Hindi, which
//               it cannot answer in Hindi: the full Hindi answer needs the AI
//               service, and the service is not there right now. In Devanagari
//               for a question in Devanagari, in Latin letters for one in Latin
//               letters ("aaj ka record kholo").
//   sample      what "Hear Mitra" says in Hindi on the Master Data voice card.
//               Hindi verbs follow the speaker, so Mitra's female voice says
//               "दिलाऊँगी" and the male voice "दिलाऊँगा": one persona, its gender
//               the person's choice (female unless they chose male).
//
// Plain, everyday Hindi; never an em dash.
export const HINDI = {
  note: "हिंदी में पूरा जवाब देने के लिए AI सेवा चाहिए, जो अभी उपलब्ध नहीं है।",
  // "Fill it with sample data" asked of a live record (REQUIREMENTS §98, engine/sampleFill.ts).
  sampleLiveDeclined: "नमूना डेटा केवल डेमो मोड में अभ्यास के लिए है। लाइव रिकॉर्ड में वही भरें जो आपने देखा।",
  noteLatin: "Hindi mein poora jawab dene ke liye AI seva chahiye, jo abhi uplabdh nahi hai.",
  sample: {
    female: "नमस्ते! मैं मित्र हूँ। कोई काम बाकी होगा तो मैं याद दिलाऊँगी, और काम पूरा होने पर शाबाशी दूँगी।",
    male: "नमस्ते! मैं मित्र हूँ। कोई काम बाकी होगा तो मैं याद दिलाऊँगा, और काम पूरा होने पर शाबाशी दूँगा।",
  },
  sampleName: {
    female: "नमस्ते, {name}! मैं मित्र हूँ। कोई काम बाकी होगा तो मैं याद दिलाऊँगी, और काम पूरा होने पर शाबाशी दूँगी।",
    male: "नमस्ते, {name}! मैं मित्र हूँ। कोई काम बाकी होगा तो मैं याद दिलाऊँगा, और काम पूरा होने पर शाबाशी दूँगा।",
  },
} as const;
