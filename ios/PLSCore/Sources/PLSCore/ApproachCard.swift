import Foundation

/// `shared/constants/approach-notes.json`: the card's fixed copy (ours, in plain words).
public struct ApproachNotes: Sendable, Equatable {
    public struct Note: Sendable, Equatable { public var text: String; public var sourceRole: String }
    public var footer: String
    public var firstScreenMax: Int
    public var order: [String]
    public var notes: [String: Note]

    struct File: Decodable {
        struct N: Decodable { let text: String; let sourceRole: String }
        let footer: String; let firstScreenMax: Int; let order: [String]; let notes: [String: N]
    }

    public init(json: Data) throws {
        let f = try JSONDecoder().decode(File.self, from: json)
        footer = f.footer
        firstScreenMax = f.firstScreenMax
        order = f.order
        notes = f.notes.mapValues { Note(text: $0.text, sourceRole: $0.sourceRole) }
    }
}

/// `shared/constants/tracking-aids.json`: each tracking aid's search-card line, in card order, and
/// the line for "none". For the cards only: never sent to a model.
public struct TrackingAidCopy: Sendable, Equatable {
    public struct Aid: Sendable, Equatable { public var id: String; public var label: String; public var line: String }
    public var aids: [Aid]
    public var noneLine: String

    struct File: Decodable {
        struct A: Decodable { let id: String; let label: String; let line: String }
        let aids: [A]; let noneLine: String
    }

    public init(json: Data) throws {
        let f = try JSONDecoder().decode(File.self, from: json)
        aids = f.aids.map { Aid(id: $0.id, label: $0.label, line: $0.line) }
        noneLine = f.noneLine
    }
}

/// The approach card (spec section 13.3): code and fixed copy, no model. Command chose the
/// note ids from the profile's flags; the phone orders them by the file, fills in the family's
/// own words, shows the first few and puts the rest under More.
public struct ApproachCard: Sendable, Equatable {
    public struct Line: Sendable, Equatable { public var id: String; public var text: String; public var sourceRole: String }
    /// "Answers to …": every name they answer to; nil when no name was given.
    public var names: String? = nil
    /// The tracking-aid lines (`trackingAidLines`); empty when the family has not said.
    public var aids: [String] = []
    public var first: [Line]
    public var more: [Line]
    public var footer: String

    public init(names: String? = nil, aids: [String] = [], first: [Line], more: [Line], footer: String) {
        self.names = names
        self.aids = aids
        self.first = first
        self.more = more
        self.footer = footer
    }

    /// The card's names line, as the web's answersToLine: the main name, then every other name they
    /// answer to (the family's list, else the nickname), each once. Nil when no name was given.
    public static func answersToLine(_ profile: SharedProfile) -> String? {
        let main = profile.answersTo.trimmingCharacters(in: .whitespacesAndNewlines)
        var others: [String] = []
        for name in profile.namesToCall.map({ $0.trimmingCharacters(in: .whitespacesAndNewlines) })
        where !name.isEmpty && name != main && !others.contains(name) {
            others.append(name)
        }
        if !main.isEmpty { return others.isEmpty ? "Answers to \(main)" : "Answers to \(main) (also \(others.joined(separator: ", ")))" }
        return others.isEmpty ? nil : "Answers to \(others.joined(separator: ", "))"
    }

    /// The search card's tracking-aid lines, as the engine's trackingAidLines: one per aid the
    /// family named, in the file's order (an id this build does not know is skipped), then the
    /// family's note; the "none" line when the family said there are none; nothing when it has not said.
    public static func trackingAidLines(_ aids: TrackingAids?, copy: TrackingAidCopy) -> [String] {
        guard let aids else { return [] }
        let named = Set(aids.aids)
        var lines = copy.aids.filter { named.contains($0.id) }.map(\.line)
        let note = aids.note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !note.isEmpty { lines.append(note) }
        return lines.isEmpty ? [copy.noneLine] : lines
    }

    public static func build(profile: SharedProfile, notes: ApproachNotes, aids copy: TrackingAidCopy? = nil) -> ApproachCard {
        let chosen = Set(profile.approachNoteIds)
        let fields: [String: String] = [
            "primaryLanguage": profile.primaryLanguage, "triggersToAvoid": profile.triggersToAvoid,
            "bestApproach": profile.bestApproach, "uniqueDescription": profile.uniqueDescription
        ]
        var lines: [Line] = []
        for id in notes.order where chosen.contains(id) {
            guard let note = notes.notes[id], let text = fill(note.text, fields) else { continue }
            lines.append(Line(id: id, text: text, sourceRole: note.sourceRole))
        }
        let cut = max(0, notes.firstScreenMax)
        return ApproachCard(names: answersToLine(profile), aids: copy.map { trackingAidLines(profile.trackingAids, copy: $0) } ?? [],
                            first: Array(lines.prefix(cut)), more: Array(lines.dropFirst(cut)),
                            footer: notes.footer)
    }

    /// Fills `{field}` placeholders; a note whose field is empty is left out.
    static func fill(_ text: String, _ fields: [String: String]) -> String? {
        var out = text
        for (name, value) in fields where out.contains("{\(name)}") {
            let v = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if v.isEmpty { return nil }
            out = out.replacingOccurrences(of: "{\(name)}", with: v)
        }
        return out.contains("{") ? nil : out
    }
}
