// For the wording measurement page: the plan prompt with each team's facts in reverse order, to see whether the
// model's choice follows the facts or their place in the list. Every other line is unchanged.

export function reverseFacts(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const m = /^(.+? searches .+?\. Facts: )(.+)$/.exec(line);
      return m ? m[1]! + m[2]!.split(/(?<=\)), /).reverse().join(", ") : line;
    })
    .join("\n");
}

/** Each team's fact list as the prompt states it, in order. */
export const factsSent = (text: string): string[] =>
  text.split("\n").filter((l) => l.includes(" searches ")).map((l) => l.slice(l.indexOf("Facts: ") + "Facts: ".length));
