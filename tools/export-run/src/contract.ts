// The public run's contract is the judge replay reader's own (web/src/extras/replay/runContract.ts), imported rather
// than copied, so the exporter and the reader cannot drift apart. Only constants come across: that file's imports
// are types, so the export command runs it without the web app.
export {
  AUTHOR_PSEUDONYM,
  DEVICE_PSEUDONYM,
  FIREBASE_UID_SHAPE,
  MAX_RUN_EVENTS,
  PUBLISHED_RUN_VERSION,
  RUN_FIELDS,
} from "../../../web/src/extras/replay/runContract";
