// Arabic texts, keyed by the English text used in the code. Split into parts to keep files manageable.
import { AR1 } from "./ar/part1";
import { AR2 } from "./ar/part2";
import { AR3 } from "./ar/part3";
import { AR4 } from "./ar/part4";
import { AR5 } from "./ar/part5";

export const AR: Record<string, string> = { ...AR1, ...AR2, ...AR3, ...AR4, ...AR5 };
