// The demo packs the owner's seller wallet lists. Real content: the sections below are
// what a buyer receives, and what the validators read when a section is disputed.
//
// Pack 1: recipe 5 breaks promise 1 (it has bacon). Pack 2 is the honest twin (smoked tofu).
// Pack 3: six cold-email templates, all promises kept; its 5-minute window shows `release`.
// Pack 4: revision cards; card 4 has no date. Pack 5: fiction prompts; prompt 6 is two paragraphs.
// Pack 6: a Tehran walking day; stop 4 has no opening time. Pack 7: support replies, all promises kept.
// Pack 8: naming rules; rule 5 has no bad example.

export type DemoPack = {
  title: string;
  kind: string;
  promises: string[];
  sections: string[];
  priceGen: string;
  windowSeconds: number;
  /** what the pack is for, shown on the sell page's "Load a demo pack" menu */
  note: string;
  /** what a buyer should try, shown in the order page's checklist; never names the section or the ingredient */
  hint: string;
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

// ---- Pack 4: exam notes, six cards on the French Revolution. Card 4 has no date. ----

const NOTES_PROMISES = [
  "Every card states at least one date.",
  "Every card is under 150 words.",
  "No card uses the word 'probably'.",
];

const card1 = `Card 1: Why the old order cracked
By 1788 the French crown was close to bankrupt. Decades of war, including the money spent helping the American colonies against Britain, had left a debt the treasury could not service, and the tax system exempted the two groups best able to pay: the clergy and the nobility. A run of bad harvests pushed the price of bread in Paris to its highest level in living memory by the spring of 1789, so that a labourer could spend most of a day's wage on a single loaf. Louis XVI, unable to force a tax reform through the parlements, summoned the Estates-General, a body that had not met since 1614. Remember the pairing: a fiscal crisis at the top and a bread crisis at the bottom, arriving in the same year.`;

const card2 = `Card 2: From Estates-General to National Assembly
The Estates-General opened at Versailles on 5 May 1789 with the three orders meeting separately, which meant the clergy and nobility could always outvote the Third Estate two to one. The Third Estate, which represented roughly 97 percent of the population, refused to accept this. On 17 June it declared itself the National Assembly, claiming to speak for the nation as a whole. Locked out of its usual hall three days later, it met on an indoor tennis court and swore not to disband until France had a constitution: the Tennis Court Oath of 20 June 1789. The king gave way on 27 June and ordered the other two orders to join. Key idea for the exam: sovereignty had shifted from the crown to the nation in under two months.`;

const card3 = `Card 3: The fall of the Bastille
On 11 July 1789 Louis XVI dismissed Jacques Necker, the finance minister the Paris crowds trusted, and troops gathered around the city. Parisians read this as the opening move of a coup against the Assembly. On 14 July a crowd searching for gunpowder marched on the Bastille, a medieval fortress used as a prison and, more importantly, as an arsenal. After several hours the governor surrendered; he was killed and his head carried through the streets on a pike. The fortress held only seven prisoners, so its capture mattered as a symbol, not a rescue: the crowd had shown that royal authority in the capital could be overturned by force. The date became the national holiday of France in 1880.`;

const card4 = `Card 4: The Terror
The Terror was the period when the Committee of Public Safety, a twelve-man executive dominated by Maximilien Robespierre, governed France under emergency powers. Its justification was survival: the republic faced invasion on every frontier, a royalist rising in the Vendee, and federalist revolts in Lyon and Marseille. The Law of Suspects allowed the arrest of anyone whose conduct or connections made them a possible enemy, and the Revolutionary Tribunal tried cases quickly, often without defence counsel. Around 17,000 people were executed after trial across the country and thousands more died in prison or in the civil war. The Terror ended when the Convention turned on Robespierre himself; he was guillotined the day after his arrest. Exam angle: was the Terror a response to the war, or did the war become an excuse for it?`;

const card5 = `Card 5: The abolition of feudalism and the Declaration of Rights
Across the countryside in late July 1789 peasants attacked manor houses and burned the rolls that recorded their feudal dues, a wave of panic and revolt known as the Great Fear. To calm it, the National Assembly on the night of 4 August 1789 voted away the whole feudal system: serfdom, seigneurial courts, tithes, the sale of offices and the tax privileges of the nobility. Three weeks later, on 26 August 1789, it passed the Declaration of the Rights of Man and of the Citizen. Its first article, that men are born and remain free and equal in rights, and its claim that sovereignty resides in the nation, became the founding text of the Revolution. Note the contrast: the Declaration was universal in language, yet women and the enslaved in the colonies were left out.`;

const card6 = `Card 6: Ending, and what to argue about it
The Directory, the five-man executive that ruled from 1795, was unpopular and dependent on the army to survive elections it lost. On 9 November 1799 (18 Brumaire in the revolutionary calendar) General Napoleon Bonaparte overthrew it and made himself First Consul, a date most textbooks take as the end of the Revolution. What survived him: legal equality, the sale of church lands, the metric system, the department map of France and the civil code of 1804. What did not: the republic itself, a free press and elected local government. A strong essay picks one thread, such as equality before the law, and traces it from 1789 to 1804 rather than telling the whole story in order.`;

// ---- Pack 5: eight writing prompts for short fiction. Prompt 6 runs to two paragraphs. ----

const PROMPT_PROMISES = [
  "Every prompt names a setting and a character.",
  "Every prompt is a single paragraph.",
  "No prompt is longer than 120 words.",
];

const prompt1 = `Prompt 1: The last ferry
Setting: the ticket booth of a small island ferry terminal in late October, the season's final crossing an hour away. Character: Mira, who has sold tickets here for thirty-one years and has never once taken the boat herself. Tonight a man she recognises from a photograph she keeps in the drawer under the till asks for a single, one way. Write the scene from the moment she looks up. Decide before you start whether she sells him the ticket, and do not let the reader know your decision until the last two sentences. Keep the sea audible the whole way through.`;

const prompt2 = `Prompt 2: Inventory
Setting: a bankrupt hardware shop the morning the liquidators arrive, shelves still full, lights on a timer. Character: Dev, nineteen, the last employee, told to count everything and write it down. Write the story as the inventory itself: line after line of items and quantities, with Dev's own thoughts leaking into the entries as the morning goes on. The reader should learn what the shop meant to him and what he is about to do next without a single line of ordinary narration. Aim for the moment when a line stops being an item and becomes a confession.`;

const prompt3 = `Prompt 3: The understudy
Setting: the wings of a provincial theatre on the closing night of a long run of a play everyone in the cast has come to hate. Character: Joanna, the understudy for the lead, who has rehearsed the part two hundred times and performed it never. Ten minutes before curtain the lead is fine, healthy, and warming up. Write the story of those ten minutes. Something must happen, but the interesting version is the one in which nobody falls ill and nobody is pushed. Let Joanna's competence be the engine of the piece, not her resentment.`;

const prompt4 = `Prompt 4: Weather report
Setting: a mountain weather station at 3,000 metres, reachable only by a cable car that runs twice a day, in the first week of a winter posting. Character: Tomasz, the newly arrived observer, who must file a report every three hours and has just noticed that the previous observer's logbook continues for eleven days after the date he supposedly left. Write the story in the form of the reports Tomasz files, each one a little less about the weather. He is not in danger. What he is in is something else, and the reader should be the one to name it.`;

const prompt5 = `Prompt 5: The apology tour
Setting: a residential street of identical terraced houses in a rainy northern town, eleven doors, one afternoon. Character: Bea, sixty-four, recently and unwillingly sober, working through a list of neighbours she owes something to. Write the story as eleven doorsteps, some of them only a sentence long. Not every door opens. At least one person has no idea what she is talking about. At least one has been waiting years for this and has rehearsed a speech. End on the eleventh door, which she has been putting off, and do not tell us who lives there until she knocks.`;

const prompt6 = `Prompt 6: A room for the night
Setting: a roadside motel on the edge of a salt flat, the only lit building for forty miles, at two in the morning. Character: Ruth, the night clerk, who has a rule about never renting room 9 and has never told anyone why.

A couple arrive who only have enough cash for the cheapest room on the board, which is room 9. Write the negotiation. Ruth's reason for the rule should be ordinary, not supernatural, and it should turn out to be a reason about her rather than about the room. Let the couple be kind; the story is harder and better if nobody is a threat.`;

const prompt7 = `Prompt 7: Second opinion
Setting: a hospital corridor with a coffee machine that only takes exact change, at the end of a Friday afternoon. Character: Dr Anand, who has just told a patient something true and is now fairly sure she said it badly. The patient, Leo, is at the far end of the corridor waiting for a lift that has been stuck for ten minutes. Write the walk down the corridor and whatever happens at the lift. The medical facts are not the story; the story is whether a person can take back a sentence. Give Leo the best line, not the doctor.`;

const prompt8 = `Prompt 8: The listing
Setting: a flat viewing in a city where every flat is taken within the hour, on a Saturday morning in a heatwave. Character: Sunny, the letting agent, twenty-three, showing the same one-bedroom to eleven people in forty minutes. Write it as a single continuous take: the same rooms, the same patter, eleven different faces, each reacting to the same damp patch behind the door. Somewhere around the seventh viewer Sunny should stop performing. Decide who gets the flat and make it the wrong person, in a way that Sunny can see and cannot fix.`;

// ---- Pack 6: a walking day in Tehran, six stops. Stop 4 gives no opening time. ----

const TEHRAN_PROMISES = [
  "Every stop lists an opening time.",
  "Every stop is reachable on foot from the previous one, and the guide says how long the walk is.",
  "No stop is a shopping mall.",
];

const stop1 = `Stop 1: Golestan Palace, 9:00 to 17:00 (last entry 16:00)
Start here, at the oldest part of the city that still stands, because the rest of the day walks outward from it. Golestan is a walled garden of pavilions built and rebuilt by the Qajar kings, and the thing to see first is the mirror hall, where thousands of cut mirrors turn a plain room into something that seems to be lit from inside. Buy the garden ticket at the gate and add the halls you want; the mirror hall and the marble throne veranda are worth it, the rest can be skipped on a first visit. Go early: by eleven the tour groups arrive and the garden loses its quiet. Allow ninety minutes. The metro stop is Panzdah-e Khordad, and the cafe just inside the entrance sells a good cardamom tea for the price of a bus ticket.`;

const stop2 = `Stop 2: The Grand Bazaar, 8:30 to 17:00 (closed Fridays)
Walk: 10 minutes. Leave Golestan by the main gate, turn left onto Panzdah-e Khordad Street and keep the palace wall on your left until the covered entrance of the bazaar opens on your right.
This is not a market so much as a roofed town, ten kilometres of lanes, and nobody sees all of it. Pick one line and follow it: the carpet lane for colour, the copper lane for noise, the spice lane for smell. Prices are not written down, so ask and expect the first number to be a starting point, though nobody will mind if you only look. Keep an eye on the porters pushing hand carts; they have right of way and they know it. Around midday the lanes fill with people heading to the mosque inside, and this is the best moment to stand still and watch the whole thing move around you.`;

const stop3 = `Stop 3: Haj Ali Darvish tea stall, 8:00 to 16:00
Walk: 5 minutes, inside the bazaar. From the main entrance lane take the second turning on the left and look for the queue; the stall itself is barely wider than a doorway.
This is said to be the smallest tea shop in the city and it has been pouring tea from the same corner for over a century. There is no seating. You are handed a small glass, you drink it standing in the lane with everyone else, and you pass the glass back. Take it with a lump of saffron sugar candy held in the mouth, the way the regulars do, and you will understand why people queue for something so simple. The current owner is the grandson of the founder and will tell you so, cheerfully, while pouring. Ten minutes here resets the whole morning.`;

const stop4 = `Stop 4: Masoudieh Mansion and garden
Walk: 15 minutes. Leave the bazaar by its northern edge onto Panzdah-e Khordad Street, turn right, then left up Ekbatan Street; the mansion's brick gate is on the left just before Baharestan Square.
This was a Qajar prince's house, later the ministry of education, and for years a near-ruin; the garden is the reason to come. It is a long rectangle of old plane trees and a shallow pool, with the tiled facade of the main building at one end and a small cafe under an arcade at the other. It is quiet in a way nowhere else on this route is, and the tilework, birds and lions in blue and ochre, repays a slow look. If the house itself is open, the painted ceilings on the first floor are the highlight; if not, sit by the pool with a tea and let your feet recover before the afternoon.`;

const stop5 = `Stop 5: National Museum of Iran, 9:00 to 18:00
Walk: 20 minutes. From Baharestan Square head west along Jomhouri Street, then turn left down Si-e Tir Street; the museum's tall brick arch, a copy of the great vault at Ctesiphon, is unmistakable.
Two buildings share the courtyard: the ancient Iran hall and the Islamic-period hall. Do the ancient hall first and do it slowly. The salt man, a miner preserved in a salt mine for seventeen centuries, is the piece everyone photographs, but the small bronze animals from Lorestan and the stone reliefs carried up from Persepolis are what stay with you. Labels are in Persian and English. The Islamic hall upstairs is calmer and its best room is the one of Quran pages in early scripts. Give the pair two hours, and use the museum cafe if you skipped lunch.`;

const stop6 = `Stop 6: Cafe Naderi, 8:00 to 22:00
Walk: 15 minutes. From the museum go back up Si-e Tir Street to Jomhouri Street and turn left; the cafe is on the right at number 559, an unremarkable door under a faded sign.
End the day where the city's writers have ended theirs since the 1920s. The cafe was opened by an Armenian emigre and kept its dark wood, its brass rail and its waiters in white jackets while everything around it changed. Order the cafe glace, the house specialty, or a plain Turkish coffee, and take a table at the back. There is an old hotel behind it and a garden that opens in summer evenings, where the same tables have hosted several generations of arguments about poetry. Nobody will hurry you. It is the right place to write down the day while it is still fresh.`;

// ---- Pack 7: six customer support replies, all promises kept. ----

const SUPPORT_PROMISES = [
  "Every template starts with a greeting.",
  "Every template ends with a next step for the customer.",
  "No template promises a refund.",
];

const support1 = `Template 1: We have your message and here is when you will hear back
Hi there,

Thanks for writing in. I have your message about the login problem and I want to be upfront about timing so you are not left guessing: I am looking into it now and you will have a proper answer from me by the end of tomorrow, whatever I find. If it turns out to be something I can fix sooner, I will write straight away.

In the meantime, two things would help me move faster. Could you reply with the email address you use to sign in, and tell me whether the problem happens in a browser, in the app, or in both?

Next step: reply to this email with those two details, and keep an eye on your inbox tomorrow.

Warm regards,
Sam, Support`;

const support2 = `Template 2: The problem was on our side
Hello,

You were right, and I am sorry. The export you tried to run on Tuesday failed because of a change we shipped that morning, not because of anything you did. We found it, rolled it back, and the export now runs as it did before. I checked your account specifically and the file you needed is ready.

I know a missing export on a deadline day is more than a small annoyance, and I do not want to wave that away. If it cost you time you want to talk about, reply here and I will read it myself.

Next step: sign in, open Reports, and press Export again; the file will be in your downloads within a minute. Reply to this email if it is not.

Best,
Sam, Support`;

const support3 = `Template 3: We cannot do that, and here is what we can do
Hi,

Thanks for asking about moving your history from one workspace to another. I want to give you a straight answer: there is no way to do that today, and I would rather tell you now than let you wait for a feature that is not on its way.

What I can do is close to it. I can export your full history as a single file you keep, and I can set up the new workspace so the first month runs on the same plan you have now, so there is nothing to lose by trying it side by side. If the missing merge is a dealbreaker, tell me and I will pass that on to the people who decide the roadmap, with your name attached.

Next step: reply with "export" and I will send the file within the hour.

Best wishes,
Sam, Support`;

const support4 = `Template 4: Your account is safe, and what to change anyway
Hello,

I have checked your account after your message about the sign-in alert. There was one attempt from a device we did not recognise, it failed, and nothing in your account was opened or changed. You did the right thing writing in.

Even so, I would take five minutes to tighten things. Change your password to one you do not use anywhere else, and turn on two-step sign-in under Settings, then Security; with that on, a password alone will not get anyone in. If you would like, I can sign out every device except the one you are on now.

Next step: reply with "sign out other devices" and I will do it right away, or go to Settings and turn on two-step sign-in yourself.

Take care,
Sam, Support`;

const support5 = `Template 5: Cancelling, done properly
Hi,

I have cancelled your subscription as you asked. Nothing more will be charged, your access continues until the end of the current period, and your data stays in place for ninety days after that in case you change your mind. You do not need to do anything else to make the cancellation stick.

If you have a minute, I would honestly like to know what did not work for you. One sentence is plenty, and I read every reply to these.

Next step: download anything you want to keep from Settings, then Export, before the end of the period. If you decide to come back, sign in and the account will be waiting.

All the best,
Sam, Support`;

const support6 = `Template 6: A question we cannot answer without more from you
Hello,

Thank you for your message. I want to help, and I am not yet sure what went wrong, because the error you saw can come from a few different places. Rather than guess and send you in circles, I would like three things from you.

First, the exact text of the error, or a screenshot. Second, roughly what time it happened, so I can find it in our logs. Third, what you were trying to do at the moment it appeared. With those I can usually find the cause in one go.

Next step: reply to this email with those three details, and I will pick it up the moment it arrives.

Kind regards,
Sam, Support`;

// ---- Pack 8: eight rules for naming things in code. Rule 5 has no bad example. ----

const NAMING_PROMISES = [
  "Every rule has a bad example and a good example.",
  "Every rule fits in 200 words.",
];

const rule1 = `Rule 1: Name the thing, not its type
A name should say what a value means in the program, not what shape it has. The type is already in the declaration, or in the reader's editor; repeating it in the name costs characters and buys nothing, and it goes stale the first time the type changes.

Bad example:
  userList = load_users()
  countInt = len(userList)
  nameStr = user.name

Good example:
  users = load_users()
  count = len(users)
  name = user.name

The test: if you changed the type from a list to a set, would the name become a lie? If so, the type was doing the naming. Plural nouns for collections, singular for one item, and let the language carry the rest.`;

const rule2 = `Rule 2: Booleans are questions with yes or no answers
A boolean name should read as a statement that is either true or false, so that a condition reads as plain English. Prefer is, has, can, should as prefixes, and avoid names that could be a count or a mode.

Bad example:
  if user.status: ...
  if flag: ...
  if not disabled: ...

Good example:
  if user.is_active: ...
  if has_unsaved_changes: ...
  if is_enabled: ...

Two traps. Negated names force double negatives at every call site: not is_disabled is harder to read than is_enabled. And status is not a boolean at all; when you see one treated as a flag, the code is usually hiding a third state it has not admitted to yet.`;

const rule3 = `Rule 3: Functions are verbs, and the verb is honest
A function name is a promise about what happens when it is called. Use a verb, make it the right verb, and make the name say whether the function changes anything.

Bad example:
  def user(id): ...            # fetches from the database
  def validate(order): ...     # also saves the order
  def data(): ...

Good example:
  def fetch_user(id): ...
  def validate_order(order): ...
  def save_order(order): ...

The bad cases lie in different ways: one has no verb so you cannot tell if it is cheap or slow, one does more than its verb says, and one says nothing. The common cure is to split until each function does what its name says and nothing else. If you cannot find one verb for it, the function is two functions.`;

const rule4 = `Rule 4: Units go in the name
Any number that has a unit should carry that unit in its name, because a bare number will one day be added to another bare number with a different unit and nobody will notice until it is in production.

Bad example:
  timeout = 30
  size = 4096
  delay = 0.5

Good example:
  timeout_seconds = 30
  size_bytes = 4096
  delay_ms = 500

Notice that the good version of delay also changed the number so that the unit is an integer; that is not required, but it removes a second way to be wrong. Do the same for currency (amount_cents, price_gen), for angles (degrees or radians) and for anything measured in percent or in fractions of one. If your language has a type system that can carry the unit, use it as well; the name is the fallback that survives every refactor.`;

const rule5 = `Rule 5: Pick one word per concept and keep it
A codebase should use one word for one idea. Once you have fetch for reading from the network, use fetch everywhere; do not let get, load, retrieve and read each mean the same thing in different files, because readers will assume the difference is deliberate and go looking for it.

Good example:
  fetch_user(), fetch_order(), fetch_invoice()    # all read over the network
  load_config(), load_template()                  # all read from local disk
  parse_date(), parse_amount()                    # all turn text into a value

Write the vocabulary down, even if it is six lines in the README, and enforce it in review. The test is a newcomer: given one of these names, can they guess the others? When the answer is yes, the words are pulling their weight. Renaming to match the vocabulary is worth a pull request of its own.`;

const rule6 = `Rule 6: Length should match scope
A name that lives for three lines can be short; a name that is exported from a module must explain itself to someone who has never seen the file. Short names in small scopes are a courtesy; short names in large scopes are a puzzle.

Bad example:
  for user_record_in_current_batch in batch: ...
  def f(x, y): ...                 # exported and called from ten files
  MAX = 100                        # module level

Good example:
  for u in batch: ...
  def clamp(value, limit): ...
  MAX_RETRIES = 100

The first bad case is over-named for a loop variable; the other two are under-named for their reach. Ask how far away the reader will be when they meet the name, and spend characters in proportion.`;

const rule7 = `Rule 7: Do not encode the implementation
A name that describes how something is built breaks as soon as the implementation changes, and it invites callers to depend on details they should not know.

Bad example:
  users_hashmap = {}
  send_email_via_sendgrid(to, body)
  cached_price_from_redis(id)

Good example:
  users_by_id = {}
  send_email(to, body)
  current_price(id)

The good names describe the contract: what you get, not where it came from. When the email provider changes, send_email keeps its name and its callers, and the diff is one file. There is one honest exception: when two implementations coexist on purpose and callers must choose, name the difference, as in price_from_cache and price_from_chain, and make the choice visible at the call site.`;

const rule8 = `Rule 8: When you cannot name it, you do not understand it yet
The hardest names are a signal, not an obstacle. If you have been staring at a function for ten minutes trying to call it something better than process or handle, the function is either doing too many things or you have not yet worked out what it is for.

Bad example:
  def process(data): ...
  def handle_stuff(items): ...
  class Manager: ...

Good example:
  def merge_duplicate_contacts(contacts): ...
  def retry_failed_uploads(uploads): ...
  class ContactDeduplicator: ...

The good names were not found by thinking harder about words. They were found by asking what the code does and splitting it until each piece had one answer. Treat every process, handle, manager, helper and util in your codebase as a marker for work you have not finished, and finish it when you next touch the file.`;

export const DEMO_PACKS: DemoPack[] = [
  {
    title: "Weeknight Vegetarian, 8 recipes",
    kind: "recipes",
    promises: VEG_PROMISES,
    sections: [recipe1, recipe2, recipe3, recipe4, recipe5Bacon, recipe6, recipe7, recipe8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "Recipe 5 has bacon: a dispute on section 5 against promise 1 breaks.",
    hint: "One recipe quietly breaks promise P1. Read them, find it, and dispute that section against P1 to see a refund; dispute any other section and the validators will side with the seller.",
  },
  {
    title: "Weeknight Vegetarian, 8 recipes — the honest twin",
    kind: "recipes",
    promises: VEG_PROMISES,
    sections: [recipe1, recipe2, recipe3, recipe4, recipe5Tofu, recipe6, recipe7, recipe8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "Same pack with smoked tofu in recipe 5: every dispute keeps.",
    hint: "The honest twin: every promise holds. Any dispute ends with the seller paid and your bond gone; try it if you want to see the validators refuse a bad claim.",
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
    hint: "Every promise holds and the window is five minutes; after it closes, press Release. Nothing to dispute here.",
  },
  {
    title: "Exam notes: the French Revolution, 6 cards",
    kind: "notes",
    promises: NOTES_PROMISES,
    sections: [card1, card2, card3, card4, card5, card6],
    priceGen: "0.5",
    windowSeconds: 2 * 86400,
    note: "Revision cards with dates and word limits; card 4 gives no date, so it breaks promise 1.",
    hint: "One card breaks promise P1: it never states a date. Read the six cards, find it, and dispute that card against P1. The word limit and the banned word hold everywhere.",
  },
  {
    title: "Writing prompts for short fiction, 8 prompts",
    kind: "prompts",
    promises: PROMPT_PROMISES,
    sections: [prompt1, prompt2, prompt3, prompt4, prompt5, prompt6, prompt7, prompt8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "Eight story seeds, each with a setting and a character; prompt 6 runs to two paragraphs, breaking promise 2.",
    hint: "One prompt breaks promise P2: it is not a single paragraph. Every prompt names its setting and character and stays under 120 words, so a dispute on P1 or P3 will lose.",
  },
  {
    title: "A first day in Tehran, 6 stops",
    kind: "guide",
    promises: TEHRAN_PROMISES,
    sections: [stop1, stop2, stop3, stop4, stop5, stop6],
    priceGen: "1.5",
    windowSeconds: 2 * 86400,
    note: "A walking day from Golestan Palace to Cafe Naderi; stop 4 has no opening time, breaking promise 1.",
    hint: "One stop breaks promise P1: it lists no opening time. Every walk between stops is timed and none of the stops is a mall, so P2 and P3 hold.",
  },
  {
    title: "Customer support replies, 6 templates",
    kind: "templates",
    promises: SUPPORT_PROMISES,
    sections: [support1, support2, support3, support4, support5, support6],
    priceGen: "0.5",
    windowSeconds: 86400,
    note: "Six honest support replies: every one opens with a greeting, ends with a next step, and none promises a refund.",
    hint: "Every promise holds. Each reply starts with a greeting, ends with a next step, and never promises a refund; any dispute ends with the seller paid and your bond gone.",
  },
  {
    title: "Eight rules for naming things in code",
    kind: "other",
    promises: NAMING_PROMISES,
    sections: [rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8],
    priceGen: "2",
    windowSeconds: 3 * 86400,
    note: "A short craft list on naming; rule 5 shows only a good example, so it breaks promise 1.",
    hint: "One rule breaks promise P1: it is missing one of the two examples. Every rule is under 200 words, so P2 holds throughout.",
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
