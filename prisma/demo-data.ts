// Demo restaurants, menus and reels (SEED_DEMO=true). Media for these is pre-rendered by
// scripts/demo-media.ts into prisma/demo/ so hosts without ffmpeg or emoji fonts still get it.

export const PALETTES = [
  ["#ff7438", "#7f2111"],
  ["#f6b73c", "#a14a0a"],
  ["#62b36f", "#1d5a2c"],
  ["#e8505b", "#6e1423"],
  ["#c08552", "#4b2e19"],
  ["#5aa9e6", "#1b3a5c"],
];

// ───── demo data ─────

export type Opt = [string, number] | [string, number, true];
export type Group = { name: string; type: "SINGLE" | "MULTIPLE" | "TEXT"; required?: boolean; max?: number; options?: Opt[] };
export type Item = { sku: string; name: string; cat: string; food: string; price: number; desc: string; ingredients: string; allergens?: string; diet?: string[]; emoji: string; groups?: string[]; prep?: number };
export type Demo = { slug: string; name: string; business: string; cuisine: string; area: string; city: string; desc: string; currency?: string; lat: number; lng: number; owner: string; verified?: boolean; fee?: number | null; areas?: [string, number | null][]; groups: Record<string, Group>; items: Item[]; reels: string[] };


export const DEMOS: Demo[] = [
  {
    slug: "burger-house", name: "Burger House", business: "Burger House SARL", cuisine: "Burgers, American", area: "Hamra", city: "Beirut", owner: "owner@burgerhouse.demo", verified: true, fee: null,
    desc: "Smashed-to-order burgers on toasted brioche. Fresh beef ground daily, hand-cut fries.", lat: 33.8959, lng: 35.4787,
    areas: [["Hamra", 1.5], ["Ras Beirut", 2], ["Verdun", 2.5], ["Achrafieh", 3]],
    groups: {
      cheese: { name: "Cheese", type: "SINGLE", required: true, options: [["Cheddar", 0, true], ["American", 0], ["Swiss", 50]] },
      extras: { name: "Extra toppings", type: "MULTIPLE", max: 4, options: [["Extra cheese", 100], ["Bacon", 150], ["Fried egg", 100], ["Caramelized onions", 75]] },
      remove: { name: "Remove ingredients", type: "MULTIPLE", options: [["No pickles", 0], ["No onions", 0], ["No sauce", 0]] },
      sauce: { name: "Sauce", type: "SINGLE", required: true, options: [["House sauce", 0, true], ["BBQ sauce", 0], ["Spicy mayo", 0]] },
      side: { name: "Add a side", type: "SINGLE", options: [["Add fries", 250], ["Add onion rings", 300]] },
      cook: { name: "Cooking preference", type: "SINGLE", required: true, options: [["Medium", 0, true], ["Medium well", 0], ["Well done", 0]] },
      notes: { name: "Special instructions", type: "TEXT" },
    },
    items: [
      { sku: "BRG001", name: "Double Smash Burger", cat: "Burgers", food: "burgers", price: 750, emoji: "🍔", desc: "Two smashed beef patties, melted cheese, house sauce, pickles on a toasted brioche bun.", ingredients: "Beef, cheese, brioche bun, pickles, onion, house sauce", allergens: "Gluten, Dairy, Egg", groups: ["cheese", "extras", "remove", "sauce", "side", "cook", "notes"], prep: 12 },
      { sku: "BRG002", name: "Crispy Chicken Burger", cat: "Burgers", food: "chicken", price: 675, emoji: "🍗", desc: "Buttermilk fried chicken thigh, slaw and spicy mayo.", ingredients: "Chicken thigh, flour, buttermilk, cabbage, mayo, brioche bun", allergens: "Gluten, Egg, Dairy", groups: ["extras", "remove", "side", "notes"], prep: 12 },
      { sku: "BRG003", name: "Mushroom Swiss", cat: "Burgers", food: "burgers", price: 825, emoji: "🍄", desc: "Single patty, sautéed mushrooms, Swiss cheese, truffle mayo.", ingredients: "Beef, mushrooms, Swiss cheese, truffle mayo, brioche bun", allergens: "Gluten, Dairy, Egg", groups: ["extras", "remove", "side", "cook", "notes"], prep: 14 },
      { sku: "BRG004", name: "Classic Cheeseburger", cat: "Burgers", food: "burgers", price: 600, emoji: "🍔", desc: "Single smashed patty, American cheese, onion, pickles, ketchup and mustard.", ingredients: "Beef, American cheese, onion, pickles, ketchup, mustard, brioche bun", allergens: "Gluten, Dairy", groups: ["extras", "remove", "side", "cook", "notes"], prep: 10 },
      { sku: "SD001", name: "French Fries", cat: "Sides", food: "burgers", price: 300, emoji: "🍟", desc: "Hand-cut skin-on fries, sea salt.", ingredients: "Potato, sunflower oil, salt", diet: ["Vegan"], prep: 6 },
      { sku: "SD002", name: "Loaded Fries", cat: "Sides", food: "burgers", price: 500, emoji: "🧀", desc: "Fries, cheese sauce, beef bacon bits, jalapeños.", ingredients: "Potato, cheese sauce, beef bacon, jalapeño", allergens: "Dairy", prep: 8 },
      { sku: "SD003", name: "Onion Rings", cat: "Sides", food: "burgers", price: 350, emoji: "🧅", desc: "Beer-battered onion rings with smoky dip.", ingredients: "Onion, flour, batter, sunflower oil", allergens: "Gluten", diet: ["Vegetarian"], prep: 7 },
      { sku: "DR001", name: "Fresh Lemonade", cat: "Drinks", food: "drinks", price: 250, emoji: "🍋", desc: "Squeezed daily with mint.", ingredients: "Lemon, sugar, mint, water", diet: ["Vegan"] },
      { sku: "DR002", name: "Chocolate Milkshake", cat: "Drinks", food: "drinks", price: 450, emoji: "🥤", desc: "Thick vanilla ice cream shake with Belgian chocolate.", ingredients: "Milk, vanilla ice cream, chocolate", allergens: "Dairy" },
    ],
    reels: ["BRG001", "BRG002", "SD002"],
  },
  {
    slug: "manousheh-corner", name: "Manousheh Corner", business: "Manousheh Corner", cuisine: "Lebanese bakery", area: "Achrafieh", city: "Beirut", owner: "owner@manousheh.demo", verified: true, fee: 100,
    desc: "Stone-oven manakish baked to order since the morning call to prayer.", lat: 33.8869, lng: 35.5197,
    groups: { veg: { name: "Add vegetables", type: "MULTIPLE", options: [["Tomato", 0], ["Cucumber", 0], ["Mint", 0], ["Olives", 25]] }, cheese: { name: "Add cheese", type: "SINGLE", options: [["Akkawi", 75], ["Halloumi", 100]] } },
    items: [
      { sku: "MN001", name: "Zaatar Manousheh", cat: "Manakish", food: "lebanese", price: 150, emoji: "🫓", desc: "Thyme, sumac, sesame and olive oil on fresh dough.", ingredients: "Flour, zaatar, sesame, sumac, olive oil", allergens: "Gluten, Sesame", diet: ["Vegan"], groups: ["veg", "cheese"], prep: 7 },
      { sku: "MN002", name: "Cheese Manousheh", cat: "Manakish", food: "lebanese", price: 250, emoji: "🧀", desc: "Akkawi and mozzarella blend, bubbling hot.", ingredients: "Flour, akkawi, mozzarella", allergens: "Gluten, Dairy", groups: ["veg"], prep: 8 },
      { sku: "MN003", name: "Lahm Bi Ajeen", cat: "Manakish", food: "lebanese", price: 300, emoji: "🥙", desc: "Spiced minced meat, tomato and onion on thin dough.", ingredients: "Flour, minced beef, tomato, onion, spices", allergens: "Gluten", prep: 9 },
      { sku: "MN004", name: "Kishk Manousheh", cat: "Manakish", food: "breakfast", price: 250, emoji: "🌾", desc: "Fermented bulgur and yogurt with onion and tomato.", ingredients: "Flour, kishk, onion, tomato, sesame", allergens: "Gluten, Dairy, Sesame", prep: 8 },
      { sku: "MN005", name: "Halloumi Zaatar Wrap", cat: "Wraps", food: "lebanese", price: 350, emoji: "🥙", desc: "Grilled halloumi, zaatar, tomato and mint rolled in thin dough.", ingredients: "Flour, halloumi, zaatar, tomato, mint, olive oil", allergens: "Gluten, Dairy, Sesame", diet: ["Vegetarian"], groups: ["veg"], prep: 8 },
      { sku: "MN006", name: "Labneh Wrap", cat: "Wraps", food: "breakfast", price: 275, emoji: "🫓", desc: "Creamy labneh, cucumber, olives and mint.", ingredients: "Flour, labneh, cucumber, olives, mint", allergens: "Gluten, Dairy", diet: ["Vegetarian"], groups: ["veg"], prep: 6 },
      { sku: "MN007", name: "Ayran", cat: "Drinks", food: "drinks", price: 125, emoji: "🥛", desc: "Chilled salted yogurt drink.", ingredients: "Yogurt, water, salt", allergens: "Dairy" },
    ],
    reels: ["MN001", "MN002", "MN003"],
  },
  {
    slug: "shawarma-station", name: "Shawarma Station", business: "Shawarma Station SAL", cuisine: "Shawarma, Lebanese", area: "Mar Mikhael", city: "Beirut", owner: "owner@shawarma.demo", fee: 200,
    desc: "Charcoal-kissed shawarma, whipped garlic toum and pickles made in-house.", lat: 33.8975, lng: 35.5265,
    groups: { size: { name: "Size", type: "SINGLE", required: true, options: [["Regular", 0, true], ["Large", 150]] }, extra: { name: "Extras", type: "MULTIPLE", max: 3, options: [["Extra toum", 50], ["Extra pickles", 0], ["Add fries inside", 50], ["No meat (veg only)", -100]] } },
    items: [
      { sku: "SH001", name: "Chicken Shawarma Sandwich", cat: "Sandwiches", food: "shawarma", price: 450, emoji: "🌯", desc: "Marinated chicken, toum, pickles, fries in saj bread.", ingredients: "Chicken, garlic, saj bread, pickles, potato", allergens: "Gluten", groups: ["size", "extra"], prep: 6 },
      { sku: "SH002", name: "Beef Shawarma Sandwich", cat: "Sandwiches", food: "shawarma", price: 500, emoji: "🥩", desc: "Beef shawarma, tarator, parsley, onion, tomato.", ingredients: "Beef, tahini, parsley, onion, tomato, bread", allergens: "Gluten, Sesame", groups: ["size", "extra"], prep: 6 },
      { sku: "SH003", name: "Chicken Shawarma Platter", cat: "Platters", food: "chicken", price: 900, emoji: "🍗", desc: "Generous shawarma, fries, toum, pickles and bread.", ingredients: "Chicken, potato, garlic, pickles, bread", allergens: "Gluten", prep: 10 },
      { sku: "SH004", name: "Falafel Sandwich", cat: "Sandwiches", food: "sandwiches", price: 300, emoji: "🧆", desc: "Crispy falafel, tarator, tomato, parsley, radish and pickles.", ingredients: "Chickpeas, fava beans, herbs, tahini, tomato, bread", allergens: "Gluten, Sesame", diet: ["Vegan"], groups: ["size"], prep: 5 },
      { sku: "SH005", name: "Beef Shawarma Platter", cat: "Platters", food: "shawarma", price: 1050, emoji: "🥩", desc: "Beef shawarma, fries, tarator, pickles, onion-sumac salad and bread.", ingredients: "Beef, potato, tahini, onion, sumac, bread", allergens: "Gluten, Sesame", prep: 10 },
      { sku: "SD010", name: "Batata Harra", cat: "Sides", food: "lebanese", price: 350, emoji: "🌶️", desc: "Spicy potatoes with garlic, coriander and chili.", ingredients: "Potato, garlic, coriander, chili, olive oil", diet: ["Vegan"], prep: 7 },
      { sku: "DR010", name: "Jallab", cat: "Drinks", food: "drinks", price: 250, emoji: "🍹", desc: "Date and grape molasses with rose water, pine nuts and raisins.", ingredients: "Date molasses, grape molasses, rose water, pine nuts, raisins", allergens: "Nuts" },
    ],
    reels: ["SH001", "SH003", "SH004"],
  },
  {
    slug: "pizza-forno", name: "Pizza Forno", business: "Forno Group", cuisine: "Pizza, Italian", area: "Jounieh", city: "Jounieh", owner: "owner@forno.demo", fee: 250,
    desc: "48-hour fermented dough, San Marzano tomatoes, wood-fired at 450°C.", lat: 33.9808, lng: 35.6178,
    groups: { size: { name: "Size", type: "SINGLE", required: true, options: [["Medium", 0, true], ["Large", 300]] }, crust: { name: "Crust", type: "SINGLE", required: true, options: [["Classic", 0, true], ["Thin", 0]] }, top: { name: "Toppings", type: "MULTIPLE", max: 5, options: [["Extra cheese", 150], ["Mushrooms", 100], ["Olives", 75], ["Rocket", 75], ["Spicy salami", 200]] } },
    items: [
      { sku: "PZ001", name: "Margherita", cat: "Pizza", food: "pizza", price: 900, emoji: "🍕", desc: "Tomato, fior di latte, basil, olive oil.", ingredients: "Flour, tomato, mozzarella, basil, olive oil", allergens: "Gluten, Dairy", diet: ["Vegetarian"], groups: ["size", "crust", "top"], prep: 15 },
      { sku: "PZ002", name: "Pepperoni", cat: "Pizza", food: "pizza", price: 1100, emoji: "🍕", desc: "Spicy beef pepperoni, mozzarella, hot honey.", ingredients: "Flour, tomato, mozzarella, beef pepperoni, honey", allergens: "Gluten, Dairy", groups: ["size", "crust", "top"], prep: 15 },
      { sku: "PS001", name: "Truffle Pasta", cat: "Pasta", food: "pasta", price: 1250, emoji: "🍝", desc: "Tagliatelle, mushroom cream, black truffle paste, parmesan.", ingredients: "Pasta, cream, mushrooms, truffle, parmesan", allergens: "Gluten, Dairy, Egg", prep: 14 },
      { sku: "PZ003", name: "Quattro Formaggi", cat: "Pizza", food: "pizza", price: 1200, emoji: "🧀", desc: "Mozzarella, gorgonzola, parmesan and goat cheese, white base.", ingredients: "Flour, mozzarella, gorgonzola, parmesan, goat cheese", allergens: "Gluten, Dairy", diet: ["Vegetarian"], groups: ["size", "crust", "top"], prep: 15 },
      { sku: "PZ004", name: "Truffle Mushroom Pizza", cat: "Pizza", food: "pizza", price: 1300, emoji: "🍄", desc: "Mushroom cream, mozzarella, truffle oil and rocket.", ingredients: "Flour, mushrooms, cream, mozzarella, truffle oil, rocket", allergens: "Gluten, Dairy", diet: ["Vegetarian"], groups: ["size", "crust", "top"], prep: 15 },
      { sku: "SL001", name: "Caesar Salad", cat: "Salads", food: "healthy", price: 800, emoji: "🥗", desc: "Romaine, grilled chicken, parmesan, croutons, house Caesar dressing.", ingredients: "Romaine, chicken, parmesan, croutons, dressing", allergens: "Gluten, Dairy, Egg, Fish", prep: 8 },
      { sku: "DS010", name: "Tiramisu", cat: "Desserts", food: "desserts", price: 600, emoji: "🍰", desc: "Mascarpone, espresso-soaked ladyfingers, cocoa.", ingredients: "Mascarpone, egg, sugar, ladyfingers, espresso, cocoa", allergens: "Gluten, Dairy, Egg" },
    ],
    reels: ["PZ001", "PZ002", "PS001"],
  },
  {
    slug: "bean-bar", name: "Bean Bar", business: "Bean Bar Coffee", cuisine: "Coffee, Bakery", area: "Gemmayzeh", city: "Beirut", owner: "owner@beanbar.demo", fee: 100,
    desc: "Specialty coffee roasted in Beirut, plus fresh pastries every morning.", lat: 33.8946, lng: 35.5165,
    groups: { size: { name: "Size", type: "SINGLE", required: true, options: [["Small", 0, true], ["Medium", 50], ["Large", 100]] }, milk: { name: "Milk type", type: "SINGLE", required: true, options: [["Full fat", 0, true], ["Skimmed", 0], ["Oat", 50], ["Almond", 50]] }, sugar: { name: "Sugar", type: "SINGLE", options: [["No sugar", 0], ["1 sugar", 0], ["2 sugars", 0]] }, shot: { name: "Extras", type: "MULTIPLE", options: [["Extra shot", 75], ["Vanilla syrup", 50], ["Caramel syrup", 50]] } },
    items: [
      { sku: "CF001", name: "Latte", cat: "Coffee", food: "coffee", price: 350, emoji: "☕", desc: "Double espresso and silky steamed milk.", ingredients: "Espresso, milk", allergens: "Dairy (unless plant milk)", groups: ["size", "milk", "sugar", "shot"], prep: 4 },
      { sku: "CF002", name: "Iced Spanish Latte", cat: "Coffee", food: "coffee", price: 450, emoji: "🧋", desc: "Espresso, condensed milk, milk over ice.", ingredients: "Espresso, condensed milk, milk, ice", allergens: "Dairy", groups: ["size", "milk", "shot"], prep: 4 },
      { sku: "BK001", name: "Butter Croissant", cat: "Bakery", food: "breakfast", price: 250, emoji: "🥐", desc: "Laminated with French butter, baked every morning.", ingredients: "Flour, butter, milk, sugar, yeast, egg", allergens: "Gluten, Dairy, Egg", prep: 2 },
      { sku: "CF003", name: "Cappuccino", cat: "Coffee", food: "coffee", price: 325, emoji: "☕", desc: "Espresso with velvety foamed milk.", ingredients: "Espresso, milk", allergens: "Dairy (unless plant milk)", groups: ["size", "milk", "sugar", "shot"], prep: 4 },
      { sku: "CF004", name: "Iced Matcha Latte", cat: "Coffee", food: "coffee", price: 500, emoji: "🍵", desc: "Ceremonial-grade matcha whisked over iced milk.", ingredients: "Matcha, milk, ice", allergens: "Dairy (unless plant milk)", groups: ["size", "milk"], prep: 4 },
      { sku: "BK002", name: "Pain au Chocolat", cat: "Bakery", food: "breakfast", price: 300, emoji: "🥐", desc: "Flaky pastry with two bars of dark chocolate.", ingredients: "Flour, butter, dark chocolate, milk, sugar, egg", allergens: "Gluten, Dairy, Egg", prep: 2 },
      { sku: "BK003", name: "Cinnamon Roll", cat: "Bakery", food: "desserts", price: 350, emoji: "🧁", desc: "Soft brioche swirl, cinnamon sugar, cream cheese glaze.", ingredients: "Flour, butter, cinnamon, sugar, cream cheese, egg", allergens: "Gluten, Dairy, Egg", prep: 2 },
    ],
    reels: ["CF002", "CF001", "BK001"],
  },
  {
    slug: "sweet-ashta", name: "Sweet Ashta", business: "Sweet Ashta", cuisine: "Lebanese desserts", area: "Tripoli", city: "Tripoli", owner: "owner@ashta.demo", currency: "LBP", fee: 150000,
    desc: "Traditional Tripoli sweets — warm knefeh and fresh ashta.", lat: 34.4367, lng: 35.8497,
    groups: { bread: { name: "Serve with", type: "SINGLE", options: [["Kaak bread", 0, true], ["Plate only", 0]] } },
    items: [
      { sku: "DS001", name: "Knefeh Bi Jibn", cat: "Sweets", food: "desserts", price: 350000, emoji: "🧁", desc: "Warm semolina and cheese, orange-blossom syrup, sesame kaak.", ingredients: "Semolina, akkawi cheese, sugar syrup, sesame bread", allergens: "Gluten, Dairy, Sesame", groups: ["bread"], prep: 5 },
      { sku: "DS002", name: "Ashta Bi Asal", cat: "Sweets", food: "desserts", price: 400000, emoji: "🍯", desc: "Clotted cream, honey and pistachio.", ingredients: "Milk, cream, honey, pistachio", allergens: "Dairy, Nuts" },
      { sku: "DS003", name: "Maamoul Box", cat: "Sweets", food: "desserts", price: 450000, emoji: "🍪", desc: "Semolina cookies filled with dates, walnuts and pistachio (6 pieces).", ingredients: "Semolina, butter, dates, walnuts, pistachio, rose water", allergens: "Gluten, Dairy, Nuts" },
      { sku: "DS004", name: "Osmalieh", cat: "Sweets", food: "desserts", price: 400000, emoji: "🥮", desc: "Crispy shredded pastry layered with ashta and syrup.", ingredients: "Kataifi pastry, ashta cream, sugar syrup, pistachio", allergens: "Gluten, Dairy, Nuts" },
      { sku: "DS005", name: "Riz Bi Haleeb", cat: "Sweets", food: "desserts", price: 250000, emoji: "🍮", desc: "Rose-water rice pudding with pistachio.", ingredients: "Rice, milk, sugar, rose water, pistachio", allergens: "Dairy, Nuts" },
    ],
    reels: ["DS001", "DS002"],
  },
];

