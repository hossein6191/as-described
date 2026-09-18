// The three demo packs the owner's seller wallet lists. Real content: the sections below are
// what a buyer receives, and what the validators read when a section is disputed.
//
// Pack 1: recipe 5 breaks promise 1 (it has bacon). Pack 2 is the honest twin (smoked tofu).
// Pack 3: six cold-email templates, all promises kept; its 5-minute window shows `release`.

export type DemoPack = {
  title: string;
  kind: string;
  promises: string[];
  sections: string[];
  priceGen: string;
  windowSeconds: number;
  /** what the pack is for, shown on the sell page's "Load a demo pack" menu */
  note: string;
};

const VEG_PROMISES = [
  "Every recipe is vegetarian: no meat, poultry or fish.",
  "Every recipe states a total time, and it is 30 minutes or less.",
  "No recipe needs an oven.",
];

const recipe1 = `Recipe 1 — Garlic butter chickpeas with wilted spinach
Total time: 20 minutes. Serves 2.

Ingredients: 2 tins chickpeas (drained), 40 g butter, 4 cloves garlic (sliced), 200 g baby spinach, 1 lemon, 1 tsp smoked paprika, salt, black pepper, 2 slices of crusty bread.

1. Warm the butter in a wide frying pan over medium heat until it foams. Add the garlic and cook for 1 minute, stirring, until it smells sweet but has not browned.
2. Tip in the chickpeas and the paprika. Fry for 6 to 8 minutes, shaking the pan now and then, until the chickpeas are blistered and a few have split.
3. Add the spinach in two handfuls, letting the first wilt before you add the second. Season with salt and pepper.
4. Squeeze in the juice of half the lemon and taste; add more if it needs lift.
5. Toast the bread in a dry pan while the spinach finishes. Pile the chickpeas on top and eat at once.`;

const recipe2 = `Recipe 2 — Peanut noodles with crunchy vegetables
Total time: 15 minutes. Serves 2.

Ingredients: 200 g dried egg-free noodles, 3 tbsp smooth peanut butter, 2 tbsp soy sauce, 1 tbsp rice vinegar, 1 tsp honey or maple syrup, 1 clove garlic (grated), 1 small carrot, half a cucumber, 3 spring onions, 1 red chilli, a handful of roasted peanuts, lime.

1. Put a pan of water on to boil and cook the noodles as the packet says, then drain and rinse under cold water so they do not clump.
2. While the water heats, whisk the peanut butter, soy, vinegar, sweetener, garlic and 3 tbsp warm water into a smooth, pourable sauce.
3. Cut the carrot and cucumber into thin matchsticks, slice the spring onions and the chilli.
4. Toss the noodles through the sauce, then fold in the vegetables so they stay crisp.
5. Top with the peanuts and a squeeze of lime. Eat warm or cold.`;

const recipe3 = `Recipe 3 — Chickpea and spinach curry
Total time: 25 minutes. Serves 3.

Ingredients: 1 onion, 3 cloves garlic, a thumb of ginger, 2 tbsp vegetable oil, 1 tbsp curry powder, 1 tsp ground cumin, 1 tin chopped tomatoes, 1 tin chickpeas (drained), 200 ml coconut milk, 150 g spinach, salt, lemon, cooked rice or flatbread to serve.

1. Finely chop the onion, garlic and ginger. Heat the oil in a deep pan over medium heat and cook the onion for 5 minutes until soft.
2. Stir in the garlic, ginger, curry powder and cumin and fry for 1 minute until fragrant.
3. Add the tomatoes and chickpeas, bring to a simmer and cook for 10 minutes so the sauce thickens.
4. Pour in the coconut milk, then add the spinach a handful at a time until it wilts.
5. Season with salt and a squeeze of lemon. Serve over rice or with warm flatbread from a dry pan.

The curry is better the next day and freezes well.`;

const recipe4 = `Recipe 4 — Halloumi and pepper tacos
Total time: 20 minutes. Serves 2.

Ingredients: 225 g halloumi, 2 bell peppers, 1 red onion, 1 tbsp olive oil, 1 tsp ground cumin, 1 tsp chilli flakes, 6 small corn tortillas, 1 avocado, a handful of coriander, 1 lime, 3 tbsp plain yoghurt.

1. Slice the halloumi into finger-width strips and pat dry. Slice the peppers and onion.
2. Heat the oil in a large frying pan over high heat. Fry the peppers and onion for 6 minutes until charred at the edges, then push them to one side.
3. Add the halloumi to the empty side and fry for 2 minutes per side until golden. Dust everything with cumin and chilli flakes.
4. Warm the tortillas one at a time in a dry pan for 20 seconds per side and wrap them in a towel to keep soft.
5. Mash the avocado with lime juice and salt. Spread on the tortillas, add the halloumi and peppers, top with yoghurt and coriander.`;

