# Real food videos for the demo restaurants

Upload videos here (GitHub → this folder → **Add file → Upload files**), then tell Claude.
Name each file after the dish below (any phone format: .mp4 or .mov, up to 25 MB each).
Vertical, 10–30 seconds, one dish per video. Only videos you have the rights to.

| File name | Restaurant | Dish |
|---|---|---|
| `burger-house-BRG001.mp4` | Burger House | Double Smash Burger |
| `burger-house-BRG002.mp4` | Burger House | Crispy Chicken Burger |
| `burger-house-SD002.mp4` | Burger House | Loaded Fries |
| `manousheh-corner-MN001.mp4` | Manousheh Corner | Zaatar Manousheh |
| `manousheh-corner-MN002.mp4` | Manousheh Corner | Cheese Manousheh |
| `manousheh-corner-MN003.mp4` | Manousheh Corner | Lahm Bi Ajeen |
| `shawarma-station-SH001.mp4` | Shawarma Station | Chicken Shawarma Sandwich |
| `shawarma-station-SH003.mp4` | Shawarma Station | Chicken Shawarma Platter |
| `shawarma-station-SH004.mp4` | Shawarma Station | Falafel Sandwich |
| `pizza-forno-PZ001.mp4` | Pizza Forno | Margherita |
| `pizza-forno-PZ002.mp4` | Pizza Forno | Pepperoni |
| `pizza-forno-PS001.mp4` | Pizza Forno | Truffle Pasta |
| `bean-bar-CF002.mp4` | Bean Bar | Iced Spanish Latte |
| `bean-bar-CF001.mp4` | Bean Bar | Latte |
| `bean-bar-BK001.mp4` | Bean Bar | Butter Croissant |
| `sweet-ashta-DS001.mp4` | Sweet Ashta | Knefeh Bi Jibn |
| `sweet-ashta-DS002.mp4` | Sweet Ashta | Ashta Bi Asal |

Simpler names are fine too (e.g. `margherita.mp4`) — Claude matches them to the dishes.
Missing videos keep the current demo reel. Claude converts them (trim, vertical 720p,
cover frame), moves them into `prisma/demo/reels/`, and deletes this folder's uploads.
