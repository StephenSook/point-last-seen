// The command post's channel to the family. Command asks a question (incidents/{id}/familyQuestions/{id}) and
// the family's answer is added to the same document, once. Command can also tell the family the search is
// searching or paused (incidents/{id}.searchState); each change sends the family a fixed push with no text.
// Nothing about whether the person was found, or their condition, goes through here: that news comes from the
// search lead in person or by phone.

import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, type Firestore, type Unsubscribe } from "firebase/firestore";

export const QUESTION_TEMPLATES = [
  "Did they ever go by another name?",
  "Places they used to walk or live?",
  "What were they wearing when you last saw them?",
] as const;

export const MAX_QUESTION = 280;

export type SearchState = "searching" | "paused";
export type FamilyQuestion = { id: string; text: string; askedAtMs: number | null; answer: { text: string; atMs: number | null } | null };

export function parseQuestion(text: string): { ok: true; text: string } | { ok: false; message: string } {
  const t = text.trim();
  if (!t) return { ok: false, message: "Type a question first." };
  if (t.length > MAX_QUESTION) return { ok: false, message: `A question is ${MAX_QUESTION} characters at most.` };
  return { ok: true, text: t };
}

export function newQuestionDoc(text: string, uid: string): object {
  return { text, createdByUid: uid, createdAt: serverTimestamp() };
}

const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | undefined;
  return typeof t?.toMillis === "function" ? t.toMillis() : null;
};

export function questionFromDoc(id: string, data: unknown): FamilyQuestion | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d["text"] !== "string") return null;
  const answer = typeof d["answer"] === "string" ? { text: d["answer"] as string, atMs: ms(d["answeredAt"]) } : null;
  return { id, text: d["text"] as string, askedAtMs: ms(d["createdAt"]), answer };
}

/** The state the family was last told, or null when none was set (or a value this app does not send). */
export function searchStateOf(incident: unknown): SearchState | null {
  const v = typeof incident === "object" && incident !== null ? (incident as { searchState?: unknown }).searchState : undefined;
  return v === "searching" || v === "paused" ? v : null;
}

export function subscribeQuestions(db: Firestore, incidentId: string, cb: (q: FamilyQuestion[]) => void, onError: (e: unknown) => void): Unsubscribe {
  return onSnapshot(query(collection(db, "incidents", incidentId, "familyQuestions"), orderBy("createdAt", "desc")), (s) => {
    cb(s.docs.flatMap((d) => {
      const q = questionFromDoc(d.id, d.data());
      return q ? [q] : [];
    }));
  }, onError);
}

/** Firestore picks the id (20 letters and digits, which the rules require), so no typed text can ride the push as one. */
export async function askFamily(db: Firestore, incidentId: string, text: string, uid: string): Promise<void> {
  await addDoc(collection(db, "incidents", incidentId, "familyQuestions"), newQuestionDoc(text, uid));
}

export async function tellFamily(db: Firestore, incidentId: string, state: SearchState): Promise<void> {
  await updateDoc(doc(db, "incidents", incidentId), { searchState: state });
}