const recipe5Bacon = `Recipe 5 — Creamy carbonara-style pasta
Total time: 25 minutes. Serves 2.

Ingredients: 200 g spaghetti, 100 g bacon, 2 egg yolks, 1 whole egg, 50 g grated pecorino or parmesan, 1 clove garlic, black pepper, salt.

1. Boil the spaghetti in salted water until just tender, about 9 minutes. Save a mug of the cooking water before draining.
2. Meanwhile, cut it into small pieces. Fry 100 g bacon in a dry frying pan over medium heat for 5 to 6 minutes until crisp. Add the crushed garlic for the last minute, then take the pan off the heat.
3. Beat the yolks, the whole egg and most of the cheese together with a lot of black pepper.
4. Tip the drained spaghetti into the frying pan and toss it through the fat. Off the heat, pour in the egg mixture and stir fast, adding cooking water a splash at a time until the sauce is glossy.
5. Serve at once with the rest of the cheese on top.`;

const recipe5Tofu = `Recipe 5 — Creamy carbonara-style pasta
Total time: 25 minutes. Serves 2.

Ingredients: 200 g spaghetti, 100 g smoked tofu, 2 egg yolks, 1 whole egg, 50 g grated hard cheese, 1 clove garlic, 1 tsp paprika, 1 tbsp olive oil, black pepper, salt.

1. Boil the spaghetti in salted water until just tender, about 9 minutes. Save a mug of the cooking water before draining.
2. Meanwhile, cut the tofu into small cubes. Fry 100 g smoked tofu in the oil over medium heat for 5 minutes until crisp, dust with paprika, add the garlic for the last minute, then take the pan off the heat.
3. Beat the yolks, the whole egg and most of the cheese together with a lot of black pepper.
4. Tip the drained spaghetti into the pan and toss it through the oil. Off the heat, pour in the egg mixture and stir fast, adding cooking water a splash at a time until glossy.
5. Serve at once with the rest of the cheese on top.`;

const recipe6 = `Recipe 6 — Black bean quesadillas
Total time: 20 minutes. Serves 2.

Ingredients: 1 tin black beans (drained), 1 tsp ground cumin, half tsp chilli powder, 4 large flour tortillas, 120 g grated cheddar, 4 spring onions, 1 small tomato, a handful of coriander, 1 tbsp oil, sour cream and hot sauce to serve.

1. Mash half the beans roughly with a fork, then stir in the whole beans, cumin, chilli powder and a pinch of salt.
2. Slice the spring onions and dice the tomato. Chop the coriander.
3. Spread the bean mixture over half of each tortilla, scatter over the cheese, spring onions, tomato and coriander, and fold the tortilla closed.
4. Heat a little oil in a frying pan over medium heat. Cook each quesadilla for 3 minutes per side, pressing lightly with a spatula, until golden and the cheese has melted.
5. Cut into wedges and serve with sour cream and hot sauce.`;

const recipe7 = `Recipe 7 — Lemon and pea risotto in a pan
Total time: 30 minutes. Serves 2.

Ingredients: 1 small onion, 30 g butter, 1 tbsp olive oil, 180 g risotto rice, 100 ml white wine (or water), 750 ml hot vegetable stock, 150 g frozen peas, 1 lemon, 40 g grated vegetarian hard cheese, a handful of mint, salt, black pepper.

1. Finely chop the onion. Melt the butter with the oil in a wide, heavy pan over medium heat and cook the onion for 4 minutes until soft.
2. Stir in the rice and cook for 1 minute until the grains turn glossy. Pour in the wine and let it bubble away.
3. Add the hot stock a ladle at a time, stirring often, waiting until each ladle is absorbed before the next. About 18 minutes.
4. Stir in the peas for the last 3 minutes. Off the heat, beat in the cheese, the zest and juice of the lemon, and the chopped mint.
5. Season, cover for 2 minutes, then serve loose and creamy.`;

const recipe8 = `Recipe 8 — Shakshuka with feta
Total time: 25 minutes. Serves 2.

Ingredients: 1 onion, 1 red pepper, 2 cloves garlic, 2 tbsp olive oil, 1 tsp ground cumin, 1 tsp smoked paprika, 1 tin chopped tomatoes, 4 eggs, 80 g feta, a handful of parsley, salt, black pepper, bread to serve.

1. Slice the onion and pepper and chop the garlic. Heat the oil in a lidded frying pan over medium heat and cook the onion and pepper for 6 minutes until soft.
2. Add the garlic, cumin and paprika and fry for 1 minute.
3. Pour in the tomatoes, half fill the tin with water and add that too. Simmer for 8 minutes until thick, then season.
4. Make four hollows in the sauce and crack an egg into each. Cover the pan and cook for 5 to 6 minutes until the whites are set and the yolks still soft.
5. Crumble over the feta and scatter the parsley. Serve straight from the pan with bread for the sauce.`;

