// The subject profile, as command types it or corrects it. Shared fields go
// to profile/shared (searchers see them); history goes to profile/command
// (never packed). Medication details stay on the family phone, so this form
// has no field for them.

import { namesToCall, type DementiaType, type FamilyProfile, type Place, type ProfileFlags, type TrackingAid } from "@pls/engine";
import trackingFile from "../../../shared/constants/tracking-aids.json";
import { useState, type FormEvent, useRef } from "react";
import type { LatLon } from "../map/geo";

const FLAGS: [keyof ProfileFlags, string][] = [
  ["mayNotRespond", "May not answer when called"], ["likelyToHide", "Likely to hide"], ["afraidOfUniforms", "Afraid of police or uniforms"],
  ["sensitiveToTouch", "Sensitive to touch"], ["sensitiveToLight", "Sensitive to light"], ["likelyToFight", "May push or strike out"],
  ["seizures", "Seizures"], ["hallucinationsOrDelusions", "Sees or believes things that are not real"], ["lookingForHome", "Says they are looking for home"],
  ["gaitUnsteady", "Unsteady walk"], ["freezing", "Feet may stop moving"], ["fallRisk", "High fall risk"], ["softVoice", "Very soft voice"],
  ["slowToRespond", "Slow to answer"], ["fluctuates", "Clarity changes fast"], ["medicationSensitivity", "Sensitive to some medicines"],
  ["carriesMedicalAlertCard", "Carries a medical alert card"], ["medicationTimingMatters", "Medicine timing matters"],
];
const TYPES: [DementiaType | "", string][] = [
  ["", "Not given"], ["alzheimers", "Alzheimer's"], ["lewy_body", "Lewy body"], ["vascular", "Vascular"],
  ["frontotemporal", "Frontotemporal"], ["mixed", "Mixed"], ["other", "Other"], ["unknown", "Not known"],
];
const AIDS = ["cane", "walker", "wheelchair", "other"] as const;
// The tracking aids in card order, with the form's labels, from the shared list the cards use too.
const TRACKING = trackingFile.aids as { id: TrackingAid; label: string }[];
const NOTE_DIGITS = /\p{Nd}/u;
type PlaceList = "previousAddresses" | "placesFrequented";

type Props = {
  initial: FamilyProfile;
  /**
   * Starts the save with the edited profile and the profile as it was when the form opened, so only the fields
   * changed here are written. The form closes at once; the parent says so if the server refuses it.
   */
  onSave: (p: FamilyProfile, opened: FamilyProfile) => void;
  /** Start picking a point on the map for one place; the parent calls back with the point. */
  onPickPlace: (list: PlaceList, index: number, done: (p: LatLon) => void) => void;
  onPlaceToCheck: (place: Place) => Promise<void>;
  onClose: () => void;
};

