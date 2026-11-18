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

/// The approach card (spec section 13.3): code and fixed copy, no model. Command chose the
/// note ids from the profile's flags; the phone orders them by the file, fills in the family's
/// own words, shows the first few and puts the rest under More.
public struct ApproachCard: Sendable, Equatable {
    public struct Line: Sendable, Equatable { public var id: String; public var text: String; public var sourceRole: String }
    public var first: [Line]
    public var more: [Line]
    public var footer: String

    public static func build(profile: SharedProfile, notes: ApproachNotes) -> ApproachCard {
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
        return ApproachCard(first: Array(lines.prefix(cut)), more: Array(lines.dropFirst(cut)), footer: notes.footer)
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