const email1 = `Subject: Quick question about your onboarding flow

Hi Dana,

I noticed your team relaunched the signup page last month. Congratulations, it is noticeably faster.

We help product teams cut the time between signup and first value, usually by finding the two or three steps where new users stall. Our last project shortened that gap from nine days to three.

Would a fifteen-minute call next week be useful? If you would rather I send a short written overview first, say the word and I will keep it to one page.

Best,
Mira Solberg`;

const email2 = `Subject: A follow-up, and one idea for your billing page

Hi Tomas,

I wrote two weeks ago and did not want to leave it hanging.

One concrete idea: your billing page shows the annual price only after the monthly plan is selected. Teams that show both prices up front see fewer abandoned checkouts, and the change is a small one.

If that is worth ten minutes, reply with a day that suits you. If not, tell me and I will stop writing.

Thanks,
Mira Solberg`;

const email3 = `Subject: Introduction from Priya at Northwind

Hi Lena,

Priya Nair suggested I get in touch. She mentioned your team is looking for a way to keep invoices and contracts in one searchable place.

That is what we build. Northwind's finance team uses it to find any document by amount, vendor or date in a few seconds, without a folder structure to maintain.

Could I show you a five-minute walkthrough on Thursday or Friday? I am happy to send the recording instead if that is easier.

Kind regards,
Jonas Weber`;

const email4 = `Subject: Your job post for a data engineer

Hi Marcus,

I saw the data engineer role you posted on Monday. Hiring for that seat usually takes three to four months, and the pipeline work does not wait.

We place vetted contract data engineers within two weeks, with a two-week trial so there is no risk if the fit is wrong. Our engineers have worked on warehouses at the scale your post describes.

Would you be open to a short call to see whether a contractor could cover the gap while you hire? A reply with a time is all I need.

Best regards,
Elif Kaya`;

const email5 = `Subject: Cutting your cloud bill without a migration

Hi Sofia,

Most teams we talk to overspend on cloud by a quarter, and almost all of it is idle capacity nobody has looked at.

We run a read-only review of your account and hand you a ranked list of savings. No agents, no migration, and the first review is free. Last month one client cut eighteen percent in a week from that list alone.

If you would like the review, reply and I will send the two-line setup. If the timing is wrong, tell me when to check back.

Thanks,
Daniel Okafor`;

const email6 = `Subject: One last note before I close your file

Hi Ravi,

I have written a few times about helping your support team answer tickets faster, and I have not heard back, which usually means the timing is off.

This is the last message. If a shorter first response time matters this quarter, reply and I will send the three-step plan we used with a team your size. If not, no reply needed and I will not write again.

Either way, good luck with the launch.

Best,
Hannah Lindqvist`;

export const DEMO_PACKS: DemoPack[] = [
  {
    title: "Weeknight Vegetarian, 8 recipes",
    kind: "recipes",
    promises: VEG_PROMISES,
    sections: [recipe1, recipe2, recipe3, recipe4, recipe5Bacon, recipe6, recipe7, recipe8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "Recipe 5 has bacon: a dispute on section 5 against promise 1 breaks.",
  },
  {
    title: "Weeknight Vegetarian, 8 recipes — the honest twin",
    kind: "recipes",
    promises: VEG_PROMISES,
    sections: [recipe1, recipe2, recipe3, recipe4, recipe5Tofu, recipe6, recipe7, recipe8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "Same pack with smoked tofu in recipe 5: every dispute keeps.",
  },
  {
    title: "Cold Email Templates, 6 templates",
    kind: "templates",
    promises: [
      "Every template has a subject line.",
      "Every template is under 120 words.",
      "No template leaves a placeholder like [NAME] unfilled.",
    ],
    sections: [email1, email2, email3, email4, email5, email6],
    priceGen: "0.5",
    windowSeconds: 300,
    note: "All promises kept; the 5-minute window shows a release to the seller.",
  },
];

/** The three promise templates on the sell page. */
export const PROMISE_TEMPLATES = [
  "Every section is …",
  "No section contains …",
  "Every section states … and it is under …",
];

/** Words that make a promise depend on world knowledge instead of the section text. Warn, never block. */
export const WORLD_KNOWLEDGE_WORDS = [
  "healthy",
  "best",
  "famous",
  "authentic",
  "popular",
  "delicious",
  "professional",
  "proven",
  "accurate",
  "correct",
  "true",
  "safe",
  "legal",
  "original",
];