const num = (v: string): number | null => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function ProfileForm({ initial, onSave, onPickPlace, onPlaceToCheck, onClose }: Props) {
  const [p, setP] = useState<FamilyProfile>(initial);
  // The profile as it was when the form opened: the base a save compares against.
  const opened = useRef(initial);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<Record<string, boolean>>({});
  const set = <K extends keyof FamilyProfile>(k: K, v: FamilyProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const text = (k: "answersTo" | "nickname" | "gender" | "appearance" | "hair" | "eyeColor" | "primaryLanguage" | "clothingLastWorn" | "nearbyWater", label: string) => (
    <label key={k}>
      {label}
      <input value={p[k]} onChange={(e) => set(k, e.target.value)} />
    </label>
  );
  const long = (k: "triggersToAvoid" | "bestApproach" | "uniqueDescription", label: string) => (
    <label key={k}>
      {label}
      <textarea value={p[k]} maxLength={200} rows={2} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  function updatePlace(list: PlaceList, i: number, place: Place) {
    setP((x) => ({ ...x, [list]: x[list].map((q, j) => (j === i ? place : q)) }));
  }

  async function share(place: Place, key: string) {
    try {
      await onPlaceToCheck(place);
      setShared((s) => ({ ...s, [key]: true }));
    } catch {
      setError("The place was not added. Try again.");
    }
  }

  // A Firestore write settles only on the server's acknowledgement, which never comes with the
  // link down; the profile is already saved on this laptop, so the form closes at once.
  function save(e: FormEvent) {
    e.preventDefault();
    // The rules refuse digits in the note: serials and phone numbers go to the search lead, not the cards.
    if (p.trackingAids && NOTE_DIGITS.test(p.trackingAids.note)) {
      setError("Leave out numbers: give serials and phone numbers to the search lead directly.");
      return;
    }
    onSave(p, opened.current);
    onClose();
  }

  const places = (list: PlaceList, title: string) => (
    <fieldset key={list}>
      <legend>{title}</legend>
      {p[list].map((place, i) => {
        const key = `${list}-${i}`;
        return (
          <div key={key} className="place">
            <input aria-label={`${title} ${i + 1}`} value={place.label} maxLength={80} onChange={(e) => updatePlace(list, i, { ...place, label: e.target.value })} />
            <button type="button" className="btn ghost" onClick={() => onPickPlace(list, i, (pos) => updatePlace(list, i, { ...place, position: pos }))}>
              {place.position ? "Move on map" : "Set on map"}
            </button>
            <button type="button" className="btn ghost" disabled={!place.position || place.label.trim() === "" || shared[key]} onClick={() => share(place, key)}>
              {shared[key] ? "Shared with teams" : "Add as a place to check"}
            </button>
          </div>
        );
      })}
      <button type="button" className="btn ghost" onClick={() => set(list, [...p[list], { label: "", position: null }])}>
        Add
      </button>
    </fieldset>
  );

  return (
    <form className="sighting-form profile-form" onSubmit={save} aria-labelledby="profile-h">
      <h2 id="profile-h" className="label">Who we are looking for</h2>
      {text("answersTo", "Answers to")}
      {p.otherNames !== undefined ? (
        // The family keeps a list of names in their app; its first entry is the nickname, so a nickname
        // edited here would be overwritten. The list is shown, not edited, here.
        <p className="small">{`Names they answer to: ${namesToCall(p).join(", ") || "none given"}. The family keeps this list in their app.`}</p>
      ) : (
        text("nickname", "Nickname")
      )}
      <div className="two">
        <label>
          Age
          <input inputMode="numeric" value={p.ageYears ?? ""} onChange={(e) => set("ageYears", num(e.target.value))} />
        </label>
        {text("gender", "Gender")}
      </div>
      <div className="two">
        <label>
          Height, feet
          <input inputMode="numeric" value={p.heightFt ?? ""} onChange={(e) => set("heightFt", num(e.target.value))} />
        </label>
        <label>
          Height, inches
          <input inputMode="numeric" value={p.heightIn ?? ""} onChange={(e) => set("heightIn", num(e.target.value))} />
        </label>
      </div>
      <label>
        Weight, pounds
        <input inputMode="numeric" value={p.weightLb ?? ""} onChange={(e) => set("weightLb", num(e.target.value))} />
      </label>
      {text("appearance", "Appearance, in the family's words")}
      {text("hair", "Hair")}
      {text("eyeColor", "Eye color")}
      {text("primaryLanguage", "Primary language")}
      {text("clothingLastWorn", "Clothing last worn")}
      <fieldset>
        <legend>Mobility aids</legend>
        {AIDS.map((a) => (
          <label key={a} className="check">
            <input type="checkbox" checked={p.mobilityAids.includes(a)} onChange={(e) => set("mobilityAids", e.target.checked ? [...p.mobilityAids, a] : p.mobilityAids.filter((x) => x !== a))} />
            {a}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Tracking or ID aids</legend>
        <label className="check">
          <input
            type="radio"
            name="tracking-known"
            checked={p.trackingAids === undefined}
            onChange={() =>
              setP((x) => {
                const { trackingAids: _drop, ...rest } = x;
                return rest as FamilyProfile;
              })
            }
          />
          Not known yet
        </label>
        <label className="check">
          <input type="radio" name="tracking-known" checked={p.trackingAids !== undefined} onChange={() => set("trackingAids", p.trackingAids ?? { aids: [], note: "" })} />
          The family answered
        </label>
        {p.trackingAids && (
          <>
            {TRACKING.map(({ id, label }) => (
              <label key={id} className="check">
                <input
                  type="checkbox"
                  checked={p.trackingAids!.aids.includes(id)}
                  onChange={(e) => {
                    const want = new Set(p.trackingAids!.aids);
                    if (e.target.checked) want.add(id);
                    else want.delete(id);
                    set("trackingAids", { ...p.trackingAids!, aids: TRACKING.map((t) => t.id).filter((t) => want.has(t)) });
                  }}
                />
                {label}
              </label>
            ))}
            <label>
              Note for teams (no numbers)
              <input maxLength={trackingFile.noteMaxChars} value={p.trackingAids.note} onChange={(e) => set("trackingAids", { ...p.trackingAids!, note: e.target.value })} />
            </label>
            <p className="muted small">Nothing ticked means the family said none.</p>
          </>
        )}
      </fieldset>
      <label>
        Type of dementia
        <select value={p.dementiaType ?? ""} onChange={(e) => set("dementiaType", e.target.value === "" ? null : (e.target.value as DementiaType))}>
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={p.shareDementiaType} onChange={(e) => set("shareDementiaType", e.target.checked)} />
        The family agrees to show the type of dementia to search teams
      </label>
      <fieldset>
        <legend>What teams should know</legend>
        {FLAGS.map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={p.flags[k]} onChange={(e) => set("flags", { ...p.flags, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </fieldset>
      {long("triggersToAvoid", "Things that upset them")}
      {long("bestApproach", "What helps")}
      {long("uniqueDescription", "Anything that sets them apart")}
      <label>
        Photo taken on
        <input type="date" value={p.photoTakenOn ?? ""} onChange={(e) => set("photoTakenOn", e.target.value === "" ? null : e.target.value)} />
      </label>
      <p className="muted">Below stays at command. Teams see a place only when you add it as a place to check.</p>
      {places("previousAddresses", "Previous addresses")}
      {places("placesFrequented", "Places they used to go")}
      {text("nearbyWater", "Water near home")}
      <label className="check">
        <input type="checkbox" checked={p.vehicle?.involved ?? false} onChange={(e) => set("vehicle", e.target.checked ? { involved: true, description: p.vehicle?.description ?? "" } : null)} />
        A vehicle may be involved
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn">
          Save profile
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
