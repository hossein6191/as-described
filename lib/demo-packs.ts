// The demo packs the owner's seller wallet lists. Real content: the sections below are
// what a buyer receives, and what the validators read when a section is disputed.
//
// Pack 1: recipe 5 breaks promise 1 (it has bacon). Pack 2 is the honest twin (smoked tofu).
// Pack 3: six cold-email templates, all promises kept; its 5-minute window shows `release`.
// Pack 4: revision cards; card 4 names no year or date. Pack 5: fiction prompts; prompt 6 is two paragraphs.
// Pack 6: a Lisbon walking day; stop 4 gives no opening hours. Pack 7: support replies, all promises kept.
// Pack 8: naming rules; rule 5 has no bad example.
// Packs 9 to 19 give every kind at least three packs: 9 breakfasts (recipe 4 needs a stove), 10 proposals
// (template 3 has no delivery date line), 11 invitations (honest), 12 physics cards (card 5 has no worked
// example), 13 Spanish verbs (honest), 14 journal prompts (prompt 5 is not a question), 15 interview prompts
// (honest), 16 houseplants (plant 4 never says how often to water), 17 Kyoto (honest), 18 a card game
// (honest), 19 commit messages (rule 6 has no example).
//
// Every promise is written to be read literally: in each pack the named section breaks the named
// promise and nothing else breaks anything, and word limits sit well above the longest section.
// Only promises, notes and hints may change here. A section's bytes are its hash, and the hashes are
// how the site recognises a demo pack (lib/demo-keys.ts), so an edited section is no longer a demo.

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

// ---- Pack 4: exam notes, six cards on the French Revolution. Card 4 names no year or date. ----

