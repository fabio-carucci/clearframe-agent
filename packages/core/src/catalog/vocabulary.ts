import type { Genre } from "@clearframe/contracts";

interface Activity {
  title: string;
  /** Verb phrase that reads naturally before any of the settings. */
  phrase: string;
  settings: readonly string[];
}

interface GenreVocabulary {
  subjects: readonly string[];
  activities: readonly Activity[];
  lighting: readonly string[];
}

export const SHOTS = [
  "drone shot",
  "handheld follow shot",
  "static wide shot",
  "slow-motion close-up",
  "tracking shot",
  "over-the-shoulder shot",
  "time-lapse",
] as const;

export const VOCABULARY: Record<Genre, GenreVocabulary> = {
  sports_outdoor: {
    subjects: [
      "a solo athlete",
      "a group of friends",
      "a young woman",
      "a middle-aged man",
      "two teammates",
      "a coach and a student",
    ],
    activities: [
      {
        title: "Mountain biking",
        phrase: "riding a mountain bike down",
        settings: ["a rocky alpine trail", "a forest singletrack", "a dusty desert canyon"],
      },
      {
        title: "Surfing",
        phrase: "surfing a long wave off",
        settings: ["a rocky coastline", "a sandy beach break", "a tropical reef"],
      },
      {
        title: "Trail running",
        phrase: "running along",
        settings: ["a misty ridge line", "a coastal cliff path", "a pine forest trail"],
      },
      {
        title: "Rock climbing",
        phrase: "climbing",
        settings: ["a granite cliff face", "a limestone overhang", "a sea stack above the waves"],
      },
      {
        title: "Kayaking",
        phrase: "paddling a kayak through",
        settings: ["whitewater rapids", "a calm glacial lake", "a narrow river gorge"],
      },
      {
        title: "Skiing",
        phrase: "skiing fresh powder on",
        settings: ["a steep mountain slope", "a wide groomed piste", "a backcountry bowl"],
      },
      {
        title: "Beach volleyball",
        phrase: "playing beach volleyball on",
        settings: ["a crowded city beach", "a quiet island beach"],
      },
      {
        title: "Paragliding",
        phrase: "paragliding over",
        settings: ["a green valley", "a coastal town", "snowy peaks"],
      },
    ],
    lighting: [
      "at golden hour",
      "at dawn",
      "on an overcast afternoon",
      "in bright midday sun",
      "under a dramatic stormy sky",
    ],
  },
  sports_indoor: {
    subjects: [
      "a teenage athlete",
      "a group of amateurs",
      "a professional player",
      "a beginner and an instructor",
      "a mixed team",
    ],
    activities: [
      {
        title: "Basketball",
        phrase: "playing a fast pickup game in",
        settings: ["a school gym", "a professional arena", "a community sports hall"],
      },
      {
        title: "Swimming",
        phrase: "swimming laps in",
        settings: ["an Olympic-size pool", "a hotel pool", "a public swimming center"],
      },
      {
        title: "Boxing",
        phrase: "sparring in",
        settings: ["a boxing gym", "a basement fight club", "a training ring"],
      },
      {
        title: "Bouldering",
        phrase: "bouldering on",
        settings: ["an indoor climbing wall", "a colorful bouldering cave"],
      },
      {
        title: "Yoga",
        phrase: "practicing yoga in",
        settings: ["a sunlit studio", "a crowded fitness class"],
      },
      {
        title: "Table tennis",
        phrase: "playing table tennis in",
        settings: ["a club hall", "a tournament venue"],
      },
    ],
    lighting: [
      "under bright arena lights",
      "in flat fluorescent light",
      "in warm evening light through high windows",
      "under dramatic spotlights",
    ],
  },
  cooking: {
    subjects: [
      "a professional chef",
      "a grandmother",
      "a home cook",
      "two line cooks",
      "a culinary student",
    ],
    activities: [
      {
        title: "Pasta making",
        phrase: "rolling fresh pasta dough in",
        settings: ["a home kitchen", "a rustic farmhouse kitchen", "a restaurant kitchen"],
      },
      {
        title: "Street food",
        phrase: "grilling skewers at",
        settings: ["a night market stall", "a busy food truck", "a beachside grill"],
      },
      {
        title: "Baking",
        phrase: "shaping bread loaves in",
        settings: ["an artisan bakery", "a small apartment kitchen"],
      },
      {
        title: "Knife skills",
        phrase: "chopping vegetables on",
        settings: ["a wooden cutting board", "a steel prep counter"],
      },
      {
        title: "Plating",
        phrase: "plating a tasting menu dish in",
        settings: ["a fine-dining kitchen", "a chef's table"],
      },
    ],
    lighting: [
      "in warm tungsten light",
      "in soft morning light",
      "under harsh kitchen lights",
      "in moody low light",
    ],
  },
  street_urban: {
    subjects: [
      "a commuter",
      "a crowd of pedestrians",
      "a young couple",
      "a street performer",
      "a delivery rider",
    ],
    activities: [
      {
        title: "Commuting",
        phrase: "rushing through",
        settings: ["a crowded metro station", "a rainy city crossing", "a busy bus terminal"],
      },
      {
        title: "Skateboarding",
        phrase: "skateboarding across",
        settings: ["a concrete plaza", "an empty parking garage"],
      },
      {
        title: "Street market",
        phrase: "browsing stalls in",
        settings: ["an open-air flea market", "a covered food market"],
      },
      {
        title: "City cycling",
        phrase: "cycling through",
        settings: ["downtown traffic", "a tree-lined bike lane"],
      },
      {
        title: "Nightlife",
        phrase: "walking past neon signs in",
        settings: ["a nightlife district", "a narrow old-town street"],
      },
    ],
    lighting: ["at rush hour", "at night under neon light", "on a rainy morning", "at sunset"],
  },
  nature_wildlife: {
    subjects: [
      "a herd of wild horses",
      "a family of deer",
      "a lone fox",
      "a pack of wolves",
      "a group of ibex",
    ],
    activities: [
      {
        title: "Feeding",
        phrase: "feeding in",
        settings: ["an alpine meadow", "a misty valley"],
      },
      {
        title: "River crossing",
        phrase: "crossing",
        settings: ["a shallow river", "a frozen lake"],
      },
      {
        title: "Resting",
        phrase: "resting at the edge of",
        settings: ["a pine forest", "a quiet clearing"],
      },
      {
        title: "On the move",
        phrase: "moving through",
        settings: ["a snowy forest", "tall golden grass"],
      },
    ],
    lighting: [
      "at first light",
      "in heavy fog",
      "at golden hour",
      "under falling snow",
      "in soft overcast light",
    ],
  },
  interview: {
    subjects: [
      "a startup founder",
      "a retired teacher",
      "a street vendor",
      "a nurse",
      "a local farmer",
      "a university student",
    ],
    activities: [
      {
        title: "Sit-down interview",
        phrase: "answering questions in",
        settings: ["a quiet living room", "a bright studio", "a busy café"],
      },
      {
        title: "Walk-and-talk",
        phrase: "talking to the camera while walking through",
        settings: ["a city park", "an open-air market", "a university campus"],
      },
      {
        title: "Testimonial",
        phrase: "sharing a personal story in",
        settings: ["a small workshop", "a hospital corridor", "a family kitchen"],
      },
    ],
    lighting: [
      "under soft studio lighting",
      "in warm window light",
      "in natural daylight",
      "in the evening",
    ],
  },
  music_performance: {
    subjects: [
      "a rock band",
      "a solo guitarist",
      "a jazz trio",
      "a string quartet",
      "a singer-songwriter",
    ],
    activities: [
      {
        title: "Live concert",
        phrase: "performing on",
        settings: ["a festival main stage", "a small club stage", "an outdoor amphitheater"],
      },
      {
        title: "Busking",
        phrase: "busking in",
        settings: ["a subway corridor", "a historic town square"],
      },
      {
        title: "Rehearsal",
        phrase: "rehearsing in",
        settings: ["a cramped practice room", "a recording studio"],
      },
      {
        title: "Acoustic set",
        phrase: "playing an acoustic set in",
        settings: ["a grand concert hall", "a church nave"],
      },
    ],
    lighting: [
      "under colorful stage lights",
      "in natural daylight",
      "in warm low light",
      "under a single spotlight",
    ],
  },
  workplace: {
    subjects: [
      "a small product team",
      "two colleagues",
      "a manager and a new hire",
      "a group of engineers",
      "a freelancer",
    ],
    activities: [
      {
        title: "Team meeting",
        phrase: "holding a meeting in",
        settings: ["a glass-walled conference room", "an open-plan office"],
      },
      {
        title: "Remote work",
        phrase: "working on laptops in",
        settings: ["a coworking space", "a home office"],
      },
      {
        title: "Whiteboarding",
        phrase: "sketching ideas on a whiteboard in",
        settings: ["a startup office", "a design studio"],
      },
      {
        title: "Warehouse",
        phrase: "packing orders in",
        settings: ["a logistics warehouse", "a small e-commerce stockroom"],
      },
    ],
    lighting: [
      "in bright office light",
      "in late-afternoon sun",
      "under cool LED panels",
      "in the early morning",
    ],
  },
};
