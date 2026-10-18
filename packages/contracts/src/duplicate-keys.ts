/**
 * The first key some object in `json` names twice, or null. JSON.parse keeps the last value of a
 * repeated key while a person, or another parser, may read the first, so a signature checked on
 * one value would vouch for a file that shows another. Expects text JSON.parse has accepted.
 */
export function findDuplicateKey(json: string): string | null {
  // One entry per open container: the keys seen so far in an object, null for an array.
  const open: (Set<string> | null)[] = [];
  let expectingKey = false;

  for (let index = 0; index < json.length; index++) {
    const char = json[index];
    if (char === '"') {
      let end = index + 1;
      while (json[end] !== '"') end += json[end] === "\\" ? 2 : 1;
      const keys = open.at(-1);
      if (keys && expectingKey) {
        // Decoded, so "a" and "a" count as the same key, as JSON.parse counts them.
        const key = JSON.parse(json.slice(index, end + 1)) as string;
        if (keys.has(key)) return key;
        keys.add(key);
        expectingKey = false;
      }
      index = end;
    } else if (char === "{") {
      open.push(new Set());
      expectingKey = true;
    } else if (char === "[") {
      open.push(null);
    } else if (char === "}" || char === "]") {
      open.pop();
    } else if (char === ",") {
      expectingKey = open.at(-1) instanceof Set;
    }
  }
  return null;
}