const NOTES_PROMISES = [
  "Every card names at least one year or date.",
  "Every card is under 200 words.",
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
  "Below its title line, every prompt is a single paragraph.",
  "No prompt is longer than 150 words.",
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

// ---- Pack 6: a first day in Lisbon, six stops. Stop 4 gives no opening hours. ----

const LISBON_PROMISES = [
  "Every stop gives its opening hours in clock times.",
  "Every stop after the first says how to get there from the previous one, on foot or by tram 28, and how long it takes.",
  "No stop is a shopping mall.",
];

const stop1 = `Stop 1: Praça do Comércio and the Rua Augusta arch, 9:00 to 19:00 (the arch viewpoint)
Start at the river. The square is the size of a small town and open on one side to the Tagus, with yellow arcades on the other three and a bronze king on a horse in the middle. Walk down to the water first: the two marble columns at the edge are where ships once landed passengers, and standing between them tells you why the city was built here. Then turn round and go through the arch at the top of the square. The lift and stairs inside take you to a terrace above the arch, with the grid of the lower town laid out in front of you and the castle on its hill to the right. Buy the ticket at the small counter inside the arch; it takes ten minutes and there is rarely a queue before eleven. Have a coffee under the arcades on the way out, at one of the older cafes on the west side, and look at the map: everything else today is uphill from here.`;

const stop2 = `Stop 2: The Sé cathedral, 10:00 to 18:00 (cloister and treasury closed Sundays)
Walk: 10 minutes. Leave the square at its top-left corner onto Rua da Alfândega, then bear right and uphill onto Rua de Santo António da Sé; the two squat towers of the cathedral fill the street ahead of you.
This is the oldest church in the city, begun in 1147 and built like a fortress because it was one: the walls are thick, the windows small, and the front is more castle than cathedral. Inside it is dark and cool, which is welcome after the climb. Look for the rose window above the door, then pay the small fee for the cloister behind the altar, where excavations have opened up a pit of Roman and Moorish foundations under the arches. The trams grind past the front door every few minutes; a photograph of the yellow tram against the stone is the one everybody takes, and the corner opposite the door is where to take it.`;

const stop3 = `Stop 3: Alfama and the São Jorge castle, 9:00 to 21:00 (last entry 20:30)
Walk: 15 minutes. From the cathedral door keep climbing along Rua Augusto Rosa, past the Santa Luzia viewpoint on your right, then follow the brown signs for the castle up through the lanes; every fork goes up.
Alfama is the district that survived the 1755 earthquake, so its streets still follow the old Moorish plan: stairs instead of roads, laundry across the lanes, and a small square every hundred metres with a tiled fountain and two old men. Take any lane that goes up and you will reach the castle walls. Inside, the walls are the point: walk the full circuit of the ramparts for the best view of the river and the roofs, and climb the towers if the stairs are open. The gardens have peacocks and shade. Allow ninety minutes for the castle and let yourself get lost on the way; the district is small enough that downhill always leads back out.`;

const stop4 = `Stop 4: Pastéis de nata in Alfama
Walk: 10 minutes. Leave the castle by the main gate, drop down Rua do Chão da Feira and Rua dos Cegos, and look for the small pastelaria on the corner of Largo de São Miguel with a queue at the counter.
The custard tart is the city's small daily pleasure, and Alfama has a corner shop that makes them through the day. Order two at the counter, ask for canela (cinnamon) and stand at the marble ledge by the window. A good one has a shell that shatters, a filling that is still just warm, and a top blistered almost black in patches; the ones that come out pale and smooth have been sitting too long. Take a bica, the short strong coffee, with it. This is a good moment to sit for twenty minutes: the morning has been all uphill and the afternoon starts with a tram ride, so let your feet cool down and watch the square. The shop also sells bottles of water, which you will want for the next stretch.`;

const stop5 = `Stop 5: Time Out Market at Mercado da Ribeira, 10:00 to 24:00
Tram 28: 25 minutes. Walk up to the Miradouro das Portas do Sol stop, board the 28 heading toward Campo de Ourique, ride it down through the Baixa and up to Chiado, get off at Praça Luís de Camões, and walk five minutes down Rua do Alecrim to the market hall by the river.
The old riverside market hall, built in 1892 with an iron roof and a dome over its central aisle, keeps its fruit and vegetable stalls at one end and turned the other half into a food hall in 2014. It is not a mall: one big room, long shared tables, and some thirty counters run by the city's better kitchens serving small plates. Go round the whole hall once before you choose, then eat two or three things from different counters instead of one full meal: a plate of grilled sardines from the counter nearest the river door, a bowl of caldo verde, a glass of vinho verde. It is loud and crowded from one o'clock, so this is a late lunch at half past two, when the tables free up.`;

const stop6 = `Stop 6: Belém Tower, 10:00 to 18:00 (last entry 17:30, closed Mondays)
Walk: 75 minutes. From the market hall cross to the riverside path and simply keep the river on your left the whole way: under the bridge, past the docks at Alcântara, past the Monument to the Discoveries, until the tower appears standing in the water ahead.
This is a long walk but a flat and easy one, on a path made for it, with the water beside you and the red bridge growing overhead. The tower at the end was built in 1515 to guard the harbour mouth and is the most decorated fortress you will ever see: rope carved in stone, watchtowers shaped like pepper pots, a rhinoceros under one corner. Go inside if the queue is short, for the low vaulted rooms and the terrace with the river on three sides; if the queue is long, the outside is the better half anyway. Sit on the wall by the water afterwards and watch the sun go down behind the tower. Tram 15 runs back to the centre from the road behind you when your feet have had enough.`;

// ---- Pack 7: six customer support replies, all promises kept. ----

const SUPPORT_PROMISES = [
  "Every template's message opens with a greeting.",
  "Every template has a 'Next step:' line before its sign-off.",
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

// ---- Pack 8: eight rules for naming things in code. Rule 5 has no labelled bad example. ----

const NAMING_PROMISES = [
  "Every rule gives a labelled bad example and a labelled good example.",
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

// ---- Pack 9: six ten-minute breakfasts, no heat. Recipe 4 uses a pan on the stove. ----

const BREAKFAST_PROMISES = [
  "Every recipe states a total time, and it is 10 minutes or less.",
  "No recipe's steps use a stove, a toaster or any other source of heat.",
  "Every recipe serves one person.",
];

const breakfast1 = `Recipe 1: Yoghurt bowl with berries and toasted seeds
Total time: 5 minutes. Serves 1.

Ingredients: 150 g thick plain yoghurt, a handful of berries (fresh or thawed from frozen), 1 tbsp mixed seeds from a packet, 1 tsp honey, a pinch of ground cinnamon, 4 walnut halves.

1. Spoon the yoghurt into a bowl and smooth the top with the back of the spoon.
2. Scatter the berries over one half and the seeds over the other, so each spoonful can be different.
3. Break the walnuts over the top with your fingers, drizzle the honey in a thin line, and dust with cinnamon.
4. Eat straight away, or press a lid on and take it to work; it holds for three hours in a bag without going soft.

Swap the honey for a spoon of jam stirred through the yoghurt if you like it sweeter, or add a chopped date.`;

const breakfast2 = `Recipe 2: Peanut butter and banana wrap
Total time: 5 minutes. Serves 1.

Ingredients: 1 large soft flour tortilla, 2 tbsp peanut butter, 1 banana, 1 tsp honey, a pinch of flaky salt, a few dark chocolate chips if you want them.

1. Lay the tortilla flat and spread the peanut butter over the whole surface right to the edge; it is the glue that holds the wrap closed.
2. Peel the banana and lay it whole along the middle. If it is a long one, trim the ends so it sits inside the tortilla.
3. Drizzle the honey along the banana, add the salt and the chocolate chips.
4. Fold the two short sides in, then roll from the long side as tightly as you can. Slice in half on an angle.

It is a breakfast you can eat with one hand on the way out of the door, and the salt is what makes it taste like more than a snack.`;

const breakfast3 = `Recipe 3: Avocado and tomato on rye
Total time: 7 minutes. Serves 1.

Ingredients: 2 slices of dark rye bread from the packet, half a ripe avocado, 1 small tomato, half a lime, a few chives or the green part of a spring onion, olive oil, salt, black pepper, chilli flakes.

1. Scoop the avocado into a small bowl and crush it roughly with a fork. Squeeze in the lime, add a pinch of salt and mix; it should still have lumps.
2. Slice the tomato thinly and snip the chives with scissors.
3. Spread the avocado thickly over both slices of rye, lay the tomato on top and season with salt, pepper and a few chilli flakes.
4. Scatter the chives, finish with a thread of olive oil, and eat with a knife and fork or folded in half.

Dense rye is good cold and does not need warming; a softer bread would, so keep to rye or a firm sourdough here.`;

const breakfast4 = `Recipe 4: Warm cinnamon apple oats
Total time: 8 minutes. Serves 1.

Ingredients: 40 g rolled oats, 200 ml milk (any kind), 1 small apple, half tsp ground cinnamon, 1 tsp brown sugar or maple syrup, a pinch of salt, 1 tbsp chopped almonds.

1. Grate the apple on the coarse side of a grater, skin and all, straight into a small saucepan.
2. Add the oats, milk, cinnamon, sugar and salt and stir once.
3. Set the pan over medium heat and cook for 4 to 5 minutes, stirring now and then, until the oats are soft and the milk has thickened to a loose porridge. Add a splash more milk if it catches.
4. Pour into a bowl, scatter the almonds over the top and let it sit for a minute before eating; it is hotter than it looks.

Grating the apple instead of chopping it means it melts into the oats and you get apple in every spoonful.`;

const breakfast5 = `Recipe 5: Mango and lime smoothie
Total time: 5 minutes. Serves 1.

Ingredients: 150 g frozen mango chunks, 1 small ripe banana, 150 ml cold milk or oat drink, 3 tbsp plain yoghurt, juice of half a lime, a thumb-sized piece of fresh ginger (optional), a small handful of ice.

1. Put the mango, the banana broken into pieces, the milk, yoghurt and lime juice into a blender. Grate in the ginger if using.
2. Blend for 30 seconds, stop, push anything stuck on the sides down with a spoon, add the ice and blend for another 30 seconds until completely smooth.
3. Taste. More lime if it is flat, a splash more milk if it is too thick to drink through a straw.
4. Pour into a tall glass and drink it cold; it separates if it stands, so give it a stir if it waits.

Frozen mango is the trick: it gives the smoothie its cold, thick texture without watering it down with extra ice.`;

const breakfast6 = `Recipe 6: Cottage cheese pot with cucumber and everything seasoning
Total time: 6 minutes. Serves 1.

Ingredients: 150 g cottage cheese, a 5 cm piece of cucumber, 4 cherry tomatoes, 1 tbsp everything bagel seasoning (or sesame seeds, dried onion, poppy seeds and salt mixed), a few leaves of dill or parsley, 4 crispbreads, olive oil, black pepper.

1. Dice the cucumber small and halve the tomatoes.
2. Spoon the cottage cheese into a bowl or a lidded pot, then pile the cucumber and tomatoes on top.
3. Sprinkle the seasoning generously over everything, tear over the herbs, and add a little olive oil and pepper.
4. Eat with the crispbreads, scooping the cheese onto them at the table so they stay crisp.

Savoury, salty and filling, and it needs no more skill than opening a tub. Keep the seasoning jar at your desk and this becomes a lunch too.`;

// ---- Pack 10: five freelance proposals. Template 3 has no delivery date line. ----

const PROPOSAL_PROMISES = [
  "Every template names a price.",
  "Every template has a 'Delivery date:' line naming a calendar date.",
  "No template leaves a placeholder like [NAME] unfilled.",
];

const proposal1 = `Template 1: Website redesign for a small studio
Hi Elena,

Thank you for walking me through the site on Tuesday. Here is the proposal in one page.

What I will do: redesign the five pages we discussed (home, work, about, journal, contact), build them on your existing hosting, move the current journal posts across, and hand over a short guide so your team can update text and images without me.

Price: USD 4,800, fixed. Half at the start, half on delivery. Hosting and domain stay in your name and are not part of the price.

Delivery date: the finished site goes live on 14 November 2026, with a review round on 31 October where you see everything and ask for changes.

If you are happy with this, reply "go" and I will send the first invoice and a kickoff time.

Best,
Nadia Ferreira`;

const proposal2 = `Template 2: Logo and brand kit
Hello Marcus,

Here is the proposal for the coffee shop rebrand we talked about.

What you get: three logo directions to choose from, then two rounds of refinement on the one you pick; final files in every format you will need (SVG, PNG, PDF, and a version for embroidery); a colour palette and two typefaces with licences; a six-page brand sheet showing how to use all of it on signage, boxes and the shop window.

Price: USD 2,200, fixed. A third now, a third when you choose a direction, a third at handover.

Delivery date: first directions on 16 October 2026, final files by 30 October 2026.

Anything not on this list, such as menus or packaging, I will quote separately once the brand is settled, so you are not paying for guesses now.

Kind regards,
Nadia Ferreira`;

const proposal3 = `Template 3: Monthly blog writing retainer
Hi Priya,

As promised, here is how the writing retainer would work.

Each month I write four articles of 900 to 1,200 words on the topics we agree at the start of the month, each with a working title, a short summary for social posts and a suggested image brief. You get a draft, one round of edits, and the final copy pasted into your CMS as a draft ready to publish. Two of the four can be interviews with your customers if you introduce me to them.

Price: USD 900 per month, invoiced on the first of the month, no minimum term; either of us can end it with one month's notice.

The retainer starts as soon as you confirm and the first month's topics are agreed, and it rolls month to month from there.

Best,
Nadia Ferreira`;

const proposal4 = `Template 4: Product photography day
Hello Jonas,

Thanks for sending the product list. Here is the proposal for the shoot.

What is included: one full day of studio photography for up to 40 products, two setups (clean white background for the shop pages and a styled lifestyle set for the homepage and social), basic retouching on every selected image, and 120 final images delivered in web and print sizes with a licence for all your own channels.

Price: USD 1,350, fixed, including the studio and props. Extra products on the day are USD 25 each.

Delivery date: the shoot is on 3 November 2026 and the finished, retouched images are delivered by 10 November 2026 through a shared folder.

Reply with a yes and I will book the studio; the date is held for you until Friday.

Best regards,
Nadia Ferreira`;

const proposal5 = `Template 5: Data cleanup script
Hi Sofia,

Here is the proposal for the customer list cleanup we discussed.

What I will build: a script that takes your exported spreadsheet, removes duplicate customers by matching email and phone (with the fuzzy matching we talked about for typos), standardises names and addresses, flags rows that need a human decision instead of guessing, and writes a clean file plus a short report of what changed. You get the script, a readme, and a recorded fifteen-minute walkthrough so your team can run it every quarter.

Price: USD 1,600, fixed. Paid on delivery, once the script has run on your real export and you are satisfied with the result.

Delivery date: 21 October 2026, with a first test run on your data on 17 October so we can adjust the rules before the final version.

Thanks,
Nadia Ferreira`;

// ---- Pack 11: six meeting invitations, all promises kept. ----

const INVITE_PROMISES = [
  "Every invitation states a day, a start time and a length.",
  "Every invitation says what to prepare, or says that nothing needs preparing.",
  "Every invitation is under 200 words.",
];

const invite1 = `Template 1: Project kickoff
Subject: Kickoff for the spring catalogue, Tuesday 10:00

Hi all,

We are starting the spring catalogue project and I would like everyone involved in one room once before the work splits up.

When: Tuesday 6 October, 10:00 to 11:00 (one hour), room 3B and the usual video link.

We will cover what we are making, who owns which part, the dates that cannot move, and how we will keep each other posted.

To prepare: read the two-page brief attached and note any questions or anything you think is missing from it. Ten minutes is enough.

If you cannot make it, tell me by Monday and I will send the notes.

Thanks,
Rosa`;

const invite2 = `Template 2: Weekly one-to-one
Subject: Our weekly one-to-one, Thursdays 14:00

Hi Amir,

I would like to set a regular time for the two of us, so you never have to ask for one.

When: every Thursday from 14:00 to 14:30 (thirty minutes), starting 8 October, in my office or on a call if either of us is remote that day.

It is your time first: what is going well, what is stuck, what you need from me. I will keep my own items to the last ten minutes.

To prepare: nothing formal. If something is on your mind, jot it down so we do not forget it; if not, come as you are.

If Thursday afternoons do not suit, say so and we will move it.

Rosa`;

const invite3 = `Template 3: Sprint retrospective
Subject: Retrospective for sprint 14, Friday 15:00

Hello team,

Sprint 14 closes on Friday, so let us look back at it together before the next one starts.

When: Friday 16 October, 15:00 to 16:00 (one hour), on the team video link.

Format as usual: what went well, what did not, what we will change, and one action per person we can check on next time.

To prepare: add your notes to the shared board under the three headings before Friday morning. Two or three honest lines each is better than a list of ten.

Camera on if you can; it helps the quiet parts.

Thanks,
Rosa`;

const invite4 = `Template 4: Client review
Subject: Review of the first designs, Wednesday 11:00

Dear Ms Okoro,

The first designs for the packaging are ready, and I would like to walk you through them rather than send a file cold.

When: Wednesday 21 October, 11:00 to 12:00 (one hour), at your office, or on video if that is easier for your team.

I will show three directions, explain the thinking behind each, and then listen. We do not need a decision on the day.

To prepare: nothing is needed from your side. If your colleagues from sales would like to join, they are welcome; the more eyes at this stage the fewer surprises later.

Please confirm the time, and I will send a calendar invitation.

Kind regards,
Rosa Lindgren`;

const invite5 = `Template 5: Decision meeting
Subject: Decision on the vendor, Monday 9:30, 45 minutes

Hi all,

We have had the three vendor proposals for two weeks, and we need to choose one before the contract window closes.

When: Monday 26 October, 9:30 to 10:15 (forty-five minutes), room 1A.

This meeting is for deciding, not for reviewing. We will confirm the criteria, score each vendor on them together, and leave with a choice and a named person to send the reply.

To prepare: read the one-page comparison attached and come with your score for each vendor on the five criteria. Please do this before the meeting, not during it, so we finish in the time.

If you cannot attend, send me your scores by Friday and they will count.

Rosa`;

const invite6 = `Template 6: Rescheduling a meeting
Subject: Moving Thursday's planning session to Friday

Hi everyone,

Two of the people we need cannot make Thursday, so I am moving the planning session rather than run it half empty.

New time: Friday 30 October, 10:00 to 11:30 (ninety minutes), same room, same video link. The Thursday invitation has been removed from your calendars.

The agenda does not change: the roadmap for the next quarter and who is on what.

To prepare: the same as before. Look over the draft roadmap and note anything you would add, remove or move. If you already did this for Thursday, you are done.

Sorry for the shuffle, and thank you for the flexibility.

Rosa`;

// ---- Pack 12: six physics cards. Card 5 has no worked example. ----

const PHYSICS_PROMISES = [
  "Every card ends with one worked example, labelled 'Worked example'.",
  "Every card states at least one formula.",
  "Every card is under 250 words.",
];

const physics1 = `Card 1: Newton's first law, inertia
A body keeps its velocity, in both size and direction, unless a net force acts on it. At rest it stays at rest; moving, it keeps moving in a straight line at the same speed. The law is really a definition of what a force is: the thing that changes velocity. Formula: if the net force F = 0, then the acceleration a = 0 and velocity v is constant.

The common mistake is to think a moving object needs a force to keep it moving. It does not; it needs a force to stop it, and on Earth that force is usually friction or air resistance, which is why things seem to slow down on their own.

Worked example: a hockey puck slides across smooth ice at 4 m/s. Ignoring friction, what is its speed after 10 seconds? No net force acts along the ice, so the acceleration is zero and the speed is still 4 m/s.`;

const physics2 = `Card 2: Newton's second law, F = ma
The net force on a body equals its mass times its acceleration: F = ma, with F in newtons (N), m in kilograms and a in metres per second squared. The acceleration points the same way as the net force. Double the force and the acceleration doubles; double the mass and it halves.

Two things to remember. First, it is the net force: add up every force as a vector before dividing by the mass. Second, the law says nothing about velocity, only about how velocity changes, so a body can have a large velocity and zero acceleration, or zero velocity and a large acceleration (a ball at the top of its throw).

Worked example: a 1,200 kg car accelerates from rest to 20 m/s in 8 seconds. Acceleration a = 20 / 8 = 2.5 m/s². Net force F = 1,200 × 2.5 = 3,000 N.`;

const physics3 = `Card 3: Newton's third law, action and reaction
When body A pushes on body B, body B pushes back on body A with a force of the same size in the opposite direction. Formula: F(A on B) = −F(B on A). The two forces are always on different bodies, which is why they never cancel: cancelling only happens between forces on the same body.

This is the law students misuse most. If the forces are equal and opposite, why does anything move? Because to find whether A moves you add up the forces on A alone; the force A exerts on B is not one of them.

Worked example: a rower pushes backward on the water with an oar with a force of 150 N. What force does the water exert on the oar, and which way? 150 N, forward; that is the force that moves the boat.`;

const physics4 = `Card 4: Weight and mass
Mass is the amount of matter in a body, measured in kilograms, and it is the same everywhere. Weight is the force of gravity on that mass, measured in newtons, and it depends on where you are. Formula: W = mg, where g is the gravitational field strength, about 9.8 N/kg on the surface of the Earth and about 1.6 N/kg on the Moon.

In everyday speech people say "weighs 70 kg", but in physics that is a mass; the weight of that person is about 690 N on Earth. When a question gives you a mass and asks about a force, weight is usually the first force to write down.

Worked example: a 12 kg suitcase. Weight on Earth: W = 12 × 9.8 = 117.6 N, or about 118 N. Weight on the Moon: W = 12 × 1.6 = 19.2 N. Its mass on the Moon is still 12 kg.`;

const physics5 = `Card 5: Friction
Friction is the force between two surfaces in contact that resists their sliding across each other. It acts parallel to the surfaces and against the direction of motion, or against the direction the body would move if there were no friction. There are two kinds: static friction, which stops a body from starting to slide, and kinetic friction, which acts once it is already sliding. Static friction is usually the larger of the two, which is why it is harder to start pushing a heavy box than to keep it moving.

Formula: the maximum friction force is F = μN, where N is the normal force pressing the surfaces together and μ (mu) is the coefficient of friction, a number with no units that depends on the two materials. Rubber on dry road is about 0.7; steel on ice is about 0.03. Notice the formula has no area in it: a wide tyre does not grip better because of its width alone.

Static friction is not always at its maximum. It takes whatever value is needed to stop the slide, up to μN; only when the push exceeds that does the body move.`;

const physics6 = `Card 6: Momentum and impulse
Momentum is mass times velocity: p = mv, measured in kg·m/s, and it is a vector, so direction matters. Newton's second law in its original form says that the net force equals the rate of change of momentum, F = Δp / Δt. Rearranged, FΔt = Δp: the product of force and the time it acts, called the impulse, equals the change in momentum.

This is why airbags and crumple zones work. The change in momentum in a crash is fixed by how fast you were going; the impulse is fixed too. Spread it over a longer time and the force goes down in proportion.

Worked example: a 0.16 kg cricket ball arrives at 30 m/s and is caught, coming to rest in 0.05 s. Change in momentum Δp = 0.16 × 30 = 4.8 kg·m/s. Average force on the hands F = 4.8 / 0.05 = 96 N. Let the hands give way over 0.2 s and the force falls to 24 N.`;

// ---- Pack 13: eight Spanish irregular verb cards, all promises kept. ----

const SPANISH_PROMISES = [
  "Every card conjugates the present tense for all six persons: yo, tú, él/ella, nosotros, vosotros, ellos.",
  "Every card ends with an example sentence and its English translation.",
  "Every card is under 200 words.",
];

const spanish1 = `Card 1: ser (to be, for what something is)
Present tense:
yo soy
tú eres
él / ella / usted es
nosotros somos
vosotros sois
ellos / ellas / ustedes son

Use ser for identity, origin, profession, time and the qualities that define something: what a thing is, rather than how it happens to be right now. It is the most irregular verb in the language and shares no stem with its infinitive, so learn the six forms as a chant: soy, eres, es, somos, sois, son.

Example: Mi hermana es médica y nosotros somos de Valencia. My sister is a doctor and we are from Valencia.`;

const spanish2 = `Card 2: estar (to be, for states and places)
Present tense:
yo estoy
tú estás
él / ella / usted está
nosotros estamos
vosotros estáis
ellos / ellas / ustedes están

Use estar for where something is and for temporary states: moods, health, weather that is happening, and the results of a change. The first person and the accents are the irregular parts; the rest follows the regular -ar pattern once you know where the stress falls. The same adjective can change meaning: es aburrido, he is boring; está aburrido, he is bored.

Example: Estoy cansada porque los niños están enfermos. I am tired because the children are ill.`;

const spanish3 = `Card 3: ir (to go)
Present tense:
yo voy
tú vas
él / ella / usted va
nosotros vamos
vosotros vais
ellos / ellas / ustedes van

Ir looks nothing like its infinitive in the present: all six forms begin with v. It is always followed by a when it means going somewhere (voy a casa) and ir a plus an infinitive is the everyday future: voy a comer, I am going to eat. Vamos on its own means "let's go" or "come on".

Example: Los sábados vamos al mercado y después vais vosotros al cine. On Saturdays we go to the market and afterwards you lot go to the cinema.`;

const spanish4 = `Card 4: tener (to have)
Present tense:
yo tengo
tú tienes
él / ella / usted tiene
nosotros tenemos
vosotros tenéis
ellos / ellas / ustedes tienen

Two irregularities in one verb: the yo form takes a g (tengo), and the e in the stem becomes ie in every form except nosotros and vosotros, which keep the plain stem. Tener carries a lot of phrases where English uses "to be": tener hambre, to be hungry; tener frío, to be cold; tener veinte años, to be twenty. Tener que plus infinitive means "to have to".

Example: Tengo que salir pronto porque mis padres tienen visita esta noche. I have to leave soon because my parents have visitors tonight.`;

const spanish5 = `Card 5: hacer (to do, to make)
Present tense:
yo hago
tú haces
él / ella / usted hace
nosotros hacemos
vosotros hacéis
ellos / ellas / ustedes hacen

Only the yo form is irregular in the present: hago. Everything else is a regular -er verb. Hacer covers both "do" and "make", and it appears in weather (hace frío, hace sol, it is cold, it is sunny) and in time expressions: hace dos años, two years ago. ¿Qué haces? is the everyday "what are you doing?" or "what do you do?".

Example: Hago la cena mientras tú haces los deberes, y hace mucho calor en la cocina. I make dinner while you do your homework, and it is very hot in the kitchen.`;

const spanish6 = `Card 6: poder (to be able to, can)
Present tense:
yo puedo
tú puedes
él / ella / usted puede
nosotros podemos
vosotros podéis
ellos / ellas / ustedes pueden

A stem-changing verb: o becomes ue in every form except nosotros and vosotros. Picture the pattern as a boot drawn around the four changed forms on the left and bottom right. Poder is followed straight by an infinitive with no preposition: puedo nadar, I can swim. ¿Puedes ayudarme? is the polite everyday "can you help me?". No puedo más means "I can't take any more".

Example: No podemos venir el lunes, pero puedes llamarnos el martes. We cannot come on Monday, but you can call us on Tuesday.`;

const spanish7 = `Card 7: querer (to want, to love)
Present tense:
yo quiero
tú quieres
él / ella / usted quiere
nosotros queremos
vosotros queréis
ellos / ellas / ustedes quieren

Another boot verb: e becomes ie except in nosotros and vosotros. Querer means "to want" with a thing or an infinitive (quiero un café, quiero dormir) and "to love" with a person: te quiero is the everyday "I love you", softer than te amo. Quisiera, from the past subjunctive, is the polite "I would like" in shops and restaurants.

Example: Quieren ir a la playa, pero yo quiero quedarme en casa. They want to go to the beach, but I want to stay at home.`;

const spanish8 = `Card 8: decir (to say, to tell)
Present tense:
yo digo
tú dices
él / ella / usted dice
nosotros decimos
vosotros decís
ellos / ellas / ustedes dicen

Decir combines two irregularities: the yo form takes a g (digo) and the e in the stem becomes i in the boot forms; nosotros and vosotros keep the plain stem, and note that vosotros is decís with a single accented i. It is followed by que when reporting speech: dice que viene, she says she is coming. ¿Cómo se dice ... en español? is the question every learner needs.

Example: Siempre dices que vienes y luego dicen tus amigos que no te han visto. You always say you are coming and then your friends say they have not seen you.`;

// ---- Pack 14: eight journal prompts for a hard week. Prompt 5 is an instruction, not a question. ----

const JOURNAL_PROMISES = [
  "Every prompt asks at least one question and ends with a question mark.",
  "Below its title line, every prompt is a single paragraph.",
  "No prompt is longer than 150 words.",
];

const journal1 = `Prompt 1: The smallest good thing
When you look back over the last seven days, what is the smallest thing that went right, so small you almost did not count it: a cup of coffee that was exactly hot enough, a message answered, a bus that came on time? Where were you when it happened, and what did your body do in that moment, the shoulders, the breath, the jaw? If you had to keep one of those small moments in your pocket for the rest of the week, which would you choose, and why that one and not the others?`;

const journal2 = `Prompt 2: What you are carrying
If everything you are worried about right now were an object you had to carry in your two hands, what would be in the left hand and what in the right, and which of the two is heavier? Which of those things did you pick up yourself, and which was handed to you by someone else without asking? Is there one you could set down on the table for the length of this page, just to see what your hands feel like empty, and what would happen if you did not pick it back up?`;

const journal3 = `Prompt 3: The sentence you keep saying
What is the sentence you have said to yourself most often this week, the one that runs under everything, and would you say it out loud to a friend who was going through the same week? If that friend said it about themselves, what would you want to answer, and could you write that answer down here in your own words, addressed to yourself? What changes in the sentence if you add the word "today" to the end of it?`;

const journal4 = `Prompt 4: Who noticed
Who noticed something about you this week, even a small thing: that you were quiet, that you looked tired, that you did a good job of something you thought nobody saw? What did they say or do, and what did you do with it, brush it off, argue with it, keep it? If nobody noticed, who would you have wanted to, and is there a way to tell that person one true sentence about this week before it is over?`;

const journal5 = `Prompt 5: Three lines for tomorrow
Write three lines for tomorrow, and make them the smallest lines you can. Write one thing you will do before noon that takes less than ten minutes. Write one person you will send a single message to, and put their name down now so it is decided. Write one thing you will not do tomorrow, one job you are giving yourself permission to leave until the week is kinder. Then close the book and do not read the three lines again until the morning.`;

const journal6 = `Prompt 6: The version of you that got through
Think of another hard week you have had, one that ended, because it did end; what did the version of you in that week know how to do that got you through it, and what did you do the day after it was over? Is any of that available to you now, even a smaller version of it? If that earlier you could see you this week, what is the one thing they would be least surprised by, and the one thing they would be proudest of?`;

const journal7 = `Prompt 7: What would be enough
If the rest of this week could not be good, only survivable, what would "survivable" actually look like on Friday evening: where would you be, what would be done and what left undone, and who would be with you? Which of those things are already true or nearly true? What is the one thing on the list that is really in your hands, and what would it take to do just that one and let the rest of the week be whatever it is going to be?`;

const journal8 = `Prompt 8: Next week's first hour
When you wake up on the first morning of next week, what is the very first hour going to be, minute by minute, if you decide it now instead of letting it decide you: what do you drink, what do you look at, what do you not look at? Is there one thing from this week you want to leave outside that first hour altogether? Who do you want to be for those sixty minutes, and does that person need anything from you tonight to make the hour possible?`;

// ---- Pack 15: seven interview prompts for hiring a designer, all promises kept. ----

const INTERVIEW_PROMISES = [
  "Every question is open-ended: it cannot be answered with a yes or a no.",
  "Every prompt says what a strong answer includes.",
  "No prompt is longer than 200 words.",
];

const interview1 = `Prompt 1: The project that changed your mind
Question: Tell me about a project where you started with one design direction and ended up shipping something quite different. What changed, and how did you find out you were wrong?

A strong answer includes: a specific project, not a general habit; the evidence that changed their mind (a test, a conversation, a metric, a constraint they had missed); how far into the work the change came and what it cost; and what they now do earlier to catch the same thing sooner. Watch for candidates who describe the change as entirely somebody else's fault, or who cannot name a single project where they were wrong.`;

const interview2 = `Prompt 2: Working with an engineer who says no
Question: Describe a time an engineer told you a design could not be built, or not in the time available. How did the conversation go, and what shipped in the end?

A strong answer includes: curiosity about the technical reason rather than a fight over the mockup; a design that was adjusted with the engineer rather than handed back; a sense of what was essential in the design and what was decoration; and a real outcome. The best candidates can explain the technical constraint in their own words, which shows they listened. Be wary of stories where the designer simply escalated to a manager and won.`;

const interview3 = `Prompt 3: Explaining a decision to someone who disagrees
Question: Walk me through a design decision that a stakeholder disagreed with. How did you explain your reasoning, and how did it end?

A strong answer includes: the actual decision and the actual objection, in plain terms; the reasoning offered, which should point to users, data or a stated goal rather than to taste; a willingness to be persuaded if the objection was good; and a clear ending, whether the design held, changed, or was tested to settle it. Candidates who describe every disagreement ending in their favour are either lucky or editing the story; ask for one that went the other way.`;

const interview4 = `Prompt 4: Designing without research
Question: Tell me about a time you had to design something with almost no user research available. What did you do to reduce the risk, and what would you have done with one more week?

A strong answer includes: honest acknowledgement of the gap rather than pretending intuition was enough; cheap substitutes they reached for (support tickets, analytics, five quick conversations, a competitor's public patterns, an assumptions list); how they built the design so it could be corrected after launch; and a concrete answer to the one-more-week question that names a method and who they would have talked to. The weak answer is "I just used best practices".`;

const interview5 = `Prompt 5: Feedback you found hard to hear
Question: What is a piece of critique on your work that was hard to hear but turned out to be right? What did you do with it?

A strong answer includes: a real example with enough detail to be believable, a description of the first reaction that is honest about being defensive, and a specific change to the work or to how they work since. Listen for whether they can separate the sting from the substance. Candidates who cannot think of any critique that was right, or who only offer examples where the critic was mistaken, will be hard to give feedback to on the job.`;

const interview6 = `Prompt 6: The state of our product
Question: You have had a look at our product before today. Walk me through three things you would want to understand better before proposing any change, and one thing you would be tempted to change on day one.

A strong answer includes: evidence they actually looked, with details from real screens; questions about users, goals or constraints rather than only visual notes; a day-one change that is small, defensible and explained in terms of a user, not taste; and some humility about proposing changes from the outside. Bold opinions are fine; bold opinions with no curiosity are the warning sign.`;

const interview7 = `Prompt 7: How you want to work here
Question: Describe the working week in which you do your best work: how you split time between making, talking and reviewing, how much direction you want, and what a manager can do that helps most and hurts most.

A strong answer includes: a concrete picture rather than "I am flexible"; awareness of their own needs for focus time and feedback; an honest account of what has hurt them before (micromanagement, silence, moving targets) without bitterness; and questions back about how the team actually works. This is as much a question for you as for them; if their best week cannot exist here, better to find out now.`;

// ---- Pack 16: six houseplants. Plant 4 has no Water line. ----

const PLANT_PROMISES = [
  "Every plant has a 'Water:' line saying how often to water it.",
  "Every plant states the light it needs.",
  "Every plant names at least one sign that it is getting too much water.",
];

const plant1 = `Plant 1: Pothos (Epipremnum aureum)
The plant to start with. It trails, it climbs, it grows in almost any room, and it forgives most mistakes.

Light: bright, indirect light is best; it tolerates a dim corner but the leaves lose their gold marbling and turn plain green. Keep it out of hot direct sun, which scorches the leaves.

Water: once every 7 to 10 days in the growing season, letting the top few centimetres of soil dry out between waterings; every two weeks in winter. It would rather be a little dry than a little wet.

Too much water: the leaves turn yellow from the base of the plant upward and feel soft, and the stems near the soil go dark and mushy. If that happens, let it dry out fully and cut away anything black.

Feeding: a half-strength liquid feed once a month from spring to early autumn. Trim the vines back whenever they get leggy; the cuttings root in a glass of water in two weeks.`;

const plant2 = `Plant 2: Snake plant (Dracaena trifasciata)
Stiff upright leaves like green swords, banded in grey with yellow edges. It is close to indestructible and grows slowly, so buy it the size you want it.

Light: anything from a bright window to a shady hallway. More light means faster growth and stronger colour; low light means it simply sits still, which is fine.

Water: once every 3 to 4 weeks, and only when the soil is fully dry all the way down the pot; in winter once every 6 weeks is plenty. This is the plant people kill with kindness.

Too much water: the leaves go soft and wrinkled at the base and fold over, and the base of the plant turns brown and smells sour. Rot moves fast in a snake plant, so if a leaf feels soft, unpot it and check the roots.

Feeding: barely needed; a weak feed twice a summer. Use a free-draining, gritty mix and a pot with a hole; a heavy pot helps, as tall plants tip.`;

const plant3 = `Plant 3: Monstera (Monstera deliciosa)
The big split-leaf plant. New leaves unfurl whole and develop their holes as the plant matures; a young one with no splits is not unhealthy, just young.

Light: bright, indirect light, close to a window but not in the sun's direct path for more than an hour or two. In poor light the leaves stay small and never split.

Water: once a week in spring and summer, when the top third of the soil has dried; every 10 to 14 days in winter. It likes a good soak and then to be left alone.

Too much water: leaves develop yellow patches and brown, wet-looking spots, often with a yellow ring, and the soil stays dark and smells musty days after watering.

Feeding: a balanced liquid feed every two weeks in the growing season. Give it a moss pole or a stake early; the aerial roots will grip it and the plant grows upward instead of sprawling across the floor. Wipe the big leaves now and then so they can breathe.`;

const plant4 = `Plant 4: Peace lily (Spathiphyllum)
Glossy dark leaves and white flowers that stand up on their own stems like flags. It is one of the few flowering plants that does well indoors in ordinary rooms.

Light: medium to low indirect light. It is one of the best plants for a room with a north-facing window or a spot a few metres from any window. Direct sun scorches the leaves and fades the flowers; if the leaves go pale and streaky, move it further from the glass.

Too much water: the leaf tips and edges turn brown and crisp while the stems at the base go limp and dark, and the flowers brown early. A peace lily that is drooping in soaked soil is rotting, not thirsty; let it dry out and check for mushy roots.

Feeding: a half-strength liquid feed every six weeks from spring to autumn; overfeeding causes brown tips too. It flowers best when slightly pot-bound, so do not rush to repot. Keep it away from cold draughts, and wipe the leaves with a damp cloth every few weeks; they collect dust fast.`;

const plant5 = `Plant 5: Spider plant (Chlorophytum comosum)
Arching striped leaves and, in a happy plant, long stems carrying baby plants that dangle over the edge of the pot. Cheerful and easy, and good in a hanging basket.

Light: bright, indirect light. It manages in less, but it will not produce babies without a good amount of light. Direct afternoon sun bleaches the stripes.

Water: once a week, when the top of the soil has dried out; every 10 days in winter. It stores water in its thick roots and so copes with the odd missed week.

Too much water: the leaves turn yellow from the centre of the plant outward, feel limp rather than crisp, and the centre of the plant goes brown and soft. Brown tips on otherwise healthy leaves are usually a different problem: fluoride in tap water, cured by using rainwater or filtered water.

Feeding: a weak feed every two weeks in spring and summer. Snip off the babies once they have a few roots of their own and pot them up; they make the easiest gifts.`;

const plant6 = `Plant 6: ZZ plant (Zamioculcas zamiifolia)
Glossy, almost plastic-looking leaflets on thick arching stems that grow from fat tubers under the soil. It grows slowly and asks for almost nothing.

Light: low to bright indirect light; it is one of the very few plants that stays healthy in an office lit only by ceiling lights. Keep it out of direct sun, which yellows the leaves.

Water: once every 2 to 3 weeks in summer, once a month in winter, and only when the soil is dry right through. The tubers hold water for weeks at a time; when unsure, wait.

Too much water: the stems go yellow and then soft at the base, leaflets drop while still green, and the tubers turn brown and mushy when you unpot it. Overwatering is nearly the only way to lose this plant.

Feeding: a half-strength feed two or three times over the summer. Repot only every two or three years; the tubers can push a plastic pot out of shape when they are ready. The sap can irritate skin, so wash your hands after handling broken stems.`;

// ---- Pack 17: a weekend in Kyoto, six stops, all promises kept. ----

const KYOTO_PROMISES = [
  "Every stop gives its opening hours, as clock times or as open 24 hours.",
  "Every stop after the first says how to get there from the previous one and how long it takes.",
  "No stop is a shopping mall.",
];

const kyoto1 = `Stop 1: Fushimi Inari Taisha, open 24 hours (the shrine grounds)
Start here, early, on Saturday. The shrine is famous for the thousands of vermilion torii gates that form tunnels up the wooded hillside behind the main buildings, and the only way to see them without a crowd in every photograph is to arrive by seven in the morning. The main shrine sits at the foot of the hill; walk through it, past the fox statues with keys and scrolls in their mouths, and start up the path. The full loop to the summit and back takes about two hours and is a proper climb, but the character of the place changes after the first twenty minutes, when most visitors turn back: the gates thin out, the forest closes in, and small shrines with stone foxes appear at every bend. Turn back at the Yotsutsuji crossing, halfway up, if you want the view of the city without the whole loop. The shrine grounds never close and there is no ticket.`;

const kyoto2 = `Stop 2: Kiyomizu-dera, 6:00 to 18:00 (later during the seasonal night openings)
Train: 15 minutes. From Inari station take the JR Nara line two stops to Kyoto, change to the Keihan line at Tofukuji or take bus 206 from Kyoto station to Gojo-zaka, then walk 10 minutes up the hill.
The temple stands on a wooden stage built out over the hillside on tall pillars without a single nail, and the view from the stage over the maples to the city is the picture every guide uses. Go through the main hall, then follow the path down to the Otowa waterfall, where three streams pour into a stone basin and visitors drink from long-handled cups; each stream is said to grant a different wish, and drinking from all three is considered greedy. The lanes below the temple, Sannenzaka and Ninenzaka, are the preserved old streets of stepped stone and wooden shopfronts, and the walk down through them to Gion is the pleasant way to leave.`;

const kyoto3 = `Stop 3: Nishiki Market, 10:00 to 18:00 (most stalls; a few open earlier)
Walk: 30 minutes. From the bottom of Ninenzaka head west along Shijo-dori, cross the river at the Shijo bridge and continue past the covered Teramachi arcade; the market is the narrow covered street one block north, running parallel to Shijo.
Five blocks long and barely wider than a corridor, the market has fed the city's kitchens for four hundred years. Some hundred and thirty stalls sell pickles, dried seaweed, tofu, knives, tea, sweets and skewers of things you have not seen before, and most will hand you a taste. It is a market, not a mall: single family stalls, no chains, no roof beyond the coloured glass canopy. Come hungry and graze: a skewer of grilled octopus with a quail egg in its head, a cup of soy milk doughnuts, a slice of tamagoyaki. Eat at the stall where you bought it, as walking while eating is frowned on here. The stalls close early, so make this the late morning of Saturday, not the afternoon.`;

const kyoto4 = `Stop 4: Arashiyama bamboo grove and Tenryu-ji, grove open 24 hours, temple 8:30 to 17:00
Train: 25 minutes. From the market walk 5 minutes to Karasuma station and take the Hankyu line to Katsura, change for Arashiyama; or take the JR Sagano line from Kyoto station to Saga-Arashiyama, 15 minutes, and walk 10 minutes.
Start Sunday here, again early. The bamboo path is a few hundred metres of towering green stems that close over the path and creak in the wind; by ten it is a slow queue of people, at eight it is close to silent. Walk it, then enter Tenryu-ji from the north gate at the grove's end. The temple garden, laid out in the fourteenth century around a pond with the hills as its backdrop, is one of the oldest in the country and the reason the temple matters more than its buildings. Sit on the veranda of the main hall and look at it for ten minutes. Leave through the main gate onto the street of shops and cross the Togetsukyo bridge for the view back to the hills.`;

const kyoto5 = `Stop 5: Kinkaku-ji, the Golden Pavilion, 9:00 to 17:00
Bus: 35 minutes. From Arashiyama take the Randen tram to Kitano-Hakubaicho, 20 minutes, then bus 204 or 205 north for 10 minutes to the Kinkakuji-michi stop, and walk 5 minutes.
The pavilion is exactly what the postcards show: a three-storey building, its upper two floors covered in gold leaf, standing at the edge of a pond that reflects it. The present building is a 1955 reconstruction after a fire, and it does not pretend otherwise. The route through the grounds is a single path: it brings you to the classic view across the pond first, then around behind the pavilion, past the smaller garden features and a tea house, to the exit. It takes about forty minutes and there is no going back against the flow, so take the photograph when you are at the pond. Arrive at opening or after three in the afternoon to avoid the tour buses. The tea house near the exit serves matcha and a sweet for a small fee, and it is worth the ten minutes.`;

const kyoto6 = `Stop 6: Gion and Yasaka Shrine, shrine grounds open 24 hours
Bus: 40 minutes. From the Kinkakuji-michi stop take bus 12 or 59 south and east to Gion; it stops on Shijo-dori right in front of the shrine's orange gate.
End the weekend where the city's evening begins. Yasaka Shrine sits at the eastern end of Shijo-dori, with a dance stage hung with hundreds of paper lanterns that are lit at dusk, and it is open all night. Walk through its grounds into Maruyama Park behind it, then come back out and turn into Hanami-koji, the street of wooden teahouses that is the heart of Gion. Around six the lanterns come on outside the teahouses and, if you are lucky and discreet, a geiko or maiko will pass on her way to an engagement; do not block the street or follow her. Finish with a walk along Shirakawa, the small canal a few streets north, where willows hang over the water and the restaurants have their lights on. Dinner at one of them is the right last thing to do.`;

// ---- Pack 18: rules for a two-player card game, all promises kept. ----

const GAME_PROMISES = [
  "Every rule is under 150 words.",
  "No rule needs anything beyond one standard 52-card deck and two players.",
  "No rule mentions money or betting.",
];

const game1 = `Rule 1: The aim and what you need
Bridgeway is a game for two players with one standard 52-card deck, jokers removed. The players build a single row of cards, the bridge, one card at a time, and the aim in each round is to be the first to play every card from your hand onto it. A game is three rounds. The cards you are left holding when a round ends count against you, and the player with the lower total after three rounds wins. Nothing else is needed: no board, no counters, no pen, though you may keep score on paper if you prefer not to remember it.`;

const game2 = `Rule 2: Setting up a round
Shuffle the whole deck and deal seven cards to each player, one at a time, face down. Place the rest of the deck face down between the players as the draw pile. Turn the top card of the draw pile face up and lay it in the middle of the table: it is the first card of the bridge. If that first card is an ace, put it back in the middle of the draw pile and turn the next card instead. The player who did not deal takes the first turn. In the second and third rounds, the deal passes to the other player.`;

const game3 = `Rule 3: Your turn
On your turn you must do one of two things. Either play one card from your hand onto either end of the bridge, or draw one card from the draw pile into your hand. A card may be played only if its rank is exactly one higher or one lower than the card at the end you are adding it to. Suits do not matter. So a 7 may go next to a 6 or an 8, at either end. After playing a card or drawing one, your turn is over and your opponent takes theirs. You may not play more than one card in a turn.`;

const game4 = `Rule 4: Aces and the ends of the ranks
Ranks run from 2 up to king, and the ace joins the two ends together. An ace may be played next to a king or next to a 2, and either a king or a 2 may be played next to an ace. So a bridge can read queen, king, ace, 2, 3, or the other way round. An ace may not be played next to any other rank. This is the only special card in the game. All other cards, including picture cards, follow the plain rule of one rank up or one rank down.`;

const game5 = `Rule 5: When the draw pile runs out
If the draw pile is empty when you would otherwise draw, you may instead pass without playing. If both players pass one after the other, the bridge is stuck: pick up all of it except the two end cards, shuffle those picked-up cards, and place them face down as a new draw pile. The two end cards stay on the table and become the whole bridge. Play continues with the player who passed second. If the draw pile runs out again and both players pass again, the round ends at once and both hands are scored.`;

const game6 = `Rule 6: Ending a round and scoring
A round ends the moment one player plays the last card from their hand, or when the round is ended under rule 5. Each player then counts the cards still in their hand: number cards count their face value, jack, queen and king count 10 each, and an ace counts 15. The player who emptied their hand scores 0 for the round. Write down or remember each player's total. Then gather every card, shuffle, and deal the next round. Scores carry over from round to round; nothing is reset until the game is over.`;

const game7 = `Rule 7: Winning the game
After three rounds, add up each player's three round totals. The player with the lower total wins the game. If the totals are equal, play one more round as a decider, and the player with the lower score in that round alone wins. Agreed variations for a longer evening: play five rounds instead of three, or deal nine cards each instead of seven. Whatever you agree, agree it before the first round is dealt, and keep it for the whole game. Shake hands afterwards; it is a small game, and it should end well.`;

// ---- Pack 19: eight rules for commit messages. Rule 6 has no example. ----

const COMMIT_PROMISES = [
  "Every rule has an example, on a line that starts with 'Example:'.",
  "Every rule is under 200 words.",
];

const commit1 = `Rule 1: Say what changed, in the imperative
The subject line should complete the sentence "if applied, this commit will ...". Use the imperative: add, fix, remove, rename. Not "added", not "adding", not "fixes". The habit matches the messages the tools themselves write (merge branch, revert commit) and it reads as an instruction, which is what a commit is: a change you are asking the codebase to accept.

Example:
  Add retry to the upload client
  Remove the unused legacy parser
  Rename Customer.mail to Customer.email

Compare "Fixed some stuff in uploads", which tells the reader nothing about what changed, only that the author was there.`;

const commit2 = `Rule 2: Keep the subject line to 50 characters
Fifty characters is what fits in a log view, a pull request list and a blame column without being cut off. It also forces you to say the one thing this commit does; if you cannot fit it, the commit is probably doing two things. Capitalise the first word and do not end with a full stop; it is a title, not a sentence.

Example:
  Cache the price feed for thirty seconds

Too long:
  Cache the price feed for thirty seconds so that the dashboard stops hammering the oracle during peak hours

The second version is right, but it belongs in the body, not the subject.`;

const commit3 = `Rule 3: Separate the subject from the body with a blank line
Tools treat the first line as the subject and everything after the first blank line as the body. Without the blank line, the whole message becomes one long subject, and every log view shows the first eighty characters of a paragraph. The body is optional; the blank line, when there is a body, is not.

Example:
  Fix the timezone bug in the invoice date

  Invoices created after 22:00 local time were dated the next day
  because the server stored the date in UTC and the template
  formatted it without converting back.

The subject is what most readers see; the body is for the one reader who needs to know more.`;

const commit4 = `Rule 4: Explain why, not how
The diff already shows how the code changed. What the diff cannot show is why: the bug report, the constraint, the alternative you rejected, the thing that was tried first and failed. That is what the body is for. A reader six months from now, wondering whether a strange line is safe to remove, is looking for exactly this and nowhere else.

Example:
  Retry the upload three times before failing

  The storage provider drops roughly one request in two hundred
  with a 503 that succeeds on the next attempt. Three retries with
  a short backoff removes the failures we saw in the last week
  without hiding a real outage, which shows up as three failures.`;

const commit5 = `Rule 5: One change per commit
A commit that fixes a bug, reformats a file and renames a variable is three commits pretending to be one. It cannot be reviewed cleanly, it cannot be reverted without losing the parts you wanted to keep, and its message has to lie by omission. Split it. Formatting goes in its own commit, with a message that says so, so the reader can skip it.

Example:
  Reformat payments.py with the project formatter

  No behaviour change; the next commit fixes the rounding bug and
  is easier to read against a clean file.

Then the real fix follows, and its diff is only the fix.`;

const commit6 = `Rule 6: Reference the issue, but do not rely on it
Put the ticket or issue number in the body, on its own line at the end, so the tracker can link the two and the reader can find the discussion. But write the message as if the tracker might disappear, because trackers do: projects move systems, tickets get archived, links rot. A message that says only "Fixes #4521" is a promise that the reader can look it up, and one day they will not be able to. Say what the problem was in the message itself, then add the reference underneath. The number is a pointer; the message is the record.`;

const commit7 = `Rule 7: Wrap the body at 72 characters
Terminal log viewers indent the body by four spaces and do not wrap it, so lines longer than about 76 characters run off the edge or wrap mid-word. Wrapping at 72 keeps the message readable everywhere it will be shown, including in email, which is where the convention comes from. Most editors do this for you when told the file is a commit message.

Example:
  Drop the nightly rebuild of the search index

  The index is now updated on every write, so the rebuild has been
  doing nothing but load the database for an hour each night since
  the change in March. Removing it also removes the only cron job
  that still needed the old credentials.`;

const commit8 = `Rule 8: Write the message before you are tired of the change
The best time to write the message is when you still remember why you made the change and what surprised you, which is usually before the code review starts, not after the fifth round of it. Write it early, keep it in the draft, and update it if the approach changes. A message written at midnight after a long review tends to say "address review comments", which is the least useful sentence a history can contain.

Example:
  Validate the callback URL before storing it

  The form accepted any string, and one customer saved a URL with
  a trailing space that failed every webhook silently. Now the URL
  is parsed on save and the form shows the problem straight away.`;

export const DEMO_PACKS: DemoPack[] = [
  {
    title: "Weeknight Vegetarian, 8 recipes",
    kind: "recipes",
    promises: VEG_PROMISES,
    sections: [recipe1, recipe2, recipe3, recipe4, recipe5Bacon, recipe6, recipe7, recipe8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "Recipe 5 has bacon: a dispute on section 5 against promise 1 breaks.",
    hint: "One recipe breaks promise P1. Read them, find it, and dispute that section against P1: the verdict should be breaks, and your price and bond come back. Every other section keeps every promise, so a dispute there should go to the seller.",
  },
  {
    title: "Weeknight Vegetarian, 8 recipes (honest twin)",
    kind: "recipes",
    promises: VEG_PROMISES,
    sections: [recipe1, recipe2, recipe3, recipe4, recipe5Tofu, recipe6, recipe7, recipe8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "Same pack with smoked tofu in recipe 5: every promise holds, so every dispute should come back keeps.",
    hint: "The honest twin: every promise holds in every section. A dispute should come back keeps, with the price and your bond going to the seller; try it to watch the validators turn down a claim the text does not support.",
  },
  {
    title: "Cold Email Templates, 6 templates",
    kind: "templates",
    promises: [
      "Every template has a subject line.",
      "Every template is under 150 words.",
      "No template leaves a placeholder like [NAME] unfilled.",
    ],
    sections: [email1, email2, email3, email4, email5, email6],
    priceGen: "0.5",
    windowSeconds: 300,
    note: "All promises kept; the 5-minute window shows a release to the seller.",
    hint: "Every promise holds and the window is five minutes; after it closes, anyone can press Release to pay the seller. Nothing here should win a dispute.",
  },
  {
    title: "Exam notes: the French Revolution, 6 cards",
    kind: "notes",
    promises: NOTES_PROMISES,
    sections: [card1, card2, card3, card4, card5, card6],
    priceGen: "0.5",
    windowSeconds: 2 * 86400,
    note: "Revision cards with dates and word limits; card 4 names no year or date, so it breaks promise 1.",
    hint: "One card breaks promise P1: it names no year and no date. Read the six cards, find it, and dispute that card against P1. The word limit and the banned word hold on every card.",
  },
  {
    title: "Writing prompts for short fiction, 8 prompts",
    kind: "prompts",
    promises: PROMPT_PROMISES,
    sections: [prompt1, prompt2, prompt3, prompt4, prompt5, prompt6, prompt7, prompt8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "Eight story seeds, each with a setting and a character; prompt 6 runs to two paragraphs, breaking promise 2.",
    hint: "One prompt breaks promise P2: below its title it runs to two paragraphs. Every prompt names its setting and character and stays under 150 words, so P1 and P3 hold.",
  },
  {
    title: "A first day in Lisbon, 6 stops",
    kind: "guide",
    promises: LISBON_PROMISES,
    sections: [stop1, stop2, stop3, stop4, stop5, stop6],
    priceGen: "1.5",
    windowSeconds: 2 * 86400,
    note: "A day from Praça do Comércio to Belém Tower; stop 4 gives no opening hours, breaking promise 1.",
    hint: "One stop breaks promise P1: it gives no opening hours. Every leg after the first stop is described and timed, on foot or by tram 28, and none of the stops is a mall, so P2 and P3 hold.",
  },
  {
    title: "Customer support replies, 6 templates",
    kind: "templates",
    promises: SUPPORT_PROMISES,
    sections: [support1, support2, support3, support4, support5, support6],
    priceGen: "0.5",
    windowSeconds: 86400,
    note: "Six honest support replies: every message opens with a greeting, has a Next step line before the sign-off, and promises no refund.",
    hint: "Every promise holds. Each message opens with a greeting, has a Next step line before its sign-off, and never promises a refund; a dispute should come back keeps, with your bond going to the seller.",
  },
  {
    title: "Eight rules for naming things in code",
    kind: "other",
    promises: NAMING_PROMISES,
    sections: [rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8],
    priceGen: "2",
    windowSeconds: 3 * 86400,
    note: "A short craft list on naming; rule 5 shows only a good example, so it breaks promise 1.",
    hint: "One rule breaks promise P1: it has no labelled bad example. Every rule is under 200 words, so P2 holds throughout.",
  },
  {
    title: "Ten-minute breakfasts, 6 recipes",
    kind: "recipes",
    promises: BREAKFAST_PROMISES,
    sections: [breakfast1, breakfast2, breakfast3, breakfast4, breakfast5, breakfast6],
    priceGen: "0.5",
    windowSeconds: 2 * 86400,
    note: "Six no-cook breakfasts under ten minutes; recipe 4 cooks in a pan on the stove, breaking promise 2.",
    hint: "One recipe breaks promise P2: one of its steps uses heat. Every recipe states a time of ten minutes or less and serves one, so P1 and P3 hold.",
  },
  {
    title: "Freelance proposal templates, 5 templates",
    kind: "templates",
    promises: PROPOSAL_PROMISES,
    sections: [proposal1, proposal2, proposal3, proposal4, proposal5],
    priceGen: "1",
    windowSeconds: 2 * 86400,
    note: "Five one-page proposals with a price and a date; template 3 has no delivery date line, breaking promise 2.",
    hint: "One template breaks promise P2: it has no delivery date line. Every template names a price and leaves no placeholder unfilled, so P1 and P3 hold.",
  },
  {
    title: "Meeting invitations, 6 templates",
    kind: "templates",
    promises: INVITE_PROMISES,
    sections: [invite1, invite2, invite3, invite4, invite5, invite6],
    priceGen: "0.5",
    windowSeconds: 86400,
    note: "Six short invitations, from a kickoff to a reschedule; every promise holds.",
    hint: "Every promise holds. Each invitation names a day, a start time and a length, says what to prepare, and stays under 200 words; a dispute should come back keeps.",
  },
  {
    title: "Newton's three laws and friends, 6 cards",
    kind: "notes",
    promises: PHYSICS_PROMISES,
    sections: [physics1, physics2, physics3, physics4, physics5, physics6],
    priceGen: "0.5",
    windowSeconds: 2 * 86400,
    note: "Six revision cards with formulas and worked examples; card 5 ends without a worked example, breaking promise 1.",
    hint: "One card breaks promise P1: it has no worked example. Every card states a formula and stays under 250 words, so P2 and P3 hold.",
  },
  {
    title: "Spanish irregular verbs, 8 cards",
    kind: "notes",
    promises: SPANISH_PROMISES,
    sections: [spanish1, spanish2, spanish3, spanish4, spanish5, spanish6, spanish7, spanish8],
    priceGen: "0.5",
    windowSeconds: 3 * 86400,
    note: "Eight verbs, each conjugated in full and ending with a translated example sentence; every promise holds.",
    hint: "Every promise holds. Each card gives all six present-tense forms, ends with an example sentence and its translation, and stays under 200 words; a dispute should come back keeps.",
  },
  {
    title: "Journal prompts for a hard week, 8 prompts",
    kind: "prompts",
    promises: JOURNAL_PROMISES,
    sections: [journal1, journal2, journal3, journal4, journal5, journal6, journal7, journal8],
    priceGen: "0.5",
    windowSeconds: 2 * 86400,
    note: "Eight prompts written as questions; prompt 5 is a set of instructions instead, breaking promise 1.",
    hint: "One prompt breaks promise P1: it asks no question and does not end with a question mark. Every prompt is one paragraph under 150 words, so P2 and P3 hold.",
  },
  {
    title: "Interview questions for hiring a designer, 7 prompts",
    kind: "prompts",
    promises: INTERVIEW_PROMISES,
    sections: [interview1, interview2, interview3, interview4, interview5, interview6, interview7],
    priceGen: "1",
    windowSeconds: 2 * 86400,
    note: "Seven open-ended questions, each with what a strong answer includes; every promise holds.",
    hint: "Every promise holds. No question can be answered yes or no, each prompt says what a strong answer includes, and each is under 200 words; a dispute should come back keeps.",
  },
  {
    title: "Caring for houseplants, 6 plants",
    kind: "guide",
    promises: PLANT_PROMISES,
    sections: [plant1, plant2, plant3, plant4, plant5, plant6],
    priceGen: "0.5",
    windowSeconds: 2 * 86400,
    note: "Six easy plants with light, water and overwatering signs; plant 4 has no Water line, breaking promise 1.",
    hint: "One plant breaks promise P1: it never says how often to water. Every plant states its light and at least one sign of too much water, so P2 and P3 hold.",
  },
  {
    title: "A weekend in Kyoto, 6 stops",
    kind: "guide",
    promises: KYOTO_PROMISES,
    sections: [kyoto1, kyoto2, kyoto3, kyoto4, kyoto5, kyoto6],
    priceGen: "1.5",
    windowSeconds: 3 * 86400,
    note: "Two days from Fushimi Inari to Gion, with opening hours for every stop and transport for every leg; every promise holds.",
    hint: "Every promise holds. Each stop gives its opening hours, each one after the first says how to reach it from the last and how long it takes, and none is a mall; a dispute should come back keeps.",
  },
  {
    title: "Rules for a two-player card game",
    kind: "other",
    promises: GAME_PROMISES,
    sections: [game1, game2, game3, game4, game5, game6, game7],
    priceGen: "0.5",
    windowSeconds: 86400,
    note: "Bridgeway, a seven-rule game for one deck and two players; every promise holds.",
    hint: "Every promise holds. Each rule is under 150 words, needs only one deck and two players, and never mentions money; a dispute should come back keeps.",
  },
  {
    title: "Eight rules for good commit messages",
    kind: "other",
    promises: COMMIT_PROMISES,
    sections: [commit1, commit2, commit3, commit4, commit5, commit6, commit7, commit8],
    priceGen: "1",
    windowSeconds: 3 * 86400,
    note: "A short craft list on commit messages; rule 6 has no example, breaking promise 1.",
    hint: "One rule breaks promise P1: it has no Example line. Every rule is under 200 words, so P2 holds throughout.",
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
