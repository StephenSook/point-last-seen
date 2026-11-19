import { spellCode } from "./radioCode";
import type { RadioCardModel } from "./radioCard";

const cardsPerPage = 2;

export function RadioCards({ cards, matchCode }: { cards: readonly RadioCardModel[]; matchCode: string | null }) {
  const words = matchCode === null ? "" : spellCode(matchCode).join(" ");
  return Array.from({ length: Math.ceil(cards.length / cardsPerPage) }, (_, page) => (
    <div className="extras-radio-sheet" key={page}>
      {cards.slice(page * cardsPerPage, (page + 1) * cardsPerPage).map((card, index) => (
        <article className="extras-radio-card" key={index}>
          {card.drillLine && <p className="extras-drill-line">{card.drillLine}</p>}
          <h2>{card.teamName}</h2>
          <p>{card.incidentName} | {card.planLine}</p>
          {card.segmentIds.length > 0 && <p><strong>Segments:</strong> {card.segmentIds.join(", ")}</p>}
          {card.taskText && <p>{card.taskText}</p>}
          {card.personLines.length > 0 && (
            <ul className="extras-radio-person">{card.personLines.map((line) => <li key={line}>{line}</li>)}</ul>
          )}
          <h3>Read the match code one character at a time</h3>
          {words && <p><strong>{matchCode}</strong> | {words}</p>}
          <dl className="extras-spell-table">
            {card.spellTable.map(({ ch, word }) => <div key={ch}><dt>{ch}</dt><dd>{word}</dd></div>)}
          </dl>
          <p>{card.matchMeaning}</p>
          {card.sayLines.length > 0 && (
            <ul>{card.sayLines.map((line) => <li key={line}>{line}</li>)}</ul>
          )}
        </article>
      ))}
    </div>
  ));
}
